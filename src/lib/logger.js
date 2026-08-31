// Small logging wrapper so debug/status messages (snapshot saves, alert
// dispatch, fetch failures) don't get shipped to the browser console in
// production, and so there's one place to later swap in a real logging
// service (Sentry, LogRocket, etc.) instead of hunting down 19+ scattered
// console.log/warn/error calls across the codebase.
const isDev = import.meta.env.DEV;

export const logger = {
  debug: (...args) => { if (isDev) console.log(...args); },
  warn:  (...args) => { if (isDev) console.warn(...args); },
  // Errors are still worth seeing in production (e.g. via browser devtools
  // during an incident review), so these are not gated behind isDev.
  error: (...args) => console.error(...args),
};
