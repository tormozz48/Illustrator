import { createFileRoute, Navigate } from '@tanstack/react-router';
import { Container, Paper, Title } from '@mantine/core';
import { useUser } from '@clerk/clerk-react';
import { SignUpForm } from '@/features/auth/SignUpForm.js';

/**
 * Sign-up page route
 */
export const Route = createFileRoute('/sign-up')({
  component: SignUpPage,
});

function SignUpPage() {
  const { isSignedIn } = useUser();

  // Redirect to home if already signed in
  if (isSignedIn) {
    return <Navigate to="/" />;
  }

  return (
    <Container size={420} my={40}>
      <Title ta="center" mb="md">
        Create your account
      </Title>

      <Paper withBorder shadow="md" p={30} radius="md">
        <SignUpForm />
      </Paper>
    </Container>
  );
}
