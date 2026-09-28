# Requirements checklist

Status: **Done** means implemented and backed by the listed tests; **Partial** means only the stated slice exists; **Pending** means unimplemented; **Blocked** needs outside access or hardware.

| Area | Status | Evidence / exact remaining work |
|---|---|---|
| Project structure, reproducible startup, migration, lockfile | Done for local preview | `npm ci`, `npm run check`, SQLite migration; Windows instructions in README |
| Design system and navigation | Partial | Responsive web Home/Practice/Lessons/Progress/Profile. Browser/device accessibility QA pending |
| Auth, onboarding, progress migration | Partial | Local email/password, guest migration and profile fields tested. Managed auth, recovery, verification, assessment, multi-device security pending |
| AI two-way voice, live transcript, interruption, roles/modes, memory | Pending | Provider selection, secure short-lived credentials, streaming client, text fallback, permissions |
| Correction and pronunciation accuracy | Pending | Audio-based assessment and uncertainty/retry controls; simulated reply makes no such claim |
| Lessons and progression | Partial | 20 original scenario prompts, 20 lessons, completion counts. Adaptive plans, offline sync, spaced repetition, branching missions, games pending |
| Human eligibility, queue, atomic matching, acceptance | Pending | PostgreSQL transactions, state machine, concurrency tests, age assurance |
| Human calls, reconnect, block/report, consent | Pending | RTC provider, relay, two-device tests, moderation workflows, two-party consent |
| Ads, subscriptions, rewards, entitlement/cost ledger | Pending | Store/AdMob accounts, backend verification and idempotent event processing |
| Admin, uploads, security, monitoring, deletion retention | Partial | Dev local account deletion only. Production roles, export, moderation, backup policy pending |
| Android and iOS clients, platform QA | Blocked | Flutter/Android/iOS SDKs and physical/emulated devices unavailable here |
| Store assets, policy, Play Console submission | Blocked | Requires functioning signed app, accurate policy, developer accounts, owner decisions |

Refer to the attached master prompt for the full acceptance list. No item omitted from this summary is considered delivered.
