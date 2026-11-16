"""Conservative assignment-pattern check; never emit matched content or filenames."""
import re
import subprocess
from pathlib import Path

PATTERN = re.compile(rb'''(?i)(?:api_key|secret|password|token)\s*=\s*['"][A-Za-z0-9+/]{20,}''')


def main():
    paths = subprocess.check_output(['git', 'ls-files', '-z']).split(b'\0')
    matches = 0
    for raw in paths:
        if not raw:
            continue
        path = Path(raw.decode('utf-8', 'surrogateescape'))
        if path.suffix in {'.rs', '.ts', '.toml'} and path.is_file() and not path.is_symlink():
            matches += bool(PATTERN.search(path.read_bytes()))
    if matches:
        raise SystemExit('Potential credential assignments found; inspect tracked source privately.')
    print('No credential assignment patterns found (heuristic check only).')


if __name__ == '__main__':
    main()
