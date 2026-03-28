import { createFileRoute } from '@tanstack/react-router';
import { Stack, Title, Text, Button } from '@mantine/core';
import { useUser } from '@clerk/clerk-react';
import { BookList } from '@/features/books/BookList.js';

/**
 * Home page route
 */
export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const { isSignedIn } = useUser();

  if (!isSignedIn) {
    return (
      <Stack align="center" gap="md" mt="xl">
        <Title order={1}>AI-Illustrated Books</Title>
        <Text size="lg" c="dimmed">
          Transform your stories into beautifully illustrated books
        </Text>
        <Button size="lg" component="a" href="/sign-in">
          Get Started
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Title order={1}>My Books</Title>
      <BookList />
    </Stack>
  );
}
