export function buildImagePrompt(
  scene: { visual_description: string; setting: string; mood: string; entities: string[] },
  bible: any,
): string {
  const entityDescriptions = (bible.entities || [])
    .filter((e: any) => scene.entities.includes(e.name))
    .map((e: any) => `${e.name}: ${e.visual_appearance || e.physical_description}`)
    .join('\n');

  const style = bible.style_guide
    ? `Art style: ${bible.style_guide.art_style}. Colors: ${bible.style_guide.color_palette}. Lighting: ${bible.style_guide.lighting}.`
    : '';

  return `Create an illustration for a book scene.

Scene: ${scene.visual_description}
Setting: ${scene.setting}
Mood: ${scene.mood}

Characters present:
${entityDescriptions}

${style}

Create a high-quality, detailed book illustration. Do not include any text or speech bubbles.`;
}
