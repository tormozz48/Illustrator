import { Header } from '@/components/Header.js';
import { AppShell, Container } from '@mantine/core';
import { Outlet, createRootRoute } from '@tanstack/react-router';

/**
 * Root layout for all routes
 */
export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Header />
      </AppShell.Header>

      <AppShell.Main>
        <Container size="lg">
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
