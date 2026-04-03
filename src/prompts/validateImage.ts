import type { CharacterBible } from '../schemas/index.js';

export function validateImagePrompt(bible: CharacterBible): string {
  const entityDescriptions = bible.entities
    .filter((e) => e.importance !== 'background')
    .map((e) => {
      const traitSummary =
        e.physicalTraits && e.category === 'character'
          ? ` [${[
              e.physicalTraits.age,
              e.physicalTraits.gender,
              e.physicalTraits.hairColor && `${e.physicalTraits.hairColor} hair`,
              e.physicalTraits.eyeColor && `${e.physicalTraits.eyeColor} eyes`,
              e.physicalTraits.clothing && `wearing ${e.physicalTraits.clothing}`,
            ]
              .filter(Boolean)
              .join(', ')}]`
          : '';

      const distinctive =
        e.distinctiveFeatures.length > 0
          ? `. Distinctive: ${e.distinctiveFeatures.join(', ')}`
          : '';

      return `${e.name} (${e.category}, ${e.importance}): ${e.visualDescription}${traitSummary}${distinctive}`;
    })
    .join('\n');

  return `Compare this illustration against the visual entity descriptions and style requirements below.
Score each trait from 0.0 to 1.0 for visual match.

Entities to validate (primary and secondary only):
${entityDescriptions}

Required art style: ${bible.styleGuide.artStyle}
Required color palette: ${bible.styleGuide.colorPalette}

Return a JSON object with this EXACT structure:
{
  "score": 0.0,
  "traits": {
    "entity_appearance_match": 0.0,
    "distinctive_features_match": 0.0,
    "art_style_match": 0.0,
    "color_palette_match": 0.0,
    "overall_consistency": 0.0
  },
  "suggestions": ["string (specific prompt adjustments to fix each mismatch)"],
  "pass": false
}

Rules:
1. score = average of all trait scores.
2. pass = true if score >= 0.7.
3. If pass is false, suggestions must list specific prompt additions or corrections for each failing trait.
4. If no named entities appear in the scene, score art_style_match, color_palette_match, and overall_consistency only — set entity_appearance_match and distinctive_features_match to 1.0.`;
}
