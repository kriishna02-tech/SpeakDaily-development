# Requirements checklist

Status: **Done** means implemented and backed by the listed tests; **Partial** means only the stated slice exists; **Pending** means unimplemented; **Blocked** needs outside access or hardware.

| Area | Status | Evidence / exact remaining work |
|---|---|---|
| Project structure, reproducible startup, migration, lockfile | Done for local preview | `npm ci`, `npm run check`, SQLite migration; Windows instructions in README |
| Design system and navigation | Partial | Responsive web Home/Practice/Lessons/Review/Progress/Profile. Browser/device accessibility QA pending |
| Auth, onboarding, progress migration | Partial | Local email/password, guest migration and profile fields tested. Managed auth, recovery, verification, assessment, multi-device security pending |
| AI two-way voice, live transcript, interruption, roles/modes, memory | Partial | Server-side OpenAI text adapter and outage/usage tests; no paid live call or realtime audio yet |
| Correction and pronunciation accuracy | Partial | Optional AI text feedback schema; no live validation, audio assessment, or recognition uncertainty controls |
| Lessons and progression | Partial | 20 original prompts/lessons, heuristic daily plan, spaced example review; offline sync, branching missions, games pending |
| Human eligibility, queue, atomic matching, acceptance | Pending | PostgreSQL transactions, state machine, concurrency tests, age assurance |
| Human calls, reconnect, block/report, consent | Pending | RTC provider, relay, two-device tests, moderation workflows, two-party consent |
| Ads, subscriptions, rewards, entitlement/cost ledger | Pending | Store/AdMob accounts, backend verification and idempotent event processing |
| Admin, uploads, security, monitoring, deletion retention | Partial | Dev account export/deletion and guest clearing. Production roles, moderation, backup policy pending |
| Android and iOS clients, platform QA | Blocked | Flutter/Android/iOS SDKs and physical/emulated devices unavailable here |
| Store assets, policy, Play Console submission | Blocked | Requires functioning signed app, accurate policy, developer accounts, owner decisions |

Refer to the attached master prompt for the full acceptance list. No item omitted from this summary is considered delivered.
