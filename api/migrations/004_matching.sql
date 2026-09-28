CREATE TABLE IF NOT EXISTS match_eligibility (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 adult_attested_at INTEGER,
 rules_accepted_version TEXT,
 microphone_ready_at INTEGER,
 suspended_at INTEGER
);
CREATE TABLE IF NOT EXISTS match_presence (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('IDLE','SEARCHING','MATCH_OFFERED','CONNECTING','IN_CALL','RECONNECTING','ENDED','CANCELLED','EXPIRED','FAILED')),
 version INTEGER NOT NULL DEFAULT 0,
 match_id TEXT,
 joined_at INTEGER,
 heartbeat_at INTEGER,
 allow_broader INTEGER NOT NULL DEFAULT 0,
 requeue_on_decline INTEGER NOT NULL DEFAULT 0,
 level TEXT NOT NULL DEFAULT 'unsure'
);
CREATE INDEX IF NOT EXISTS match_waiting ON match_presence(state,joined_at);
CREATE TABLE IF NOT EXISTS matches (
 id TEXT PRIMARY KEY,
 a_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 b_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('MATCH_OFFERED','CONNECTING','IN_CALL','RECONNECTING','ENDED','CANCELLED','EXPIRED','FAILED')),
 offered_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 a_accepted INTEGER NOT NULL DEFAULT 0,
 b_accepted INTEGER NOT NULL DEFAULT 0,
 CHECK(a_user_id<>b_user_id)
);
CREATE INDEX IF NOT EXISTS matches_a ON matches(a_user_id,offered_at);
CREATE INDEX IF NOT EXISTS matches_b ON matches(b_user_id,offered_at);
CREATE TABLE IF NOT EXISTS blocks (
 blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(blocker_id,blocked_id),
 CHECK(blocker_id<>blocked_id)
);
