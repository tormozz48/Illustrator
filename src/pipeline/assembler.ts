import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { CharacterBible, EnrichedChapter } from '../schemas.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function assemble(
  title: string,
  author: string | undefined,
  bible: CharacterBible,
  chapters: EnrichedChapter[]
): Promise<string> {
  const eta = new Eta({
    views: join(__dirname, '../templates'),
    cache: false,
  });

  return eta.renderAsync('book', {
    title,
    author,
    bible,
    chapters,
    generatedAt: new Date().toISOString(),
    renderLines,
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderLines(paragraph: string): string {
  return paragraph.split('\n').map(escapeHtml).join('<br>');
}
