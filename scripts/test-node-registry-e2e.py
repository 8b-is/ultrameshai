"""Own one loopback daemon, sign exact request bytes, and clean up only that child."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request


def main():
    subprocess.run(['cargo', 'build', '-p', 'loop-engineering-node-registry'], check=True)
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0))
        port = reservation.getsockname()[1]
    # A port race makes our child fail; it never gives us permission to kill its owner.
    secret = 'local-test-only'
    env = {key: value for key, value in os.environ.items() if key in {'PATH', 'HOME', 'LD_LIBRARY_PATH'}}
    env.update(HEARTBEAT_SECRET=secret, NODE_REGISTRY_ADDR=f'127.0.0.1:{port}',
               NODE_REGISTRY_TAILNET='invalid.test', TAILSCALE_API_KEY='',
               STALE_THRESHOLD_SECS='300', POLL_INTERVAL_SECS='3600')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    base = f'http://127.0.0.1:{port}'
    binary = Path(os.environ.get('CARGO_TARGET_DIR', 'target')) / 'debug/loop-engineering-node-registry'
    with tempfile.TemporaryDirectory(prefix='node-registry-test-') as tmp:
        with open(Path(tmp) / 'daemon.log', 'wb') as log:
            proc = subprocess.Popen([str(binary.resolve())], env=env, stdout=log, stderr=log)
            try:
                def request(path, data=None, signed=False):
                    headers = {'Content-Type': 'application/json'}
                    if signed:
                        headers['x-signature'] = 'hmac-sha256=' + hmac.new(secret.encode(), data, hashlib.sha256).hexdigest()
                    req = urllib.request.Request(base + path, data=data, headers=headers)
                    try:
                        with opener.open(req, timeout=2) as response:
                            body = response.read()
                            return response.status, json.loads(body) if body else None
                    except urllib.error.HTTPError as error:
                        return error.code, None

                for _ in range(10):
                    if proc.poll() is not None:
                        raise AssertionError('Owned daemon exited before readiness')
                    try:
                        code, health = request('/health')
                        if code == 200:
                            break
                    except urllib.error.URLError:
                        pass
                    time.sleep(1)
                else:
                    raise AssertionError('Owned daemon not ready')
                assert health['status'] == 'healthy'
                payload = {'node_id': 'test-node-01', 'capabilities': ['test'], 'memory_mb': 65536, 'load_avg': None, 'region': 'test'}
                data = json.dumps(payload, separators=(',', ':')).encode()
                assert request('/heartbeat', data, True)[0] == 200
                assert request('/heartbeat', data, False)[0] == 401
                assert request('/health')[1]['total_nodes'] == 1
                payload['memory_mb'] = 131072
                data = json.dumps(payload, separators=(',', ':')).encode()
                assert request('/heartbeat', data, True)[0] == 200
                nodes = request('/nodes')[1]
                assert next(n for n in nodes if n['metadata']['node_id'] == payload['node_id'])['metadata']['memory_mb'] == 131072
                proc.terminate()
                assert proc.wait(timeout=5) == 0
                print('Signed/unsigned heartbeat, update, health, nodes and graceful shutdown passed.')
            finally:
                if proc.poll() is None:
                    proc.terminate()
                    try:
                        proc.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait(timeout=5)


if __name__ == '__main__':
    main()
