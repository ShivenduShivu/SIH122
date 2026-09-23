export default function Loading() {
  return (
    <div className="workspace-loading" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <span>Loading workspace</span>
    </div>
  );
}
