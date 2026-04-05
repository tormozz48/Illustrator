export interface SceneRow {
  id: number;
  chapter_id: number;
  ordinal: number;
  description: string;
  visual_description: string;
  entities: string; // JSON array string
  setting: string;
  mood: string;
  insert_after_para: number;
  selected: number;
  created_at: string;
}

export interface VariantRow {
  id: number;
  scene_id: number;
  r2_key: string;
  prompt: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  validation_score: number | null;
  selected: number;
  created_at: string;
}

export async function insertScenes(
  db: D1Database,
  chapterId: number,
  scenes: Array<{
    ordinal: number;
    description: string;
    visualDescription: string;
    entities: string[];
    setting: string;
    mood: string;
    insertAfterParagraph: number;
  }>
): Promise<void> {
  const statements = scenes.map((s) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO scenes
           (chapter_id, ordinal, description, visual_description, entities, setting, mood, insert_after_para, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(
        chapterId,
        s.ordinal,
        s.description,
        s.visualDescription,
        JSON.stringify(s.entities),
        s.setting,
        s.mood,
        s.insertAfterParagraph
      )
  );
  if (statements.length > 0) {
    await db.batch(statements);
  }
}

export async function getScenesByChapterId(
  db: D1Database,
  chapterId: number
): Promise<SceneRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM scenes WHERE chapter_id = ? ORDER BY ordinal')
    .bind(chapterId)
    .all<SceneRow>();
  return results;
}

export async function getVariantsBySceneId(
  db: D1Database,
  sceneId: number
): Promise<VariantRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM scene_variants WHERE scene_id = ? ORDER BY id')
    .bind(sceneId)
    .all<VariantRow>();
  return results;
}

export async function insertVariant(
  db: D1Database,
  params: {
    sceneId: number;
    r2Key: string;
    prompt: string;
    width?: number;
    height?: number;
    bytes?: number;
    validationScore?: number;
  }
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO scene_variants (scene_id, r2_key, prompt, width, height, bytes, validation_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(
      params.sceneId,
      params.r2Key,
      params.prompt,
      params.width ?? null,
      params.height ?? null,
      params.bytes ?? null,
      params.validationScore ?? null
    )
    .run();
  return result.meta.last_row_id as number;
}

export async function getVariantById(
  db: D1Database,
  variantId: number
): Promise<VariantRow | null> {
  return db
    .prepare('SELECT * FROM scene_variants WHERE id = ?')
    .bind(variantId)
    .first<VariantRow>();
}

export async function getSceneById(
  db: D1Database,
  sceneId: number
): Promise<SceneRow | null> {
  return db
    .prepare('SELECT * FROM scenes WHERE id = ?')
    .bind(sceneId)
    .first<SceneRow>();
}

export async function saveChapterSelections(
  db: D1Database,
  chapterId: number,
  selections: Array<{ sceneId: number; variantId: number | null }>
): Promise<void> {
  const statements: D1PreparedStatement[] = [];

  statements.push(
    db.prepare(`UPDATE scenes SET selected = 0 WHERE chapter_id = ?`).bind(chapterId)
  );
  statements.push(
    db
      .prepare(
        `UPDATE scene_variants SET selected = 0
         WHERE scene_id IN (SELECT id FROM scenes WHERE chapter_id = ?)`
      )
      .bind(chapterId)
  );

  for (const sel of selections) {
    statements.push(
      db
        .prepare(`UPDATE scenes SET selected = 1 WHERE id = ? AND chapter_id = ?`)
        .bind(sel.sceneId, chapterId)
    );
    if (sel.variantId !== null) {
      statements.push(
        db
          .prepare(`UPDATE scene_variants SET selected = 1 WHERE id = ? AND scene_id = ?`)
          .bind(sel.variantId, sel.sceneId)
      );
    }
  }

  await db.batch(statements);
}

export interface SelectedScene {
  scene_id: number;
  variant_id: number | null;
  insert_after_para: number;
  variant_r2_key: string | null;
}

export async function getSelectedScenesForChapter(
  db: D1Database,
  chapterId: number
): Promise<SelectedScene[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id AS scene_id, s.insert_after_para,
              sv.id AS variant_id,
              sv.r2_key AS variant_r2_key
       FROM scenes s
       LEFT JOIN scene_variants sv ON sv.scene_id = s.id AND sv.selected = 1
       WHERE s.chapter_id = ? AND s.selected = 1
       ORDER BY s.insert_after_para`
    )
    .bind(chapterId)
    .all<SelectedScene>();
  return results;
}

export async function listVariantR2KeysByBook(
  db: D1Database,
  bookId: string
): Promise<{ r2_key: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT sv.r2_key
       FROM scene_variants sv
       JOIN scenes s ON s.id = sv.scene_id
       JOIN chapters ch ON ch.id = s.chapter_id
       WHERE ch.book_id = ?`
    )
    .bind(bookId)
    .all<{ r2_key: string }>();
  return results;
}
