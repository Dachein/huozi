-- 0010_tasks_email.sql
--
-- Tasks: agent-driven work units backed by `inbox.jsonl` + `tasks/<id>.jsonl`
-- Collection files in each workspace. See `app/docs/tasks.md` for the full
-- design. This migration adds the two D1 tables that anchor the email ingest
-- and thread-resolution paths; the data itself lives in R2/Collection.
--
-- 1. `email_tokens` — per-user magic-address tokens
--    `t-<token>@mail.huozi.app` → workspace + user lookup. Rotatable;
--    revocation is soft (revoked_at) so audits keep working. The token
--    string IS the credential — knowing the address is enough to deliver
--    mail. We therefore drop unknown / revoked addresses silently rather
--    than bouncing, to avoid leaking which tokens are live.
--
-- 2. `task_message_index` — RFC 2822 Message-Id → task_id lookup
--    Scoped by workspace_id (composite PK) so a forged In-Reply-To from
--    workspace A cannot resolve to a task in workspace B. Indexed on
--    (workspace_id, task_id) so "show me every Message-Id known for this
--    task" is fast (debug/audit, not hot path).
--
-- Both tables are Cloud-primary; Edge editions can use them too but the
-- email ingest path only ships on Cloud (single shared inbound domain).
-- See `tasks.md` §10.


CREATE TABLE IF NOT EXISTS email_tokens (
  token            TEXT PRIMARY KEY,        -- 32-char URL-safe random, lowercase
  workspace_id     TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  revoked_at       INTEGER,                 -- NULL = active; non-null = retired (rotate)
  last_used_at     INTEGER,                 -- last successful inbound delivery; powers the "this works" UI hint
  allowed_senders  TEXT                     -- JSON array of domain strings, e.g. ["acme.com","gmail.com"]; NULL = any
);

CREATE INDEX IF NOT EXISTS idx_email_tokens_user
  ON email_tokens (workspace_id, user_id);

CREATE INDEX IF NOT EXISTS idx_email_tokens_active
  ON email_tokens (revoked_at);


CREATE TABLE IF NOT EXISTS task_message_index (
  workspace_id  TEXT NOT NULL,
  message_id    TEXT NOT NULL,              -- RFC 2822 Message-Id, angle brackets stripped
  task_id       TEXT NOT NULL,              -- task UUID (also the filename + Claude session id)
  recorded_at   INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_task_message_index_task
  ON task_message_index (workspace_id, task_id);
