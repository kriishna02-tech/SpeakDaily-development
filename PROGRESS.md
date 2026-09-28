# Progress — 2026-09-28, learning review slice

## Completed

- Inspected the empty workspace and available SDKs; Node 24.19 is present; Flutter/Dart, Android SDK, and local browser binaries are absent.
- Built a local responsive web/backend preview with 20 scenarios and 20 lessons.
- Added local auth, profile, guest progress migration, account deletion, production simulation guard, and backend integration tests.
- Added heuristic daily plans, example review cards and idempotent grading, data export, and guest record clearing.
- Added an optional OpenAI text provider adapter with a server-held key, bounded history and output, request-count reservations, and visible outage behavior. Pinned paid mode to GPT-6 Luna Standard and added a persistent $4.50 lifetime app allowance with a conservative $0.05 reservation per attempted call. Its contract is tested with fake responses only; no paid call has been executed.
- Added an internal server-owned matching prototype with adult self-attestation gate, one presence row per account, atomic reservations, mutual acceptance, cancellation, expiry, and blocking. It has no public API or RTC room admission.
- Documented architecture, requirements, run steps, and test evidence.

## Remaining / known defects

- No verified live AI call, speech, pronunciation assessment, Flutter clients, user-facing human matching/calling, payments, ads, moderation, production auth/database, or store release artifacts.
- Web layout, keyboard/screen-reader behavior, and microphone handling have not been device/browser tested. The cloud browser blocked the local preview URL; there is no microphone capture in the preview.
- No password reset or email verification. Local session cookies are for a development preview, not a hardened service.
- Guest quota can be reset by clearing cookies; no server abuse prevention beyond the per-ID counter.
- The app allowance is not a provider-side billing limit or usage measurement; other project traffic and future pricing changes are outside it. There is no production abuse protection.
- Review cards use lesson example recall. They do not demonstrate independent correct usage or resolved recurring mistakes.
- Matching eligibility uses development-only adult self-attestation. It does not provide release-grade age assurance; there are no actual calls or room credentials.
- Flutter first-run setup was blocked by automatic approval review after an unexpected request to the cloud instance metadata endpoint. No Flutter client or platform build was produced; do not rerun that command through another route without resolving the credential-exposure risk.
- UI `confirm()` for deletion needs a designed accessible confirmation flow before release.

## Exact next steps

1. Verify the remote commit and CI in `kriishna02-tech/SpeakDaily-development`, then work in feature branches. The repository is public, so keep credentials, user data, and signing files out of commits.
2. Install Flutter and Android SDK; initialize the shared client; port the design/navigation and connect to the typed API. Build Android/web; use macOS for iOS.
3. Replace local auth/SQLite with managed auth/PostgreSQL; add recovery, verification, deletion retention, production rate limits, and tested migrations.
4. Configure a secure project key and provider billing ceiling below the user's $5 cap; validate actual text feedback with real learner examples. Select and implement a realtime voice service after SDK/pricing/security review.
5. Implement adult eligibility, atomic matching and moderated two-person RTC; separately verify on two devices and networks.
6. Continue monetization, administration, platform QA, and store preparation; update this file and `docs/TEST_REPORT.md` with actual evidence.
