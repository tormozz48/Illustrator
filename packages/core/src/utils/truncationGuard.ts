/**
 * Estimate the risk that a given LLM call will exceed Gemini's output token
 * limit and produce a truncated (and therefore unparseable) JSON response.
 *
 * Gemini 2.5 Flash output limit: ~65 000 tokens
 * Rule of thumb: 1 token ≈ 3 chars (conservative; Cyrillic/CJK are ~1–2 chars/token)
 */
export function estimateTruncationRisk(params: {
  inputChars: number;
  expectedOutputSchema: 'bible' | 'chapters' | 'keyScene';
}): 'low' | 'medium' | 'high' {
  const { inputChars, expectedOutputSchema } = params;
  const estimatedInputTokens = inputChars / 3;

  if (expectedOutputSchema === 'chapters') {
    // Old approach: LLM echoed back full text → output ≈ input (extremely dangerous).
    // New approach: boundary markers only → output is ~2 k tokens regardless of book size.
    // Risk is now based purely on whether the *input* fits within context.
    if (estimatedInputTokens > 200_000) return 'high'; // > ~600 k chars
    if (estimatedInputTokens > 100_000) return 'medium'; // > ~300 k chars
    return 'low';
  }

  if (expectedOutputSchema === 'bible') {
    // Bible output is proportional to entity/environment count, not book length.
    // Typically 2–8 k tokens. Risk only materialises for very long books.
    if (estimatedInputTokens > 200_000) return 'medium';
    return 'low';
  }

  return 'low';
}
