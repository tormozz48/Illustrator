import type { AIProvider } from '../ai-provider.js';
import { upsertBible } from '../db/bible.db.js';
import { insertChapters } from '../db/chapter.db.js';
import { getLogger } from '../logger.js';
import type { CharacterBible, RawChapter } from '../schemas/index.js';
import type { makeSetStatus } from './setStatus.js';

interface Ctx {
  readonly setStatus: ReturnType<typeof makeSetStatus>;
  readonly client: AIProvider;
  readonly bookText: string;
  readonly bookId: string;
  readonly DB: D1Database;
}

export async function analyzeAndSplitStep({
  setStatus,
  client,
  bookText,
  bookId,
  DB,
}: Ctx): Promise<[CharacterBible, RawChapter[]]> {
  const log = getLogger();
  log.info('step.analyzeAndSplit.start', { bookId, bookChars: bookText.length });
  await setStatus('splitting');

  const [book, chapters] = await Promise.all([
    client.analyzeBook(bookText),
    client.splitChapters(bookText),
  ]);

  await upsertBible(DB, bookId, book);
  await insertChapters(DB, bookId, chapters);

  log.info('step.analyzeAndSplit.complete', {
    bookId,
    chapterCount: chapters.length,
    primaryEntityCount: book.entities.filter((e) => e.importance === 'primary').length,
    totalEntityCount: book.entities.length,
  });

  return [book, chapters];
}
