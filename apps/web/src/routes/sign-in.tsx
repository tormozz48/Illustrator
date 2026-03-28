import { createFileRoute, Navigate } from '@tanstack/react-router';
import { Container, Paper, Title } from '@mantine/core';
import { useUser } from '@clerk/clerk-react';
import { SignInForm } from '@/features/auth/SignInForm.js';

/**
 * Sign-in page route
 */
export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
});

function SignInPage() {
  const { isSignedIn } = useUser();

  // Redirect to home if already signed in
  if (isSignedIn) {
    return <Navigate to="/" />;
  }

  return (
    <Container size={420} my={40}>
      <Title ta="center" mb="md">
        Welcome back!
      </Title>

      <Paper withBorder shadow="md" p={30} radius="md">
        <SignInForm />
      </Paper>
    </Container>
  );
}
