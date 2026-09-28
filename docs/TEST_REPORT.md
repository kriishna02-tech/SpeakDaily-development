# Verification report — 2026-09-28

Environment: Linux workspace, Node.js v24.19.0, npm 11.9.0. No Flutter/Dart, Android SDK, iOS build host, or local browser binary. Tests use ephemeral SQLite databases and an HTTP server bound to `127.0.0.1`.

| Check | Expected | Observed | Status |
|---|---|---|---|
| `npm run check` | JS syntax and integration tests pass | 4/4 tests pass after migration fix | Pass |
| Clean local install and HTTP smoke | `npm ci` succeeds; health and web root respond | Offline `npm ci` succeeded; `/api/health` returned development status and `/` returned HTTP 200 | Pass |
| Guest limit and migration | Three turns, 429 on fourth, activity moves once | Confirmed in test | Pass |
| Ownership and input checks | Other guest cannot see activity; invalid input rejected | Confirmed in test | Pass |
| Login duplicate completion | Existing and guest lesson overlap yields one completion | Confirmed in test | Pass |
| Origin check and logout | Cross-origin POST denied; logout clears session | Confirmed in test | Pass |
| Production guard | Refuse simulated service | Confirmed in test | Pass |
| Responsive UI in actual browsers/devices | Layout, controls, accessibility work | No browser/device run available | Blocked |
| Flutter Android/iOS/web builds | Build and launch | SDKs unavailable; no Flutter client yet | Blocked |
| AI microphone/streaming/feedback | Natural two-way speech and accurate correction | Provider and audio implementation absent | Not run |
| Two-account real human call | Mutual acceptance and bidirectional audio | RTC/matching absent | Not run |
| Purchase/ads and store readiness | Verified real sandbox flow | Integrations absent | Not run |

The first test run exposed a guest lesson migration bug (an inserted row reused its primary key and was ignored). The migration now updates ownership within the registration transaction; the test passes. These tests do not establish production security or app store readiness.
