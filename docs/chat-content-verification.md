# Rich chat — local verification

4 November 2026. Package version 1.2.0. The approved scope and output formats are documented in [the chat content contract](chat-content-contract.md).

## Check evidence

- Full frontend/domain suite: **88 tests across eight files passed**. Eight new chat tests cover safe Markdown/math, table output, collapsed exercises, incomplete and invalid reserved fences, block budgets, suggestions/fallbacks, diagram references, circuit constraints, finite/escaped SVG output, expression precedence and discontinuity sampling. Final focused chat/translation checks also passed after the browser fixes.
- Full backend suite: **58 tests passed**. The new isolated HTTP/provider check proves one upstream call for body/exercise/suggestions, idempotent replay without a second charge, no formal evidence or learning event from chat generation alone, and released credit reservations for wholly unusable replies without repair calls. Existing provider cancellation, model purpose, quota, account isolation and formal assessment checks remain passing.
- Frontend/server TypeScript checks and production build passed. Markdown/visual code is loaded on demand: the observed chat-content chunk is about 152 kB (46 kB gzip), visual drawing about 15 kB (6 kB gzip). No Python, image generator or additional hosting service was added. The production bundle guard passes.
- Working changes were inspected with the repository's secret rules without printing private values. The existing unrelated untracked `scripts/update-types.mjs` was preserved. Private fixture code, generated images and logs remain ignored under `.data/`.

## Browser evidence

Used the built production frontend against a disposable in-memory app and a localhost fixture provider. No production account or provider key was used. The fake provider is controlled test data, not real model validation.

- English table and KaTeX display; hints and answers initially closed; mouse and keyboard expansion; unchanged credit balance on reveals.
- Contextual buttons populate and focus the composer without sending. An existing draft can be restored. Enter continues the same chat; one configured 2-credit operation corresponds to one fixture-provider call.
- Function plot and bar chart, mind map, geometry triangle, parallel branches, series circuit with a voltmeter connected across a resistor, enlargement, and successful local SVG/PNG downloads. The downloaded PNG was visually inspected.
- Chinese chat content, native collapse controls and three contextual suggestions. Interface language and teaching language remain distinct.
- Browser-discovered fixes: focus the composer synchronously rather than waiting for a background-tab animation frame; translate the zoom dialog's Close button; use readable numeric ticks including zero; keep zoom graphics within the viewport height. Native details remain closed on reload.

Ignored screenshots: `.data/reviews/chat-v1.2/practice-zh.png`, `function-en.png`, `mindmap-en.png`, `circuit-en.png`. Logs: `.data/chat-*.log`. These screenshots use the default desktop viewport. No physical-mobile acceptance or real-model visual-quality check is claimed.

## Real-provider compatibility attempt — 4 November 2026

Read only the existing cloud model and billing-policy settings, with no Store initialization, migrations or student data access. The configured provider was enabled and selected `gemini-3.8-flash` (its approved upstream ID retains the routing prefix). The provider's model list returned HTTP 200 and included the selected model and Flash Lite variants. The test used the same generation adapter and visual-format contract as chat, with synthetic learning questions; it was an adapter compatibility probe, not a real student chat or formal quiz workflow.

- Five requests covered a study-minute bar chart with a folded exercise, a series circuit with an across-resistor voltmeter, a discriminant mind map, a two-case probability explanation, and the unsupported interactive-record/slider boundary. The first returned HTTP 502; the remaining four returned HTTP 503. None returned usable model content, so no real generated visual, semantic accuracy, format compliance or interactive behavior was verified.
- One subsequent minimal diagnostic request returned HTTP 503 with upstream code `no_credential`: “没有可用凭证（未推送或已全部失效/禁用），请在 AI Studio 页面重新推送 Cookie”. A single Flash Lite compatibility attempt also returned HTTP 503 and stopped immediately. Listing a model therefore does not demonstrate that generation is available. There were seven generation attempts in total; no successful response supplied token usage. Provider-side billing cannot be inferred from these error responses.
- No global model selection, account, credit balance or production chat was changed. Test calls bypassed student credit accounting but were real provider requests. Any provider-side cost remains subject to that service's accounting. Scripts, sanitized diagnostics and results are ignored under `.data/reviews/chat-real-2026-11-04/`; no credential is included in this receipt.
- Current presentation can render the bounded chart, circuit and mind-map formats established by the local checks above. The first supplied screenshot's colored scenario/status-card layout has no dedicated component; a table or concept diagram is an available alternative. The second screenshot's sliders, form inputs and live recalculation are not implemented. Receiving HTML from a model would not make those controls executable in chat. These remain separate extensions rather than completed features.

