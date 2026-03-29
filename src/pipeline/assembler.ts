import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { CharacterBible, EnrichedChapter } from '../schemas.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderChapterBody(chapter: EnrichedChapter, index: number, total: number): string {
  const paragraphs = chapter.content
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const insertAt = chapter.keyScene.insertAfterParagraph;
  const parts: string[] = [];

  parts.push(`<article class="chapter" id="chapter-${chapter.number}">`);
  parts.push(`  <div class="chapter-heading">`);
  parts.push(`    <span class="chapter-number">Chapter ${chapter.number}</span>`);
  parts.push(
    `    <h2 class="chapter-title">${escapeHtml(chapter.title || `Chapter ${chapter.number}`)}</h2>`
  );
  parts.push('  </div>');
  parts.push('  <div class="chapter-body">');

  for (let i = 0; i < paragraphs.length; i++) {
    const lines = (paragraphs[i] ?? '').split('\n').map(escapeHtml).join('<br>');
    parts.push(`    <p>${lines}</p>`);

    if (i === insertAt && chapter.illustration) {
      const { imageBase64, width, height, validationScore } = chapter.illustration;
      parts.push('    <figure class="illustration">');
      parts.push(
        `      <img src="data:image/jpeg;base64,${imageBase64}" width="${width}" height="${height}" alt="Illustration for chapter ${chapter.number}" loading="lazy">`
      );
      parts.push(
        `      <figcaption>Chapter ${chapter.number} · consistency score: ${(validationScore * 100).toFixed(0)}%</figcaption>`
      );
      parts.push('    </figure>');
    }
  }

  // If insertAt is beyond the paragraph count, append image at end
  if (insertAt >= paragraphs.length && chapter.illustration) {
    const { imageBase64, width, height, validationScore } = chapter.illustration;
    parts.push('    <figure class="illustration">');
    parts.push(
      `      <img src="data:image/jpeg;base64,${imageBase64}" width="${width}" height="${height}" alt="Illustration for chapter ${chapter.number}" loading="lazy">`
    );
    parts.push(
      `      <figcaption>Chapter ${chapter.number} · consistency score: ${(validationScore * 100).toFixed(0)}%</figcaption>`
    );
    parts.push('    </figure>');
  }

  parts.push('  </div>');

  parts.push('  <nav class="chapter-nav">');
  if (index > 0) {
    parts.push(`    <a href="#chapter-${index}">&larr; Previous</a>`);
  } else {
    parts.push('    <span></span>');
  }
  parts.push('    <a href="#toc">&#8593; Contents</a>');
  if (index < total - 1) {
    parts.push(`    <a href="#chapter-${index + 2}">Next &rarr;</a>`);
  } else {
    parts.push('    <span></span>');
  }
  parts.push('  </nav>');

  parts.push('</article>');

  return parts.join('\n');
}

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
    renderChapter: (ch: EnrichedChapter, i: number, total: number) =>
      renderChapterBody(ch, i, total),
  });
}
