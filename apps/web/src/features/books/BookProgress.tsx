import { useEffect, useState } from 'react';
import { Card, Progress, Text, Stack } from '@mantine/core';
import { env } from '@/env.js';

interface BookProgressProps {
  bookId: string;
}

interface ProgressData {
  status: string;
  progress: number;
  currentStep: string;
}

/**
 * Real-time book processing progress via SSE
 */
export function BookProgress({ bookId }: BookProgressProps) {
  const [progress, setProgress] = useState<ProgressData | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(`${env.VITE_API_URL}/api/progress/${bookId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data) as ProgressData;
      setProgress(data);

      // Close connection when complete or failed
      if (data.status === 'published' || data.status === 'failed') {
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [bookId]);

  if (!progress) {
    return null;
  }

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Text size="sm" fw={500}>
          {progress.currentStep}
        </Text>
        <Progress value={progress.progress} size="lg" animated={progress.progress < 100} />
        <Text size="xs" c="dimmed">
          {progress.progress}% complete
        </Text>
      </Stack>
    </Card>
  );
}
