# Plan 005: Validate executive warnings through one production shadow quarter

> **Implementation instructions**: Follow this plan step by step. This is a
> controlled validation, not an implementation sprint. Obtain explicit HKA
> authorization for production read-only access and named reviewers before
> starting. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. Update this plan's index status after each monthly
> checkpoint and only mark DONE after the quarterly review.
>
> **Drift check (run first)**:
> `git diff --stat 910ee92..HEAD -- packages/gatekeeper-trom docs/superpowers/specs/2026-08-15-trom-executive-investigator-design.md`
> Plans 002 and 003 are expected to change the Gatekeeper. Confirm their final
> public contracts and Plan 004 acceptance evidence before beginning. Product
> behavior outside those approved contracts is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L (one calendar quarter)
- **Risk**: HIGH
- **Depends on**: `advisor-plans/004-trom-recurring-investigator-acceptance.md`
- **Category**: direction
- **Planned at**: commit `910ee92`, 2026-08-15

## Why this matters

Test data can prove contracts and workflow, but it cannot prove that warnings
precede real SPM/SLA failures or save executive time. A shadow quarter measures
usefulness without allowing the investigator to become an authoritative
decision system. Promotion is based on reviewed evidence, not a guessed
precision target.

## Current state

The design at
`docs/superpowers/specs/2026-08-15-trom-executive-investigator-design.md:34-37`
states that development credentials contain test data and production validation
is a release gate. Lines 296-311 define the shadow-quarter measures: warning
recall, justified-warning share, time to answer, cross-surface findings,
director decisions, unsupported claims, and interpretable data coverage.

Plan 002 intentionally exposes the current upstream limitation: TROM's
SPM/SLA endpoints do not distinguish measured results from configured defaults.
This must appear in every affected finding and may block promotion even if the
workflow itself is useful.

## Commands and evidence you will need

| Purpose | Command/check | Expected on success |
|---|---|---|
| Release regression | `pnpm --filter @gadgets/gatekeeper-trom test && pnpm --filter @gadgets/gatekeeper-trom build` | exit 0 |
| Repository lint | `pnpm lint:check` | exit 0 |
| Monthly review | Reviewer signs the monthly evidence sheet | all warnings and outcomes have stable source references |
| Final review | Three monthly sheets plus quarterly synthesis reconcile | unsupported executive claims count is exactly zero |

Do not place production payloads, credentials, person-level records, or
sensitive section narratives in the repository. Store validation evidence only
in the HKA-approved workspace/location. The repository index may record status
and aggregate, non-sensitive conclusions only.

## Scope

**In scope as an authorized operational validation**:

- One approved executive Cloudflare OS workspace and recurring investigation.
- Read-only production TROM observations for three monthly reviews.
- Named HKA reviewers who label warnings, outcomes, decisions, unsupported
  claims, and coverage limitations.
- Manual comparison with the current executive question-answering process.
- One quarterly synthesis and go/no-go recommendation.
- `advisor-plans/README.md` — aggregate status only.

**Out of scope**:

- Production TROM writes, automated escalation delivery, autonomous decisions,
  employee performance scoring, or person-level evaluation.
- Publishing a dashboard or exposing validation data outside the approved HKA
  workspace.
- Training a model, inventing a probability, tuning on future outcomes, or
  setting precision/recall targets before measuring the baseline.
- Changing Gatekeeper, Scheduler, or Workshop code during the quarter. Product
  defects receive separate plans and may pause the validation.

## Git workflow

No source branch or commit is expected. Keep sensitive evidence out of Git.
Only update the Plan 005 status with non-sensitive aggregate progress after
reviewer approval.

## Steps

### Step 1: Approve the shadow protocol and baseline

Before enabling production reads, record:

- the three review months and review date for each;
- the authorized workspace, director/HQ reviewer roles, and data custodian;
- the current process used to answer the same executive risk question;
- a start/stop timer definition for both current and agent-assisted processes;
- the meaning of a warning, actual breach, justified intervention, unsupported
  claim, and sufficient coverage;
- the known measured/default ambiguity and how reviewers will flag affected
  conclusions.

Do not assign numeric success targets yet. Agree only that unsupported executive
claims must be zero.

**Verify**: named reviewers and the data custodian approve the protocol before
the production workspace is enabled.

### Step 2: Run and review each monthly investigation

For each of three months, let the recurring agent investigate before the
outcome window closes. Freeze the warning set for evaluation; do not rewrite a
warning after seeing the outcome.

For every finding, reviewers record:

- stable case, section, indicator, period, and evidence references;
- supporting and contrary evidence;
- missing/conflicting data and measured/default ambiguity;
- strong/moderate/weak confidence and why;
- proposed intervention window and any director decision;
- time needed to answer the executive question with and without the agent;
- whether evidence crossed more than one TROM surface;
- any unsupported statement, which immediately triggers a review stop.

Dismissed and disproven cases remain in the ledger; they are not deleted to
improve apparent precision.

**Verify at each monthly checkpoint**: every frozen warning has reviewer labels
and source references, the monthly brief contains no unsupported claim, and the
plan index records `IN PROGRESS — month N/3 reviewed`.

### Step 3: Reconcile warnings with outcomes

After each warning's outcome window, label whether:

- an actual SPM/SLA breach occurred;
- the warning preceded it;
- management intervened and the intervention was justified;
- the case improved, remained exposed, was disproven, or lacked interpretable
  coverage;
- the conclusion depended on a default-versus-measured ambiguity.

Keep `insufficient coverage` separate from both success and failure. Do not
count missing outcomes as avoided breaches.

**Verify**: case totals reconcile exactly across outcome labels; no case is
silently omitted from denominators.

### Step 4: Produce the quarterly synthesis and decision

Calculate and review:

- actual breaches preceded by a warning / interpretable actual breaches;
- warnings that became breaches or prompted a justified intervention /
  interpretable warnings;
- median and range of time-to-answer for current and agent-assisted processes;
- material findings using more than one TROM surface;
- director acceptance, dismissal, deferral, and escalation counts/rates;
- unsupported executive claims;
- findings excluded for insufficient coverage or measured/default ambiguity.

Review three separate decisions:

1. **Business usefulness** — did this change attention or shorten a real
   executive workflow?
2. **Evidence safety** — were all material claims traceable and were unsupported
   claims zero?
3. **Data readiness** — is coverage, including measured/default provenance,
   adequate for the proposed use?

Recommend production promotion only if all three pass. Otherwise recommend a
bounded remediation or stop; do not average the three into a composite score.

**Verify**: named HKA reviewers sign the quarterly synthesis and explicit
go/no-go decision.

### Step 5: Close or continue deliberately

If approved, retain the monthly/quarterly workflow and document the accountable
owner for future quality reviews. If rejected, disable the recurring schedule
without deleting the evidence ledger. If blocked by data provenance, keep the
Gatekeeper factual and read-only and raise the smallest upstream data-contract
request needed; do not add a heuristic substitute.

**Verify**: the schedule state matches the signed decision and the plan index
records DONE, BLOCKED with one reason, or REJECTED with one rationale.

## Test plan

This plan uses prospective operational evaluation rather than code fixtures.
The test population is three consecutive monthly investigations and their
quarterly synthesis. Reviewers must preserve every frozen warning, contrary
finding, dismissal, missing-data case, and later outcome so the denominator is
auditable.

## Done criteria

- [ ] Production read-only access and reviewers were explicitly authorized.
- [ ] Three monthly warning sets were frozen before outcomes and fully labeled.
- [ ] Current-process and agent-assisted time-to-answer were measured under one
      agreed definition.
- [ ] Every metric reports its interpretable denominator and excluded coverage.
- [ ] Unsupported executive claims equal zero.
- [ ] Measured/default ambiguity is quantified and included in the data-
      readiness decision.
- [ ] HKA reviewers signed a business-usefulness, evidence-safety, data-
      readiness, and final go/no-go decision.
- [ ] The recurring schedule state matches that decision.
- [ ] No sensitive production evidence was committed to Git.

## STOP conditions

Stop and report back if:

- Production access or named reviewer approval is missing or revoked.
- Any Gatekeeper or agent path attempts a TROM write, automatic escalation
  delivery, or person-level performance judgment.
- An unsupported executive claim appears; pause use until it is reviewed and
  the root cause is understood.
- Evidence cannot be traced to stable TROM identifiers or coverage cannot be
  interpreted.
- Measured/default ambiguity materially changes a finding and HKA has not
  accepted that limitation.
- A product defect requires source changes during the quarter; create a new plan
  and decide whether the prospective evaluation must restart.

## Maintenance notes

- Do not turn shadow-quarter metrics into permanent targets until HKA has enough
  quarters to understand natural variation and base rates.
- Re-run a smaller evidence-safety review after any material TROM contract,
  Gatekeeper method, investigation prompt, or model change.
- A later statistical model is justified only if historical coverage and breach
  examples support it; it is not the default next step.

