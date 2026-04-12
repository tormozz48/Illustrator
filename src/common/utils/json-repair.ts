/**
 * Sanitize LLM JSON output: strip markdown fences, trailing commas, BOM, etc.
 */
export function sanitiseJson(raw: string): string {
  let s = raw.trim();

  // Strip BOM
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);

  // Strip markdown code fences
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  // Strip trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, '$1');

  return s.trim();
}
