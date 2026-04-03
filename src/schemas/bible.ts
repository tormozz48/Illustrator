import { z } from 'zod';

export const EntityCategorySchema = z.enum([
  'character',
  'creature',
  'object',
  'vehicle',
  'building',
  'organism',
  'food',
  'symbol',
  'other',
]);
export type EntityCategory = z.infer<typeof EntityCategorySchema>;

export const EntityImportanceSchema = z.enum(['primary', 'secondary', 'background']);
export type EntityImportance = z.infer<typeof EntityImportanceSchema>;

export const PhysicalTraitsSchema = z.object({
  age: z.string().optional(),
  gender: z.string().optional(),
  build: z.string().optional(),
  height: z.string().optional(),
  skinTone: z.string().optional(),
  hairColor: z.string().optional(),
  hairStyle: z.string().optional(),
  eyeColor: z.string().optional(),
  facialFeatures: z.string().optional(),
  clothing: z.string().optional(),
  accessories: z.array(z.string()).optional(),
});
export type PhysicalTraits = z.infer<typeof PhysicalTraitsSchema>;

// ── Visual entity — the universal subject that needs consistent illustration ───
export const VisualEntitySchema = z.object({
  name: z.string(),
  category: EntityCategorySchema,
  importance: EntityImportanceSchema,
  visualDescription: z.string(),
  distinctiveFeatures: z.array(z.string()),
  physicalTraits: PhysicalTraitsSchema.optional(),
});
export type VisualEntity = z.infer<typeof VisualEntitySchema>;

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

// ── Environment — richer than the old Setting ─────────────────────────────────
export const EnvironmentSchema = z.object({
  name: z.string(),
  visualDescription: z.string(),
  atmosphere: z.string(),
  colorDominance: z.string(),
  recurringElements: z.array(z.string()),
});
export type Environment = z.infer<typeof EnvironmentSchema>;

// ── Book classification — drives downstream pipeline behaviour ─────────────────
export const BookClassificationSchema = z.object({
  genre: z.string(),
  hasHumanCharacters: z.boolean(),
  primarySubjectType: z.enum([
    'characters',
    'creatures',
    'concepts',
    'nature',
    'objects',
    'places',
    'procedures',
  ]),
  illustrationApproach: z.enum([
    'narrative-scene',
    'descriptive',
    'diagrammatic',
    'abstract',
    'portrait',
  ]),
});
export type BookClassification = z.infer<typeof BookClassificationSchema>;

export const VisualBibleSchema = z.object({
  classification: BookClassificationSchema,
  entities: z.array(VisualEntitySchema),
  styleGuide: StyleGuideSchema,
  environments: z.array(EnvironmentSchema),
});
export type VisualBible = z.infer<typeof VisualBibleSchema>;

// ── Backward-compat aliases — existing imports still compile unchanged ─────────
export type CharacterBible = VisualBible;
export const CharacterBibleSchema = VisualBibleSchema;
