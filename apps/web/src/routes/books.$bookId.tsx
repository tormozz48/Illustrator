import { createFileRoute } from '@tanstack/react-router';
import { Stack, Title, LoadingOverlay } from '@mantine/core';
import { trpc } from '@/trpc.js';
import { BookDetails } from '@/features/books/BookDetails.js';
import { ChapterList } from '@/features/chapters/ChapterList.js';
import { BookProgress } from '@/features/books/BookProgress.js';

/**
 * Book detail page route
 */
export const Route = createFileRoute('/books/$bookId')({
  component: BookDetailPage,
});

function BookDetailPage() {
  const { bookId } = Route.useParams();

  const { data: book, isLoading } = trpc.books.get.useQuery({ bookId });

  if (isLoading) {
    return <LoadingOverlay visible />;
  }

  if (!book) {
    return <Title order={2}>Book not found</Title>;
  }

  return (
    <Stack gap="md">
      <BookDetails book={book} />
      <BookProgress bookId={bookId} />
      <ChapterList bookId={bookId} />
    </Stack>
  );
}
