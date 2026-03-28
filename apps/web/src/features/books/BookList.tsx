import { Stack, Card, Text, Badge, Group, Button, LoadingOverlay } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { trpc } from '@/trpc.js';

/**
 * List of user's books
 */
export function BookList() {
  const { data: books, isLoading } = trpc.books.list.useQuery();

  if (isLoading) {
    return <LoadingOverlay visible />;
  }

  if (!books || books.length === 0) {
    return (
      <Card withBorder>
        <Text c="dimmed">No books yet. Upload your first book to get started!</Text>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      {books.map((book) => (
        <Card key={book.id} withBorder>
          <Group justify="space-between">
            <div>
              <Text fw={500}>{book.title}</Text>
              <Badge color={getStatusColor(book.status)}>{book.status}</Badge>
            </div>
            <Button component={Link} to="/books/$bookId" params={{ bookId: book.id }}>
              View Details
            </Button>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    uploading: 'gray',
    splitting: 'blue',
    generatingBible: 'cyan',
    illustrating: 'violet',
    assembling: 'indigo',
    published: 'green',
    failed: 'red',
  };
  return colors[status] ?? 'gray';
}