### Retest after the user restored the connection

The user reported that the connection was repaired, and the same configured Flash model then returned HTTP 200 for all five cases. They took approximately 15, 17, 17, 21 and 22 seconds respectively; all finished with `stop`, returned three suggestions and had no output truncation. The provider reported 14,584 total tokens across these five requests. Keep provider-reported usage as received: its total includes reasoning and does not equal its prompt-plus-completion counters. These were still synthetic adapter probes, with local replay through the production frontend rather than writes to production student chats.

| Case | Actual output and review |
| --- | --- |
| Study-minute chart | Valid five-bar chart and folded exercise. Data matched the requested 20/30/25/40/35 minutes; the mean of 30 minutes was correct. |
| Circuit | Valid two-resistor series schematic, 6 V source and voltmeter across the 2 Ω resistor. The 1 A current and 2 V reading were correct for the stated ideal assumptions. |
| Mind map | Seven correct discriminant/root/intersection nodes. Initially rejected because optional edge labels were empty strings. Bounded optional text now accepts blank strings; required text remains nonempty and lengths/types remain checked. |
| Two probability cases | Correct main classification, table and result 0.928. The provider used `layout: tree`, now normalized to the existing flow layout before the same reference/size validation. **The extra practice answer was wrong**: answer 0.128 versus a worked result of 0.032 for A working but B failing. This is a content failure, not a format failure. |
| Interactive record | Explicitly said sliders/live forms were unavailable and offered a valid static comparison chart and Markdown table. This does not implement an interactive record. |

The five original responses were replayed through the updated parser without more provider calls: no unavailable blocks remained. Two fresh requests then checked mind maps and probability classification using the clarified flow/mindmap examples and a same-call answer-consistency instruction. Both passed format validation, but the extra probability exercise again returned answer 0.128 alongside an explanation of 0.032. **The self-check prompt did not resolve this defect.** It remains a documented limitation; no answer was silently edited to create passing evidence, and no multi-call chat repair workflow was introduced. The two requests reported 6,798 further total tokens, making seven successful retest calls / 21,382 reported tokens after recovery.

Browser replay of the real first-batch responses verified the chart, series circuit, mind map and two-case graph/table. Native practice answers start closed. The circuit and mind-map screenshots are saved under `.data/reviews/chat-real-2026-11-04/`. Real Chinese labels exposed overflow in the concept-map nodes; wrapping now accounts for wide characters, preserves explicit line breaks and wraps edge text within the available gap. Full text remains in the supporting relationship list and node titles. This is desktop browser evidence, not physical-mobile or production acceptance.

The final focused chat/translation suite passed 17 tests; the backend one-call/replay/refund check passed; frontend/server type checks, production build and bundle guards passed. The student guides in both languages clarify the current static-versus-interactive scope and how to challenge inconsistent quick-practice answers. No production settings or account records were changed. Future compatibility checks should stop on repeated service errors and should not change the global default merely to test a model.

## Delivery status and remarks

Local implementation and checks are complete. On 4 November 2026 the user subsequently authorized publishing the accumulated changes, including the earlier university-goals commit. The v1.2 changes and versioned release notes are prepared for main; successful push, CI and deployment must each be confirmed independently. This test receipt alone does not establish a live deployment.

The repaired provider passed the bounded examples above, with a repeatable answer-consistency failure in one extra probability exercise. This is limited real-model evidence, not acceptance of every visual format or general subject accuracy. Markdown and local fallbacks work with old text replies. Format validation does not certify mathematical explanations or circuit reasoning. Circuit support is limited to the declared schematic templates, and quick chat exercises do not become independent scored assessments.

Deferred work: provider-native streaming and partial persistence; richer geometry annotations, complex circuit topology or simulation; editable interactive parameters; extension to explanation pages outside chat. These are recorded as follow-ups, not implemented capabilities.
