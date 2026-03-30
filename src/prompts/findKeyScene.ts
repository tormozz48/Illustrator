import type { CharacterBible, RawChapter } from "../schemas.js";

export function findKeyScenePrompt(
  chapter: RawChapter,
  bible: CharacterBible
): string {
  const characterNames = bible.characters.map((c) => c.name).join(", ");
  const settingNames = bible.settings.map((s) => s.name).join(", ");

  return `Identify the single most visually compelling scene from this chapter for an illustration.

Return a JSON object with this EXACT structure:
{
  "description": "string (detailed visual description of the scene — what is VISIBLE, 2-4 sentences)",
  "characters": ["string (exact character names present in this scene)"],
  "setting": "string (location name)",
  "mood": "string (emotional atmosphere: 'tense', 'joyful', 'mysterious', etc.)",
  "insertAfterParagraph": 0
}

Known characters (use exact names): ${characterNames}
Known settings (use exact names if applicable): ${settingNames}

Instructions:
1. Choose the scene with the most visual drama, emotion, or story significance
2. Only list characters actually present and visible in this specific scene
3. insertAfterParagraph: 0-indexed paragraph number after which the image appears (0 = before first paragraph)
4. description: focus on VISIBLE elements — actions, poses, expressions, environment, light

Chapter ${chapter.number}: ${chapter.title}
${chapter.content}`;
}
