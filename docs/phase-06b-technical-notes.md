# Phase 6B — verified field capture

Status: software implementation under review; real-phone and human speech checks remain open. No Phase 7 deployment has been started.

## Data flow

1. The signed-in reporter records up to 25 seconds or types a report. They can add up to three photos with captions. The browser stores text and capture identifiers locally, scoped to user and project.
2. Reservation creates a **draft** report at version **0**, immutable file declarations and private upload locations. No extraction job exists yet. Repeating the same capture ID and declarations returns the same report; changing them conflicts.
3. The browser uploads directly to signed private Storage URLs. Finalization checks that each expected object exists at the declared size, then queues validation. It does not trust client duration or a filename suffix.
4. The worker leases a file, downloads it, checks SHA-256 and size, validates its bytes, then transcribes audio. A photo is decoded for format and size checks only; no vision model infers completion.
5. The original transcript is immutable. The reporter edits a separate text field, checks work date/task/evidence and explicitly selects **Send for review**. Submission creates one immutable report version and one extraction job in a transaction.
6. Existing extraction, clarification, independent supervisor verification and planner acceptance rules apply. Accepted events update the schedule through the existing transaction. Pending media/report content never creates accepted bars. Exported accepted events carry media provenance, original transcript and checksums; evidence access still requires authorization.

## Storage and contracts

| Record | Purpose |
| --- | --- |
| `reports`, version 0 | Server upload draft; omitted from review/report registers until submission |
| `field_captures` | Reservation manifest and final submission fingerprint |
| `attachments` | Bound project/report/file ID, path, bytes, MIME, hash, caption and language |
| `media_jobs` | File validation/transcription work, attempts, lease and public error code |
| `media_results` | Immutable original transcript, provider/model, verified byte hash and metadata |
| `report_versions.context.media` | Frozen provenance copied into the confirmed report version |
| local storage | User/project draft text, date, selected task, stable IDs and retry payload; **not raw media** |

Migrations `202609210011_field_media.sql` and `202609210012_media_evidence.sql` are forward migrations. They were applied without resetting the local database. Old unrestricted personal evidence-upload policies are removed. A new object must match a reserved attachment belonging to the current author and project. Uploads cannot overwrite existing objects. Verified attachment metadata and original transcripts cannot be edited. Discarding a draft does not erase history or delete objects; object retention/cleanup is an operator concern and has no automatic production policy yet.

Only the current author can reserve, resume, finalize, submit or discard their capture through these APIs. Planner authority does not let someone submit a reporter's draft on their behalf. Existing project RLS governs attachment visibility, including planners' authorized evidence reads. Evidence is private to authorized project users, not promised to be hidden from authorized planners. Revocation blocks new reads and writes. Already issued signed download URLs remain bearer links until their 60-second expiry.

## API surface

All mutation routes require the signed-in session and same-origin request. Routes use the caller's database session; the web server does not use a service-role credential.

| Method and route | Result |
| --- | --- |
| `GET /api/v1/projects/:projectId/captures` | Own unsubmitted upload drafts, maximum 20 |
| `POST /api/v1/projects/:projectId/captures` | Stable capture reservation plus signed upload URLs for unverified files |
| `GET /api/v1/captures/:captureId` | Own draft/receipt state, manifest and file processing results; this ID is the **report ID** |
| `POST /api/v1/captures/:captureId/finalize` | Confirm uploaded objects and enqueue/retry validation |
| `POST /api/v1/captures/:captureId/submit` | Confirm corrected text/date/task; return the same receipt on identical retry |
| `POST /api/v1/captures/:captureId/discard` | Abandon a version-0 draft; cannot discard a submitted report |
| `GET /api/v1/attachments/:attachmentId/access` | Existing endpoint: authorized signed URL, filename and expiry as JSON |

Clients must fetch evidence access metadata and open the returned signed URL, not navigate to the JSON endpoint. The evidence control opens a tab within the user gesture to avoid delayed-popup blocking; a normal link is offered if the browser blocks that tab.

## Provider and byte limits

