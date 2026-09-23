export default function Loading() {
  return (
    <div className="workspace-loading" role="status" aria-live="polite">
      <div className="loading-surface">
        <span className="loading-brand-mark" aria-hidden="true">
          <span>N</span>
          <i />
        </span>
        <span className="loading-copy">
          <strong>Loading your workspace</strong>
          <small>Preparing your project view</small>
          <span className="loading-progress-track" aria-hidden="true">
            <i />
          </span>
        </span>
      </div>
    </div>
  );
}
