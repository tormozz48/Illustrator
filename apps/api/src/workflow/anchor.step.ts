import {
  buildAnchorPrompt,
  type GeminiClient,
  type CharacterBible,
} from "@illustrator/core";

type Entity = CharacterBible["entities"][number];

interface Ctx {
  readonly bookId: string;
  readonly entity: Entity;
  readonly bible: CharacterBible;
  readonly gemini: GeminiClient;
  readonly BOOKS_BUCKET: R2Bucket;
}

export async function anchorEntityStep({
  bookId,
  entity,
  bible,
  gemini,
  BOOKS_BUCKET,
}: Ctx): Promise<string | null> {
  const prompt = buildAnchorPrompt({
    entity,
    stylePrefix: bible.styleGuide.stylePrefix,
    negativePrompt: bible.styleGuide.negativePrompt,
  });

  try {
    const imgBuf = await gemini.generateImage(prompt);
    const key = `books/${bookId}/anchors/${entity.name.replace(/\s+/g, "_")}.webp`;
    await BOOKS_BUCKET.put(key, imgBuf, {
      httpMetadata: { contentType: "image/webp" },
    });
    return key;
  } catch {
    // Anchor generation is best-effort; don't fail the whole workflow
    return null;
  }
}
