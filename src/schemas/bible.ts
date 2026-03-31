import { z } from 'zod';

export const CharacterSheetSchema = z.object({
  name: z.string(),
  age: z.string(),
  gender: z.string(),
  build: z.string(),
  height: z.string(),
  skinTone: z.string(),
  hairColor: z.string(),
  hairStyle: z.string(),
  eyeColor: z.string(),
  facialFeatures: z.string(),
  clothing: z.string(),
  accessories: z.array(z.string()),
  distinctiveFeatures: z.array(z.string()),
  role: z.enum(['protagonist', 'mentor', 'antagonist', 'supporting', 'minor']),
});
export type CharacterSheet = z.infer<typeof CharacterSheetSchema>;

export const StyleGuideSchema = z.object({
  artStyle: z.string(),
  colorPalette: z.string(),
  mood: z.string(),
  lighting: z.string(),
  lineWork: z.string(),
  negativePrompt: z.string(),
  stylePrefix: z.string(),
});
export type StyleGuide = z.infer<typeof StyleGuideSchema>;

export const SettingSchema = z.object({
  name: z.string(),
  visualDescription: z.string(),
});
export type Setting = z.infer<typeof SettingSchema>;

export const CharacterBibleSchema = z.object({
  characters: z.array(CharacterSheetSchema),
  styleGuide: StyleGuideSchema,
  settings: z.array(SettingSchema),
});
export type CharacterBible = z.infer<typeof CharacterBibleSchema>;
