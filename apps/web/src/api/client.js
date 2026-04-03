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
const BASE = import.meta.env.VITE_API_BASE?.replace(/\/$/, '') ?? '';
async function apiFetch(path, init) {
    const res = await fetch(`${BASE}${path}`, init);
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return res.json();
}
export const api = {
    /** Upload a book file and start illustration */
    uploadBook(file, title, author) {
        const form = new FormData();
        form.append('file', file);
        if (title)
            form.append('title', title);
        if (author)
            form.append('author', author);
        return apiFetch('/api/books', { method: 'POST', body: form });
    },
    /** List all books */
    listBooks() {
        return apiFetch('/api/books');
    },
    /** Get a single book's status */
    getBook(id) {
        return apiFetch(`/api/books/${id}`);
    },
    /** List chapters for a book */
    listChapters(bookId) {
        return apiFetch(`/api/books/${bookId}/chapters`);
    },
    /** URL to stream a chapter's illustration image */
    chapterImgUrl(bookId, chapterNum) {
        return `${BASE}/api/books/${bookId}/chapters/${chapterNum}/img`;
    },
    /** Delete a book and all its data */
    deleteBook(id) {
        return apiFetch(`/api/books/${id}`, { method: 'DELETE' });
    },
};
