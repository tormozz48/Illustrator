export function buildFindKeyScenesPrompt(
  chapterText: string,
  bible: any,
  chapterNumber: number,
): string {
  return `You are an illustration director. Find 2-3 key scenes in Chapter ${chapterNumber} that would make compelling illustrations.

Character Bible: ${JSON.stringify(bible, null, 2)}

For each scene return:
- paragraph_index: which paragraph (0-based) the illustration should appear after
- description: what is happening narratively
- visual_description: detailed visual prompt for image generation
- entities: character names present
- setting: where the scene takes place
- mood: emotional tone

Return JSON: { "scenes": [...] }

Chapter text:
${chapterText}`;
}
