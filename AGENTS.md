# Project maintenance

## Keep the user guide current

- The user explicitly requires the usage guide to be updated alongside every product update. The canonical student guide is `docs/user-guide.md`, rendered directly by `/help`; do not maintain a separate copy of its text in a component.
- The English student guide is `docs/user-guide.en.md`, shown at `/help?lang=en`. Maintain both languages together, with matching feature availability, limits and dated change logs. Credentials and individual invitations must stay in ignored private files, never in either public guide.
- For changes to behavior, navigation, configuration, data coverage, difficulty labels, limits, or feature availability, update the relevant guide sections and its dated change log in the same task. For internal-only changes, inspect guide accuracy and state in the task handoff when no user-facing change is needed.
- Keep `README.md` and `docs/pilot-runbook.md` aligned when developer launch, setup, review, model, backup, or deployment steps change. Link the guide from the README and in-app help.
- Verify guide claims against current code and actual check evidence. Keep demo, real implementation, reviewed content, real provider validation, and proposed work distinct. Do not write planned exam OCR or diagnostic exemptions as implemented.

## External maths metadata

- `public/data/maths-source-index.json` and its CSV exports are an external metadata/link catalogue, separate from the private reviewed assessment bank. Refresh via `scripts/extract-maths-metadata.mjs`; curated publisher/collection evidence is in `data/maths-source-notes.json`.
- Preserve question identity (exam/year/paper/number), source labels, scope, provenance, overlap, unknown values, and 2028 applicability status. Publisher exercises are not the past-paper questions they reference.
- Never relabel website difficulty or publisher target levels as official per-question DSE grades. Unknown difficulty stays unknown. Never promote these rows to published/independent mastery evidence without the existing content process.
- Do not persist copied third-party question banks, stems, answers, explanations, credentials, or source PDFs in public assets. A source access failure must remain visible; do not fabricate extraction results.

Subagent preferences supplied by the user remain applicable; this file does not authorize extra delegation.
