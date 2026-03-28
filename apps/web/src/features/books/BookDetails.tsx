import { Card, Stack, Text, Badge, Group } from '@mantine/core';
import type { BookSelect } from '@illustrator/shared/db';

interface BookDetailsProps {
  book: BookSelect;
}

/**
 * Display book details
 */
export function BookDetails({ book }: BookDetailsProps) {
  return (
    <Card withBorder>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text size="xl" fw={700}>
            {book.title}
          </Text>
          <Badge size="lg" color={getStatusColor(book.status)}>
            {book.status}
          </Badge>
        </Group>

        <Text size="sm" c="dimmed">
          Created: {new Date(book.createdAt).toLocaleDateString()}
        </Text>

        {book.errorMessage && (
          <Text size="sm" c="red">
            Error: {book.errorMessage}
          </Text>
        )}

        {book.expectedChapters && (
          <Text size="sm">
            Chapters: {book.completedChapters} / {book.expectedChapters} completed
          </Text>
        )}
      </Stack>
    </Card>
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
