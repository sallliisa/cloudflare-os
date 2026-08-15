# TROM Executive Investigator Design

## Decision

Build `gatekeeper-trom` into the factual, read-only substrate for a persistent executive
investigator in Cloudflare OS. The primary interface is a recurring chat investigation, not a
dashboard. The agent identifies and tests hypotheses about future SPM/SLA exposure, returns to the
same executive chat each month, remembers management decisions, and checks whether interventions
changed the outcome.

The first release prioritizes:

1. SPM/SLA breach risk.
2. Safety evidence that changes the interpretation of an SPM/SLA risk.
3. Equipment or operational-readiness evidence that changes the interpretation of an SPM/SLA risk.

It drafts escalations for director approval but does not send them or mutate TROM.

## Decision Context

The intended users are HKA directors and HQ leadership. They need to decide where management
attention can prevent performance failure across toll-road sections, not operate another reporting
screen.

TROM already contains many separate operational workflows and dashboards. The existing Gatekeeper
exposes eight factual dashboard datasets: sections, SPM/SLA, incidents, inspections, equipment
availability, reporting completeness, and running costs. Those methods support summaries but not a
longitudinal investigation that connects an executive hypothesis to underlying operational records.

HKA's public operating model reinforces the need for cross-section reasoning: the company manages
distributed toll-road operations and maintenance and states that safety, data-based asset
management, cost efficiency, and risk control are strategic priorities.

The configured development credentials point to test data. That data is suitable for contract,
workflow, and failure-mode development, but it is not authoritative enough to size impact, calibrate
warning thresholds, or claim predictive accuracy. Production validation is therefore a release
gate, not a prerequisite for implementation.

## Product Outcome

The product should make a management practice possible that TROM dashboards cannot provide on their
own: a continuing executive inquiry that forms hypotheses across modules, seeks disconfirming
evidence, records the management response, and returns later to determine whether the response
worked.

A successful interaction is not "show me the current SLA score." It is:

> Which sections and SPM/SLA indicators are most exposed next quarter, what operational evidence
> supports that conclusion, what evidence argues against it, and which management intervention has
> the best chance of changing the outcome?

The quarterly report is a by-product of three monthly investigations. It is not the primary product.

## Alternatives Considered

### Evidence-based executive investigator — selected

The agent uses transparent evidence, trends, thresholds, and comparisons to form and test risk
hypotheses. It explains uncertainty and drafts an escalation only when the evidence is material.
This can be built with test data and validated later against production outcomes.

### Automated executive dashboard/report — rejected

This would save reporting time but remain a new presentation layer over TROM. It would explain past
performance without creating the longitudinal, hypothesis-driven management process that justifies
Cloudflare OS.

### Statistical prediction model — deferred

A trained probability model may become useful after production history is assessed for coverage,
consistent definitions, and enough breach examples. Adding it before that evidence exists would
create false precision and an opaque trust problem.

## User Experience

### Entry point

`gatekeeper-trom` exposes one chat-first slash command:

```text
/trom-executive-review
```

The command expands to a fixed agent instruction that starts an executive investigation. It does
not contain protected TROM data and does not itself perform a read. Natural-language requests such
as "investigate next quarter's SPM/SLA risks" remain supported through the Gatekeeper's typed API.

The fixed expansion is:

> Use the HKA TROM capability to conduct an executive investigation of SPM/SLA exposure for the
> coming quarter. Screen the section portfolio, form candidate hypotheses, drill into relevant
> operational evidence, seek counter-evidence, and discard weak or immaterial findings. For each
> remaining finding, state the section, indicator, period, baseline, supporting evidence, contrary
> evidence, data limitations, materiality, intervention window, confidence, and what would disprove
> the conclusion. Do not treat missing records as good performance, invent unavailable facts, or
> produce an opaque risk score. Present the investigation in this chat. Afterward, if Scheduled
> Tasks is available, offer to establish a monthly investigation and quarterly synthesis in this
> same chat; do not create recurring automation without explicit approval.

On the first invocation, the agent:

1. Performs a one-off investigation immediately.
2. Explains its hypotheses, evidence, counter-evidence, and data limitations in chat.
3. Offers to create a recurring monthly investigation and quarterly synthesis.
4. If approved, asks for the review timezone, weekday, and time required by Scheduled Tasks.
5. Creates the minimal automation Gadget and registers its callback with Scheduler.

If Scheduler is unavailable, the one-off investigation still works and the agent explains that
recurrence cannot be enabled.

