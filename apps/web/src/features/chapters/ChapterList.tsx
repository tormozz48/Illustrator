import { Stack, Card, Text, Badge, Image, LoadingOverlay } from '@mantine/core';
import { trpc } from '@/trpc.js';

interface ChapterListProps {
  bookId: string;
}

/**
 * List of chapters for a book
 */
export function ChapterList({ bookId }: ChapterListProps) {
  const { data: chapters, isLoading } = trpc.chapters.list.useQuery({ bookId });

  if (isLoading) {
    return <LoadingOverlay visible />;
  }

  if (!chapters || chapters.length === 0) {
    return (
      <Card withBorder>
        <Text c="dimmed">No chapters yet</Text>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      {chapters.map((chapter) => (
        <Card key={chapter.id} withBorder>
          <Stack gap="sm">
            <Text fw={500}>
              Chapter {chapter.chapterNumber}: {chapter.title}
            </Text>

            <Badge color={getStatusColor(chapter.status)}>{chapter.status}</Badge>

            {chapter.sceneDescription && (
              <Text size="sm" c="dimmed" lineClamp={2}>
                {chapter.sceneDescription}
              </Text>
            )}

            {chapter.illustrationUrl && (
              <Image src={chapter.illustrationUrl} alt={chapter.title} radius="md" />
            )}
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'gray',
    processing: 'blue',
    completed: 'green',
    failed: 'red',
  };
  return colors[status] ?? 'gray';
}
