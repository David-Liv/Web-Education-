# Tutor methods and PDF lessons — v1.5 verification

Updated: 2026-11-06. This document separates implementation, local fixtures, real-provider evidence and production verification.

## Implemented scope

- Versioned David and Matt methods in one conversation-creation flow, including the Learning Flow entry. Method choice is separate from model choice. Existing chats retain their legacy behavior.
- Matt's first complete topic is compulsory Mathematics quadratic equations. Other topics remain explicitly unavailable for Matt. No Tutor-authoring or video-extraction pipeline is claimed.
- Owned mission/preferences, topic-scoped learning-note candidates and confirmed personal glossary. Record candidates require an exact quote from the student's message. These are not formal mastery evidence.
- Optional chat suggestions and exercise modules, source-grounded PDF lessons, stable lesson/question numbers and document versions, owned downloads and saved-content reformatting.
- Private checked source in encrypted settings, PDF bytes in the existing owned file store. Files survive API restart; chat removal atomically removes its files/source while retaining shared learning notes.
- One operation price for a delivered lesson; internal review is included. A PDF-only failure refunds/releases credits. A manual retry can reuse checked content without additional model calls. Repeat downloads and layout rebuilds are free.
- Full profile settings save now filters server-owned fields, allowing teaching language and grade targets to be saved while preserving date/rest-day protections.

## Local automated evidence

The following checks passed on 2026-11-05/06 before publication:

- Frontend: `pnpm test` — 65 tests, 7 files.
- Backend: `pnpm test:server` — 79 tests, including 10 Tutor/profile/PDF integration checks.
- Production build: `node scripts/build-pilot.mjs` — frontend and backend type checks, generated OpenAPI, real-mode asset build and private-bank/mock-bundle guard passed. API now includes the Tutor and private-document routes.
- Tutor integration includes: scope and ownership, a real PDF binary, same-request replay, versioned revisions, hidden answers, review-failure refund, storage-failure rollback and retry without more provider calls, quoted/confirmed learning notes, a concept-only PDF fast path, unsupported-math failure and PDF/source persistence across an API restart.
- Tests use an isolated local model server; passing them does not prove real-provider output quality.

Local `check:postgres` could not start because Docker's engine was unavailable. GitHub CI subsequently passed the real isolated PostgreSQL suite: 41 checks passed and the SQLite-specific restart check was intentionally skipped. The Tutor suite uses its own disposable database; production data was never used as a destructive test database.

## Browser and PDF evidence

The real API/UI fixture used an isolated in-memory account and local model server, not live student data. Browser checks covered:

- Selecting Matt, actual PDF download, discussion draft with lesson/version/question number.
- Student reply and learning-note confirmation; personal glossary visibility.
- Saving preferences, changing to David in a new chat, and retaining relevant preferences/notes.
- English interface and English lesson delivery after saving the teaching language; the profile-save issue was reproduced and fixed.
- Desktop 1440 × 1000 and mobile 390 × 844 layouts. This is responsive browser evidence, not physical touch-device testing.

Private screenshots are under `.data/reviews/tutor/`: `chat-zh.png`, `chat-en.png`, `mobile-en.png`, `tutor-picker-mobile.png`. The private browser test downloaded `HOKSE-1-v1.pdf` successfully.

Chinese and English sample PDFs were rendered with Poppler and inspected for CJK text, formulas, table layout, plots, questions, references and pagination. Inline and table formulas use bounded MathJax SVG; diagrams use controlled numeric geometry and escaped labels. Public demo PDFs are original fixed samples with no reference answers and do not represent personalised model output.

## Real provider

The production connection configuration was read using a read-only PostgreSQL transaction, decrypted only in the local process and copied into an isolated in-memory pilot. No cloud student data, billing policy or active model configuration was changed; no keys or connection strings were emitted.

- Initial provider attempts returned HTTP 503 and correctly charged no student credit.
- After the user reported recovery, generation and review both returned HTTP 200. One review changed the structured exercise count, so delivery was rejected and credits remained zero.
- A replay of that same draft's review returned `pass`. The review request now carries the expected exercise count and explicitly requires preservation of the original exercise fences and reflective prose.
- At 2026-11-06 00:11 Hong Kong time, a complete run using the configured Flash model succeeded: generation and review both returned HTTP 200, a 131,343-byte PDF was delivered, two provider calls were logged and only one 5-credit operation was charged. The run took about 39 seconds and wrote no cloud student data. Its exercise, `3x² − 6x = −3`, was independently checked: the discriminant is zero and the repeated root is 1.
- Visual inspection of that real output exposed incorrect intrinsic SVG sizing for inline mathematics. The renderer now fits MathJax SVGs to their measured bounds. The same checked content was rebuilt without another provider call; all three pages and the final Chinese/English sample PDFs were visually inspected. Table headers are kept with their first row, and diagram height follows its content.
- Private diagnostics and generated files remain under `.data/`, never in the public assets or Git. The public fixed samples are separately authored demonstration content.

## Publication

- Published implementation: commit `6ce41bc868b025c1fc9656eb6560dd531888fa1f` on `main`.
- GitHub run [42063691028](https://github.com/David-Liv/Web-Education-/actions/runs/42063691028): all five jobs succeeded, including CodeQL and isolated PostgreSQL.
- Render deployment `dep-dbmar8avcj2c738cnb20` became `live` at 2026-11-06 00:25 Hong Kong time. The existing service remains Free; no new service, disk, worker or database was created.
- Public readback returned the matching `/assets/index-_Bk2ZVQt.js`, v1.5 bilingual guide content and document API contract. An authenticated browser showed the David/Matt selection, Mathematics topic and enabled Matt choice; the modal was cancelled without creating a conversation in the existing administrator account.
- The first production generation checks encountered upstream authentication failures; Flash explicitly returned HTTP 401 with an expired provider Cookie message. After the user requested a retry, production generation and review both returned HTTP 200. An English Matt lesson was delivered in about 53 seconds (57,305-byte PDF); two calls cost one 5-credit operation. Repeated download and saved-content reformatting did not increase the charge. Anonymous access returned 401 and a different account returned 404. The student-facing state contained no reference answers and no mastery evidence was added. All three downloaded PDF pages were visually inspected, including the multi-curve plot and exercise working space. All disposable accounts and their test records were removed; existing student data and global model settings were unchanged.
- The successful production PDF check explicitly selected Flash only for its temporary student. A subsequent administrator draft test of the Free default Lite model also returned HTTP 200 with a usable text reply; it changed no global model configuration and charged no student credits. That probe establishes text connectivity, not Lite PDF quality or availability of every model.

## Explicit limitations

- Student learning outcomes, full DSE content coverage and individual teacher fidelity have not been established by these engineering checks.
- No paper OCR, uploaded-paper diagnostic exemption, interactive PDF grading, arbitrary generated code, new simulator engine, PPT, Anki export or automatic source-extraction pipeline is introduced.
- Model output remains learning guidance. Private persisted data relies on the configured external database in production; PDF bytes are access-controlled, not separately application-encrypted.
