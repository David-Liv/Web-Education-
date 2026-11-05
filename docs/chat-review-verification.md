# v1.3 chat practice review verification

5 November 2026. Scope and recovery behavior: [chat review contract](chat-review-contract.md).

## Implementation

- Added one site-wide administrator-selected reviewer, defaulting to the approved Flash route. It does not change students' quiz/chat/evaluation choices. Provider logs distinguish generation and review while retaining the original operation and cost.
- Added revisioned same-floor message snapshots, gated exercise/solution delivery, one manual retry, private encrypted drafts/revisions, explicit stop and deletion guards, disconnected-viewer continuation and expired-lease recovery. No worker, paid service, new dependency or database DDL was added.
- Ordinary concept replies with valid routing metadata remain one call. A mixed reply can deliver its leading explanation before one review; pure exercises and worked answers wait. Missing markers conservatively receive full review. Semantic classification is not infallible.
- The narrow arithmetic rejection guard catches the reproduced scalar answer/explanation mismatch. It does not prove arbitrary word-problem semantics. The second model's verdict is still AI reference.
- Both student guides, administrator guides, release notes, developer runbook and public API contract were updated. Student replies have no review badges.

## Automated evidence

- Frontend/domain suite: **90 tests across eight files passed**. The new tests cover hidden routing metadata, exclusion of malformed raw payloads from student rendering/history, and explicit private draft retention; existing safe Markdown, visual and exercise rendering checks remain passing.
- Backend suite: **68 tests passed**, including ten new review/lifecycle cases. They cover the reproduced numerical contradiction, separate generator/reviewer IDs with one charge, replay, private-draft isolation, partial delivery, disconnect continuation, full refund and retry, paid partial reply with one free retry, exhaustion, cross-account denial, explicit stop, expired work, concurrent request IDs, administrator-only revision export, and review of malformed exercise fences without silently deleting questions.
- Existing one-call concept fixtures now declare `review:none`. Chinese/English chat-practice fixtures expect one generator and one reviewer, separately from the unchanged Studio quick-practice and formal quiz workflows. The API contract now has 87 operations.
- Frontend/server type checks, production build and bundle guard passed. Working files passed the repository's secret-pattern checks without printing values. Private credentials, test scripts and results remain ignored under `.data/`; unrelated `scripts/update-types.mjs` was preserved.
- The disposable PostgreSQL check runner also includes the new review suite against its own labelled, temporary database. Initial release CI run [41963244853](https://github.com/David-Liv/Web-Education-/actions/runs/41963244853) passed all five jobs, including 30 isolated PostgreSQL tests. Follow-up compatibility changes require the same gate; local SQLite success alone does not establish PostgreSQL acceptance.

## Desktop browser evidence

Used an isolated in-memory app with a delayed local fixture provider, the production frontend, and disposable student/admin accounts. No production student was used or charged.

- Mixed explanation appears before the exercise. The final reply contains only one user floor and one assistant floor, with stable message IDs, no review badge and initially folded hint/answer details.
- A pure exercise remains hidden during review. Navigating away and returning preserves the same completed floor, without restarting the provider call.
- English failure display contains a short message and Retry. Retrying completes on the same floor, with the visible balance unchanged at 494 credits after three original 2-credit operations.
- Administrator Plan settings displays a separate site-wide reviewer selector with cleaned model names. Backend export permission and before/after contents are covered by the API test.
- Browser-found fixes: refresh the balance when returning to background-completed work; replace the broad “failed operations are not charged” cost notice with wording about usable delivery and included checks. The guides explain partial-delivery charging and fully refunded retries.

Ignored screenshots: `.data/reviews/chat-v1.3/mixed-complete.png`, `pure-pending.png`, `failure-en.png`, `retry-complete-en.png`, `admin-review-model.png`. This is desktop evidence; no physical-phone acceptance is claimed.

## Real provider attempt and limits

Initial isolated attempts failed with upstream HTTP 503, with zero spent and held student credits. After connectivity was restored, generation and review both returned HTTP 200, but nested exercise JSON contained unescaped LaTeX commands. Local validation correctly withheld it. A single manually invoked retry was also withheld, with no student charge. Investigation additionally found that serialization dropped malformed exercise fences from the private review draft; the follow-up preserves those fences and their question count, shares format instructions with the reviewer, and explains strict inner/outer JSON escaping. Validators remain strict.

The subsequent real Flash generation and review completed successfully at **2026-11-05 11:55 Hong Kong time**, in 36.7 seconds (generation 24.1 s, review 12.5 s). One exercise and three suggestions were delivered, with no failure flag. Independent calculation agrees with the main answer **0.032** and the generated conditional-probability answer **29/30**. The isolated account spent **5 credits total**, with zero held credits; both upstream calls reported usage. This is one successful probability example, not general subject-accuracy certification. No cloud configuration or production student data was changed, and there were no automatic test retry loops. Private receipts are in `.data/reviews/chat-v1.3/real-provider*.json`.

## Release evidence

The initial v1.3 release, commit `60fdee7d0976fe14664ded506f9afe4d977fd2f4`, passed all required CI jobs and went live on Render at **2026-11-05 11:46:35 Hong Kong time**, deployment `dep-dblvnknb9u1s7388ob00`. Public HTTPS readback confirmed healthy setup, both v1.3 guides, the reviewer setting and retry APIs; unauthenticated private revision export returned 401. The format-compatibility follow-up is separately validated and released through the same CI gate; its final deployment receipt belongs in the release handoff. A provider HTTP 200 alone never counts as successful student delivery.
