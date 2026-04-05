import type { AIProvider } from '../ai-provider.js';
import { getChapterId, updateChapterStatus } from '../db/chapter.db.js';
import { insertScenes } from '../db/scene.db.js';
import { getLogger } from '../logger.js';
import { findKeyScenesFallbackPrompt, findKeyScenesPrompt } from '../prompts/findKeyScenes.js';
import { ScenesResultSchema } from '../schemas/scenes.js';
import type { CharacterBible, RawChapter } from '../schemas/index.js';
import { sanitizeLlmJson } from '../utils/jsonRepair.js';

interface Ctx {
  readonly bookId: string;
  readonly chapters: RawChapter[];
  readonly bible: CharacterBible;
  readonly client: AIProvider;
  readonly DB: D1Database;
}

export async function prepareScenesBatchStep({
  bookId,
  chapters,
  bible,
  client,
  DB,
}: Ctx): Promise<void> {
  const log = getLogger();
  log.info('step.prepareScenes.start', { bookId, chapters: chapters.map((c) => c.number) });

  await Promise.allSettled(
    chapters.map((ch) => prepareScenesForChapter({ bookId, ch, bible, client, DB }))
  );

  log.info('step.prepareScenes.complete', { bookId, chapters: chapters.map((c) => c.number) });
}

async function prepareScenesForChapter({
  bookId,
  ch,
  bible,
  client,
  DB,
}: {
  bookId: string;
  ch: RawChapter;
  bible: CharacterBible;
  client: AIProvider;
  DB: D1Database;
}): Promise<void> {
  const log = getLogger();

  try {
    const prompt = findKeyScenesPrompt(ch, bible);
    let rawJson: string;

    try {
      rawJson = await client.generateText(prompt);
    } catch {
      const fallbackPrompt = findKeyScenesFallbackPrompt(ch, bible);
      rawJson = await client.generateText(fallbackPrompt);
    }

    const repaired = sanitizeLlmJson(rawJson);
    const parsed = JSON.parse(repaired);
    const result = ScenesResultSchema.parse(parsed);

    const chapterId = await getChapterId(DB, bookId, ch.number);
    if (chapterId === null) {
      log.error('step.prepareScenes.chapterNotFound', { bookId, chapterNumber: ch.number });
      return;
    }

    await insertScenes(
      DB,
      chapterId,
      result.scenes.map((s, i) => ({
        ordinal: i + 1,
        description: s.description,
        visualDescription: s.visualDescription,
        entities: s.entities,
        setting: s.setting,
        mood: s.mood,
        insertAfterParagraph: s.insertAfterParagraph,
      }))
    );

    await updateChapterStatus(DB, chapterId, 'draft');

    log.info('step.prepareScenes.chapterDone', {
      bookId,
      chapterNumber: ch.number,
      sceneCount: result.scenes.length,
    });
  } catch (err) {
    log.error('step.prepareScenes.chapterFailed', {
      bookId,
      chapterNumber: ch.number,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
