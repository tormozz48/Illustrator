import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config.js';
import {
  type CharacterBible,
  CharacterBibleSchema,
  type KeyScene,
  KeySceneSchema,
  type RawChapter,
  SplitResultSchema,
  type ValidationResult,
  ValidationResultSchema,
} from './schemas.js';

const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-2.5-flash-image-preview';

export class GeminiClient {
  private readonly genAI: GoogleGenerativeAI;

  constructor(apiKey: string = config.GEMINI_API_KEY) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async analyzeBook(text: string): Promise<CharacterBible> {
    const model = this.genAI.getGenerativeModel({ model: TEXT_MODEL });

    const prompt = `Analyze this book text and extract a complete character and style bible.

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

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    const json = JSON.parse(result.response.text()) as unknown;
    return CharacterBibleSchema.parse(json);
  }

  async splitChapters(text: string): Promise<RawChapter[]> {
    const model = this.genAI.getGenerativeModel({ model: TEXT_MODEL });

    const prompt = `Split this book text into chapters.

Return a JSON object with this EXACT structure:
{
  "chapters": [
    {
      "number": 1,
      "title": "string",
      "content": "string (FULL chapter text, verbatim)"
    }
  ]
}

Instructions:
1. Identify chapter boundaries from headings, "Chapter N", "Part N", or clear narrative breaks
2. If no explicit chapters, create logical breaks of 800-2500 words each
3. Preserve the COMPLETE original text — do NOT summarize or truncate content
4. Number chapters sequentially starting from 1
5. If a prologue/epilogue exists, include it as a numbered chapter

Book text:
${text}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    const json = JSON.parse(result.response.text()) as unknown;
    const parsed = SplitResultSchema.parse(json);
    return parsed.chapters;
  }

  async findKeyScene(chapter: RawChapter, bible: CharacterBible): Promise<KeyScene> {
    const model = this.genAI.getGenerativeModel({ model: TEXT_MODEL });

    const characterNames = bible.characters.map((c) => c.name).join(', ');
    const settingNames = bible.settings.map((s) => s.name).join(', ');

    const prompt = `Identify the single most visually compelling scene from this chapter for an illustration.

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

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    const json = JSON.parse(result.response.text()) as unknown;
    return KeySceneSchema.parse(json);
  }

  async generateImage(prompt: string, refs: Buffer[] = []): Promise<Buffer> {
    const model = this.genAI.getGenerativeModel({ model: IMAGE_MODEL });

    type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

    const parts: Part[] = [];

    for (const ref of refs) {
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: ref.toString('base64'),
        },
      });
    }

    parts.push({ text: prompt });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
      } as Record<string, unknown>,
    });

    const candidate = result.response.candidates?.[0];
    if (!candidate) throw new Error('No image candidate returned from Gemini');

    for (const part of candidate.content.parts) {
      if (part.inlineData?.data) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
    }

    throw new Error('No image data in Gemini response');
  }

  async validateImage(image: Buffer, bible: CharacterBible): Promise<ValidationResult> {
    const model = this.genAI.getGenerativeModel({ model: TEXT_MODEL });

    const characterDescriptions = bible.characters
      .map(
        (c) =>
          `${c.name} (${c.role}): ${c.age} ${c.gender}, ${c.hairColor} ${c.hairStyle} hair, ${c.eyeColor} eyes, ${c.skinTone} skin, wearing ${c.clothing}${c.distinctiveFeatures.length > 0 ? `. Distinctive: ${c.distinctiveFeatures.join(', ')}` : ''}`
      )
      .join('\n');

    const prompt = `Compare this illustration against the character descriptions and style requirements below.
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

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: image.toString('base64'),
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json' },
    });

    const json = JSON.parse(result.response.text()) as unknown;
    return ValidationResultSchema.parse(json);
  }
}
