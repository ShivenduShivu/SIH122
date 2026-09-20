import Link from 'next/link';
import { Icon } from '../../components/icon';
export default function FieldPage() {
  return (
    <>
      <div className="field-greeting">
        <p className="eyebrow">DEMONSTRATION PROFILE</p>
        <h1>Hello, Arun.</h1>
        <p>Your assigned work, in one place.</p>
      </div>
      <section className="site-card">
        <div className="eyebrow">DULIAJAN FACILITY EXPANSION</div>
        <h2>Pump bay / P-101</h2>
        <div className="site-card-bottom">
          <span>Civil works</span>
          <strong>04 assigned activities</strong>
        </div>
      </section>
      <Link className="field-work-link" href="/field/work">
        <div>
          <strong>View my work</strong>
          <span>Check the location and planned dates</span>
        </div>
        <span aria-hidden="true">→</span>
      </Link>
      <section aria-labelledby="report-heading">
        <div className="field-section-heading">
          <h2 id="report-heading">Report from the site</h2>
          <span>Coming in later phases</span>
        </div>
        <div className="capture-options">
          <button disabled className="voice-primary">
            <Icon name="microphone" size={20} />
            <strong>Speak a progress report</strong>
            <small>Hindi, English, or a mix of both</small>
          </button>
          <button disabled>
            <Icon name="pen" />
            <strong>Type instead</strong>
          </button>
          <button disabled>
            <Icon name="camera" />
            <strong>Add a photo</strong>
          </button>
        </div>
        <p className="field-explanation">
          Capture is not connected yet. The completed flow will ask for missing details before
          sending your update for review.
        </p>
      </section>
      <div className="field-callout">
        <strong>A clear location matters.</strong>
        <p>
          “Painting is finished” could mean more than one room. IntelliGrid will ask which room you
          mean.
        </p>
      </div>
      <p className="field-disclaimer">
        Synthetic sample profile · Not signed in
        <br />
        No reports are collected in this phase.
        <br />
        <Link href="/planner">Back to planner preview</Link>
      </p>
    </>
  );
}
