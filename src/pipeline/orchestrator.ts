import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { GeminiClient } from '../gemini.js';
import { createSpinner, logger } from '../logger.js';
import type { AppConfig, BookResult } from '../schemas.js';
import { buildBible } from './analyzer.js';
import { assemble } from './assembler.js';
import { illustrateChapters } from './illustrator.js';
import { extractTitle, readBook } from './reader.js';
import { splitIntoChapters } from './splitter.js';

export async function run(appConfig: AppConfig): Promise<BookResult> {
  const gemini = new GeminiClient();
  const spinner = createSpinner();

  // ── Stage 1: Read ──────────────────────────────────────────────────────────
  spinner.start('Reading book...');
  const rawText = await readBook(appConfig.inputPath);
  const title = extractTitle(rawText, basename(appConfig.inputPath));
  spinner.succeed(`Loaded: "${title}" (${rawText.length.toLocaleString()} chars)`);

  // ── Stage 2: Analyze ───────────────────────────────────────────────────────
  spinner.start('Analyzing — building character & style bible...');
  const bible = await buildBible(gemini, rawText);
  spinner.succeed(
    `Bible: ${bible.characters.length} characters · ${bible.settings.length} settings · style: ${bible.styleGuide.artStyle}`
  );

  for (const ch of bible.characters) {
    logger.debug(`[${ch.role.padEnd(12)}] ${ch.name}`);
  }

  // ── Stage 2b: Anchor images ────────────────────────────────────────────────
  const anchorImages = new Map<string, Buffer>();
  const mainChars = bible.characters.filter((c) =>
    ['protagonist', 'mentor', 'antagonist'].includes(c.role)
  );

  if (mainChars.length > 0) {
    spinner.start(`Generating anchor images for ${mainChars.length} main character(s)...`);

    for (const char of mainChars) {
      const anchorPrompt = `${bible.styleGuide.stylePrefix}\n\n${char.name}: ${char.age} ${char.gender} with ${char.hairColor} ${char.hairStyle} hair, ${char.eyeColor} eyes, ${char.skinTone} skin, ${char.facialFeatures}, wearing ${char.clothing}${char.accessories.length > 0 ? `, ${char.accessories.join(', ')}` : ''}${char.distinctiveFeatures.length > 0 ? `. Distinctive: ${char.distinctiveFeatures.join(', ')}` : ''}.\n\nFull-body portrait, front-facing, neutral expression, neutral pose, plain background, character reference sheet.\n\nNegative: ${bible.styleGuide.negativePrompt}`;

      try {
        const buf = await gemini.generateImage(anchorPrompt);
        anchorImages.set(char.name, buf);
        logger.debug(`anchor ready: ${char.name}`);
      } catch (err) {
        spinner.warn(
          `Anchor skipped for ${char.name}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    spinner.succeed(`Anchors: ${anchorImages.size}/${mainChars.length} generated`);
  }

  // ── Stage 3: Split ─────────────────────────────────────────────────────────
  spinner.start('Splitting into chapters...');
  const chapters = await splitIntoChapters(gemini, rawText);
  spinner.succeed(`Chapters: ${chapters.length}`);

  // ── Stage 4: Illustrate ────────────────────────────────────────────────────
  logger.info(
    `Illustrating ${chapters.length} chapters (concurrency: ${appConfig.concurrency})...`
  );

  const enrichedChapters = await illustrateChapters(
    gemini,
    chapters,
    bible,
    anchorImages,
    appConfig.concurrency,
    (done, total) => {
      logger.debug(`Progress: ${done}/${total} chapters illustrated`);
    }
  );

  const illustrated = enrichedChapters.filter((c) => c.illustration !== undefined).length;
  logger.info(`Illustrated ${illustrated}/${chapters.length} chapters`);

  // ── Stage 5: Assemble ──────────────────────────────────────────────────────
  spinner.start('Assembling HTML book...');
  const html = await assemble(title, undefined, bible, enrichedChapters);
  spinner.succeed('HTML assembled');

  // ── Write output ───────────────────────────────────────────────────────────
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
