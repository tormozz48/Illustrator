import type { Queue } from "bullmq";
import {
  JOB_NAMES,
  type SplitChaptersPayload,
  type GenerateStyleBiblePayload,
  type AssembleBookPayload,
  SplitChaptersPayloadSchema,
  GenerateStyleBiblePayloadSchema,
  AssembleBookPayloadSchema,
} from "@illustrator/shared/jobs";

/**
 * Book job dispatch layer
 * Type-safe job creation using shared contracts
 */

export async function dispatchSplitChapters(
  queue: Queue,
  payload: SplitChaptersPayload
) {
  const validated = SplitChaptersPayloadSchema.parse(payload);
  await queue.add(JOB_NAMES.SPLIT_CHAPTERS, validated);
}

export async function dispatchGenerateStyleBible(
  queue: Queue,
  payload: GenerateStyleBiblePayload
) {
  const validated = GenerateStyleBiblePayloadSchema.parse(payload);
  await queue.add(JOB_NAMES.GENERATE_STYLE_BIBLE, validated);
}

export async function dispatchAssembleBook(
  queue: Queue,
  payload: AssembleBookPayload
) {
  const validated = AssembleBookPayloadSchema.parse(payload);
  await queue.add(JOB_NAMES.ASSEMBLE_BOOK, validated);
}
