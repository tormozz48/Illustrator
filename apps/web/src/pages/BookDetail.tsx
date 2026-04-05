/**
 * BookDetail — shows processing progress and chapter grid for ready books.
 * During pipeline: poll every 3s, show stepper + sidebar dashboard
 * When ready: fetch chapter grid, poll progress every 5s, show 3-col grid
 * When done: redirect to reader
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  type Book,
  type BookProgress,
  type ChapterGridItem,
  api,
} from '../api/client.js';
import styles from './BookDetail.module.css';

const PIPELINE_STEPS = [
  { key: 'analyzing', label: 'Analyzing characters & world' },
  { key: 'splitting', label: 'Splitting into chapters' },
  { key: 'anchoring', label: 'Building anchor images' },
  { key: 'preparing_scenes', label: 'Preparing scenes' },
  { key: 'ready', label: 'Ready for illustration' },
];

function stepIndex(status: string): number {
  return PIPELINE_STEPS.findIndex((s) => s.key === status);
}

function renderStepper(book: Book) {
  const currentStep = stepIndex(book.status);

  return (
    <ol className={styles.steps}>
      {PIPELINE_STEPS.map((step, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        return (
          <li
            key={step.key}
            className={`${styles.step} ${done ? styles.done : ''} ${active ? styles.active : ''}`}
          >
            <span className={styles.stepDot}>{done ? '✓' : active ? '◉' : '○'}</span>
            <span>{step.label}</span>
            {active && <span className={styles.spinner} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

function statusBadgeClass(status: string): string {
  if (status === 'illustrated') return styles.badgeIllustrated;
  if (status === 'editing') return styles.badgeEditing;
  return styles.badgeDraft;
}

export default function BookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<ChapterGridItem[] | null>(null);
  const [progress, setProgress] = useState<BookProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  // Initial load and pipeline polling
  useEffect(() => {
    if (!id) return;

    const poll = async () => {
      try {
        const data = await api.getBook(id);
        setBook(data);

        if (data.status === 'done') {
          navigate(`/books/${id}/read`, { replace: true });
        } else if (data.status === 'ready') {
          // Fetch chapter grid when transitioning to ready
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

  // Progress polling (every 5s once ready)
  useEffect(() => {
    if (!id || !book || book.status !== 'ready') return;

    const pollProgress = async () => {
      try {
        const data = await api.getBookProgress(id);
        setProgress(data);
      } catch (err) {
        // Silent fail for progress polling
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
        const data = await api.listChaptersGrid(id);
        setChapters(data);
      } catch (err) {
        // Silent fail on focus refetch
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
      // Status will transition to 'publishing' then 'done' via polling
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
      setIsPublishing(false);
    }
  };

  if (error) {
    return (
      <main className={styles.main}>
        <p className={styles.error}>{error}</p>
        <Link to="/books">← Back to library</Link>
      </main>
    );
  }

  if (!book) {
    return (
      <main className={styles.main}>
        <p className={styles.muted}>Loading…</p>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.layout}>
        <div className={styles.content}>
          <Link to="/books" className={styles.back}>
            ← Library
          </Link>

          <h1 className={styles.title}>{book.title}</h1>
          {book.author && <p className={styles.author}>by {book.author}</p>}

          {book.status === 'error' ? (
            <div className={styles.errorBox}>
              <strong>Processing failed</strong>
              {book.error_msg && <p>{book.error_msg}</p>}
            </div>
          ) : book.status === 'ready' || book.status === 'publishing' ? (
            <>
              {progress &&
                progress.total_chapters > 0 &&
                progress.illustrated_chapters === progress.total_chapters && (
                  <button
                    className={styles.publishBtn}
                    onClick={handlePublish}
                    disabled={isPublishing}
                  >
                    {isPublishing ? 'Publishing…' : '📖 Publish Book'}
                  </button>
                )}
              <div className={styles.grid}>
                {chapters?.map((ch) => (
                  <div
                    key={ch.id}
                    className={styles.card}
                    onClick={() => navigate(`/books/${id}/chapters/${ch.number}`)}
                  >
                    <div className={styles.cardHeader}>
                      <span className={styles.chapterNum}>Ch. {ch.number}</span>
                      <span className={`${styles.statusBadge} ${statusBadgeClass(ch.status)}`}>
                        {ch.status === 'illustrated'
                          ? '✓ Illustrated'
                          : ch.status === 'editing'
                            ? 'Editing'
                            : 'Draft'}
                      </span>
                    </div>
                    <h3 className={styles.cardTitle}>{ch.title || `Chapter ${ch.number}`}</h3>
                    <p className={styles.cardPreview}>{ch.content_preview}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            renderStepper(book)
          )}
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.sidebarSection}>
            <h3>Pipeline</h3>
            {renderStepper(book)}
          </div>

          {progress && progress.total_chapters > 0 && (
            <div className={styles.sidebarSection}>
              <h3>Chapters</h3>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{
                    width: `${(progress.illustrated_chapters / progress.total_chapters) * 100}%`,
                  }}
                />
              </div>
              <p className={styles.progressText}>
                {progress.illustrated_chapters} / {progress.total_chapters} illustrated
              </p>
              <div className={styles.chapterCounts}>
                <span>Draft: {progress.draft_chapters}</span>
                <span>Editing: {progress.editing_chapters}</span>
                <span>✓ {progress.illustrated_chapters}</span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
