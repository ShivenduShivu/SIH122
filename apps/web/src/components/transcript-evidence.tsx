type Media = {
  attachmentId: string;
  kind: string;
  caption: string;
  originalTranscript: string | null;
  model: string | null;
};
export function TranscriptEvidence({ media }: { media?: Media[] }) {
  if (!media?.length) return null;
  return (
    <section className="source-provenance" aria-label="Original capture evidence">
      <strong>Captured evidence</strong>
      {media.map((m) => (
        <div key={m.attachmentId}>
          {m.kind === 'audio' ? (
            <details>
              <summary>Original voice transcript</summary>
              <blockquote>{m.originalTranscript}</blockquote>
              <p>
                The submitted wording was checked by the reporter. Original audio is available in
                the evidence files.
              </p>
            </details>
          ) : (
            <p>Photo caption: {m.caption || 'No caption supplied'}</p>
          )}
        </div>
      ))}
    </section>
  );
}
