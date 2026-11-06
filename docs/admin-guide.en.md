# HOKSE Administrator Manual

v1.6 · 6 November 2026. For maintaining accounts, content, AI services and programme data.

Navigation can collapse to icons on desktop and remembers the browser preference. Calendar moves and Undo use the same ownership, conflict and budget checks; they do not call AI.

## 1. Administrator workspace

Sign in with the developer role and open Content & Developer Settings. Students see the student guide. Administrator-guide reads and downloads check the server-side role; reviewers do not have access. Do not share administrator accounts.

## 2. Accounts and data

Create students or reviewers under Invite Accounts. New accounts normally require passwords of at least 10 characters; previously assigned short trial passwords still work. Student data is account-scoped. Signing out revokes that session.

Attachments are stored for viewing and authorised manual review. Text models do not automatically read attached images or recordings. Do not describe paper OCR or diagnostic exemptions as implemented. The upload limit is 20 MB per file; accepted types are shown by the picker. Keep exports and backups private and out of public assets and Git.

## 3. Model service

Enter the shared Base URL, protocol and API key under Model Service, fetch the list, choose an admin test model, then enable the service. Discovery reads model IDs only. Admin generation tests incur real provider costs but use no student credits.

Students choose separate quiz, conversation and assessment models. Independent quiz generation and repairs use the quiz model. Conversations, guided reading, quick exercises and plan explanations use the conversation model. Marking and error analysis use assessment. Only independent quiz generation has the full format-check and bounded repair workflow.

The server permits only the approved PGGO anti-truncation route. Display names hide routing labels; technical requests and exports retain exact IDs. Keys are encrypted. A blank key keeps it for the same URL; a changed URL needs a new key. A successful text test does not validate teaching quality, images, native streaming or all structured output.

## 4. Plans and credits

Plan settings control Free/Plus/Pro monthly allowances, simulated prices, allowed models, per-purpose defaults and operation prices. Initial allowances are 500/2,000/5,000; Lite/Flash/Argon initially cost 2/5/20 credits per operation. Current settings take precedence.

Checkout simulates success without collecting card details or charging money. A simulated upgrade still increases access to real AI calls and can raise provider costs. Internal credits are not an actual provider-spending cap.

Reserve before settling; failures, invalid results and cancellation release reservations. Internal quiz repairs share one operation charge. Credits reset at the Hong Kong month boundary without rollover. Upgrades change the cap without erasing spent credits; cancellations and downgrades apply next period. Configuration versions and actor records are retained.

## 5. AI logs and support

Search users or models and filter by status and Hong Kong dates. The eye icon shows request summaries, status, tokens, duration and settlement. Missing tokens remain unknown. Response text is available only through protected single JSON or filtered JSONL exports.

Logs retain up to 1,000 upstream calls for 30 days, with at most 30,000 response characters and key redaction. Credit ledgers, orders and learning history are separate. Inspect content only for necessary support and protect exports. The student guide retains notice of this access.

Chat uses controlled Markdown and bounded JSON blocks for charts, plots, geometry, diagrams, circuits and exercises. Suggested next steps are requested in the same conversation-model call; invalid suggestions use local defaults with no repair calls. Clicking only fills a draft. Answer reveals and exports are local operations. Rendering uses app-owned React/SVG components, never model HTML, JavaScript or Python. Diagram format checks do not certify subject accuracy. Old text-only replies remain readable. The first call completes before ordinary explanations appear; practice is added to the same floor after checking. Native token streaming remains a separate follow-up.

Configure the site-wide chat practice reviewer in Plan and model rules. It defaults to Flash and is independent of students’ three model selections. Hidden review routing metadata and conservative guards gate new exercises and worked answers; unmarked legacy-format responses receive full review. Saved historical replies are not automatically rechecked. Each request has at most one automatic review and one student credit charge. Logs distinguish generation and review; review details link to a protected revision-record export. No usable delivery releases the reservation. A delivered explanation retains its original charge, with one free manual retry for failed practice on that floor.

Jobs use the existing API process, with no paid worker. Hidden drafts and revisions are encrypted in settings; student state contains only displayable content. Disconnecting does not cancel work. Explicit Stop, deletion and server shutdown cancel it. After a restart, expired leases become retryable failures when the conversation is read; they are never automatically re-sent. Native token streaming remains deferred; ordinary explanations are sent as soon as the first call completes. See docs/chat-review-contract.md.

## 6. Content and learning evidence

Coaching uses original reference material and provisional AI feedback. The original formal content bank retains its review and publication process. Rules mark objective answers; uncertain subjective answers stay unknown. Hints, repeats and self-ratings are not independent mastery.

Students can flag feedback. Check the actual answer and criterion before handling an exception. Do not infer whole-subject DSE grades from a few unit questions.

## 7. Programme data and reference scoring

Programme snapshots retain sources. The current import contains 431 JUPAS and four non-JUPAS reference entries, not a claim to cover every Hong Kong programme. The import process retains coverage reports, source gaps and anomalies.

All programmes support reference scoring and prioritisation. Separate source rules, published reference multipliers and platform assumptions. The shared deterministic calculator handles Best 4/5/6, required groups, M1/M2, exclusions, bonuses and weighted-subject limits.

The personal reference index scales earned/maximum score to 0–7 using the same subjects and rules for current and target grades. It does not claim to reproduce the source site's internal normalisation. Do not mix means with medians or raw points with indices.

