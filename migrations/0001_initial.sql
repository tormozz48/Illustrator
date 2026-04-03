-- ── books ──────────────────────────────────────────────────────────────────────
-- One row per uploaded book. status drives the UI progress indicator.
CREATE TABLE IF NOT EXISTS books (
  id          TEXT PRIMARY KEY,          -- nanoid, e.g. "abc123"
  title       TEXT NOT NULL,
  author      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  -- pending | analyzing | splitting | anchoring | illustrating | assembling | done | error
  error_msg   TEXT,
  r2_key      TEXT,                      -- raw .txt file in R2
  html_r2_key TEXT,                      -- assembled reader HTML in R2
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_books_status     ON books(status);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at DESC);

-- ── bibles ─────────────────────────────────────────────────────────────────────
-- Character / world bible produced by the analyzer step. One per book.
CREATE TABLE IF NOT EXISTS bibles (
  book_id     TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  data        TEXT NOT NULL,             -- JSON CharacterBible
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── chapters ───────────────────────────────────────────────────────────────────
-- One row per chapter produced by the splitter.
CREATE TABLE IF NOT EXISTS chapters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  number      INTEGER NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL,            -- raw prose text
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(book_id, number)
);

CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id, number);

-- ── anchors ────────────────────────────────────────────────────────────────────
-- Key-scene anchor (paragraph index) found for each chapter.
CREATE TABLE IF NOT EXISTS anchors (
  chapter_id         INTEGER PRIMARY KEY REFERENCES chapters(id) ON DELETE CASCADE,
  insert_after_para  INTEGER NOT NULL,   -- 0-based paragraph index
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── illustrations ──────────────────────────────────────────────────────────────
-- Tracks whether an illustration exists for a chapter, and its R2 key.
CREATE TABLE IF NOT EXISTS illustrations (
  chapter_id  INTEGER PRIMARY KEY REFERENCES chapters(id) ON DELETE CASCADE,
  r2_key      TEXT NOT NULL,             -- e.g. "books/{bookId}/chapters/{n}/img.webp"
  width       INTEGER,
  height      INTEGER,
  bytes       INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── jobs ───────────────────────────────────────────────────────────────────────
-- Workflow / queue job tracking. One row per processing attempt.
CREATE TABLE IF NOT EXISTS jobs (
  id              TEXT PRIMARY KEY,       -- Workflow instance ID
  book_id         TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  workflow_status TEXT NOT NULL DEFAULT 'queued',
  -- queued | running | complete | errored
  started_at      TEXT,
  finished_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_book ON jobs(book_id);
