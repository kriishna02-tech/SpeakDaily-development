# Architecture and decisions — 2026-09-28

## Goal and current shape

Build a learning app for adults initially emphasizing Hindi-speaking students and first-job applicants. The AI learning target age is **18+ for this initial design**, matching the planned human matching restriction. Final age assurance and consent policy require legal/product review before release. Automated CEFR placement will be labeled an estimate when implemented.

This first slice uses dependency-free Node.js HTTP and SQLite so a functional local preview can be verified without credentials or SDK installation. These are **development choices**, not a production recommendation. The planned production architecture is Flutter/Dart for Android, iOS, and web; TypeScript API; managed authentication; PostgreSQL; transactionally reserved matching; and a selected WebRTC service. No real provider or platform integration has been chosen yet. Selection requires current mobile/web support, pricing, retention, access controls, and an owner account. Avoid committing to a provider without that verification.

## Current data ownership

- `users`: local dev email/password hash using scrypt and random salt. Never log passwords.
- `sessions`: SHA-256 of an opaque session token, expiry timestamp. Token lives in an HttpOnly SameSite=Strict cookie. No production session management claim.
- `profiles`: one row per account. Goal, self-reported level, explanation language, interests, and daily target.
- `practice` and `lesson_progress`: tagged guest/user ownership. Guest IDs are 128-bit random UUID cookies; account migration occurs in an immediate transaction. Lesson completion has an owner/lesson uniqueness constraint. Account deletion removes owned activity and the user (sessions/profile cascade).
- `review_items` and `review_events`: one example card per completed lesson, server due date, event ID for idempotent grading, and guest/account ownership. Guest cards merge by lesson on login.
- `ai_usage`: reservation and completed request rows by UTC day. Development OpenAI text mode limits account and project request counts transactionally. Request counts do not establish a spending cap in currency.

Guest practice is limited to three turns total per guest ID. This is a usability limit, **not** abuse-resistant metering. A user can clear cookies to reset it. Production needs an abuse-control strategy that does not collect unnecessary identifiers.

## API contract, current slice

JSON error shape: `{ "error": { "code": "...", "message": "..." } }`. Bodies are capped at 8 KiB; string fields have per-field limits. `GET /api/health` reports provider mode. `GET /api/bootstrap` returns current user/profile, content, counts, review cards, plan, and guest allowance. `POST /api/auth/register`, `/login`, `/logout` manage local credentials. `POST /api/profile` saves preferences. `POST /api/practice` takes `{scenarioId,input}` and returns a labeled simulated or AI text reply. `POST /api/lessons/complete` takes `{lessonId}` and is idempotent by unique owner/lesson. `POST /api/review/grade` takes `{itemId,result,eventId}` and is idempotent for exact event replay. `GET /api/account/export` exports only signed-in records; `POST /api/account/delete` deletes them. `POST /api/guest/clear` clears guest records. No endpoint accepts a client-selected owner. Same-origin POST requests are checked against the request host, and cookies use SameSite=Strict. Pagination and idempotency keys for future collection/payment endpoints remain to be designed.

The OpenAI text adapter uses the Responses API with a strict JSON schema and `store:false`. It receives at most six preceding turns for the same scenario, returns a short conversational reply and up to three text improvement suggestions, and excludes any audio or pronunciation claim. The key stays server-side. Provider failure returns 503 and releases the request reservation; it does not silently substitute a simulated reply. A user/project request cap and guest limit reduce exposure, but paid usage remains blocked pending owner authorization and a currency budget. This adapter has only been exercised with an injected fake response, not a paid live call. Sources checked on 2026-09-28: [Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) and [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Planned human matching contract

Server-owned states: IDLE → SEARCHING → MATCH_OFFERED → CONNECTING → IN_CALL → RECONNECTING → ENDED. SEARCHING/MATCH_OFFERED may go to CANCELLED or EXPIRED; connection states may go to FAILED or ENDED. Every state change needs a server version and idempotency key. A unique account-level active-state constraint, row locks/atomic reservation, and two acceptances before room credentials will prevent double allocation. Block checks must run during queue selection and room admission. Heartbeat and offer expiry will be configurable. These transitions are **design notes only; no matching endpoint exists**.

Human audio processing will default off. Each optional recording, transcription, or AI analysis purpose needs two separate versioned consents and a persistent indication. Withdrawal must stop the processing stream immediately while leaving the ordinary call intact. No human audio processing exists today.

## Security and operations gaps

Before staging: managed auth and verification/recovery; PostgreSQL schema and migrations; rate limits; session rotation and revocation; CSRF strategy beyond the present origin/cookie protection; input/content threat model; provider secret management; observability; backups and deletion retention; authorization testing; admin roles; currency-denominated cost ceilings. The app deliberately throws on `APP_ENV=production` until production adapters and security controls are implemented.

## Platform and release decisions pending

Flutter installation on Windows supports Android and web development; iOS builds require macOS/Xcode. Reference: [Flutter setup](https://docs.flutter.dev/install/with-vs-code), [supported platforms](https://docs.flutter.dev/reference/supported-platforms). Minimum Android/iOS versions, browser support, actual device/network targets, SDK/service choices, pricing, and store policy requirements need verification during platform implementation. Do not infer a tested platform from source code alone.
