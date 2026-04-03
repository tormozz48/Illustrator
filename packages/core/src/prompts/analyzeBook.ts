export function analyzeBookPrompt(text: string): string {
  return `Analyze this book text and produce a complete Visual Bible for illustration.

Work in four steps:
  Step 1 — Classify the book (genre, subject type, illustration approach).
  Step 2 — Extract all visually significant recurring subjects as entities.
  Step 3 — Extract environments / settings with full atmospheric detail.
  Step 4 — Define a unified art style suited to this book's genre and tone.

Return a JSON object with this EXACT structure (no extra fields):
{
  "classification": {
    "genre": "string (e.g. 'epic fantasy novel', 'nature field guide', 'cookbook', 'poetry collection')",
    "hasHumanCharacters": true,
    "primarySubjectType": "characters|creatures|concepts|nature|objects|places|procedures",
    "illustrationApproach": "narrative-scene|descriptive|diagrammatic|abstract|portrait"
  },
  "entities": [
    {
      "name": "string",
      "category": "character|creature|object|vehicle|building|organism|food|symbol|other",
      "importance": "primary|secondary|background",
      "visualDescription": "string (2-4 sentences of rich visual prose — appearance, colours, materials, overall feel)",
      "distinctiveFeatures": ["string (any immediately recognisable trait: scar, pattern, colour, always-carried item)"],
      "physicalTraits": {
        "age": "string (only for category=character, e.g. 'mid-30s')",
        "gender": "string (only for category=character)",
        "build": "string (only for category=character, e.g. 'stocky')",
        "height": "string (only for category=character)",
        "skinTone": "string (only for category=character, specific: 'warm olive')",
        "hairColor": "string (only for category=character)",
        "hairStyle": "string (only for category=character)",
        "eyeColor": "string (only for category=character)",
        "facialFeatures": "string (only for category=character)",
        "clothing": "string (only for category=character, typical/signature outfit)",
        "accessories": ["string (only for category=character)"]
      }
    }
  ],
  "styleGuide": {
    "artStyle": "string (e.g. 'digital watercolor illustration with ink outlines')",
    "colorPalette": "string (e.g. 'warm earth tones with muted greens and golds')",
    "mood": "string (e.g. 'whimsical, slightly melancholic')",
    "lighting": "string (e.g. 'soft diffused natural light')",
    "lineWork": "string (e.g. 'clean outlines with soft edges')",
    "negativePrompt": "string (what to avoid: 'photorealistic, 3D render, anime, extra limbs, bad anatomy, blurry')",
    "stylePrefix": "string (1-2 sentence locked prefix used for every image prompt — copy-paste ready)"
  },
  "environments": [
    {
      "name": "string",
      "visualDescription": "string",
      "atmosphere": "string (e.g. 'oppressive and misty', 'warm and inviting')",
      "colorDominance": "string (e.g. 'deep greens and shadow tones', 'warm amber and candlelight')",
      "recurringElements": ["string (visual detail that always appears here: 'stone archways', 'red lanterns', 'scattered leaves')"]
    }
  ]
}

Entity extraction rules:
1. Fiction / biography — named characters with speaking roles or physical descriptions.
2. Fantasy / sci-fi — also include creatures, magic artifacts, iconic weapons, notable vehicles.
3. Nature / science — animals, plants, organisms, geological features, notable specimens.
4. Cookbooks — signature dishes, key ingredients, characteristic kitchen tools.
5. History / travel — buildings, landmarks, cultural objects, ceremonial items.
6. Poetry / abstract — dominant symbols, recurring motifs, personified concepts.
7. ONLY include physicalTraits for entities with category === "character". Omit the field entirely for all other categories.
8. visualDescription must be self-sufficient — a prompt generator will use it as prose without any structured fields.
9. Preserve all entity names in their original language — do not translate or transliterate (e.g. keep "Евгений" not "Evgeny").

Environment rules:
10. Include at least 3 recurring environments. For books without explicit named locations, infer conceptual ones (e.g. "A candlelit study", "An open winter meadow").
11. recurringElements should list things that visually anchor the environment — not plot events.
12. Preserve environment names in the original language of the text.

Style rules:
13. Choose ONE art style that fits the book's genre, tone, and implied audience age.
14. stylePrefix is prepended verbatim to every image prompt — make it locked and reusable. Write stylePrefix in English regardless of the source text language.

Book text:
${text}`;
}
