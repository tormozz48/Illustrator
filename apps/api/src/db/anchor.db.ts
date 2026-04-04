export async function upsertAnchor(
  db: D1Database,
  chapterId: number,
  insertAfterPara: number
): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO anchors (chapter_id, insert_after_para, created_at)
       VALUES (?, ?, datetime('now'))`
    )
    .bind(chapterId, insertAfterPara)
    .run();
}
