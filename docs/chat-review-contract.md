# Chat practice review — v1.3

5 November 2026. Applies to newly generated AI chat exercises and worked answers. Existing saved replies, Studio quick practice and the formal assessment workflow keep their existing behavior. Review helps reduce errors; a model verdict is not proof of subject accuracy.

## Routing and presentation

The generator emits a hidden `review` fenced JSON scope: `none`, `exercises`, or `all`. The shared parser hides this metadata. Missing/invalid metadata, direct-solution requests and unmarked legacy-format replies are conservatively reviewed in full. Exercise blocks override a claim of `none`; textual question markers add a guard. This is bounded classification, not a guaranteed semantic detector for arbitrary natural language.

In mixed replies, only the leading ordinary explanation is delivered before review; related diagrams, questions, hints, answers and later text stay hidden. Whole worked solutions and pure exercise requests have no early answer. All exercises in one reply share one review call. Generation retains its 2,400-token output cap; review allows up to 4,800 output tokens to accommodate a complete corrected draft and its JSON envelope. Actual usage is logged. The reviewer receives the current question, required leading context and draft, without unrelated chat history. It returns `pass`, a complete `corrected` draft, or `uncertain`. Pass preserves the original draft. Corrected drafts must preserve the exercise count and pass the bounded visual/exercise validators. Uncertain, malformed, unavailable or contradictory output fails closed. There is no automatic repair loop.

An arithmetic rejection guard compares complete scalar exercise answers against the final supported numeric equality in their explanation, using the bounded expression parser, never `eval`. It rejects the reproduced `0.128` versus `0.8 × 0.2 × 0.2 = 0.032` contradiction even if the reviewer says pass. It does not independently reconstruct an arbitrary word problem, prove a solution or verify all algebra. Unsupported expressions and subjective judgments remain model reference. General semantic solvers and stronger question-derived checks are follow-ups.

Malformed reserved fences are retained only in the private review draft, including their exercise identity and count; they cannot disappear during parsing or bypass review under a `none` marker. The student renderer and subsequent chat history still omit their raw payloads. A pure malformed exercise can use its normal single review attempt, but `pass` cannot make invalid output deliverable. Generation and review share the same block-format instructions, including strict JSON escaping and a preference for Unicode maths inside JSON strings. Review must produce independently parseable inner fences as well as its outer JSON response. Non-printable control characters in block text are rejected, including the form-feed produced when a single-backslash LaTeX fraction is misread as a JSON escape; correctly escaped maths stays supported. No permissive JSON parser, arbitrary code execution or extra model repair loop is introduced.

Students see the final content in the same keyed message, with no review badges. A failure shows a short retry control. Answers remain folded. New SSE `message` events carry a complete public message snapshot and its user message; monotonically increasing revisions prevent stale client updates. Ordinary concept-only replies can use one generation call. The first call still completes before the leading explanation is sent: provider-native token streaming remains out of scope.

## Lifecycle and recovery

Jobs run in the existing API process, without a new worker or service. Hidden drafts, decisions and before/after revisions are encrypted in `settings`; student records contain only deliverable content and minimal UI flags. A per-message run ID and revision check prevent stopped, superseded or deleted jobs from writing late results. The active map belongs to each API instance. Database claims prevent simultaneous work on the same conversation.

Navigation and HTTP disconnect only detach the viewer. Explicit Stop cancels the active controller and preserves already delivered text. Deleting a chat cancels it and removes its private review records. Graceful shutdown aborts and drains owned jobs. A 120-second saved lease bounds recovery after a hard restart: when a conversation is read, expired work becomes a retryable failure and an unpaid reservation is released. There is no automatic provider replay on startup or reconnect. The client polls only while a message is pending. It recovers saved content on return, with no new AI calls.

Each operation has one automatic reviewer call. One manual retry per failed floor reuses the original draft and existing body; if generation itself never produced a draft, it may generate again. Retry claims are atomic, repeated successful retry IDs replay saved results, and exhausted retry IDs cannot call upstream again. A retry can use the latest administrator reviewer setting, while the original generation and cost remain attributed to their operation. New user questions are separate operations.

## Model configuration and accounting

`BillingPolicy.reviewModel` defaults to the approved Flash route and is controlled by administrators in Plan and model rules. It is independent of the student's quiz/chat/evaluation selections. It must be enabled in the global model rules. Review does not grant the student access to that model as their own chat selection. Existing route restrictions still apply. Legacy JSON settings need no DDL migration.

Generation and review have separate `stage` fields in upstream usage logs and share the original credit operation. Optional review overrides bypass only the operation's model pin, never authentication, route validation, the configured provider or student reservation. Private metadata writes cannot trigger a delivery checkpoint. Saving a usable explanation or final reply checkpoints the original charge atomically. No usable delivery releases credits; a delivered explanation retains its one charge if practice later fails. A manual retry adds no second charge. If the original operation was fully refunded, its successful retry acquires and settles the original operation once, subject to current availability. Provider-side cost still increases with real calls.

Usage logs retain actual model IDs, per-call token reports, duration and upstream status. Totals remain unknown if any upstream usage is missing. Administrators can export the encrypted revision record from a review-log detail via `GET /admin/usage/{id}/review`; students cannot access it. Deleting logs does not reset the credit ledger.

## APIs

- `POST /chats/{id}/messages`: idempotent generation/review; SSE message snapshots and done.
- `GET /chats/{id}`: owned public snapshot and expired-lease recovery, without AI work.
- `POST /chats/{id}/messages/{messageId}/retry`: one owned manual retry with a request ID.
- `POST /chats/{id}/stop`: explicit cancellation.
- `PUT /admin/billing/policy`: additionally accepts `reviewModel`.
- `GET /admin/usage/{id}/review`: administrator-only private revision export.

Future work: independent question-derived solvers beyond the narrow numerical guard; provider-native streaming; durable queue infrastructure if traffic grows. None is implied by this version's model review.
