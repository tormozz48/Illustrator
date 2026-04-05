import { getLogger } from '../logger.js';

import { markBookDone } from '../db/book.db.js';
import { markJobComplete } from '../db/job.db.js';

interface Ctx {
  readonly bookId: string;
  readonly htmlR2Key: string;
  readonly DB: D1Database;
  readonly CACHE: KVNamespace;
}

export async function finalizeStep({ bookId, htmlR2Key, DB, CACHE }: Ctx): Promise<void> {
  const log = getLogger();
  await markBookDone(DB, bookId, htmlR2Key);
  await markJobComplete(DB, `illustrate-${bookId}`);
  await CACHE.delete(`html:${bookId}`);
  log.info('step.finalize.complete', { bookId, htmlR2Key });
}
