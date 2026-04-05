import type { CharacterBible, RawChapter } from '../schemas/index.js';

const APPROACH_HINTS: Record<string, string> = {
  'narrative-scene': 'Capture story moments — show entities interacting with each other or their environment.',
  descriptive: 'Showcase key subjects in full visual detail within their environment.',
  diagrammatic: 'Depict procedures, processes, or techniques in clear, instructional compositions.',
  abstract: 'Evoke the mood, theme, or central concepts of the chapter rather than literal events.',
  portrait: 'Present primary subjects close-up with maximum detail.',
};

export function findKeyScenesPrompt(chapter: RawChapter, bible: CharacterBible): string {
  const entityNames = bible.entities.map((e) => e.name).join(', ');
  const environmentNames = bible.environments.map((e) => e.name).join(', ');
  const approachHint = APPROACH_HINTS[bible.classification.illustrationApproach] ?? '';

  return `Identify the 2 to 3 most visually compelling scenes from this chapter for illustrations.

Return a JSON object with this EXACT structure:
{
  "scenes": [
    {
      "description": "string (narrative description of the scene — what is happening, 1-2 sentences)",
      "visualDescription": "string (visual/prompt-ready description — what is VISIBLE: poses, expressions, colors, light, textures, 2-4 sentences in English)",
      "entities": ["string (exact names of entities present and visible in this scene)"],
      "setting": "string (location name)",
      "mood": "string (emotional atmosphere: 'tense', 'joyful', 'mysterious', etc.)",
      "insertAfterParagraph": 0
    }
  ]
}

Rules:
- Return 2 scenes if the chapter is short or has few distinct moments; return 3 for rich chapters.
- Choose scenes from different parts of the chapter (beginning, middle, end) when possible.
- Each scene must be visually distinct from the others.
- Only list entities that are actually present and visible in each specific scene.
- insertAfterParagraph: 0-based paragraph index after which the image appears. Spread scenes across the chapter.
- description: the narrative context (what is happening in the story).
- visualDescription: focus ONLY on VISIBLE elements — actions, poses, expressions, environment, light, textures, colours. Write in English regardless of source language.
- Keep entity and setting names in their original language in "entities" and "setting" fields.
- If the chapter has no literal scenes (e.g. pure exposition), describe visual concepts or moods instead.

Known entities (use exact names): ${entityNames}
Known environments (use exact names if applicable): ${environmentNames}

Illustration approach for this book: ${bible.classification.illustrationApproach}
${approachHint}

Chapter ${chapter.number}: ${chapter.title}
${chapter.content}`;
}

export function findKeyScenesFallbackPrompt(chapter: RawChapter, bible: CharacterBible): string {
  const entityNames = bible.entities.map((e) => e.name).join(', ');
  const environmentNames = bible.environments.map((e) => e.name).join(', ');
  const approachHint = APPROACH_HINTS[bible.classification.illustrationApproach] ?? '';

  return `Create 2 visually compelling illustration concepts for a book chapter based only on its title and known characters/settings.

Return a JSON object with this EXACT structure:
{
  "scenes": [
    {
      "description": "string (narrative description, 1-2 sentences)",
      "visualDescription": "string (visual/prompt-ready description in English, 2-4 sentences)",
      "entities": ["string (exact entity names that would likely appear)"],
      "setting": "string (most fitting location name)",
      "mood": "string (emotional atmosphere)",
      "insertAfterParagraph": 0
    }
  ]
}

Rules:
- Return exactly 2 scenes based on what the chapter title suggests.
- Only include entities and settings from the known lists below.
- visualDescription: focus ONLY on VISIBLE elements. Write in English.
- Use insertAfterParagraph: 0 for the first scene, 3 for the second.
- Keep entity and setting names in their original language.

Known entities: ${entityNames}
Known environments: ${environmentNames}

Illustration approach: ${bible.classification.illustrationApproach}
${approachHint}

Chapter ${chapter.number}: ${chapter.title}`;
}
