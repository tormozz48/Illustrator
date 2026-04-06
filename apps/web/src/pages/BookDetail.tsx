import { useEffect, useState } from 'react';
import { BookOpen, ChevronLeft, Loader2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { type Book, type BookProgress, type ChapterGridItem, api } from '@/api/client.js';
import { ChapterCard } from '@/components/book/ChapterCard.js';
import { ProgressSidebar } from '@/components/book/ProgressSidebar.js';
import { AppShell } from '@/components/layout/AppShell.js';
import { Button } from '@/components/ui/button.js';

export default function BookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<ChapterGridItem[] | null>(null);
  const [progress, setProgress] = useState<BookProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  // Pipeline polling
  useEffect(() => {
    if (!id) return;
    const poll = async () => {
      try {
        const data = await api.getBook(id);
        setBook(data);
        if (data.status === 'done') {
          navigate(`/books/${id}/read`, { replace: true });
        } else if (data.status === 'ready') {
          const chapterData = await api.listChaptersGrid(id);
          setChapters(chapterData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [id, navigate]);

  // Progress polling (every 5s when ready)
  useEffect(() => {
    if (!id || !book || book.status !== 'ready') return;
    const pollProgress = async () => {
      try {
        setProgress(await api.getBookProgress(id));
      } catch {
        // silent
      }
    };
    pollProgress();
    const interval = setInterval(pollProgress, 5000);
    return () => clearInterval(interval);
  }, [id, book?.status]);

  // Refetch grid on window focus
  useEffect(() => {
    if (!id || book?.status !== 'ready') return;
    const handleFocus = async () => {
      try {
        setChapters(await api.listChaptersGrid(id));
      } catch {
        // silent
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [id, book?.status]);

  const handlePublish = async () => {
    if (!id) return;
    setIsPublishing(true);
    try {
      await api.publishBook(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
      setIsPublishing(false);
    }
  };

  if (error) {
    return (
      <AppShell>
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
        <Link to="/books" className="mt-4 inline-block text-sm text-muted-foreground hover:underline">
          ← Back to library
        </Link>
      </AppShell>
    );
  }

  if (!book) {
    return (
      <AppShell>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      </AppShell>
    );
  }

  const allIllustrated =
    progress && progress.total_chapters > 0 &&
    progress.illustrated_chapters === progress.total_chapters;

  return (
    <AppShell>
      {/* Back */}
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2 text-muted-foreground">
        <Link to="/books">
          <ChevronLeft className="size-4" />
          Library
        </Link>
      </Button>

      {/* Book header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{book.title}</h1>
        {book.author && (
          <p className="mt-1 text-muted-foreground">by {book.author}</p>
        )}
      </div>

      {book.status === 'error' ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="font-semibold text-destructive">Processing failed</p>
          {book.error_msg && (
            <p className="mt-1 text-sm text-destructive/80">{book.error_msg}</p>
          )}
        </div>
      ) : (
        <div className="flex gap-8">
          {/* Main content */}
          <div className="min-w-0 flex-1">
            {(book.status === 'ready' || book.status === 'publishing') ? (
              <>
                {allIllustrated && (
                  <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <BookOpen className="size-5 text-emerald-600 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-emerald-800">All chapters illustrated!</p>
                      <p className="text-sm text-emerald-600">Your book is ready to publish.</p>
                    </div>
                    <Button
                      onClick={handlePublish}
                      disabled={isPublishing}
                      className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {isPublishing ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Publishing…
                        </>
                      ) : (
                        'Publish Book'
                      )}
                    </Button>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {chapters?.map((ch) => (
                    <ChapterCard key={ch.id} chapter={ch} bookId={id!} />
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border bg-muted/20 p-6 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">Processing your book — see pipeline status →</span>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="w-64 shrink-0">
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <ProgressSidebar book={book} progress={progress} />
            </div>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
