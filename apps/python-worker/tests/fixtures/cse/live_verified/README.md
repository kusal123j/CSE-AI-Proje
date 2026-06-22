# Live-verified CSE fixtures

Run `python apps/python-worker/scripts/verify_cse_live_endpoints.py` from the project root to capture current CSE payloads for AFSL.N0000, LOLC.N0000, COMB.N0000, JKH.N0000, and BIL.N0000.

The sandbox used for package generation did not perform live CSE calls. This folder is intentionally present so production/test environments can store verified payloads without changing code.
