// Shown while a lazy page or the sign-in check is loading.
export default function PageLoader({ fullscreen = false }) {
  return (
    <div className={`page-loader${fullscreen ? ' page-loader-full' : ''}`} role="status" aria-live="polite">
      <span className="page-loader-spinner" aria-hidden="true" />
      <span className="visually-hidden">Loading</span>
    </div>
  );
}
