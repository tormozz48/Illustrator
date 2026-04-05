-- ── chapters: add status column ───────────────────────────────────────────────
ALTER TABLE chapters ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
-- valid: draft | editing | illustrated

-- ── scenes ─────────────────────────────────────────────────────────────────────
-- AI-prepared key scenes (2-3 per chapter). Replaces inline keyScene computation.
CREATE TABLE IF NOT EXISTS scenes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id          INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  ordinal             INTEGER NOT NULL,
  description         TEXT NOT NULL,
  visual_description  TEXT NOT NULL,
  entities            TEXT NOT NULL DEFAULT '[]',
  setting             TEXT NOT NULL DEFAULT '',
  mood                TEXT NOT NULL DEFAULT '',
  insert_after_para   INTEGER NOT NULL DEFAULT 0,
  selected            INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(chapter_id, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_scenes_chapter ON scenes(chapter_id);

-- ── scene_variants ─────────────────────────────────────────────────────────────
-- All generated image variants for a scene (persisted permanently).
CREATE TABLE IF NOT EXISTS scene_variants (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id          INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  r2_key            TEXT NOT NULL,
  prompt            TEXT NOT NULL DEFAULT '',
  width             INTEGER,
  height            INTEGER,
  bytes             INTEGER,
  validation_score  REAL,
  selected          INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_variants_scene ON scene_variants(scene_id);
