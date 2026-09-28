# Progress — 2026-09-28, learning review slice

## Completed

- Inspected the empty workspace and available SDKs; Node 24.19 is present; Flutter/Dart, Android SDK, and local browser binaries are absent.
- Built a local responsive web/backend preview with 20 scenarios and 20 lessons.
- Added local auth, profile, guest progress migration, account deletion, production simulation guard, and backend integration tests.
- Added heuristic daily plans, example review cards and idempotent grading, data export, and guest record clearing.
- Added an optional OpenAI text provider adapter with a server-held key, bounded history and output, request-count reservations, and visible outage behavior. Its contract is tested with fake responses only; no paid call has been authorized or executed.
- Documented architecture, requirements, run steps, and test evidence.

## Remaining / known defects

- No verified live AI call, speech, pronunciation assessment, Flutter clients, human matching/calling, payments, ads, moderation, production auth/database, or store release artifacts.
- Web layout, keyboard/screen-reader behavior, and microphone handling have not been device/browser tested. The cloud browser blocked the local preview URL; there is no microphone capture in the preview.
- No password reset or email verification. Local session cookies are for a development preview, not a hardened service.
- Guest quota can be reset by clearing cookies; no server abuse prevention beyond the per-ID counter.
- AI text request caps count requests, not tokens or money; there is no currency budget, billing measurement, or production abuse protection.
- Review cards use lesson example recall. They do not demonstrate independent correct usage or resolved recurring mistakes.
- UI `confirm()` for deletion needs a designed accessible confirmation flow before release.

## Exact next steps

1. Verify the remote commit and CI in `kriishna02-tech/SpeakDaily-development`, then work in feature branches. The repository is public, so keep credentials, user data, and signing files out of commits.
2. Install Flutter and Android SDK; initialize the shared client; port the design/navigation and connect to the typed API. Build Android/web; use macOS for iOS.
3. Replace local auth/SQLite with managed auth/PostgreSQL; add recovery, verification, deletion retention, production rate limits, and tested migrations.
4. With owner authorization for paid resources, securely configure an AI project/model and currency budget, then validate actual text feedback with real learner examples. Select and implement a realtime voice service after SDK/pricing/security review.
5. Implement adult eligibility, atomic matching and moderated two-person RTC; separately verify on two devices and networks.
6. Continue monetization, administration, platform QA, and store preparation; update this file and `docs/TEST_REPORT.md` with actual evidence.
