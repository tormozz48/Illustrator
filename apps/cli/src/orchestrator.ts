import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import pMap from 'p-map';
import {
  GeminiClient,
  buildAnchorPrompt,
  buildBible,
  illustrateChapters,
  assemble,
  splitIntoChapters,
  type AppConfig,
  type BookResult,
} from '@illustrator/core';
import { config } from './config.js';
import { createSpinner, logger } from './logger.js';
import { extractTitle, readBook } from './reader.js';

export async function run(appConfig: AppConfig): Promise<BookResult> {
  const client = new GeminiClient(config.GEMINI_API_KEY);
  const spinner = createSpinner();

  spinner.start('Reading book...');
  const rawText = await readBook(appConfig.inputPath);
  const title = extractTitle(rawText, basename(appConfig.inputPath));
  spinner.succeed(`Loaded: "${title}" (${rawText.length.toLocaleString()} chars)`);

  // Both calls are independent — they both read rawText and produce separate
  // outputs. Running them with Promise.all() saves the full wall-clock duration
  // of whichever finishes first (typically splitChapters).
  spinner.start('Building visual bible & splitting chapters (parallel)...');

  const [bible, chapters] = await Promise.all([
    buildBible(client, rawText),
    splitIntoChapters(client, rawText),
  ]);

  spinner.succeed(
    `Bible: ${bible.entities.length} entities · ${bible.environments.length} environments · style: ${bible.styleGuide.artStyle} · approach: ${bible.classification.illustrationApproach}`
  );
  logger.info(`Chapters: ${chapters.length}`);

  for (const entity of bible.entities) {
    logger.debug(
      `[${entity.category.padEnd(10)}][${entity.importance.padEnd(10)}] ${entity.name}`
    );
  }

  // Generate reference images for primary entities.
  const anchorImages = new Map<string, Buffer>();
  const primaryEntities = bible.entities.filter((e) => e.importance === 'primary');

  if (primaryEntities.length > 0) {
    spinner.start(
      `Generating anchor images for ${primaryEntities.length} primary entity/entities...`
    );

    await pMap(
      primaryEntities,
      async (entity) => {
        const anchorPrompt = buildAnchorPrompt({
          entity,
          stylePrefix: bible.styleGuide.stylePrefix,
          negativePrompt: bible.styleGuide.negativePrompt,
        });

        try {
          const buf = await client.generateImage(anchorPrompt);
          anchorImages.set(entity.name, buf);
          logger.debug(`anchor ready: ${entity.name} (${entity.category})`);
        } catch (err) {
          spinner.warn(
            `Anchor skipped for ${entity.name}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      },
      { concurrency: 2 }
    );

    spinner.succeed(`Anchors: ${anchorImages.size}/${primaryEntities.length} generated`);
  }

  logger.info(
    `Illustrating ${chapters.length} chapters (concurrency: ${appConfig.concurrency})...`
  );

  const enrichedChapters = await illustrateChapters({
    client,
    chapters,
    bible,
    anchorImages,
    concurrency: appConfig.concurrency,
    onProgress: (done, total) => {
      logger.debug(`Progress: ${done}/${total} chapters illustrated`);
    },
  });

  const illustrated = enrichedChapters.filter((c) => c.illustration !== undefined).length;
  logger.info(`Illustrated ${illustrated}/${chapters.length} chapters`);

  spinner.start('Assembling HTML book...');
  const html = await assemble({
    title,
    author: undefined,
    bible,
    chapters: enrichedChapters,
  });
  spinner.succeed('HTML assembled');

  await mkdir(appConfig.outputDir, { recursive: true });
  const outputPath = join(appConfig.outputDir, 'book.html');
  await writeFile(outputPath, html, 'utf-8');

  logger.info(`Book ready: ${outputPath}`);

  return {
    title,
    bible,
    chapters: enrichedChapters,
    html,
  };
}
