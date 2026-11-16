# Tasks — E2E Integration Demo

## Task 1: E2E Integration Test Script
- [x] Write the Nushell wrapper and isolated Python HTTP process smoke.
- [x] Verify the underlying `python3 scripts/test-node-registry-e2e.py` smoke.

## Task 2: Graceful Shutdown
- [x] Check `main.rs` for SIGTERM handler
- [x] Add if missing
- [x] Verify clean shutdown of the owned test child

## Task 3: Progress Ledger + Archive
- [ ] Update `.superpowers/sdd/progress.md`
- [x] Run `nu scripts/lint-ecl.nu`
- [ ] Archive to `harness/changes/archive/`

The smoke covers registry HTTP and shutdown only; transport/mempalace integration,
Nix and target hardware remain open. Keep this change active until that scope is verified.
