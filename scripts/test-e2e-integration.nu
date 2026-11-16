#!/usr/bin/env nu
# Local node-registry HTTP and graceful-shutdown smoke; no live fleet services.
def main [] {
    ^python3 scripts/test-node-registry-e2e.py
    if $env.LAST_EXIT_CODE != 0 { exit $env.LAST_EXIT_CODE }
}