OpenAI handles both extraction and transcription through separate adapters and calls. Transcription defaults to `gpt-4o-mini-transcribe-2025-12-15`; `OPENAI_TRANSCRIPTION_MODEL` can override it in the **worker environment**. This supported dated model passed live English and Hindi synthetic probes. This is a measured connectivity choice, not a claim that it outperforms other models. The current [OpenAI speech guide](https://developers.openai.com/api/docs/guides/speech-to-text) and [model page](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe) were checked during implementation.

- AudioWorklet captures mono PCM; the client creates a PCM16 WAV instead of depending on browser-specific WebM/MP4 encoders.
- Worker accepts WAV with valid RIFF sizes, PCM16 mono, supported sample rates (16/22.05/24/44.1/48 kHz), aligned data and duration **0.2–25 seconds**. Files are capped at **5 MB**; a 25-second 48 kHz capture is about 2.4 MB. Quiet/silent input is rejected before provider use; this is an amplitude check, not a reliable speech detector.
- Photos: **three maximum**, JPEG/PNG/WebP, **5 MB each**, **20 million decoded pixels**, one image. Sharp verifies the declared MIME against decoded format. HEIC, PDF, OCR and arbitrary video are outside this flow. Original photo metadata may remain in the stored evidence; this phase does not claim metadata scrubbing or malware scanning.
- One recording plus three photos maximum. Twenty outstanding server drafts per author/project. The saved-upload list lets users resume or discard old uploads.
- Transcription timeout: **45 seconds**. Lease: **90 seconds**. At most **three processing attempts**. Expired leases can be reclaimed; stale tokens cannot replace a newer result. Worker failures remain visible and require retry; silence and invalid bytes are not silently treated as successful transcripts.
- API key and service credential stay in the worker. Audio is sent to OpenAI on transcription. Photos are stored privately and are not sent to a vision model.

## Recovery semantics

| Situation | Behaviour |
| --- | --- |
| Offline while the form is already open | Text can be edited and saved locally; upload/send disabled |
| Reload with connectivity | Restore valid local text and stable IDs; reload uploaded file state |
| Reload before uploading audio/photo | Media in memory is lost; visible instruction to select again or restart a reserved draft |
| Upload succeeded but acknowledgement lost | Same reservation/path, no overwrite; retry finalizes the existing object |
| Transcription failed | Original uploaded bytes stay available for a bounded retry |
| Submission succeeded but response lost | Locked submission payload and polling recover the same receipt; no second extraction job |
| Session expired | Visible sign-in message; locally saved draft remains scoped to the same user/project |
| Browser storage fails | Visible warning to keep the page open/copy text; no false “saved” claim |
| Sign out | Remove that user's local drafts; already uploaded drafts remain recoverable after sign-in |
| Local draft expires | Seven days since last local save; reject invalid/mismatched stored payloads |

There is **no service worker, offline shell, durable raw-media queue or background sync**. Loading the page again needs connectivity. Multi-tab simultaneous editing of a local draft is not merged; use one capture tab per user/project. Same capture IDs still protect the server from divergent duplicate submissions. Do not describe this implementation as a fully offline PWA.

The selected task is reporting context, not proof that work happened there. Speech must still name missing locations and dates or enter the existing clarification flow. The transcript confirmation screen does not perform speculative completion inference.

## Verification boundary

Unit checks validate audio limits, draft schema/isolation and WER accounting. Database tests validate authority, stable IDs, leases, immutable evidence and accepted export provenance. Desktop Chrome uses explicitly synthetic audio through its fake microphone; this verifies the browser capture path and real provider connection. It does not simulate a phone's operating-system interruptions, camera or network stack.

The synthetic fixtures and benchmark instructions are in `fixtures/speech/`. `evaluate:speech` reports per-source denominators and WER, request failures, latency and critical phrase hits. Phrase presence does not prove meaning: human reviewers must check which room, asset and quantity each statement refers to, especially negation. Human recordings and real Android Chrome/iPhone Safari checks are still required before closing this phase's device/speech gate.
