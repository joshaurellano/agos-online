// Turns a thrown error or a Supabase error into one short line a person can
// act on. The raw message is for the log, never for the screen.

export function isNetworkError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!err) return false;
  const text = `${err.name ?? ''} ${err.message ?? ''}`;
  return /failed to fetch|networkerror|network request failed|load failed|fetcherror|retryablefetch|timed? ?out/i.test(text);
}

export function friendlyError(err, fallback = 'Something went wrong. Try again.') {
  if (isNetworkError(err)) return 'Could not reach the server. Check your connection.';
  const text = err?.message ?? '';
  if (err?.status === 401 || /jwt expired/i.test(text)) return 'Your session ended. Sign in again.';
  if (err?.status === 403 || err?.code === '42501') return 'You do not have permission to do that.';
  if (err?.status === 429) return 'Too many tries. Wait a minute and try again.';
  return fallback;
}

// Loading a page script can fail after a new version is deployed or when
// the connection drops mid-load.
export function isChunkLoadError(err) {
  return /dynamically imported module|importing a module script|loading chunk|loading css chunk/i.test(err?.message ?? '');
}
