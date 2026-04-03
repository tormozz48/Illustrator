import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { GeminiClient } from "../gemini.js";
import { createSpinner, logger } from "../logger.js";
import type { AppConfig, BookResult } from "../schemas/index.js";
import { buildBible } from "./analyzer.js";
import { assemble } from "./assembler.js";
import { illustrateChapters } from "./illustrator.js";
import { extractTitle, readBook } from "./reader.js";
import { splitIntoChapters } from "./splitter.js";

/** Build an anchor image prompt for any entity type. */
function buildAnchorPrompt({
  entity,
  stylePrefix,
  negativePrompt,
}: {
  entity: import("../schemas/index.js").VisualEntity;
  stylePrefix: string;
  negativePrompt: string;
}): string {
  const {
    name,
    category,
    visualDescription,
    distinctiveFeatures,
    physicalTraits,
  } = entity;

  // For characters, enrich with structured physical traits when available
  let subjectLine = `${name}: ${visualDescription}`;
  if (category === "character" && physicalTraits) {
    const details = [
      physicalTraits.age,
      physicalTraits.gender,
      physicalTraits.hairColor &&
        `${physicalTraits.hairColor} ${physicalTraits.hairStyle ?? ""}`.trim() +
          " hair",
      physicalTraits.eyeColor && `${physicalTraits.eyeColor} eyes`,
      physicalTraits.skinTone && `${physicalTraits.skinTone} skin`,
      physicalTraits.facialFeatures,
      physicalTraits.clothing && `wearing ${physicalTraits.clothing}`,
      physicalTraits.accessories?.length
        ? physicalTraits.accessories.join(", ")
        : undefined,
    ]
      .filter(Boolean)
      .join(", ");
    if (details) subjectLine += ` — ${details}`;
  }
  if (distinctiveFeatures.length > 0) {
    subjectLine += `. Distinctive: ${distinctiveFeatures.join(", ")}`;
  }

  // Compose type-appropriate reference sheet instruction
  const refInstruction =
    category === "character"
      ? "Full-body portrait, front-facing, neutral expression, neutral pose, plain background, character reference sheet."
      : category === "creature"
        ? "Full-body side view, neutral pose, plain background, creature reference sheet."
        : `Detailed view of subject, isolated on plain background, reference sheet.`;

  return [
    stylePrefix,
    subjectLine,
    refInstruction,
    `Negative: ${negativePrompt}`,
  ].join("\n\n");
}

export async function run(appConfig: AppConfig): Promise<BookResult> {
  const client = new GeminiClient();
  const spinner = createSpinner();

  // ── Stage 1: Read ──────────────────────────────────────────────────────────
  spinner.start("Reading book...");
  const rawText = await readBook(appConfig.inputPath);
  const title = extractTitle(rawText, basename(appConfig.inputPath));
  spinner.succeed(
    `Loaded: "${title}" (${rawText.length.toLocaleString()} chars)`
  );

  // ── Stage 2: Analyze ───────────────────────────────────────────────────────
  spinner.start("Analyzing — building visual bible...");
  const bible = await buildBible(client, rawText);
  spinner.succeed(
    `Bible: ${bible.entities.length} entities · ${bible.environments.length} environments · style: ${bible.styleGuide.artStyle} · approach: ${bible.classification.illustrationApproach}`
  );

  for (const entity of bible.entities) {
    logger.debug(
      `[${entity.category.padEnd(10)}][${entity.importance.padEnd(10)}] ${entity.name}`
    );
  }

  // ── Stage 2b: Anchor images ────────────────────────────────────────────────
  // Generate reference images for primary entities so later scene illustrations
  // can use them as visual anchors for consistency.
  const anchorImages = new Map<string, Buffer>();
  const primaryEntities = bible.entities.filter(
    (e) => e.importance === "primary"
  );

  if (primaryEntities.length > 0) {
    spinner.start(
      `Generating anchor images for ${primaryEntities.length} primary entity/entities...`
    );

    for (const entity of primaryEntities) {
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
    }

    spinner.succeed(
      `Anchors: ${anchorImages.size}/${primaryEntities.length} generated`
    );
  }

  // ── Stage 3: Split ─────────────────────────────────────────────────────────
  spinner.start("Splitting into chapters...");
  const chapters = await splitIntoChapters(client, rawText);
  spinner.succeed(`Chapters: ${chapters.length}`);

  // ── Stage 4: Illustrate ────────────────────────────────────────────────────
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

  const illustrated = enrichedChapters.filter(
    (c) => c.illustration !== undefined
  ).length;
  logger.info(`Illustrated ${illustrated}/${chapters.length} chapters`);

  // ── Stage 5: Assemble ──────────────────────────────────────────────────────
  spinner.start("Assembling HTML book...");
  const html = await assemble({
    title,
    author: undefined,
    bible,
    chapters: enrichedChapters,
  });
  spinner.succeed("HTML assembled");

  // ── Write output ───────────────────────────────────────────────────────────
  await mkdir(appConfig.outputDir, { recursive: true });
  const outputPath = join(appConfig.outputDir, "book.html");
  await writeFile(outputPath, html, "utf-8");

  logger.info(`Book ready: ${outputPath}`);

  return {
    title,
    bible,
    chapters: enrichedChapters,
    html,
  };
}
