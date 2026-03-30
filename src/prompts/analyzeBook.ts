export function analyzeBookPrompt(text: string): string {
  return `Analyze this book text and extract a complete character and style bible.

Return a JSON object with this EXACT structure (no extra fields):
{
  "characters": [
    {
      "name": "string",
      "age": "string (e.g. 'mid-20s', 'elderly', 'child ~8 years')",
      "gender": "string",
      "build": "string (e.g. 'slim', 'stocky', 'athletic')",
      "height": "string (e.g. 'tall', 'average', 'short')",
      "skinTone": "string (specific: 'warm olive', 'pale with freckles')",
      "hairColor": "string",
      "hairStyle": "string",
      "eyeColor": "string",
      "facialFeatures": "string",
      "clothing": "string (typical/signature outfit)",
      "accessories": ["string"],
      "distinctiveFeatures": ["string (scars, markings, always-carried items)"],
      "role": "protagonist|mentor|antagonist|supporting|minor"
    }
  ],
  "styleGuide": {
    "artStyle": "string (e.g. 'digital watercolor illustration')",
    "colorPalette": "string (e.g. 'warm earth tones with muted greens and golds')",
    "mood": "string (e.g. 'whimsical, slightly melancholic')",
    "lighting": "string (e.g. 'soft diffused natural light')",
    "lineWork": "string (e.g. 'clean outlines with soft edges')",
    "negativePrompt": "string (what to avoid: 'photorealistic, 3D render, anime, extra limbs, bad anatomy, blurry')",
    "stylePrefix": "string (1-2 sentence locked prefix used for every image prompt)"
  },
  "settings": [
    {
      "name": "string",
      "visualDescription": "string"
    }
  ]
}

Instructions:
1. Identify ALL named characters with speaking roles or physical descriptions
2. Infer visual details not explicitly stated (era-appropriate clothing, setting-consistent features)
3. Choose a SINGLE art style that fits the book's genre and tone
4. stylePrefix must be a rigid, reusable opening for every image prompt — copy-paste ready
5. Include at least 3 recurring settings (locations)

Book text:
${text}`;
}
