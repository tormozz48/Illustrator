/**
 * BookReader — client-side rendering of a published book.
 * Fetches reader data from GET /api/books/:id/reader-data and renders
 * the full reading experience as a React component (no iframe needed).
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronUp, Loader2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { type ReaderData, api } from '@/api/client.js';
import { Button } from '@/components/ui/button.js';
import { Separator } from '@/components/ui/separator.js';

export default function BookReader() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReaderData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getBookReaderData(id)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load book'));
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#faf8f4] px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
          <Link to="/books" className="mt-4 inline-block text-sm text-muted-foreground hover:underline">
            ← Back to library
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf8f4]">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8f4] px-4 py-10 font-serif text-[#2c2825]">
      {/* Nav bar */}
      <div className="mx-auto mb-8 flex max-w-2xl items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="text-[#7a7068] hover:text-foreground">
          <Link to="/books">
            <ChevronLeft className="size-4" />
            Library
          </Link>
        </Button>
      </div>

      {/* Book header */}
      <header className="mx-auto max-w-2xl mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight leading-tight">{data.title}</h1>
        {data.author && (
          <p className="mt-2 text-lg text-[#7a7068] italic">by {data.author}</p>
        )}
        <Separator className="mt-6 bg-[#e8e0d4]" />
      </header>

      {/* Table of contents */}
      <nav
        id="toc"
        className="mx-auto mb-10 max-w-2xl rounded-xl border border-[#e8e0d4] bg-white p-6 shadow-sm"
        aria-label="Table of contents"
      >
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#7a7068]">
          Contents
        </h2>
        <ol className="space-y-1">
          {data.chapters.map((ch) => (
            <li key={ch.number} className="flex items-baseline gap-2 border-b border-dotted border-[#e8e0d4] pb-1 last:border-b-0">
              <span className="min-w-[1.5rem] text-xs text-[#7a7068]">{ch.number}</span>
              <a
                href={`#chapter-${ch.number}`}
                className="text-[0.95rem] text-[#8b5e3c] hover:underline"
              >
                {ch.title || `Chapter ${ch.number}`}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Chapters */}
      {data.chapters.map((ch) => (
        <ReaderChapter key={ch.number} chapter={ch} />
      ))}

      {/* Footer */}
      <footer className="mx-auto mt-16 max-w-2xl border-t border-[#e8e0d4] pt-6 text-center text-xs text-[#7a7068]">
        <p>
          Generated with <strong>bookillust</strong> &middot;{' '}
          {new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </footer>
    </div>
  );
}

// ── Chapter component ─────────────────────────────────────────────────────────

interface ReaderChapterProps {
  chapter: ReaderData['chapters'][number];
}

function ReaderChapter({ chapter }: ReaderChapterProps) {
  const paragraphs = chapter.content
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean);

  // Build map: insertAfterParagraph → image URLs
  const illustrationsAt = new Map<number, string[]>();
  for (const ill of chapter.illustrations) {
    const existing = illustrationsAt.get(ill.insertAfterParagraph) ?? [];
    existing.push(ill.imageUrl);
    illustrationsAt.set(ill.insertAfterParagraph, existing);
  }

  return (
    <article
      id={`chapter-${chapter.number}`}
      className="mx-auto mb-14 max-w-2xl rounded-xl border border-[#e8e0d4] bg-white px-10 py-8 shadow-sm"
    >
      {/* Chapter heading */}
      <div className="mb-7 flex items-baseline gap-3 border-b border-[#e8e0d4] pb-4">
        <span className="text-xs font-mono uppercase tracking-widest text-[#7a7068]">
          Ch. {chapter.number}
        </span>
        <h2 className="text-xl font-bold leading-snug">
          {chapter.title || `Chapter ${chapter.number}`}
        </h2>
      </div>

      {/* Body */}
      <div className="text-[17px] leading-[1.85] text-[#2c2825]">
        {paragraphs.map((para, i) => (
          <div key={i}>
            <p
              className={
                i === 0
                  ? 'mb-5 first-letter:float-left first-letter:mr-1 first-letter:mt-1 first-letter:text-5xl first-letter:font-bold first-letter:leading-[0.8] first-letter:text-[#8b5e3c]'
                  : 'mb-5'
              }
            >
              {para}
            </p>
            {illustrationsAt.get(i)?.map((url, j) => (
              <figure key={j} className="my-7 -mx-4">
                <img
                  src={url}
                  alt={`Illustration for chapter ${chapter.number}`}
                  loading="lazy"
                  className="w-full rounded-lg shadow-md"
                />
              </figure>
            ))}
          </div>
        ))}
      </div>

      {/* Chapter nav */}
      <div className="mt-8 flex items-center justify-between border-t border-[#e8e0d4] pt-4 text-sm">
        {chapter.number > 1 ? (
          <a href={`#chapter-${chapter.number - 1}`} className="text-[#8b5e3c] hover:underline">
            ← Previous
          </a>
        ) : (
          <span />
        )}
        <a href="#toc" className="flex items-center gap-1 text-[#8b5e3c] hover:underline">
          <ChevronUp className="size-3.5" />
          Contents
        </a>
      </div>
    </article>
  );
}
