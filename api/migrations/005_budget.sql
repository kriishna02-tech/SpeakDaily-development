-- Monotone lifetime reservation. Never decrement on a failed call or deletion:
-- a provider may bill a request even when the app does not receive a usable reply.
CREATE TABLE IF NOT EXISTS ai_project_budget (
 id INTEGER PRIMARY KEY CHECK(id=1),
 reserved_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK(reserved_micro_usd>=0)
);
INSERT OR IGNORE INTO ai_project_budget(id,reserved_micro_usd) VALUES(1,0);
