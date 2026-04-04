/**
 * Typed API client — thin wrappers over fetch that talk to the Worker.
 *
 * In development: Vite proxies /api → localhost:8787 (see vite.config.ts).
 * In production:  set VITE_API_BASE to the deployed Worker URL, e.g.
 *                 https://illustrator-api.<account>.workers.dev
 *
 * If VITE_API_BASE is not set the client uses a relative path (same-origin),
 * which works when Pages and the Worker share a custom domain.
 */
const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';

export interface Book {
  id: string;
  title: string;
  author: string | null;
  status:
    | 'pending'
    | 'analyzing'
    | 'splitting'
    | 'anchoring'
    | 'illustrating'
    | 'assembling'
    | 'done'
    | 'error';
  error_msg: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChapterMeta {
  id: number;
  number: number;
  title: string;
  insert_after_para: number | null;
  has_illustration: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  /** Upload a book file and start illustration */
  uploadBook(
    file: File,
    title?: string,
    author?: string
  ): Promise<Pick<Book, 'id' | 'title' | 'status'>> {
    const form = new FormData();
    form.append('file', file);
    if (title) {
      form.append('title', title);
    }
    if (author) {
      form.append('author', author);
    }
    return apiFetch('/api/books', { method: 'POST', body: form });
  },

  /** List all books */
  listBooks(): Promise<Book[]> {
    return apiFetch('/api/books');
  },

  /** Get a single book's status */
  getBook(id: string): Promise<Book> {
    return apiFetch(`/api/books/${id}`);
  },

  /** List chapters for a book */
  listChapters(bookId: string): Promise<ChapterMeta[]> {
    return apiFetch(`/api/books/${bookId}/chapters`);
  },

  /** URL to stream a chapter's illustration image */
  chapterImgUrl(bookId: string, chapterNum: number): string {
    return `${BASE}/api/books/${bookId}/chapters/${chapterNum}/img`;
  },

  /** Delete a book and all its data */
  deleteBook(id: string): Promise<{ deleted: boolean }> {
    return apiFetch(`/api/books/${id}`, { method: 'DELETE' });
  },
};
