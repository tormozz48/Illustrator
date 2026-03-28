import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../api/src/router.js';
import { env } from './env.js';

/**
 * Typed tRPC client for React
 * Auto-infers all types from API router
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * tRPC client configuration
 */
export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${env.VITE_API_URL}/api/trpc`,
      async headers() {
        // Clerk automatically injects auth token via context
        return {};
      },
    }),
  ],
});
