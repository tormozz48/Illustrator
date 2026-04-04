import type { CharacterBible, RawChapter } from '../schemas/index.js';

const APPROACH_HINTS: Record<string, string> = {
  'narrative-scene':
    'Capture a story moment — show entities interacting with each other or their environment.',
  descriptive: 'Showcase a key subject in full visual detail within its environment.',
  diagrammatic: 'Depict a procedure, process, or technique in a clear, instructional composition.',
  abstract: 'Evoke the mood, theme, or central concept of the chapter rather than a literal event.',
  portrait: 'Present the primary subject close-up with maximum detail.',
};

export function findKeyScenePrompt(chapter: RawChapter, bible: CharacterBible): string {
  const entityNames = bible.entities.map((e) => e.name).join(', ');
  const environmentNames = bible.environments.map((e) => e.name).join(', ');
  const approachHint = APPROACH_HINTS[bible.classification.illustrationApproach] ?? '';

  return `Identify the single most visually compelling scene from this chapter for an illustration.

Return a JSON object with this EXACT structure:
{
  "description": "string (detailed visual description of the scene — what is VISIBLE, 2-4 sentences)",
  "entities": ["string (exact names of entities present and visible in this scene)"],
  "setting": "string (location name)",
  "mood": "string (emotional atmosphere: 'tense', 'joyful', 'mysterious', etc.)",
  "insertAfterParagraph": 0
}

Known entities (use exact names): ${entityNames}
Known environments (use exact names if applicable): ${environmentNames}

Illustration approach for this book: ${bible.classification.illustrationApproach}
${approachHint}

Instructions:
1. Choose the scene with the most visual drama, emotion, or story significance.
2. Only list entities that are actually present and visible in this specific scene.
3. insertAfterParagraph: 0-indexed paragraph number after which the image appears (0 = before first paragraph).
4. description: focus on VISIBLE elements only — actions, poses, expressions, environment, light, textures, colours. Write the description in English regardless of the source text language — this will be used as an image generation prompt.
5. If the chapter has no literal scene (e.g. pure exposition, abstract poetry), describe the dominant visual concept or mood instead.
6. Keep entity and setting names in their original language in the "entities" and "setting" fields.

Chapter ${chapter.number}: ${chapter.title}
${chapter.content}`;
}

/**
 * Fallback prompt used when the full chapter content is blocked by the LLM's
 * safety filter.  Uses only the chapter title and bible metadata — no raw text.
 */
export function findKeySceneFallbackPrompt(chapter: RawChapter, bible: CharacterBible): string {
  const entityNames = bible.entities.map((e) => e.name).join(', ');
  const environmentNames = bible.environments.map((e) => e.name).join(', ');
  const approachHint = APPROACH_HINTS[bible.classification.illustrationApproach] ?? '';

  return `Create a visually compelling illustration concept for a book chapter based only on its title and known characters/settings.

Return a JSON object with this EXACT structure:
{
  "description": "string (detailed visual description — what is VISIBLE, 2-4 sentences)",
  "entities": ["string (exact names of entities that would likely appear)"],
  "setting": "string (most fitting location name)",
  "mood": "string (emotional atmosphere: 'tense', 'joyful', 'mysterious', etc.)",
  "insertAfterParagraph": 0
}

Known entities (use exact names): ${entityNames}
Known environments (use exact names if applicable): ${environmentNames}

Illustration approach for this book: ${bible.classification.illustrationApproach}
${approachHint}

Instructions:
1. Base your scene on what the chapter title suggests thematically or narratively.
2. Only include entities and settings from the known lists above.
3. description: focus on VISIBLE elements only — actions, poses, environment, light, textures, colours. Write in English.
4. insertAfterParagraph: use 0 (place at chapter start).
5. Keep entity and setting names in their original language in the "entities" and "setting" fields.

Chapter ${chapter.number}: ${chapter.title}`;
}
