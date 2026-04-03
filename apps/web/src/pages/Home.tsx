import { useState, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import styles from './Home.module.css';

export default function Home() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const book = await api.uploadBook(file, title || undefined, author || undefined);
      navigate(`/books/${book.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploading(false);
    }
  }

  return (
    <main className={styles.main}>
      <header className={styles.hero}>
        <h1>📖 Bookillust</h1>
        <p>Upload a plain-text book and get a beautifully illustrated reading experience powered by AI.</p>
      </header>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="file">Book file (.txt)</label>
          <input
            id="file"
            ref={fileRef}
            type="file"
            accept=".txt"
            required
            disabled={uploading}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="title">Title <span className={styles.optional}>(optional — auto-detected from filename)</span></label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Moby Dick"
            disabled={uploading}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="author">Author <span className={styles.optional}>(optional)</span></label>
          <input
            id="author"
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="e.g. Herman Melville"
            disabled={uploading}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" disabled={uploading} className={styles.btn}>
          {uploading ? 'Uploading…' : 'Illustrate my book'}
        </button>
      </form>

      <div className={styles.libraryLink}>
        <a href="/books">← View your library</a>
      </div>
    </main>
  );
}