### Recurring experience

The same executive investigation chat is reactivated each month. The agent posts a concise opening
brief containing only material new, worsening, improving, or unresolved hypotheses. Directors can
then interrogate the agent naturally:

- "Why do you believe this is likely?"
- "What contradicts this conclusion?"
- "Compare this section with its peers."
- "What changes if these repairs close this month?"
- "Draft an escalation to the responsible section."
- "Did last quarter's intervention work?"

The agent can generate tables, charts, or a report when they clarify evidence, but there is no
required dashboard UI.

### Escalation approval

An escalation draft contains the affected section and indicator, evidence, materiality, requested
management response, owner role, and review date. Directors may edit, approve, defer, or dismiss it
in chat. Approval records the management decision in the investigation ledger. Delivery outside
Cloudflare OS is manual in the first release.

## System Boundary

```text
TROM APIs
   |
   v
gatekeeper-trom: normalized factual evidence, read-only
   |
   v
Executive investigation chat: hypotheses, reasoning, and director interaction
   ^                              |
   |                              v
Monthly Scheduler          Automation Gadget: callback and investigation ledger
```

### TROM

TROM remains the source of truth. This design requires no new TROM screen, table, service, workflow,
or write endpoint. The Gatekeeper uses existing authenticated APIs through the configured deployment
service account.

### `gatekeeper-trom`

The Gatekeeper:

- Authenticates and reads TROM.
- Validates and normalizes upstream responses.
- Exposes factual portfolio screening, trends, definitions, reporting coverage, and drill-down
  evidence.
- Authorizes every observation before returning it.
- Offers the fixed `/trom-executive-review` slash command.
- Does not calculate an executive risk score, form hypotheses, store management cases, deliver
  escalations, or mutate TROM.

The Gatekeeper must not implement director roles, workspace access control, or human identity.
Cloudflare OS provisioning, bindings, and workspace sharing own those concerns.

### Automation Gadget

The first approved setup creates one small Gadget in the executive workspace. It has no dashboard
requirement. Its Durable Object stores:

- The persistent callback to the originating chat.
- The last completed review month and Scheduler `runId` values used for idempotency.
- Active and closed investigation cases.
- Evidence references and bounded aggregate snapshots.
- Director decisions, escalation drafts, and follow-up dates.

It does not mirror TROM, persist credentials, or retain full upstream payloads. State that can be
re-read from TROM is stored as a reference unless a bounded snapshot is needed to compare change
over time.

### Scheduler

Scheduled Tasks supports hourly, daily, and weekly calendar rules, not a native monthly rule. Setup
therefore registers one weekly callback at the director-selected timezone, weekday, and time. The
Gadget checks its ledger and activates the chat only for the first eligible occurrence of each
calendar month. Retries with the same `runId` and later weekly occurrences in the same month are
no-ops.

After every third completed monthly investigation, the agent also synthesizes the quarterly review.
This avoids approximate 30-day intervals and preserves local wall-clock behavior.

## Factual API Shape

The implementation plan should choose final method names after tracing the existing TROM endpoints,
but the session must support these factual questions without returning unbounded raw data:

1. **Portfolio screen:** section-level SPM/SLA results and reporting coverage for a bounded period.
2. **Indicator trend:** historical result, threshold, applicability, and data coverage for one or
   more SPM/SLA indicators.
3. **Indicator detail:** the applicable SPM/SLA definition and the source records that determined
   pass/fail for a section and period.
4. **Open exposure:** bounded operational records with timestamps, current status, configured
   handling threshold, and accountable role where TROM exposes one. The Gatekeeper returns facts;
   the agent calculates remaining time and interprets risk.
5. **Supporting evidence:** incidents and actions, inspection findings and repair progress,
   reporting completeness, and equipment availability when relevant to an SPM/SLA hypothesis.

Every list method requires a bounded period, section, cursor, or hard result limit. Methods return
stable record identifiers so the agent can re-fetch evidence instead of retaining full payloads.
Person-level fields are excluded unless they are necessary to answer the approved executive
question.

## Investigation Contract

Each scheduled or ad hoc investigation follows the same loop:

1. Screen the portfolio for meaningful changes, gaps, and persistent exposure.
2. Form candidate hypotheses that name a section, indicator, expected outcome, horizon, and causal
   mechanism.
