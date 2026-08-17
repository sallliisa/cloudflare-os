# Plan 002: Expose bounded executive evidence through `gatekeeper-trom`

> **Implementation instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update this plan's status row in
> `advisor-plans/README.md` after the implementation and review pass.
>
> **Drift check (run first)**:
> `git diff --stat 910ee92..HEAD -- packages/gatekeeper-trom/src/trom-api.ts packages/gatekeeper-trom/src/trom.ts packages/gatekeeper-trom/src/types.txt packages/gatekeeper-trom/__tests__/trom.test.ts packages/gatekeeper-trom/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. A mismatch
> is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `910ee92`, 2026-08-15

## Why this matters

The current Gatekeeper can summarize operational dashboards, but it cannot
trace an executive SPM/SLA hypothesis from a portfolio result to a monthly
trend, indicator definition, or open repair exposure. Adding those factual,
bounded reads lets the Cloudflare OS agent investigate causes and
counter-evidence instead of merely restating a dashboard.

The current TROM API has one material limitation: it substitutes configured
defaults when no measurement exists, then returns only the resulting score.
The Gatekeeper must disclose that the result basis is unavailable and must not
describe these scores as measured. This plan does not change TROM.

## Current state

### The Gatekeeper exposes only aggregate reads

`packages/gatekeeper-trom/src/trom-api.ts:89-100` currently declares eight
session methods. The only SPM/SLA method is the section aggregate:

```ts
export interface TromSession {
  listSections(): Promise<TromSection[]>;
  getSpmSlaBySection(period?: TromPeriod): Promise<SectionSpmSla[]>;
  // incident, inspection, equipment, report, and cost methods omitted
}
```

`packages/gatekeeper-trom/src/trom-api.ts:137-152` maps the existing portfolio
endpoint and returns only section, score, and total-indicator facts.

`packages/gatekeeper-trom/src/trom.ts:70-143` establishes the security pattern:
fetch first, call `authorizeObservation()`, then return the result. Every new
public read must follow that order. `packages/gatekeeper-trom/__tests__/trom.test.ts:236-275`
tests the rule for all current methods.

### Existing TROM endpoints provide the required drill-down, with one caveat

The authoritative TROM source is read-only reference material for this plan.
Do not modify `hka-trom-laravel-v2/`.

`hka-trom-laravel-v2/app/Services/Custom/Dashboard/DataTrendSpmSla.php:28-33`
accepts `start_month` and `end_month`; lines 159-164 return monthly
`score_spm` and `score_sla`. An optional `section_id` is accepted at lines
44-47 and 69-74.

`hka-trom-laravel-v2/app/Services/Custom/Dashboard/DetailSectionRecapSpmSla.php:137-142`
returns applicable indicator definitions and pass/fail booleans for one section
and period. Lines 186-193 wrap them with section identity and aggregate scores.
The SQL at line 137 proves the caveat: when no record exists, `score_default`
is returned in the same `spm_score`/`sla_score` field. The response does not say
whether a boolean was measured or defaulted.

`hka-trom-laravel-v2/app/Services/Custom/AssetDamages/ListMajorAssetDamages.php:166-216`
supports `OPEN` and `ON_PROGRESS` repair-state filters. Lines 239-244 support a
bounded date range; lines 260 onward paginate. The model's custom projection at
`hka-trom-laravel-v2/app/Models/InspectionDamages.php:386-406` supplies a stable
asset label, computed `repair_status_code`, `spm_due_at`, and `sla_due_at`.
Person relations exist in the source response and must be discarded by the
Gatekeeper.

### Report completeness currently overstates its period contract

`packages/gatekeeper-trom/src/trom-api.ts:267-283` accepts a `TromPeriod` but
sends only its start date as `month`. The upstream implementation at
`hka-trom-laravel-v2/app/Services/Custom/Dashboard/DashboardMonitoringActivity/RecapMonitoringActivityByStatus.php:17-27`
always expands one month, and lines 180-186 return totals for that month. A
cross-month caller is therefore silently given only the first month.

### Product constraints

The approved design at
`docs/superpowers/specs/2026-08-15-trom-executive-investigator-design.md:197-216`
requires bounded portfolio, trend, detail, open-exposure, and supporting-evidence
reads with stable identifiers and no unnecessary person fields. Lines 264-274
forbid treating missing records as good performance or hiding incomplete
coverage. Lines 276-283 preserve read-only TROM access and observation
authorization.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm --filter @gadgets/gatekeeper-trom test` | exit 0; all Gatekeeper tests pass |
| Type contract | `pnpm --filter @gadgets/gatekeeper-trom types:check` | exit 0; source and test types pass |
| Package build | `pnpm --filter @gadgets/gatekeeper-trom build` | exit 0 |
| Repository lint | `pnpm lint:check` | exit 0; no lint errors |
| Patch hygiene | `git diff --check` | exit 0; no whitespace errors |

