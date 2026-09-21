# Phase 6B — voice, evidence and recoverable drafts

**Status: implementation and review fixes approved by the user on 21 September 2026.** Phase 6A was pushed as `051247f`. The user approved proceeding to Phase 7 after the field-home and My reports fixes. Physical Android/iPhone and team-recorded speech checks remain pending and carry into Phase 7; approval does not turn them into passed tests.

## What is available

- **Speak report** records up to 25 seconds; English, Hindi and mixed-language settings are available. The original recording and transcript are retained. The reporter corrects the words before sending.
- **Add a photo** supports three captioned photos. Private uploads are checked before submission. Photos never auto-approve completion.
- **Report → Check → Send** makes the confirmation step explicit. Upload, transcription, submission and accepted schedule progress remain distinct.
- Text drafts recover on reload. Uploaded drafts can be reopened after local storage is cleared. Lost responses use stable IDs so retries recover the same report.
- The planner sees voice as an input type, original speech alongside corrected reporting, and authorized evidence links. Accepted voice provenance survives into history/export.

The mobile interface retains the approved navy/white styling, serif headings, outline icons and Home / Report / My work / My reports navigation. Compared pages 8–11 of **Nirmaan | Website and Field PWA Design** with rendered screens. The implementation adds real upload/check states; it does not reproduce the design's illustrative sync times, predicted matches or fake successful states. Hindi speech input is supported; full Hindi interface translation remains outside this phase.

## Checks and evidence

| Check | Result |
| --- | --- |
| Type checks, fixtures, worker configuration, unit suite | Passed; 88 unit tests |
| Production Next.js build | Passed |
| Media database suite | 41 checks passed |
| Storage/role/assignment regression | 39 checks passed |
| Planner exchange/revision regression, extended with accepted voice provenance | 49 checks passed |
| Browser capture/recovery checks | 12 checks passed; desktop Chrome with synthetic microphone input |
| English synthetic provider probe | 8.018-second generated clip; 2,178 ms provider call; room references, negation and quantity retained |
| Hindi synthetic provider probe | 9.35-second generated clip; 1,110 ms provider call; returned reference wording including negation and quantity |
| Human speech benchmark | **0 recordings evaluated — pending** |
| Physical Android Chrome and iPhone Safari | **Both requested; neither verified yet** |

Provider timings are two individual local smoke observations, not end-to-end SLAs. Synthetic speech is not evidence of noisy-site accuracy. The Hindi clip was generated with OpenAI TTS; the English clip with Windows System.Speech. No official speech dataset or organisers' answer key is claimed.

The separate evaluation-command run completed both synthetic fixtures: **3 word edits / 41 reference words = 7.32% WER**, with **6/6 diagnostic critical-phrase hits**. The three word edits were English number/spelling changes (`one`→`1`, `two`→`2`, `metres`→`meters`). These are synthetic results only; the harness deliberately leaves human meaning review pending. Never present 6/6 phrase hits as general field accuracy.

Tests cover report-bound uploads, checksum mismatch, unverified read denial, immutable transcripts, concurrent identical submission, legacy-route bypass prevention, timeout retry, stale/expired leases, three-attempt limits, discarded drafts and revoked access. Exchange checks demonstrate accepted media in both JSON and evidence CSV while pending claims remain excluded.

The waste-plant demo remains at schedule version **5**, with **149 reporting leaves**, accepted quantity **1,800 m³** on `GWP-CIV-1250`, and actual dates **22–30 November 2027**. No replacement revision was activated. Media/exchange tests used disposable projects. The legacy database regression appended assignment/access audit records in the separate Duliajan fixture. A scan of 64 changed files and 24 built client assets found no configured provider key or secret-key pattern. The local web server and worker were restored for review.

Browser checks cover real AudioWorklet capture with synthetic input, actual OpenAI transcription, photo upload, editable text, resume after clearing local storage, reload, offline text retention, lost submission receipt, permission-denial fallback, expired-session and quota-error simulations, evidence opening and sign-out cleanup. Browser simulations are labelled separately from physical-phone checks.

- [Media database checks](assets/phase-06b-database.json)
- [Exchange regression](assets/phase-06b-exchange-regression.json)
- [Browser checks](assets/phase-06b-browser.json)
- [Synthetic speech probes](assets/phase-06b-synthetic-speech.json)
- [Synthetic benchmark command results](assets/phase-06b-speech-metrics.json)
- [Demo preservation check](assets/phase-06b-preservation.json), [secret scan](assets/phase-06b-secret-check.json)
- [Capture at 390px](assets/phase-06b-capture-390.png), [capture at 320px](assets/phase-06b-capture-320.png)
- [Confirmation](assets/phase-06b-confirm-320.png), [receipt](assets/phase-06b-receipt-320.png)

