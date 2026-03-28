import type { AppRouter } from '@illustrator/api';
import { type TRPCClient, httpBatchLink } from '@trpc/client';
import { type CreateTRPCReact, createTRPCReact } from '@trpc/react-query';
import { env } from './env.js';

/**
 * Typed tRPC client for React
 * Auto-infers all types from API router
 */
export const trpc: CreateTRPCReact<AppRouter, unknown, null> = createTRPCReact<AppRouter>();

/**
 * Get Clerk auth token
 * Must be called inside component context where Clerk is initialized
 */
let getAuthToken: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  getAuthToken = getter;
}

/**
 * tRPC client configuration
 */
export const trpcClient: TRPCClient<AppRouter> = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${env.VITE_API_URL}/api/trpc`,
      async headers() {
        const token = getAuthToken ? await getAuthToken() : null;
        return token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {};
      },
    }),
  ],
});
