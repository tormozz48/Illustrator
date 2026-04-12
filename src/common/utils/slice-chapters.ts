/**
 * Fuzzy-match chapter boundaries in raw text and extract content.
 */
export function sliceChapters(
  rawText: string,
  boundaries: { number: number; title: string; startMarker: string; endMarker: string }[],
): { number: number; title: string; content: string }[] {
  const chapters: { number: number; title: string; content: string }[] = [];

  for (const b of boundaries) {
    const startIdx = fuzzyFind(rawText, b.startMarker);
    const endIdx = b.endMarker ? fuzzyFind(rawText, b.endMarker, startIdx) : rawText.length;

    if (startIdx === -1) continue;

    const content = rawText.slice(startIdx, endIdx === -1 ? undefined : endIdx).trim();
    if (content.length > 0) {
      chapters.push({ number: b.number, title: b.title, content });
    }
  }

  return chapters;
}

function fuzzyFind(text: string, marker: string, fromIndex = 0): number {
  if (!marker) return -1;

  // Try exact match first
  const exact = text.indexOf(marker, fromIndex);
  if (exact !== -1) return exact;

  // Try normalized (collapse whitespace)
  const normText = text.slice(fromIndex).replace(/\s+/g, ' ');
  const normMarker = marker.replace(/\s+/g, ' ');
  const normIdx = normText.indexOf(normMarker);
  if (normIdx !== -1) return fromIndex + normIdx;

  // Try first 40 chars as prefix
  const prefix = marker.slice(0, 40).replace(/\s+/g, ' ');
  const prefixIdx = normText.indexOf(prefix);
  if (prefixIdx !== -1) return fromIndex + prefixIdx;

  return -1;
}
