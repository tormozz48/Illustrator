/**
 * BookDetail — shows live processing progress for a book that is not yet done.
 * Polls every 3 seconds and redirects to the reader once status === 'done'.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, type Book } from '../api/client.js';
import styles from './BookDetail.module.css';

const STEPS = [
  { key: 'analyzing',   label: 'Analyzing characters & world' },
  { key: 'splitting',   label: 'Splitting into chapters' },
  { key: 'anchoring',   label: 'Finding key scenes' },
  { key: 'illustrating', label: 'Generating illustrations' },
  { key: 'assembling',  label: 'Assembling reader' },
  { key: 'done',        label: 'Done!' },
];

function stepIndex(status: string): number {
  return STEPS.findIndex((s) => s.key === status);
}

export default function BookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const poll = async () => {
      try {
        const data = await api.getBook(id);
        setBook(data);
        if (data.status === 'done') {
          navigate(`/books/${id}/read`, { replace: true });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [id, navigate]);

  if (error) {
    return (
      <main className={styles.main}>
        <p className={styles.error}>{error}</p>
        <Link to="/books">← Back to library</Link>
      </main>
    );
  }

  if (!book) {
    return <main className={styles.main}><p className={styles.muted}>Loading…</p></main>;
  }

  const currentStep = stepIndex(book.status);

  return (
    <main className={styles.main}>
      <Link to="/books" className={styles.back}>← Library</Link>

      <h1 className={styles.title}>{book.title}</h1>
      {book.author && <p className={styles.author}>by {book.author}</p>}

      {book.status === 'error' ? (
        <div className={styles.errorBox}>
          <strong>Processing failed</strong>
          {book.error_msg && <p>{book.error_msg}</p>}
        </div>
      ) : (
        <ol className={styles.steps}>
          {STEPS.map((step, i) => {
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
      )}
    </main>
  );
}
