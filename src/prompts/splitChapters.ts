export function splitChaptersPrompt(text: string): string {
  return `Split this book text into chapters.

Return a JSON object with this EXACT structure:
{
  "chapters": [
    {
      "number": 1,
      "title": "string",
      "content": "string (FULL chapter text, verbatim)"
    }
  ]
}

Instructions:
1. Identify chapter boundaries from headings, "Chapter N", "Part N", or clear narrative breaks
2. If no explicit chapters, create logical breaks of 800-2500 words each
3. Preserve the COMPLETE original text — do NOT summarize or truncate content
4. Number chapters sequentially starting from 1
5. If a prologue/epilogue exists, include it as a numbered chapter

Book text:
${text}`;
}
