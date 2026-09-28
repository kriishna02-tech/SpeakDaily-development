PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 goal TEXT NOT NULL, level TEXT NOT NULL, language TEXT NOT NULL,
 interests TEXT NOT NULL, daily_minutes INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS practice (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, owner_kind TEXT NOT NULL CHECK(owner_kind IN ('guest','user')),
 scenario_id TEXT NOT NULL, input TEXT NOT NULL, reply TEXT NOT NULL,
 feedback TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS practice_owner_created ON practice(owner_kind, owner_id, created_at);
CREATE TABLE IF NOT EXISTS lesson_progress (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, owner_kind TEXT NOT NULL CHECK(owner_kind IN ('guest','user')),
 lesson_id TEXT NOT NULL, completed_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(owner_kind, owner_id, lesson_id)
);