## Review on this computer

Open `http://localhost:3000/field` with an existing reporter account. The web app and worker must both be running. Use a fresh report; do not mark sample reports accepted merely to clear the queue.

1. Choose **Speak report**. Allow the microphone and say: “Painting in room one is not finished. Room two is complete.” Stop recording, listen, then select **Upload and transcribe**.
2. Inspect the transcript. Correct any room name, number or missing “not”. Supply the work date if known. Leave unknown details blank so clarification remains possible.
3. Add a photo **before uploading** if it belongs with the report. Once upload declarations are saved they cannot be replaced; discard the unsent draft to choose different files. Use a JPEG/PNG/WebP under 5 MB, with a short caption.
4. Select **Check report**, read the summary and **Send for review**. In My reports, inspect the corrected text, original transcript and evidence. Sending must not change the accepted schedule.
5. Try a typed draft, reload and confirm it returns. While the page is already open, disconnect and type; Send must stay unavailable until reconnected. Unuploaded audio/photos do not survive reload.
6. As planner, open Field reports and inspect the voice report. Missing details follow the existing questions/verification process; review the exact activity and before/after preview before any acceptance.

## Required Android and iPhone report

A phone cannot use the computer's `localhost` URL. Microphone access needs a trusted HTTPS test origin or a secure local development arrangement. The current prototype has not been published and this phase does not claim a usable phone HTTPS endpoint. Set up that test origin before running the physical-device checklist; ordinary LAN HTTP is insufficient.

Record phone model, OS, browser version, test URL, language and result for each row:

| Scenario | Android Chrome | iPhone Safari |
| --- | --- | --- |
| Allow microphone, record, stop, listen, transcribe | Pending | Pending |
| Deny microphone; type and send instead | Pending | Pending |
| Interrupt recording by app switch/phone lock; recover visibly | Pending | Pending |
| Reach 25 seconds; recorder releases microphone | Pending | Pending |
| Take a camera photo; preview, caption, upload, reopen evidence | Pending | Pending |
| Correct transcript and submit exactly once | Pending | Pending |
| Offline text, reconnect, reload and expired login | Pending | Pending |
| Sign out/sign in; local text removed, uploaded draft recoverable | Pending | Pending |

For any issue, report **device, screen, action, expected result, actual result and report ID**. Do not send keys or private project data. Team-recorded English/Hindi/mixed speech instructions and benchmark command are in [the speech corpus guide](../../fixtures/speech/README.md).

## Limits and next gate

### Review fix — overlapping field-home text

The reported 115-detail notification inherited inline link layout, so its padding and text overlapped the greeting. It is now a full-width block with separate title and instruction lines. The voice action combined an older absolutely positioned microphone with a newer grid, placing its title in the icon column. Consolidated this into one grid with explicit icon/title/subtitle positions. Verified the actual 115-detail screen at 320, 390, 480 and 1440 pixels: no overlapping rectangles or page overflow, and keyboard focus remains available. Production build passed. [Corrected field home](assets/phase-06b-home-fix-390.png) · [Layout verification](assets/phase-06b-home-fix.json). This CSS-only fix changes no reporting or schedule behaviour.

### Review fix — bounded My reports list

My reports now uses an independently scrolling, keyboard-focusable report region with a narrow scrollbar and stable gutter. The search/status controls stay outside the scrolling list. The field shell fits the viewport on regular phones and desktop; a 700px minimum keeps the controls usable on shorter screens, where the outer page can also scroll a small amount. No records are removed or truncated. Scroll position is saved per user/project and filter combination so opening a report and returning restores the list position. Verified the real 83-report dataset at 390×844, 320×568, 480×900 and 1440×950: no horizontal overflow; the 390px page is 844px high with a 273px list instead of roughly 14,700px of report content. Keyboard scrolling, return navigation, CIV-003 search and empty results passed. Production build passed. [Mobile report list](assets/phase-06b-reports-scroll-390.png) · [Verification](assets/phase-06b-reports-scroll.json).

No durable offline audio/photos, service-worker shell, background sync, native P6 write-back, OCR or photo-based completion judgement is claimed. Audio/transcription errors still require reporter checking. Evidence retention cleanup, multi-tab draft merging and fully translated UI remain open production work.

The user approved committing this implementation and proceeding to Phase 7. Commit message: `feat: add verified voice capture and recoverable field drafts`. Keep the outstanding device/speech evidence visible in the next stage. Full APIs, access rules, bounds and recovery behaviour are in [technical notes](../phase-06b-technical-notes.md).
