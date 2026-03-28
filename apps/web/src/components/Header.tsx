import { Group, Button, Text } from '@mantine/core';
import { useUser, useClerk } from '@clerk/clerk-react';
import { Link } from '@tanstack/react-router';

/**
 * App header with navigation and auth controls
 */
export function Header() {
  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();

  return (
    <Group h="100%" px="md" justify="space-between">
      <Link to="/">
        <Text size="xl" fw={700}>
          Illustrator
        </Text>
      </Link>

      <Group>
        {isSignedIn ? (
          <>
            <Text size="sm">Hello, {user.firstName ?? user.emailAddresses[0]?.emailAddress}</Text>
            <Button variant="subtle" onClick={() => signOut()}>
              Sign Out
            </Button>
          </>
        ) : (
          <>
            <Button component={Link} to="/sign-in" variant="subtle">
              Sign In
            </Button>
            <Button component={Link} to="/sign-up">
              Sign Up
            </Button>
          </>
        )}
      </Group>
    </Group>
  );
}
