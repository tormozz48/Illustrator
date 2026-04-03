/**
 * Reference-based chapter splitting prompt.
 *
 * Instead of asking the LLM to echo back the full chapter text (which can exceed
 * output token limits for long books and produce truncated/malformed JSON), we ask
 * it to return only lightweight boundary markers. The actual chapter content is then
 * sliced from the original text locally in sliceChapters().
 */
export function splitChaptersPrompt(text: string): string {
  return `Identify the chapter boundaries in this book text.

Return a JSON object with this EXACT structure:
{
  "chapters": [
    {
      "number": 1,
      "title": "string",
      "startMarker": "string (the first 40–60 characters of this chapter, verbatim, including any leading whitespace or heading text)",
      "endMarker": "string (the last 40–60 characters of this chapter, verbatim, including any trailing punctuation)"
    }
  ]
}

Instructions:
1. Identify chapter boundaries from headings such as "Chapter N", "Part N", "Глава", "Часть", numbered sections, or clear narrative breaks.
2. If no explicit chapters exist, create logical breaks of 800–2500 words each.
3. Number chapters sequentially starting from 1.
4. If a prologue/epilogue exists, include it as a numbered chapter.
5. Preserve all names, titles, and proper nouns in the title field in their original language — do not translate or transliterate.
6. startMarker: copy the EXACT first 40–60 characters of the chapter opening (including the heading line if present).
7. endMarker: copy the EXACT last 40–60 characters of the chapter (including the final sentence/punctuation).
8. Markers must be unique enough to locate the chapter unambiguously in the text.
9. Do NOT include the chapter content — only the boundary markers and title.

Book text:
${text}`;
}