Use pnpm only. Do not install a dependency; the current normalization helpers,
`URLSearchParams`, arrays, and plain TypeScript types are sufficient.

## Scope

**In scope** (the only files to modify):

- `packages/gatekeeper-trom/src/trom-api.ts`
- `packages/gatekeeper-trom/src/trom.ts`
- `packages/gatekeeper-trom/src/types.txt`
- `packages/gatekeeper-trom/__tests__/trom.test.ts`
- `packages/gatekeeper-trom/README.md`
- `advisor-plans/README.md` — status only after implementation and review

**Out of scope**:

- Every file under `hka-trom-laravel-v2/`; it is reference source only.
- `packages/workshop-shared/`, `packages/workshop-backend/`, Scheduler, and the
  frontend; no shared or kernel change is needed.
- A risk score, breach probability, alert threshold, hypothesis engine, case
  ledger, dashboard, or TROM write.
- Person names, user IDs, images, coordinates, full upstream payloads, and
  unbounded list responses.
- Claiming that an SPM/SLA result is measured or defaulted when TROM does not
  expose the distinction.

## Git workflow

- Branch: `advisor/002-trom-executive-evidence-api`.
- Use conventional commits; a suitable message is
  `feat(trom): expose executive evidence reads`.
- Do not push, open a PR, merge, deploy, or touch production unless the operator
  explicitly requests it.

## Steps

### Step 1: Define the smallest factual contracts

In `src/trom-api.ts`, add exported, documented types and three session methods:

1. `getSpmSlaTrend(period: TromPeriod, sectionId?: number)` returning monthly
   points with only `month`, `scoreSpm`, and `scoreSla`.
2. `getSpmSlaIndicatorDetail(sectionId: number, period: TromPeriod)` returning
   section identity, aggregate scores, source `lastUpdatedAt`, and at most 250
   indicator rows. Each indicator includes its stable ID, substance ID, code,
   indicator/sub-indicator text, SPM/SLA specifications and parameters, operator,
   unit, and source booleans. Add the literal field
   `resultBasis: "measured-or-default-unidentified"` to every indicator and a
   top-level `truncated` boolean. Do not infer a better basis.
3. `listMajorAssetDamageExposures(query)` using one plain query type containing
   required `period` and `repairStatus: "OPEN" | "ON_PROGRESS"`, plus optional
   `sectionId`, `page`, and `limit`. Default page to 1 and limit to 50; reject
   non-integers, values below 1, and limits above 50 before any fetch. Return
   `rows`, `total`, `totalPages`, `page`, and `limit`.

The exposure projection must contain only stable ID, section ID/name, date,
asset label, station range, damage category/criteria/description, repair
priority/recommendation/status, major repair type, current stage when present,
SPM/SLA due timestamps when present, and record timestamps. Do not map any
person relation, image, location coordinate, or raw file field.

Mirror these declarations and doc comments in `src/types.txt`. Keep the two
agent-facing contracts exactly synchronized.

**Verify**:
`pnpm --filter @gadgets/gatekeeper-trom types:check` → it may fail only because
the three implementations do not exist yet; it must not report declaration
syntax or `types.txt` formatting problems.

### Step 2: Normalize the three existing TROM endpoints

In `TromApi`, implement:

- `/dashboard/spm-sla/trend-spm-sla` with `start_month`, `end_month`, and an
  optional validated `section_id`.
- `/dashboard/spm-sla/detail-section-spm-sla` with validated `section_id`,
  `start_periode`, and `end_periode`. The endpoint's nested `data` mixes
  `category: "substance"` and `category: "spm"`; return only SPM rows, preserve
  source order, cap the returned array at 250, and set `truncated` if more were
  received. Unlike the current `#objectData()` endpoints, this response keeps
  `section_id`, `section_name`, `last_updated_at`, `score_spm`, and `score_sla`
  at the response top level and uses top-level `data` for the mixed row array;
  parse that exact envelope directly rather than forcing it through
  `#objectData()`.
- `/major-asset-damages/list` with `start_date`, `end_date`,
  `repair_status_code`, `page`, `limit`, and optional validated `section_id`.
  Parse top-level `total` and `totalPage` as required finite numbers; do not add
  a generic pagination abstraction for this one endpoint.

Reuse `resolvePeriod`, `validateSectionId`, `valueOf`, `requiredNumber`, and the
existing nullable normalizers. Keep upstream errors bounded through the
existing `#request()` path.

Also make `getReportCompleteness()` reject a period whose start and end are in
different calendar months before login or fetch. Update its documentation to
say it returns one calendar month's totals; keep the existing method signature
to avoid unnecessary API churn.

