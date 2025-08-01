// utils/trpc.ts - CORRECTED for @trpc/react-query
import { createTRPCReact, httpBatchLink, loggerLink } from '@trpc/react-query';
import type { AppRouter } from '../types/trpcTypes/app-router'; // <--- CRITICAL: FIX THIS PATH
import superjson from 'superjson';

export const trpc = createTRPCReact<AppRouter>(); // Use your actual AppRouter here, not <any>

const getBaseUrl = () => {
  // Ensure this is the correct base URL for your tRPC backend
  return 'http://192.168.0.170:7001';
};

export const trpcClient = trpc.createClient({ // Renamed to trpcClient to avoid confusion
  links: [
    loggerLink({
      enabled: (opts) =>
        process.env.NODE_ENV === 'development' ||
        (opts.direction === 'down' && opts.result instanceof Error),
    }),
    httpBatchLink({
      url: `${getBaseUrl()}/trpc`, // IMPORTANT: Make sure your tRPC router is at /trpc path on your server
                                 // e.g., http://192.168.0.170:7001/trpc
      headers() {
        return {
          // Add any headers like Authorization if needed
        };
      },
    }),
  ],
  transformer: superjson,
});

