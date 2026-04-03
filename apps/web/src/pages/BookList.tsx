import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, type Book } from '../api/client.js';
import styles from './BookList.module.css';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Queued',
  analyzing: 'Analyzing…',
  splitting: 'Splitting chapters…',
  anchoring: 'Finding key scenes…',
  illustrating: 'Generating illustrations…',
  assembling: 'Assembling reader…',
  done: 'Done',
  error: 'Error',
};

function StatusBadge({ status }: { status: Book['status'] }) {
  return (
    <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default function BookList() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await api.listBooks();
      setBooks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load books');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Poll every 5 s if any book is in-progress
    const interval = setInterval(() => {
      const hasPending = books.some((b) => b.status !== 'done' && b.status !== 'error');
      if (hasPending) load();
    }, 5000);
    return () => clearInterval(interval);
  }, [books.length]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this book and all its illustrations?')) return;
    await api.deleteBook(id);
    setBooks((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>Your Library</h1>
        <Link to="/" className={styles.uploadBtn}>+ Upload book</Link>
      </header>

      {loading && <p className={styles.muted}>Loading…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!loading && books.length === 0 && (
        <p className={styles.empty}>No books yet. <Link to="/">Upload one!</Link></p>
      )}

      <ul className={styles.list}>
        {books.map((book) => (
          <li key={book.id} className={styles.card}>
            <div className={styles.cardMain}>
              <div className={styles.cardTitle}>
                {book.status === 'done' ? (
                  <Link to={`/books/${book.id}/read`}>{book.title}</Link>
                ) : (
                  <span>{book.title}</span>
                )}
              </div>
              {book.author && <div className={styles.cardAuthor}>by {book.author}</div>}
              <div className={styles.cardMeta}>
                <StatusBadge status={book.status} />
                {book.error_msg && (
                  <span className={styles.errorMsg} title={book.error_msg}>⚠ {book.error_msg.slice(0, 80)}</span>
                )}
              </div>
            </div>
            <div className={styles.cardActions}>
              {book.status === 'done' && (
                <Link to={`/books/${book.id}/read`} className={styles.readBtn}>Read</Link>
              )}
              {(book.status === 'pending' || book.status !== 'done') && book.status !== 'error' && (
                <Link to={`/books/${book.id}`} className={styles.progressBtn}>Progress</Link>
              )}
              <button
                className={styles.deleteBtn}
                onClick={() => handleDelete(book.id)}
                aria-label="Delete book"
              >
                🗑
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
