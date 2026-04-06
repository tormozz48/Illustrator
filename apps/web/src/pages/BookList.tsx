import { useEffect, useState } from 'react';
import { Library, PlusCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { type Book, api } from '@/api/client.js';
import { BookCard } from '@/components/book/BookCard.js';
import { AppShell } from '@/components/layout/AppShell.js';
import { Button } from '@/components/ui/button.js';

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
    const interval = setInterval(() => {
      const hasPending = books.some((b) => b.status !== 'done' && b.status !== 'error');
      if (hasPending) load();
    }, 5000);
    return () => clearInterval(interval);
  }, [books.length]);

  const handleDelete = async (id: string) => {
    await api.deleteBook(id);
    setBooks((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Library className="size-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight">Your Library</h1>
        </div>
        <Button asChild variant="default" size="sm">
          <Link to="/">
            <PlusCircle className="size-4" />
            Upload book
          </Link>
        </Button>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive mb-6">
          {error}
        </p>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-36 rounded-xl border bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && books.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed py-16 text-center">
          <Library className="size-10 text-muted-foreground/50" />
          <div>
            <p className="font-medium text-muted-foreground">No books yet</p>
            <p className="text-sm text-muted-foreground">Upload a .txt file to get started</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/">Upload your first book</Link>
          </Button>
        </div>
      )}

      {!loading && books.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <BookCard key={book.id} book={book} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
