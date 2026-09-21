# Speech verification corpus

No human recordings have been supplied or scored yet. The English synthetic smoke test establishes API connectivity and capture plumbing, not speech accuracy on site.

The two committed WAV fixtures are explicitly generated voices: English via Windows System.Speech, Hindi via OpenAI `gpt-4o-mini-tts`/`coral`, on 21 September 2026. They contain no human field recording. `synthetic.json` records their references and provenance. `npm run evaluate:speech -- fixtures/speech/synthetic.json` reruns these synthetic smoke cases; the browser test uses the English WAV as a fake microphone source. Keep these results separate from human recordings.

Record 12 short clips (0.2–25 seconds, mono PCM16 WAV) with team consent: four English, four Hindi, four mixed Hindi/English. Use both Android Chrome and iPhone Safari, at least two speakers, and include quiet and ordinary background-noise conditions. Keep audio in ignored `tmp/speech/`; do not commit personal recordings or keys. Agree the exact reference transcript before running ASR. Do not change gold labels to match its output.

Cover these meanings, phrased naturally in each language:

1. Room 1 painting is **not** complete; Room 2 is complete.
2. Unit 2, line 24-P-1201, spool 3 erected; two joints still await NDT.
3. Twelve metres of cable installed today, forty metres in total.
4. Work started yesterday, 21 November 2027; inspection is planned for tomorrow.

An example manifest entry (replace with an actual recorded file and manually written transcript):

```json
[
  {
    "id": "human-en-01",
    "file": "english-01.wav",
    "source": "human",
    "speaker": "consenting-team-member-A",
    "device": "Android Chrome / enter actual phone and browser version",
    "language": "en",
    "reference": "Painting in room one is not finished. Room two is complete.",
    "critical": [
      {"field": "location", "acceptedPhrases": ["room one", "room 1"]},
      {"field": "negation", "acceptedPhrases": ["not finished"]}
    ]
  }
]
```

Run `npm run evaluate:speech -- tmp/speech/manifest.json`. Each clip makes a billable OpenAI transcription call using the configured server environment key. Never paste the key in the manifest. The script validates WAV bounds before sending.

Record word error rate (word edits / reference words), successful/failed requests, duration, latency and diagnostic critical-phrase hits with denominators. Review every transcript manually for location, tag, date, quantity and negation: a transcript can contain a phrase while assigning it to the wrong room. Record each field as correct, wrong or missing, and save corrected text separately. Hindi/English script changes and number spelling can increase WER despite equivalent meaning; do not disguise that by silently rewriting references.

Before treating voice as demo-ready: all 12 clips must complete or have a visible recoverable error; each transcript must be editable before submission; every meaning error must be caught in the confirmation check; a negative/partial report must never silently complete a task. Report measured results and failures, not an unsupported universal accuracy percentage.
