import { QueryClient } from '@tanstack/react-query';

// Single shared query client for the whole app.
//
// retry is capped at 2 rather than TanStack's default of 3 (with longer
// backoff) -- fetchModelJson() already has its own live -> backup host
// fallback baked in before a query is even allowed to fail, so by the
// time a query actually errors, extra silent retries just delay showing
// the resident an honest "prediction unavailable" state.
//
// refetchOnWindowFocus is left on (the default): if someone tabs back to
// AGOS after a while away, they get a fresh read immediately instead of
// waiting up to POLL_INTERVAL_MS for the next scheduled poll.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});
