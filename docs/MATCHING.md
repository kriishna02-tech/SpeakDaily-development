# Matching domain prototype — 2026-09-28

`api/matching.mjs` is a development-only, synchronous SQLite domain service. It has no HTTP join endpoint, no age-assurance provider, no room tokens, and no RTC. The user interface truthfully says human matching is unavailable. It does not invent waiting partners or connect AI as a human.

## Hard constraints and queue

An account must exist and have an `match_eligibility` row with an adult self-attestation timestamp, accepted rules version, microphone-ready timestamp, and no suspension. Self-attestation is **not sufficient age assurance for release**. A `match_presence` primary key permits one authoritative active state per account across devices. `BEGIN IMMEDIATE` serializes queue selection and pair reservation in this development database. A production PostgreSQL implementation must use equivalent atomic row locks/uniqueness constraints and test under multiple server processes.

Joining moves IDLE, CANCELLED, EXPIRED, ENDED, or FAILED to SEARCHING. SEARCHING users are selected by oldest join time, provided neither user has blocked the other, both are eligible, both are currently available, and their levels are within one CEFR band. If both explicitly allow broader matching, two bands are allowed. An unknown level is treated as a preference wildcard. An immediate repeat partner is avoided when another suitable person waits. A match creates a unique ID and expires after 20 seconds by default; both participants move to MATCH_OFFERED in the same transaction. No partner is fabricated if the queue is empty.

## State transitions implemented in the prototype

| From | Event | To |
|---|---|---|
| IDLE/CANCELLED/EXPIRED/ENDED/FAILED | Eligible join | SEARCHING |
| SEARCHING | Atomic pair selection | MATCH_OFFERED |
| SEARCHING | Cancel / heartbeat expiry | CANCELLED / EXPIRED |
| MATCH_OFFERED | Both accept before expiry | CONNECTING |
| MATCH_OFFERED | Cancel/block / offer expiry | CANCELLED / EXPIRED, with optional requeue of the other user |
| CONNECTING | Cancel/block | CANCELLED |

Each presence row has a version. Accept, cancel, and heartbeat require the caller's current version; stale operations fail. Duplicate acceptance from the same participant while waiting is idempotent. A cancellation racing with acceptance is serialized, so a stale acceptance cannot create a connection. A block during a shared pending or connecting match cancels both sides. `expire()` is callable by a future server scheduler and is also run on joins and acceptances. Default heartbeat timeout is 30 seconds.

IN_CALL, RECONNECTING, ENDED, and FAILED are reserved schema states but have no entry/exit implementation yet. CONNECTING does **not** issue room credentials. Admission will require a selected RTC service, both acceptances, fresh eligibility/block checks, a two-person room limit, bounded reconnect behavior, and device/network tests. The current service cannot place a voice call.

Tests use three independent account IDs, simulate a second device for one account, stale acceptances/cancellation, blocked pairs, offer and heartbeat expiry, and level preferences. They do not substitute for PostgreSQL concurrency or real RTC tests.
