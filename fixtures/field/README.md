# Supplied field-input development corpus

`07-Sample_Field_Inputs.xlsx` is the unchanged, conceptual/synthetic workbook supplied by Oil India with the September 2026 clarification email. It is not live project data. SHA-256: `d458d8f2715d2dd8acc7e7867c1e7d8cb082852ef95a8c1772c95bbe7253088e`.

There are 82 source records: 46 Text_Reports, 25 Civil_DPR, seven Fabrication_Log and four Electrical_Log. `corpus.json` retains sheet names, original row numbers and cell values; the original workbook remains the authoritative source. Dates remain in 2027–2028. Blank dates in TXT-045/046 stay blank.

`expectations.json` was written before the Phase 5B provider measurements. These are team-authored development expectations, not an organiser-provided answer key or a blind test. Each row has candidate-leaf groups, indicative event kinds and a review note. A pipe separates acceptable candidate alternatives; kinds are not an exhaustive event-level gold annotation. Labels have not been revised to agree with model output.

The measurement reports whether each expected group occurs anywhere in that row's claim-level top-eight candidate lists. This is **row-level candidate coverage**, not final-link accuracy or event-level Recall@8. Extra claims, missing dates, wrong scopes and conflicting candidates still require review. Two prompt passes are preserved in the Phase 5B report assets. Reprocessing appends source versions and retains prior runs and superseded claims.

The parser supports these four explicit profiles, not arbitrary Excel files. Run `npm test` for source conservation and parser checks. The real provider evaluation is `npm run evaluate:field`; it requires the browser-import result, local database, configured OpenAI key and a stopped normal worker. Do not run queue-consuming database suites concurrently.
