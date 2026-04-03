/**
 * Local text slicer for reference-based chapter splitting.
 *
 * The LLM returns lightweight boundary markers (startMarker / endMarker) rather
 * than the full chapter text.  This module locates those markers in the original
 * rawText and slices verbatim chapter content — guaranteeing no LLM-induced
 * alterations or truncation of the source material.
 */
import { logger } from '../logger.js';
import type { ChapterBoundary } from '../schemas/chapters.js';
import type { RawChapter } from '../schemas/index.js';

function findMarker(rawText: string, marker: string): number {
  const exact = rawText.indexOf(marker);
  if (exact !== -1) return exact;

  const MIN_FUZZY = 10;
  for (let len = marker.length - 5; len >= MIN_FUZZY; len -= 5) {
    const prefix = marker.slice(0, len).trim();
    if (prefix.length < MIN_FUZZY) break;
    const idx = rawText.indexOf(prefix);
    if (idx !== -1) {
      logger.warn(`sliceChapters: exact marker not found, used ${len}-char fuzzy prefix`);
      return idx;
    }
  }

  return -1;
}

export function sliceChapters(
  rawText: string,
  boundaries: ChapterBoundary[],
): RawChapter[] {
  const chapters: RawChapter[] = [];

  const startOffsets: number[] = boundaries.map((b) => findMarker(rawText, b.startMarker));

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const start = startOffsets[i];

    // Both are guaranteed defined — we're iterating within bounds — but TS
    // doesn't narrow indexed array access in strict mode, so we guard explicitly.
    if (boundary === undefined || start === undefined) continue;

    if (start === -1) {
      logger.warn(
        `sliceChapters: cannot locate startMarker for chapter ${boundary.number} ("${boundary.title}") — skipping`,
      );
      continue;
    }

    let end = rawText.length;
    for (let j = i + 1; j < boundaries.length; j++) {
      const nextOffset = startOffsets[j];
      if (nextOffset !== undefined && nextOffset !== -1) {
        end = nextOffset;
        break;
      }
    }

    const content = rawText.slice(start, end).trim();
    if (content.length === 0) {
      logger.warn(`sliceChapters: chapter ${boundary.number} ("${boundary.title}") produced empty content — skipping`);
      continue;
    }

    chapters.push({ number: boundary.number, title: boundary.title, content });
  }

  logger.debug(`sliceChapters: ${chapters.length}/${boundaries.length} chapters resolved`);
  return chapters;
}
