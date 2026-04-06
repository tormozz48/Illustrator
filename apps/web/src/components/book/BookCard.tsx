import { Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Book } from '@/api/client.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card.js';
import { BookStatusBadge } from './BookStatusBadge.js';

interface BookCardProps {
  book: Book;
  onDelete: (id: string) => void;
}

export function BookCard({ book, onDelete }: BookCardProps) {
  const handleDelete = () => {
    if (confirm('Delete this book and all its illustrations?')) {
      onDelete(book.id);
    }
  };

  return (
    <Card className="gap-3 py-4 transition-shadow hover:shadow-md">
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">
              {book.status === 'done' ? (
                <Link
                  to={`/books/${book.id}/read`}
                  className="hover:text-primary hover:underline"
                >
                  {book.title}
                </Link>
              ) : (
                book.title
              )}
            </CardTitle>
            {book.author && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">by {book.author}</p>
            )}
          </div>
          <BookStatusBadge status={book.status} />
        </div>
      </CardHeader>

      {book.error_msg && (
        <CardContent className="py-0">
          <p className="text-xs text-destructive line-clamp-2" title={book.error_msg}>
            {book.error_msg}
          </p>
        </CardContent>
      )}

      <CardFooter className="gap-2 pt-0">
        {book.status === 'done' && (
          <Button asChild size="sm" variant="default">
            <Link to={`/books/${book.id}/read`}>Read</Link>
          </Button>
        )}
        {book.status !== 'done' && book.status !== 'error' && (
          <Button asChild size="sm" variant="outline">
            <Link to={`/books/${book.id}`}>View progress</Link>
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          className="ml-auto text-muted-foreground hover:text-destructive"
          onClick={handleDelete}
          aria-label="Delete book"
        >
          <Trash2 className="size-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
