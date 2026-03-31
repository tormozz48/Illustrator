import { z } from 'zod';

export const ValidationResultSchema = z.object({
  score: z.number().min(0).max(1),
  traits: z.record(z.string(), z.number()),
  suggestions: z.array(z.string()).optional(),
  pass: z.boolean(),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
