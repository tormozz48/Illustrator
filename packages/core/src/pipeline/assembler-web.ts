/**
 * Worker-compatible HTML assembler for the SaaS reader.
 *
 * Unlike assembler.ts (which uses Eta + the Node.js filesystem), this module
 * generates the reader HTML entirely from TypeScript template literals — no
 * filesystem access, no Eta dependency. Images are referenced via URL rather
 * than base64-embedded, so the HTML stays small and images load lazily.
 *
 * Used by the Cloudflare Worker's GET /api/books/:id/read endpoint.
 */
import type { CharacterBible, EnrichedChapter } from '../schemas/index.js';

export interface WebAssembleOptions {
  bookId: string;
  title: string;
  author?: string;
  bible: CharacterBible;
  chapters: WebChapter[];
  generatedAt?: string;
  /** Base URL for image endpoints, e.g. "" (same origin) or "https://api.example.com" */
  apiBase?: string;
}

/** Minimal chapter shape used by the web assembler — images are served by URL */
export interface WebChapter {
  number: number;
  title: string;
  content: string;
  keyScene?: { insertAfterParagraph: number } | null;
  hasIllustration: boolean;
}

export function assembleWebHtml({
  bookId,
  title,
  author,
  chapters,
  generatedAt = new Date().toISOString(),
  apiBase = '',
}: WebAssembleOptions): string {
  const tocItems = chapters
    .map(
      (ch) =>
        `<li>
          <a href="#chapter-${ch.number}">${escHtml(ch.title || `Chapter ${ch.number}`)}</a>
        </li>`
    )
    .join('\n      ');

  const chapterBlocks = chapters.map((ch) => renderChapter(ch, bookId, apiBase)).join('\n\n  ');

  const formattedDate = new Date(generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  ${CSS}
</head>
<body>

  <header class="book-header">
    <h1 class="book-title">${escHtml(title)}</h1>
    ${author ? `<p class="book-author">by ${escHtml(author)}</p>` : ''}
  </header>

  <nav class="toc" id="toc" aria-label="Table of contents">
    <h2>Contents</h2>
    <ol>
      ${tocItems}
    </ol>
  </nav>

  ${chapterBlocks}

  <footer class="book-footer">
    <p>Generated with <strong>bookillust</strong> &middot; ${formattedDate}</p>
  </footer>

</body>
</html>`;
}

function renderChapter(ch: WebChapter, bookId: string, apiBase: string): string {
  const paragraphs = ch.content
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const insertAt = ch.keyScene?.insertAfterParagraph ?? paragraphs.length;
  const imgUrl = `${apiBase}/api/books/${bookId}/chapters/${ch.number}/img`;
  const total = paragraphs.length;

  const paragraphHtml: string[] = [];
  for (let pi = 0; pi < paragraphs.length; pi++) {
    paragraphHtml.push(`    <p>${renderLines(paragraphs[pi] ?? '')}</p>`);
    if (pi === insertAt && ch.hasIllustration) {
      paragraphHtml.push(illustrationFigure(ch.number, imgUrl));
    }
  }
  // If insertAfterParagraph >= total, append illustration at end
  if (insertAt >= total && ch.hasIllustration) {
    paragraphHtml.push(illustrationFigure(ch.number, imgUrl));
  }

  const prevLink =
    ch.number > 1
      ? `<a href="#chapter-${ch.number - 1}">&larr; Previous</a>`
      : '<span></span>';
  const nextLink =
    ch.number < paragraphs.length
      ? `<a href="#chapter-${ch.number + 1}">Next &rarr;</a>`
      : '<span></span>';

  return `  <article class="chapter" id="chapter-${ch.number}">
    <div class="chapter-heading">
      <span class="chapter-number">Chapter ${ch.number}</span>
      <h2 class="chapter-title">${escHtml(ch.title || `Chapter ${ch.number}`)}</h2>
    </div>
    <div class="chapter-body">
${paragraphHtml.join('\n')}
    </div>
    <nav class="chapter-nav">
      ${prevLink}
      <a href="#toc">&#8593; Contents</a>
      ${nextLink}
    </nav>
  </article>`;
}

function illustrationFigure(chapterNum: number, imgUrl: string): string {
  return `    <figure class="illustration">
      <img src="${imgUrl}" alt="Illustration for chapter ${chapterNum}" loading="lazy">
    </figure>`;
}

function escHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderLines(paragraph: string): string {
  return paragraph.split('\n').map(escHtml).join('<br>');
}

// ── Styles (same look as the Eta template) ─────────────────────────────────────

const CSS = `<style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #faf8f4; --text: #2c2825; --text-muted: #7a7068;
      --accent: #8b5e3c; --border: #e8e0d4; --chapter-bg: #fff; --max-width: 740px;
    }
    html { font-size: 18px; }
    body { background: var(--bg); color: var(--text); font-family: Georgia,'Times New Roman',serif; line-height: 1.75; padding: 2rem 1rem 4rem; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .book-header { max-width: var(--max-width); margin: 0 auto 3rem; text-align: center; border-bottom: 2px solid var(--border); padding-bottom: 2rem; }
    .book-title { font-size: 2.4rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 0.4rem; }
    .book-author { font-size: 1.1rem; color: var(--text-muted); font-style: italic; }
    .toc { max-width: var(--max-width); margin: 0 auto 3rem; background: var(--chapter-bg); border: 1px solid var(--border); border-radius: 6px; padding: 1.5rem 2rem; }
    .toc h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-muted); margin-bottom: 1rem; }
    .toc ol { list-style: none; counter-reset: toc-counter; }
    .toc ol li { counter-increment: toc-counter; display: flex; align-items: baseline; gap: 0.5rem; padding: 0.25rem 0; border-bottom: 1px dotted var(--border); }
    .toc ol li:last-child { border-bottom: none; }
    .toc ol li::before { content: counter(toc-counter); font-size: 0.75rem; color: var(--text-muted); min-width: 1.5rem; }
    .toc ol li a { flex: 1; font-size: 0.95rem; }
    .chapter { max-width: var(--max-width); margin: 0 auto 4rem; background: var(--chapter-bg); border: 1px solid var(--border); border-radius: 6px; padding: 2.5rem 2.5rem 2rem; }
    .chapter-heading { display: flex; align-items: baseline; gap: 0.75rem; margin-bottom: 1.75rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border); }
    .chapter-number { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); white-space: nowrap; }
    .chapter-title { font-size: 1.4rem; font-weight: 700; }
    .chapter-body p { margin-bottom: 1.2rem; text-align: justify; hyphens: auto; }
    .chapter-body p:first-child::first-letter { float: left; font-size: 3.2em; line-height: 0.85; margin: 0.05em 0.1em 0 0; color: var(--accent); font-weight: 700; }
    .illustration { margin: 1.75rem -1rem; text-align: center; }
    .illustration img { max-width: 100%; height: auto; border-radius: 4px; box-shadow: 0 2px 12px rgba(0,0,0,0.12); }
    .chapter-nav { display: flex; justify-content: space-between; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border); font-size: 0.85rem; }
    .book-footer { max-width: var(--max-width); margin: 0 auto; text-align: center; font-size: 0.8rem; color: var(--text-muted); padding-top: 2rem; border-top: 1px solid var(--border); }
    @media (max-width: 600px) { html { font-size: 16px; } .chapter { padding: 1.5rem 1.25rem; } .illustration { margin: 1.5rem -0.25rem; } }
    @media print { body { background: white; padding: 0; } .chapter { border: none; } .chapter-nav { display: none; } }
  </style>`;
