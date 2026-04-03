/**
 * Sanitize common LLM JSON artifacts before parsing.
 *
 * Handles the most frequent Gemini failure modes:
 *   - Markdown code fences wrapping the JSON block
 *   - Trailing commas before } or ]  (strict JSON forbids these)
 *   - UTF-8 BOM and zero-width characters prepended to the response
 */
export function sanitizeLlmJson(raw: string): string {
  let s = raw.trim();

  s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');
  s = s.replace(/,(\s*[}\]])/g, '$1');
  s = s.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\uFEFF]/g, '');

  return s.trim();
}
