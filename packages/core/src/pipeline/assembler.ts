import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { CharacterBible, EnrichedChapter } from '../schemas/index.js';

/**
 * Lazily resolve the templates directory so that this module can be safely
 * imported in environments where `import.meta.url` is undefined at module-load
 * time (e.g. Cloudflare Workers during bundle validation).  The path is only
 * computed when `assemble()` is actually invoked.
 */
function defaultTemplatesDir(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return join(thisDir, '../templates');
}

export async function assemble({
  title,
  author,
  bible,
  chapters,
  templatesDir,
}: {
  title: string;
  author: string | undefined;
  bible: CharacterBible;
  chapters: EnrichedChapter[];
  /** Override the Eta views directory. Defaults to the templates/ folder
   *  bundled alongside this package. Pass an absolute path when running in
   *  environments that don't support import.meta.url (e.g. Cloudflare Workers). */
  templatesDir?: string;
}): Promise<string> {
  const eta = new Eta({ views: templatesDir ?? defaultTemplatesDir(), cache: false });

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
