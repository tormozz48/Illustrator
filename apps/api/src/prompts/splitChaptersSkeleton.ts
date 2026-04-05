/**
 * Chapter-splitting prompt for use with a book skeleton.
 *
 * When the full book text is too long to send to a small model in a single
 * inference call we instead build a compact skeleton: the first and last ~100
 * characters of every 2 500-char window of the original text.  This reduces
 * a 300 000-char book to ~30 000 chars while preserving every chapter heading
 * and boundary verbatim.
 *
 * The startMarker / endMarker values the model returns MUST be verbatim text
 * from the skeleton (and therefore from the original book) so that
 * sliceChapters() can locate them with indexOf().
 */
export function splitChaptersSkeletonPrompt(skeleton: string, originalLength: number): string {
  return `Identify the chapter boundaries in this book.

The book is ${originalLength.toLocaleString()} characters long. Below is a compact skeleton:
for every 2 500-character window of the original text you see:
  FIRST: the first ~100 characters of that window (verbatim)
  LAST:  the last ~100 characters of that window (verbatim)

Return a JSON object with this EXACT structure:
{
  "chapters": [
    {
      "number": 1,
      "title": "string",
      "startMarker": "string (verbatim text from a FIRST: line where this chapter begins — 40–60 chars)",
      "endMarker":   "string (verbatim text from a LAST: line where this chapter ends — 40–60 chars)"
    }
  ]
}

Instructions:
1. Identify chapter starts from headings such as "Chapter N", "Part N", "Глава", "Часть",
   numbered sections, or clear narrative breaks visible in the FIRST: lines.
2. If no explicit chapter headings exist, create logical breaks of roughly equal size.
3. Number chapters sequentially starting from 1.  Include prologues/epilogues as chapters.
4. startMarker: copy 40–60 characters VERBATIM from the FIRST: line of the window where
   this chapter begins (include the heading itself if present).
5. endMarker: copy 40–60 characters VERBATIM from the LAST: line of the window that is
   the last window before the next chapter starts (i.e. the window just before the next
   chapter heading).  For the final chapter use the very last LAST: entry.
6. Markers must be unique enough to locate the chapter unambiguously in the original text.
7. Preserve all names and titles in their original language — do NOT translate.
8. Do NOT include chapter content — only the boundary markers and title.

Book skeleton:
${skeleton}`;
}