Without a historical median, prefer a designated reference, then same-institution or cross-institution peers. Peer estimates require at least three programmes, one recent value per programme. Without enough data, retain unknown. QS 2027 directional notes are the agreed platform assumption; they never adjust points or imply admission probability. Missing rankings or mixed directions produce no directional judgement.

The main goal drives planning; backups support comparison and shared-benefit notes. Changed goals, grades, evidence or calendar state require a new preview, and rule versions participate in expiry checks. Programme comparisons make no AI calls and use no credits.

## 8. Releases and troubleshooting

The existing GitHub Actions checks must pass before Render publishes main. Keep the Free service. Maintain the workspace's extra build-spend limit in Render. Production requires external PostgreSQL; student data must not depend on an ephemeral filesystem.

Keep keys, connection strings, backups and individual invitations in private configuration, never Git. Developer, backup and verification procedures are in docs/pilot-runbook.md and docs/deployment-verification.md. Documentation in the public repository is not secret storage; never put credentials in this manual.

For provider failures, inspect status and protocol. For balances, inspect operation settlement rather than deleting logs. For scheduling, inspect capacity, locks and rest days. Use actual deployment records for release status; local checks are not production acceptance.

4 November 2026 visual probe: after provider recovery, Flash returned charts, a circuit and concept diagrams. Bounded compatibility now accepts empty optional text and maps `tree` to the existing flow layout, retaining node and edge validation. One extra practice answer disagreed with its explanation; the same-call prompt now asks for a consistency check, without adding chat repair calls or guaranteeing correctness. Operable sliders and record forms remain unimplemented. See docs/chat-content-verification.md for evidence and the initial upstream `no_credential` failure.

## 9. Administrator release record

- v1.3 / 5 November 2026: one-pass chat practice review, updates in the original floor, one failure retry, and an administrator-configured reviewer.
- v1.2 / 4 November 2026: rich chat replies, contextual draft suggestions and collapsible quick-practice answers; one-call generation and local visual exports.
- v1.1 / 4 November 2026: programme data and reference scoring integration; separate student and administrator guides; student release notes use product-level version summaries.
- v1.0: account isolation, three-subject coaching, per-purpose models, plan allowances and usage logs.

Manual reference: HOKSE_ADMIN_OPERATIONS_1_1.


## Tutor methods and PDF lessons

David and Matt are versioned teaching methods, separate from model selection. New UI conversations bind a method; old conversations keep their original behavior. Matt’s first covered topic is compulsory Mathematics quadratic equations. Curated resources and the adapted methods ship with the server; the ignored local skill checkout is not a runtime dependency. Matt attribution and MIT notice are included in server/assets.

Lesson generation uses the conversation model, and new exercises/solutions use the existing review route. It does not enter the formal assessment repair workflow. PDF generation is deterministic and uses PDFKit, embedded OFL Noto Sans TC and MathJax vector formulas, without a browser worker or another cloud service. Each new lesson/revision is one operation. Pure concept lessons can avoid an unnecessary exercise review. Downloads and rebuilding the saved layout make no model calls. PDF-only failures release credits; checked content stays private for the original one-time retry.

Document metadata is in the owned chat; checked source content, including answers, is encrypted in settings. The student PDF excludes exercise hints and answers. PDF bytes use the existing account-owned files store and global 100 MiB attachment guard; bytes are not separately encrypted by the application. PDF output is capped at 16 pages and 5 MiB. Production persistence requires the existing external PostgreSQL. Deleting a chat removes its documents and private source; shared learning notes remain. No new DDL or paid storage is provisioned.

Learning-note proposals must quote the student’s current message exactly. Student confirmation can add a personal glossary entry, but does not change independent mastery, grades or calendar. Only relevant topic records enter the tutor context. Three suggestions and chat cards are optional for method-bound conversations; legacy chats keep their previous fallback. The mock uses a labelled, fixed original sample PDF, not a personalised generation.

Run server/tutors.check.ts plus the existing suites and production build; isolated PostgreSQL checks include the same Tutor suite. Verify real-provider file delivery, ownership, restart persistence and visual PDF quality separately. Do not infer those results from a model connection test.

## v1.6 learning-loop operations

The first full targeted-practice flow covers six compulsory-Mathematics quadratic skills. Student JSON retains private question snapshots, tutor/document versions, assistance, attempts and merged next-day review entries. No schema or additional paid service is required. Old coarse records are not redistributed into the six new skills.

Auto selection prefers original, code-checkable variants and avoids previously registered wording; if it cannot supply enough new items, assessment generation uses the quiz model and bounded validation. Numeric expressions use a bounded parser. Unrecognised expressions and missing modelling methods stay uncertain or receive AI reference feedback. These provisional results are separate from the reviewed bank and whole-subject DSE grades.

An explicitly linked chat answer and its feedback share one conversation operation. Hints, answers and discussion assistance are tied to question content, across tutors. One appeal per attempt uses code when possible, otherwise the site-wide review model at platform expense; it remains available at zero student allowance. Repeated claims do not generate more calls. Failure or expired work remains uncertain and excluded, with no automatic retry. The legacy dispute control remains for older records.

Skill reviews merge by skill and learning date. Retests use one or two new items; early practice is allowed but does not bypass the 24-hour, multiple-question and family conditions. Planning still uses budgets, rest days, protected tasks and stale-preview checks. PDF export renders saved questions without generation or revealing reference answers.

Before release, run the practice suite, full server suite, build and isolated PostgreSQL checks. Record browser, real-provider and live checks separately in the v1.6 verification document. Do not describe engineering checks as demonstrated learning gains. OCR, handwritten grading and whole-paper diagnostic exemptions remain outside this release.
