export function buildValidateImagePrompt(bible: any): string {
  return `Score this illustration for consistency with the character bible on a scale of 0.0 to 1.0.

Character Bible: ${JSON.stringify(bible, null, 2)}

Check:
- Character appearance accuracy
- Style guide adherence
- Setting/environment match
- Mood/tone consistency

Return JSON: { "score": 0.85, "traits": { "character_accuracy": 0.9, "style": 0.8, "setting": 0.85, "mood": 0.85 }, "suggestions": ["..."] }`;
}
