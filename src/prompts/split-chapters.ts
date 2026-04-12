export function buildSplitChaptersPrompt(text: string): string {
  return `You are a book structure analyst. Identify chapter boundaries in this book.

Return JSON: { "chapters": [{ "number": 1, "title": "...", "startMarker": "exact text from first line", "endMarker": "exact text from last line" }] }

Use EXACT quotes from the text as markers (first ~50 chars of chapter start, first ~50 chars of next chapter or end).

Book text:
${text}`;
}
