import { getLogger } from "@illustrator/core";

interface Ctx {
  readonly bookId: string;
  readonly htmlR2Key: string;
  readonly DB: D1Database;
  readonly CACHE: KVNamespace;
}

export async function finalizeStep({
  bookId,
  htmlR2Key,
  DB,
  CACHE,
}: Ctx): Promise<void> {
  const log = getLogger();
  await DB.prepare(
    `UPDATE books
     SET status = 'done', html_r2_key = ?, error_msg = NULL, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(htmlR2Key, bookId)
    .run();

  await DB.prepare(
    `UPDATE jobs SET workflow_status = 'complete', finished_at = datetime('now') WHERE id = ?`
  )
    .bind(`illustrate-${bookId}`)
    .run();

  // Invalidate any cached HTML
  await CACHE.delete(`html:${bookId}`);

  log.info('step.finalize.complete', { bookId, htmlR2Key });
}
