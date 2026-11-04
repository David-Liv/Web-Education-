# Chat content contract — v1.2

4 November 2026. This is the implemented first release of rich chat content, contextual draft suggestions and collapsible quick-practice answers. It extends the existing chat, not the formal quiz-generation workflow.

## Request and persistence

The existing authenticated `/api/v1/chats/:id/messages` request, idempotency key, account scope and conversation-model selection remain in use. The system prompt requests Markdown and bounded JSON fences. One provider call returns the explanation, optional visuals/exercise and three suggested follow-ups. No separate suggestion, repair, Python, image-generation or diagram-provider call is made.

`ChatMessage.content` remains a string. Valid fences and their answer text persist in the same account record; older text-only messages still work. `suggestions` metadata is hidden from the presentation and stripped from subsequent model history. Learning content is retained in history. Existing provider text/timeout limits remain in force. The server still receives the complete upstream answer before emitting its display chunks; native streaming is not part of this release.

## Supported fences

Every reserved fence has JSON content and uses either backticks or tildes. The shared validator is `src/chat-content.ts`; it is used by both the frontend and server. These formats are not HTML and never contain executable code.

| Fence | Payload and bounds |
| --- | --- |
| `chart` | Title; `type` line/bar/scatter; string `labels`; 1–4 named numeric/null `series` with equal-length values; optional axis labels and caption. At most 120 points. Scatter x labels must be numeric. Null values remain gaps. |
| `plot` | Title; 1–3 functions with expression/optional label; increasing finite x/y bounds. Supported grammar: numbers, x, pi, e, + − * / ^, parentheses and sin/cos/tan/sqrt/abs/ln/log/exp. Explicit multiplication; trig in radians; log is base ten. Expressions ≤160 characters/100 tokens, bounded nesting. No JavaScript evaluation. Sampling splits nonfinite, out-of-range and large discontinuities. It is not an analytical proof or root solver. |
| `geometry` | Named points and referenced paths, optional circles. ≤20 points/12 paths/4 circles, finite coordinates, unique point IDs and existing references. Uniform coordinate scale; labels/conditions remain the basis for interpreting lengths and angles. |
| `diagram` | `layout` flow/mindmap; the bounded compatibility alias `tree` is normalized to flow before validation. ≤12 uniquely named nodes and 20 referenced edges. App-owned layered SVG layout, with a grid fallback for cycles. Chinese/Latin labels wrap by approximate glyph width; full text remains in supporting text and node titles. It is a concept map, not arbitrary Mermaid/HTML source. |
| `circuit` | Series: 1–5 resistor/lamp/switch/ammeter components, a source label, optional voltmeter-across component index. Parallel: 2–3 branches of 1–5 components. Native symbol templates; no arbitrary topology, live simulation, current animation or automatic electrical-solution claim. Voltmeter is only an across-component measurement in the series template. |
| `exercise` | Question and answer Markdown, optional hint/explanation. The app displays the question with closed native details/summary sections for hint and answer. This is coaching practice, not an independent scored quiz. |
| `suggestions` | Exactly three distinct `{label,prompt}` entries. Label ≤60 and editable prompt ≤1,200 characters. Contextual hints/breakdown/visualisation should take precedence while a student has not answered an exercise. |

The parser bounds displayed source at 60,000 characters and accepted blocks at ten. JSON cannot invoke app tools, alter grades or access stored data. Reserved incomplete/invalid blocks never expose raw JSON or half-written answers in the UI. Invalid suggestions use three local context-based defaults. Other invalid blocks show a readable fallback without retrying the provider. An answer containing no usable text, visual or exercise is rejected and releases the credit reservation. A mixed reply with usable text can still count as the existing single operation.

## Browser behavior

- Markdown supports headings, lists, tables, code, quotes and KaTeX. Raw HTML is skipped. External images are not loaded. Links are limited to HTTPS; user messages remain plain escaped text.
- Graphs use app-owned React/SVG components. Titles, labels and data render as text, never injected model SVG, HTML or scripts. All use the HOKSE palette. Relevant supporting tables/text are available.
- Completed assistant replies show three next-step buttons. Clicking fills/focuses the current chat composer, preserving one previous nonempty draft for undo. It sends nothing, creates no learning event and incurs no credit charge. Enter or Send submits the edited prompt through the normal chat API. Buttons are disabled while a reply is generating.
- Graph enlargement, SVG/PNG download and answer reveal are local browser actions, with no AI calls. Exported graphics do not include student account details. PNG uses the local SVG rasterisation and may fail on an unsupported browser; the SVG option remains available.
- Exercise answers are already in the delivered chat response. Folding them prevents accidental viewing; it is not a secure exam-answer boundary. Formal quiz answers continue through the separate assessment flow. No formal grade/mastery evidence is created by chat practice or revealing an answer.

## Checks and follow-ups

Meaningful checks cover the arithmetic grammar, discontinuity handling, unsafe markup/URLs, invalid and incomplete blocks, reference bounds, SVG escaping, default-closed answers, one upstream call, idempotent replay, zero formal evidence and released credits for unusable output. Browser acceptance uses an isolated fixture provider, never production keys.

The 4 November real-provider attempt initially returned upstream 502/503 errors, including `no_credential`. After the user restored service, chart/circuit/concept-map examples returned usable formats; blank optional labels and the tree alias received bounded compatibility fixes. Optional text may be blank but remains type/length checked; required labels remain nonempty. One extra probability exercise repeatedly had an answer inconsistent with its explanation, including after the same-call self-check instruction. See [the verification receipt](chat-content-verification.md). Format success and prompting do not establish subject accuracy. Follow-ups: native provider streaming with partial-save behavior; stronger lightweight numerical consistency checks; richer geometric annotations and more circuit templates after review; optional interactive parameters or simulation; dedicated scenario/status cards; extending this presentation to non-chat explanation pages. Slider forms, editable training records and live recalculation are not supported blocks. None of those follow-ups are claimed as implemented here.
