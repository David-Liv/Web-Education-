# University goals and guide split — v1.1 verification

Date: 4 November 2026 (Hong Kong). Scope: the approved [university-goals plan](university-goals-improvement-plan.md) and separate student/administrator help.

## Delivered behavior

- Imported the existing 431 unique JUPAS snapshots (430 degrees and one higher diploma), alongside four non-JUPAS references. This task projected the recorded snapshot; it did not re-crawl or independently verify every programme's current admission requirements.
- Shared deterministic reference rules now handle Best 4/5/6, required groups and two-of groups, M1/M2 alternatives, exclusions, numeric and reference weights, weighting caps, CSD points and positional bonuses. Unparsed source clauses remain visible. No broad `verified` whitelist blocks programme comparisons.
- Current and target grades use the same theoretical-maximum denominator for a platform 0–7 reference index. Historical medians, quartiles, raw means and borrowed benchmarks keep distinct meanings. Same-area peer estimates require three unique comparable programmes; missing values remain missing. QS 2027 notes are directional assumptions and never adjust scores.
- Programme discovery includes study-area filters, sorting with missing values last, batch rendering, interview tags, quartile cards, current/target history references, accessible point selection and a data table. One primary and two backup goals share the existing profile. The primary drives plan previews; backups show shared benefits. Changing the goal invalidates an old preview.
- `/api/v1/programmes/compare` reads the authenticated student's own profile. Comparison, filtering and planning rules make no AI calls and consume no AI credits.
- `/help` and `/help?lang=en` render concise student guides with v1.1/v1.0 product summaries. Relevant checkout, attachment, reference-score and AI-log notices remain. Operational details moved to the two administrator manuals, served by the developer-only `/admin/help` and `/api/v1/admin/guide` (including download). Admin Markdown is not imported into the static frontend bundle. The public source repository itself is not a secrets store.

## Local evidence

- Frontend/domain suite: 80 tests across seven files, including nine new admissions tests; earlier full run passed 79 before the additional elective-gate case. Final focused admissions/translation checks passed.
- Backend suite: 57 tests passed; profile/guide/comparison tests were rerun after the final primary/backup deduplication change. Tests cover 401/403/200 display and download access, no-store, account isolation, shared-calculation parity, zero credit operations and stale previews. Existing lock, rest-day, capacity and completed-task checks remain passing.
- Data and security checks: seven tests passed (three programme checks and four security checks). Frontend/server typechecks and production build passed. The bundle guard excludes private assessment data, mock seed and the admin-manual marker.
- Local browser: isolated memory database, disposable student/developer accounts, no production credentials and no real provider calls. Checked English filtering/sorting, three-goal comparison, missing-history peer fallback, current/target toggle, keyboard point selection, Chinese layout, both student-guide languages, denied student access to admin help, both admin-guide languages and authenticated English download.
- Screenshots and disposable logs are kept under ignored `.data/reviews/university-v1.1/` and `.data/university-*.log`. Default desktop browser checked; physical mobile-device acceptance and admissions-prediction calibration were not performed.

## Release evidence

The university-goals implementation was committed as `fd2ae683d4c60d6552a7dddd36e387cc87e7f906`. On 4 November 2026 the user authorized publishing the accumulated changes; that commit was pushed together with the subsequent v1.2 chat release `ccbdb15980fd1b2f6bf69268df021a1245867691`.

The [GitHub check run](https://github.com/David-Liv/Web-Education-/actions/runs/41860704694) passed every required job, including the isolated PostgreSQL checks and CodeQL. Render automatically deployed `ccbdb15` in `dep-dbll5v49v7es738rldr0`, confirmed `live` at 23:46:08 Hong Kong time on 4 November 2026. The existing service remains Free. Public HTTPS health, new assets, both versioned student-guide summaries and the public API contract were read back successfully. Full release evidence is recorded in [the rich-chat receipt](chat-content-verification.md#delivery-status-and-remarks); this did not repeat production student scoring or scheduling mutations.

## Follow-up remarks

- Add source-designated reference IDs when available; the recorded raw snapshot does not contain these for every programme, so current missing-history courses usually use peer fallback.
- Backtest peer estimates and the QS directional assumption before adding any probability or numeric ranking adjustment. No claim of official index calibration or guaranteed entry is made.
- A later admin UI can maintain reference multipliers, ranking editions and source exceptions. Current maintenance is version-controlled data plus import checks.
- The existing API keys, environment files, backups and trial invitations remain ignored. This release adds no paid service or new database system and requires no schema migration.
