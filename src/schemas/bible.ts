import { z } from 'zod';

// ── Entity categories ──────────────────────────────────────────────────────────
// Covers the full range of book types: fiction, nature, cookbooks, history, etc.
export const EntityCategorySchema = z.enum([
  'character',  // people — fiction, biography, memoir
  'creature',   // animals, monsters, fantasy beings, nature subjects
  'object',     // artifacts, tools, magic items, key props
  'vehicle',    // ships, spacecraft, carriages, cars
  'building',   // landmarks, structures, architecture
  'organism',   // plants, fungi, biological subjects
  'food',       // dishes, ingredients — cookbooks, culinary writing
  'symbol',     // emblems, abstract icons, philosophical concepts
  'other',      // catch-all
]);
export type EntityCategory = z.infer<typeof EntityCategorySchema>;

export const EntityImportanceSchema = z.enum(['primary', 'secondary', 'background']);
export type EntityImportance = z.infer<typeof EntityImportanceSchema>;

// ── Physical traits — only populated when category === 'character' ─────────────
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
  /** Rich prose visual description (2-4 sentences). Used directly in image prompts. */
  visualDescription: z.string(),
  /** Immediately recognisable traits: scars, patterns, colours, always-carried items. */
  distinctiveFeatures: z.array(z.string()),
  /** Structured character traits — omit entirely for non-character categories. */
  physicalTraits: PhysicalTraitsSchema.optional(),
});
export type VisualEntity = z.infer<typeof VisualEntitySchema>;

// ── Style guide ────────────────────────────────────────────────────────────────
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
  /** Overall feel: 'oppressive and misty', 'warm and inviting', etc. */
  atmosphere: z.string(),
  /** Dominant colour tones: 'deep greens and shadow', 'warm amber', etc. */
  colorDominance: z.string(),
  /** Visual elements that recur whenever this environment appears. */
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
    'narrative-scene', // story moment with entities interacting
    'descriptive',     // showcasing a subject (animal, dish, object)
    'diagrammatic',    // instructional / step-by-step
    'abstract',        // mood, theme, concept-driven
    'portrait',        // focused close-up on a single subject
  ]),
});
export type BookClassification = z.infer<typeof BookClassificationSchema>;

// ── Visual Bible — the unified schema ─────────────────────────────────────────
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
