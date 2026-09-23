export default function Loading() {
  return (
    <div className="workspace-loading" role="status" aria-live="polite">
      <span className="loading-indicator" aria-hidden="true" />
      Loading your workspace…
    </div>
  );
}
