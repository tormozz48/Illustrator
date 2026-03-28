import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { env } from './env.js';
import { routeTree } from './routeTree.gen.js';
import { setAuthTokenGetter, trpc, trpcClient } from './trpc.js';
import '@mantine/core/styles.css';

/**
 * TanStack Query client
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * TanStack Router instance
 */
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
});

/**
 * Type augmentation for router context
 */
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

/**
 * Root element
 */
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

/**
 * App wrapper that initializes auth token getter
 */
function App() {
  const { getToken } = useAuth();

  // Initialize auth token getter for tRPC
  setAuthTokenGetter(() => getToken());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <MantineProvider>
          <RouterProvider router={router} />
        </MantineProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

/**
 * App entry point
 */
createRoot(rootElement).render(
  <StrictMode>
    <ClerkProvider publishableKey={env.VITE_CLERK_PUBLISHABLE_KEY}>
      <App />
    </ClerkProvider>
  </StrictMode>
);
