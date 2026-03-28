import type { Job } from "bullmq";
import type { AssembleBookPayload } from "@illustrator/shared/jobs";
import { books } from "@illustrator/shared/db";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { logger } from "../logger.js";
import { orchestrator } from "../orchestrator.js";

/**
 * Stage 4: Combine chapters + illustrations into final PDF
 * Triggered by: Last processChapter completion (atomic counter check)
 * Final stage: book marked as published
 *
 * NOTE: PDF generation is deferred (out of scope for initial implementation)
 * For now, we just mark the book as published
 */
export async function handleAssembleBook(job: Job<AssembleBookPayload>) {
  const { bookId } = job.data;

  logger.info({ bookId, jobId: job.id }, "Starting book assembly");

  try {
    // TODO: Implement actual PDF generation
    // For now, just mark as published

    await db
      .update(books)
      .set({
        status: "published",
        updatedAt: new Date(),
      })
      .where(eq(books.id, bookId));

    logger.info(
      { bookId },
      "Book assembly completed (PDF generation deferred)"
    );
  } catch (error) {
    logger.error({ bookId, error }, "Book assembly failed");
    await orchestrator.markBookFailed(bookId, `Book assembly failed: ${error}`);
    throw error;
  }
}
