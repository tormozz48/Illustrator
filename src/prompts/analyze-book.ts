export function buildAnalyzeBookPrompt(text: string): string {
  return `You are a literary analyst and visual designer. Analyze this book text and produce a detailed character/world bible.

Return a JSON object with:
- classification: { genre, setting_period, tone, themes[] }
- entities: [{ name, type, physical_description, personality, visual_appearance, distinguishing_features, role }]
- style_guide: { art_style, color_palette, lighting, composition_notes }
- environments: [{ name, description, visual_description, mood, key_features[] }]

Book text:
${text}`;
}
