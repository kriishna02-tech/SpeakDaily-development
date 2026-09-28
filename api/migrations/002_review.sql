CREATE TABLE IF NOT EXISTS review_items (
 id TEXT PRIMARY KEY,
 owner_kind TEXT NOT NULL CHECK(owner_kind IN ('guest','user')),
 owner_id TEXT NOT NULL,
 lesson_id TEXT NOT NULL,
 due_at INTEGER NOT NULL,
 interval_days INTEGER NOT NULL DEFAULT 0,
 repetitions INTEGER NOT NULL DEFAULT 0,
 reviewed_at INTEGER,
 UNIQUE(owner_kind,owner_id,lesson_id)
);
CREATE INDEX IF NOT EXISTS review_due ON review_items(owner_kind,owner_id,due_at);
CREATE TABLE IF NOT EXISTS review_events (
 id TEXT PRIMARY KEY,
 item_id TEXT NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
 owner_kind TEXT NOT NULL CHECK(owner_kind IN ('guest','user')),
 owner_id TEXT NOT NULL,
 result TEXT NOT NULL CHECK(result IN ('again','hard','good')),
 reviewed_at INTEGER NOT NULL
);
