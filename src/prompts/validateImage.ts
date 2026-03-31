import type { CharacterBible } from "../schemas/index.js";

export function validateImagePrompt(bible: CharacterBible): string {
  const characterDescriptions = bible.characters
    .map(
      (c) =>
        `${c.name} (${c.role}): ${c.age} ${c.gender}, ${c.hairColor} ${c.hairStyle} hair, ${c.eyeColor} eyes, ${c.skinTone} skin, wearing ${c.clothing}${c.distinctiveFeatures.length > 0 ? `. Distinctive: ${c.distinctiveFeatures.join(", ")}` : ""}`
    )
    .join("\n");

  return `Compare this illustration against the character descriptions and style requirements below.
Score each trait from 0.0 to 1.0 for visual match.

Characters:
${characterDescriptions}

Required art style: ${bible.styleGuide.artStyle}
Required color palette: ${bible.styleGuide.colorPalette}

Return a JSON object with this EXACT structure:
{
  "score": 0.0,
  "traits": {
    "hair_color_match": 0.0,
    "hair_style_match": 0.0,
    "clothing_match": 0.0,
    "body_type_match": 0.0,
    "distinctive_features_match": 0.0,
    "art_style_match": 0.0,
    "overall_consistency": 0.0
  },
  "suggestions": ["string (specific prompt adjustments to fix mismatches)"],
  "pass": false
}

Rules:
1. score = average of all trait scores
2. pass = true if score >= 0.7
3. If pass is false, suggestions must list specific prompt additions to fix each failed trait
4. If no named characters appear in the scene, score art_style_match and overall_consistency only (set others to 1.0)`;
}
