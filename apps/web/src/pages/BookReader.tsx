/**
 * BookReader — embeds the assembled HTML in a full-page iframe.
 *
 * The assembled HTML lives at /api/books/:id/read and is served directly
 * by the Worker from R2 (or KV cache). We use an iframe so the reader's
 * own scoped CSS doesn't bleed into the SPA styles.
 */
import { Link, useParams } from 'react-router-dom';
import styles from './BookReader.module.css';

export default function BookReader() {
  const { id } = useParams<{ id: string }>();

  if (!id) return <p>Invalid book ID</p>;

  const src = `/api/books/${id}/read`;

  return (
    <div className={styles.container}>
      <nav className={styles.topBar}>
        <Link to="/books" className={styles.back}>
          ← Library
        </Link>
      </nav>
      <iframe
        className={styles.frame}
        src={src}
        title="Book reader"
        sandbox="allow-same-origin allow-scripts allow-popups"
      />
    </div>
  );
}
