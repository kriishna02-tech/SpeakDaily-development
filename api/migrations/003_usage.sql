CREATE TABLE IF NOT EXISTS ai_usage (
 id TEXT PRIMARY KEY,
 owner_kind TEXT NOT NULL CHECK(owner_kind IN ('guest','user')),
 owner_id TEXT NOT NULL,
 utc_day TEXT NOT NULL,
 provider TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('reserved','completed')),
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_usage_owner_day ON ai_usage(owner_kind,owner_id,utc_day,status);
CREATE INDEX IF NOT EXISTS ai_usage_project_day ON ai_usage(utc_day,status);