**Verify**: `pnpm --filter @gadgets/gatekeeper-trom test` → all existing tests
plus the new API normalization tests from Step 4 pass.

### Step 3: Expose the reads through the authorized session

Implement the three methods in `TromSessionImpl`. Validate arguments before the
API call, fetch the data, then call `#authorize()` before returning it. Use
specific observation descriptions:

- `SPM/SLA monthly trend`
- `SPM/SLA indicator detail for section <id>`
- `<status> major asset damage exposures` with the optional section suffix

Add every new fake API method and session call to the existing
`authorizes every public read before returning data` test. Do not change
`getAutoApprovableActions()`, `applyAction()`, `rejectAction()`, or
`revertAction()`.

**Verify**: `pnpm --filter @gadgets/gatekeeper-trom test` → the authorization
test observes exactly `fetch`, then `authorize`, for every public read.

### Step 4: Lock the trust boundaries with focused tests

Extend `__tests__/trom.test.ts` using its existing mocked-fetch helpers. Add
tests for:

- trend endpoint path, period parameters, optional section, numeric-string and
  null normalization;
- detail endpoint mixed categories, stable fields, source order, literal
  unknown-basis label, and 251 SPM rows producing 250 rows plus
  `truncated: true`;
- exposure endpoint query parameters, top-level pagination normalization,
  OPEN and ON_PROGRESS acceptance, and person/image/coordinate keys absent;
- invalid exposure status, section, page, limit, and period rejected before
  any upstream call;
- cross-month report completeness rejected before any upstream call;
- missing required upstream fields fail with the existing bounded,
  secret-free error form;
- each new session method authorizes after fetch and before return.

Avoid snapshot tests and live-network tests. Test the response shapes the
checked-in Laravel source actually defines.

**Verify**:

1. `pnpm --filter @gadgets/gatekeeper-trom test` → all tests pass.
2. `pnpm --filter @gadgets/gatekeeper-trom types:check` → exit 0.
3. `pnpm --filter @gadgets/gatekeeper-trom build` → exit 0.

### Step 5: Document the useful boundary, not a product tour

Update `packages/gatekeeper-trom/README.md` with the three new reads, the 50-row
exposure limit, the 250-indicator cap, and the one-month report-completeness
contract. State plainly that current TROM SPM/SLA responses do not distinguish
measured results from configured defaults; agents must disclose the limitation
and must not infer missing data as good performance.

Do not document a dashboard, prediction model, or recurring workflow here;
those are not Gatekeeper responsibilities.

**Verify**:

1. `pnpm lint:check` → exit 0.
2. `git diff --check` → exit 0.
3. `git status --short` → only the six in-scope files and the plan index are
   modified.

## Test plan

Use `packages/gatekeeper-trom/__tests__/trom.test.ts` and its existing
`apiWith`, `dataResponse`, and fake-authorizer patterns. Cover happy paths,
bounds, source-shape failures, excluded sensitive fields, and authorization
ordering. The focused package suite is the required regression check; run the
root lint after it.

## Done criteria

- [ ] The typed session can read monthly SPM/SLA trends, bounded indicator
      detail, and paged OPEN/ON_PROGRESS major-damage exposures.
- [ ] Every returned list has an explicit hard bound or page/limit contract.
- [ ] Indicator rows state `measured-or-default-unidentified`; no code claims a
      measured/default distinction that TROM does not expose.
- [ ] Cross-month report-completeness requests fail before network access.
- [ ] Person relations, images, coordinates, and full payloads are absent from
      the new public types and tests.
- [ ] All new session reads authorize after fetch and before return.
- [ ] Focused tests, type check, package build, root lint, and `git diff --check`
      exit 0.
- [ ] No files outside Scope are modified.
- [ ] `advisor-plans/README.md` marks Plan 002 DONE only after review.

## STOP conditions

Stop and report back if:

- Any current-state excerpt no longer matches the live code.
- The configured test TROM returns a materially different envelope or field
  shape from the checked-in Laravel service.
- Honest measured-versus-default identification becomes a required acceptance
  criterion for this plan; the existing endpoints cannot provide it.
- The work appears to require a TROM, Workshop shared/kernel, Scheduler, or
  frontend change.
- A verification command fails twice after a reasonable correction.

## Maintenance notes

- Reviewers should reject any inferred risk label or time-remaining calculation
  in the Gatekeeper; those belong to the agent and must cite source facts.
- If TROM later exposes a measured/default provenance field, replace the
  literal unknown-basis value with a source-derived enum and add contract tests.
- If 250 indicators or 50 exposure rows are proven insufficient, add upstream
  pagination first; do not silently raise bounds or return raw payloads.
