# v1.3 chat practice review verification

5 November 2026. Scope and recovery behavior: [chat review contract](chat-review-contract.md).

## Implementation

- Added one site-wide administrator-selected reviewer, defaulting to the approved Flash route. It does not change students' quiz/chat/evaluation choices. Provider logs distinguish generation and review while retaining the original operation and cost.
- Added revisioned same-floor message snapshots, gated exercise/solution delivery, one manual retry, private encrypted drafts/revisions, explicit stop and deletion guards, disconnected-viewer continuation and expired-lease recovery. No worker, paid service, new dependency or database DDL was added.
- Ordinary concept replies with valid routing metadata remain one call. A mixed reply can deliver its leading explanation before one review; pure exercises and worked answers wait. Missing markers conservatively receive full review. Semantic classification is not infallible.
- The narrow arithmetic rejection guard catches the reproduced scalar answer/explanation mismatch. It does not prove arbitrary word-problem semantics. The second model's verdict is still AI reference.
- Both student guides, administrator guides, release notes, developer runbook and public API contract were updated. Student replies have no review badges.

## Automated evidence

- Frontend/domain suite: **89 tests across eight files passed**. The new test covers hidden routing metadata and its exclusion from model history; existing safe Markdown, visual and exercise rendering checks remain passing.
- Backend suite: **67 tests passed**, including nine new review/lifecycle cases. They cover the reproduced numerical contradiction, separate generator/reviewer IDs with one charge, replay, private-draft isolation, partial delivery, disconnect continuation, full refund and retry, paid partial reply with one free retry, exhaustion, cross-account denial, explicit stop, expired work, concurrent request IDs, and administrator-only revision export.
- Existing one-call concept fixtures now declare `review:none`. Chinese/English chat-practice fixtures expect one generator and one reviewer, separately from the unchanged Studio quick-practice and formal quiz workflows. The API contract now has 87 operations.
- Frontend/server type checks, production build and bundle guard passed. Working files passed the repository's secret-pattern checks without printing values. Private credentials, test scripts and results remain ignored under `.data/`; unrelated `scripts/update-types.mjs` was preserved.
- The disposable PostgreSQL check runner also includes the new review suite against its own labelled, temporary database. Its CI result must be verified independently; local SQLite success alone does not establish PostgreSQL acceptance.

## Desktop browser evidence

Used an isolated in-memory app with a delayed local fixture provider, the production frontend, and disposable student/admin accounts. No production student was used or charged.

- Mixed explanation appears before the exercise. The final reply contains only one user floor and one assistant floor, with stable message IDs, no review badge and initially folded hint/answer details.
- A pure exercise remains hidden during review. Navigating away and returning preserves the same completed floor, without restarting the provider call.
- English failure display contains a short message and Retry. Retrying completes on the same floor, with the visible balance unchanged at 494 credits after three original 2-credit operations.
- Administrator Plan settings displays a separate site-wide reviewer selector with cleaned model names. Backend export permission and before/after contents are covered by the API test.
- Browser-found fixes: refresh the balance when returning to background-completed work; replace the broad “failed operations are not charged” cost notice with wording about usable delivery and included checks. The guides explain partial-delivery charging and fully refunded retries.

Ignored screenshots: `.data/reviews/chat-v1.3/mixed-complete.png`, `pure-pending.png`, `failure-en.png`, `retry-complete-en.png`, `admin-review-model.png`. This is desktop evidence; no physical-phone acceptance is claimed.

## Real provider attempt and limits

Two isolated real-provider attempts used the current saved configuration without modifying cloud settings or production accounts. The first generation failed on both attempts. The final attempt explicitly reported upstream HTTP 503. Neither reached the reviewer; no token usage was supplied. Each isolated account ended with zero spent and zero held credits. Provider-side billing cannot be inferred from those errors.

Consequently, the successful delayed-provider workflow and UI checks are fixtures, not a successful real Flash end-to-end review. Real-provider format adherence and subject quality remain pending restoration of upstream generation. There were no automatic test retry loops. Private receipts are in `.data/reviews/chat-v1.3/real-provider*.json`.

## Release evidence

Implementation and local verification are complete. Push, CI and actual deployment are separate evidence and will be recorded after they occur. The known upstream 503 is a provider-availability limitation, not proof of a successful review.