3. Fetch only the drill-down evidence needed to test each candidate.
4. Search for counter-evidence and compare with the section's history and appropriate peers.
5. Reject weak, unsupported, duplicate, or immaterial hypotheses.
6. Reopen prior cases and evaluate whether the recorded intervention changed the trajectory.
7. Present the remaining findings in chat and draft an escalation when management action is
   justified.

Every executive finding must state:

- Section, indicator, and evidence period.
- Expected exposure within the coming quarter.
- Current observation and meaningful baseline.
- Underlying TROM evidence and stable identifiers.
- Counter-evidence considered.
- Missing, stale, or conflicting data.
- Materiality and the available intervention window.
- Evidence that would disprove the conclusion.

Confidence is expressed as strong, moderate, or weak based on coverage, consistency, and directness
of evidence. The first release does not produce an opaque composite risk score or numerical breach
probability.

## Investigation Ledger

Each case has:

- A stable case ID and normalized section/indicator key.
- Status: `active`, `monitoring`, `escalation-approved`, `deferred`, `dismissed`, `improved`, or
  `disproven`.
- Current hypothesis and expected horizon.
- Evidence references, bounded comparison snapshot, and coverage notes.
- Counter-evidence and confidence label.
- Director decision, rationale, escalation text, and next review month.
- Outcome notes linked to later TROM evidence.

The agent updates an existing case rather than opening duplicates for the same continuing exposure.
A dismissed or disproven case may reopen only when new evidence materially changes the earlier
reasoning, which the agent must explain.

## Failure And Data-Quality Behavior

- "No records" is not interpreted as "no risk" when expected reporting coverage is absent.
- Default SPM/SLA values are identified separately from measured results.
- Stale, partial, or conflicting datasets are disclosed before any conclusion that depends on them.
- A failed required read marks the investigation incomplete; the agent does not fill the gap with a
  narrative estimate.
- Upstream errors remain bounded and exclude credentials, tokens, headers, and response bodies.
- Scheduler retries are idempotent and cannot create duplicate cases or chat briefs.
- Full TROM payloads and person-level details are not written into the ledger or executive report by
  default.

## Security And Authority

- TROM access remains read-only through the deployment service account.
- Every data-returning Gatekeeper method uses observation authorization.
- The Gatekeeper declares no auto-approvable actions and submits no TROM mutations.
- Workspace sharing and access control remain Cloudflare OS responsibilities.
- The recurring callback is scoped to the workspace and chat that approved it.
- Escalation approval changes only the Cloudflare OS ledger in the first release.

## Validation

### Development checks

- Contract tests cover upstream normalization, bounds, period validation, missing fields, and safe
  errors for every new Gatekeeper method.
- Scenario fixtures cover a supported hypothesis, a contradicted hypothesis, missing-data ambiguity,
  a continuing case, an improved case, and a duplicate Scheduler retry.
- Slash-command tests verify bounded metadata and the exact fixed expansion contract.
- The package build, tests, and repository lint pass.

### Production shadow quarter

The recurring investigation runs for one quarter without being used as an authoritative decision
system. Reviewers compare its warnings with actual SPM/SLA outcomes and record:

- The share of actual breaches preceded by a warning.
- The share of warnings that became breaches or prompted a justified intervention.
- Time to answer an executive risk question compared with the current process.
- Material findings that required evidence from more than one TROM surface.
- Director acceptance, dismissal, deferral, and escalation rates.
- Unsupported executive claims, whose required count is zero.
- Data coverage sufficient to interpret each metric.

Numeric targets for warning recall, warning precision, and investigation time savings are set only
after the production baseline is measured. Production promotion requires reviewed evidence that
warnings are useful, source coverage is adequate, and unsupported claims remain zero.

## Non-Goals

- A replacement TROM dashboard.
- A Gatekeeper management UI.
- TROM schema, API, or workflow changes.
- TROM writes or automatic escalation delivery.
- A trained prediction model in the first release.
- A universal HKA risk score.
- Access-control or director-role management.
- Standalone safety or equipment-readiness prediction in the first release.
- Copying the recurring setup automatically into other workspaces.

## Implementation Sequencing

Implementation should proceed in three reviewable slices:

1. Add and test the bounded factual Gatekeeper methods required for one-off investigations.
2. Add and test the chat slash command and its agent instruction contract.
3. Validate the agent-created ledger/callback pattern against the existing Scheduler, including
   monthly gating, same-chat reactivation, and retry idempotency.

Kernel or shared-API changes are not expected. If implementation reveals that one is unavoidable,
stop and redesign that boundary before expanding the core diff.
