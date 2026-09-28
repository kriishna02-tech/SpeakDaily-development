# Verification report — 2026-09-28

Environment: Linux workspace, Node.js v24.19.0, npm 11.9.0. No Flutter/Dart, Android SDK, iOS build host, or local browser binary. Tests use ephemeral SQLite databases and an HTTP server bound to `127.0.0.1`.

| Check | Expected | Observed | Status |
|---|---|---|---|
| `npm run check` | JS syntax and integration tests pass | 14/14 tests pass, including review, provider fake, caps, export, guest clear, and old-schema migration | Pass |
| Clean local install and HTTP smoke | `npm ci` succeeds; health and web root respond | Offline `npm ci` succeeded; `/api/health` returned development status and `/` returned HTTP 200 | Pass |
| Guest limit and migration | Three turns, 429 on fourth, activity moves once | Confirmed in test | Pass |
| Ownership and input checks | Other guest cannot see activity; invalid input rejected | Confirmed in test | Pass |
| Login duplicate completion | Existing and guest lesson overlap yields one completion | Confirmed in test | Pass |
| Origin check and logout | Cross-origin POST denied; logout clears session | Confirmed in test | Pass |
| Production guard | Refuse simulated service | Confirmed in test | Pass |
| Review idempotency and ownership | Duplicate event has one effect; foreign user denied | Confirmed in test | Pass |
| Concurrent guest allowance | Four simultaneous requests cannot exceed three | Confirmed with delayed provider fake | Pass |
| OpenAI text contract | Key remains server-side; strict schema requested; failure visible | Verified with injected fake response, no live call | Pass for contract only |
| Data export and guest deletion | Owner-only export; guest clear isolated | Confirmed in test | Pass |
| Upgrade from initial schema | Existing practice remains after adding review/usage tables | Confirmed in test | Pass |
| Responsive UI in actual browsers/devices | Layout, controls, accessibility work | Cloud browser refused local `127.0.0.1` URL (`ERR_BLOCKED_BY_CLIENT`); no device run | Blocked |
| Flutter Android/iOS/web builds | Build and launch | SDKs unavailable; no Flutter client yet | Blocked |
| AI microphone/streaming/feedback | Natural two-way speech and accurate correction | Provider and audio implementation absent | Not run |
| Live OpenAI text response | Real response and feedback quality | No owner-authorized key/spend; no paid call | Blocked |
| Two-account real human call | Mutual acceptance and bidirectional audio | RTC/matching absent | Not run |
| Purchase/ads and store readiness | Verified real sandbox flow | Integrations absent | Not run |

The first test run exposed a guest lesson migration bug (an inserted row reused its primary key and was ignored). The migration now updates ownership within the registration transaction; the test passes. These tests do not establish production security or app store readiness.
