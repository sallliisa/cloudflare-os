# Plan 004: Prove the recurring investigator in a disposable Cloudflare OS workspace

> **Implementation instructions**: Follow this plan step by step. Run every
> verification check and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report;
> do not improvise. This plan changes test-workspace state, so obtain explicit
> operator approval before Step 2. When done, update this plan's status row in
> `advisor-plans/README.md` after the acceptance review.
>
> **Drift check (run first)**:
> `git diff --stat 910ee92..HEAD -- packages/gatekeeper-trom packages/gatekeeper-scheduler/README.md packages/workshop-backend/src/agent.ts docs/superpowers/specs/2026-08-15-trom-executive-investigator-design.md`
> Plans 002 and 003 are expected to change `gatekeeper-trom`. Confirm their
> completed contracts still match this plan. Any Scheduler or `self` semantic
> change is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `advisor-plans/002-trom-executive-evidence-api.md`, `advisor-plans/003-trom-executive-review-command.md`
- **Category**: tests
- **Planned at**: commit `910ee92`, 2026-08-15

## Why this matters

The highest-value behavior is not the one-off report; it is the agent returning
to the same executive conversation, remembering decisions, and testing whether
management interventions worked. Cloudflare OS already has persistent chat
callbacks, user-created Gadgets, and weekly wall-clock scheduling. This plan
proves those native parts are sufficient before anyone writes kernel code or a
dashboard.

## Current state

`packages/workshop-backend/src/agent.ts:688-700` tells the agent that `self` is a
magic callback to the same chat and may be passed over RPC and stored in Durable
Object KV for long-term callbacks.

`packages/gatekeeper-scheduler/README.md:7-19` defines the user flow:
registration creates a disabled hook, and the user enables it in Connections.
Lines 46-55 confirm wall-clock rules support weekly, not monthly, recurrence.
Lines 77-95 require persistent callbacks and `runId` idempotency; retries can
deliver the same logical occurrence up to eight times.

The approved behavior at
`docs/superpowers/specs/2026-08-15-trom-executive-investigator-design.md:171-195`
uses one small Gadget. It stores the originating-chat callback, completed month,
processed run IDs, bounded cases/evidence/decisions, and uses a weekly schedule
that activates only once per calendar month. Every third completed month also
requests a quarterly synthesis.

The same design at lines 247-274 defines case identity, statuses, evidence and
decision fields, duplicate suppression, and missing-data behavior. These are
acceptance requirements, not an invitation to mirror TROM payloads.

## Commands and checks you will need

| Purpose | Command/check | Expected on success |
|---|---|---|
| Package regression | `pnpm --filter @gadgets/gatekeeper-trom test` | exit 0 |
| Scheduler regression | `pnpm --filter @gadgets/gatekeeper-scheduler test` | exit 0 |
| Repository state | `git status --short` | no source edits from this acceptance pass |
| Runtime inspection | Open the disposable workspace's Connections and Scheduled views | one enabled weekly schedule targets the test workspace |

Use the product-native collaborative browser when available. Do not use
production TROM data for this plan; the configured test data is sufficient.

## Scope

**In scope as disposable runtime state**:

- One new Cloudflare OS test workspace and chat.
- One minimal automation Gadget created by the agent after explicit approval.
- One TROM binding and one Scheduler binding required by that Gadget.
- One enabled weekly calendar schedule using an explicitly supplied test
  timezone, weekday, and time.
- Synthetic callback invocations or a short-lived test cadence used only to
  prove idempotency and month/quarter gating.
- `advisor-plans/README.md` — status only after acceptance review.

**Out of scope**:

- Repository source changes, production deployment, production credentials, or
  an authoritative HKA report.
- A dashboard, management UI, TROM write, automatic escalation delivery, email,
  Teams, Slack, or another external system.
- Changes to Workshop kernel/shared/frontend, Scheduler, or Gatekeeper code.
- Storing full TROM payloads, credentials, person-level details, or generated
  charts in the ledger.
- Leaving a rapid test schedule enabled after validation.

## Git workflow

No implementation branch or source commit is expected. If acceptance discovers
a source defect, stop and write a focused follow-up plan; do not patch it during
this runtime validation. Only the plan-index status may change after review.

## Steps

### Step 1: Establish a clean baseline

Run the TROM and Scheduler focused suites. Confirm the TROM resource is present
in a local/test Cloudflare OS instance and `/trom-executive-review` appears in
the chat command picker.

**Verify**:

1. `pnpm --filter @gadgets/gatekeeper-trom test` → exit 0.
2. `pnpm --filter @gadgets/gatekeeper-scheduler test` → exit 0.
3. Command picker → exactly one TROM executive command is visible.

### Step 2: Run the one-off investigation before approving recurrence

After the operator authorizes disposable workspace state, invoke
`/trom-executive-review`. Approve only the necessary TROM observations. Confirm
the agent screens SPM/SLA first, uses stable evidence IDs, seeks contrary
evidence, discloses the measured/default limitation, and does not interpret
missing data as good performance.

The agent must finish the one-off answer before offering recurrence. Decline or
withhold recurrence once to prove no Gadget or schedule is created implicitly;
then explicitly approve it in a later message and supply an IANA timezone,
weekday, and time.

**Verify**:

- Before explicit approval: no new Gadget and no schedule exist.
- After approval: the agent asks for any missing calendar fields rather than
  inferring them.

### Step 3: Inspect the generated Gadget boundary

Review the proposed Gadget code before accepting it. It must be the smallest
Durable Object that can:

- store the originating `self` callback;
- store `lastCompletedMonth` and a bounded collection of processed `runId`s;
- store cases keyed by normalized section/indicator identity;
- keep only stable evidence references, bounded comparison snapshots, coverage
  notes, director decisions, escalation drafts, and follow-up dates;
- no-op when the same `runId` is delivered again;
- no-op after the first eligible weekly occurrence in the same local month;
- call the same chat once on the first eligible occurrence;
- request a quarterly synthesis after each third newly completed monthly review.

It must not contain TROM credentials, copy full TROM responses, calculate a
risk score, send an escalation, or implement a dashboard. Accept and bind only
TROM and Scheduler if those capabilities are actually needed by the generated
code.

**Verify**: inspect the accepted Gadget code and storage-facing methods; every
required field and no-op guard above is present, and none of the prohibited
behavior is present.

### Step 4: Register and enable the weekly calendar callback

Have the agent persist the callback with `ctx.restore()` and register one
`calendarAt()` rule with `freq: "weekly"` and the explicitly supplied IANA
timezone, weekday, hour, and minute. Confirm registration initially creates a
disabled hook, then enable it through Connections as the product requires.

Do not emulate monthly cadence with 30-day milliseconds.

**Verify**:

- Connections shows one enabled hook targeting the disposable workspace.
- Scheduled shows one weekly rule with the chosen local wall-clock fields.
- No second schedule was created by a retry or repeated setup message.

### Step 5: Exercise idempotency and longitudinal state

Using a synthetic invocation path exposed only for the disposable test Gadget,
or a temporary weekly cadence if necessary, deliver:

1. one new run ID in a new month;
2. the same run ID again;
3. a different run ID in the same month;
4. first eligible runs for two more months.

Use synthetic TROM fixture conditions to represent: a supported hypothesis, a
contradicted hypothesis, missing-data ambiguity, a continuing case, and an
improved case. Record a director decision in chat between callbacks.

Expected behavior:

- delivery 1 reactivates the same chat once;
- deliveries 2 and 3 create no duplicate brief or case;
- later months update the existing normalized case instead of duplicating it;
- the third completed month requests one quarterly synthesis;
- the recorded decision is available when evaluating the later outcome;
- callback completion resolves successfully so Scheduler does not retry it.

**Verify**: chat history and bounded Gadget state show exactly three monthly
completions, one quarterly synthesis request, stable case IDs, and no duplicate
briefs.

### Step 6: Clean up the accelerated test path

Disable any rapid or synthetic schedule. Keep the disposable weekly schedule
only if the operator wants it retained; otherwise disable it too. Do not delete
or alter unrelated workspace state.

**Verify**:

1. Scheduled/Connections show no accelerated test hook enabled.
2. `git status --short` → no repository source edits from this plan.
3. Record the pass/fail evidence and any blocker in the Plan 004 index status.

## Test plan

This is an end-to-end acceptance test, not a source unit-test plan. It covers:

- chat-first command discovery and one-off investigation;
- explicit approval before any persistent state;
- same-chat `self` callback persistence;
- weekly-to-monthly calendar gating;
- duplicate `runId` and same-month no-ops;
- case continuation, improvement, contradiction, and missing data;
- third-month quarterly synthesis;
- no TROM mutation or external escalation delivery.

## Done criteria

- [ ] A disposable workspace completes the one-off investigation before any
      recurrence is created.
- [ ] The accepted Gadget is minimal and stores only the approved bounded
      callback/ledger state.
- [ ] One enabled weekly calendar rule produces at most one monthly brief.
- [ ] Duplicate run IDs and later same-month occurrences are no-ops.
- [ ] Three completed months produce exactly one quarterly synthesis request.
- [ ] The same chat is reactivated and prior director decisions affect later
      follow-up.
- [ ] No source code, TROM data, or external communication is mutated.
- [ ] Accelerated test hooks are disabled after validation.
- [ ] `advisor-plans/README.md` records DONE or a precise BLOCKED reason.

## STOP conditions

Stop and report back if:

- The operator has not explicitly approved disposable workspace/Gadget/schedule
  creation.
- TROM or Scheduler is unavailable in the test workspace.
- The agent proposes production data, a dashboard, a TROM write, external
  delivery, credentials in code, or a Workshop kernel change.
- The generated Gadget cannot persist `self`, use `ctx.restore()`, or no-op by
  `runId` using current platform contracts.
- A monthly investigation requires a native monthly Scheduler rule; the
  approved design explicitly uses weekly calendar gating.
- Any test schedule cannot be safely disabled after validation.

## Maintenance notes

- Keep this as a product acceptance gate. Do not convert the generated Gadget
  into a bundled framework unless multiple real workspaces prove that manual
  creation is unreliable.
- Scheduler retries are normal; `runId` idempotency is permanent product logic,
  not test scaffolding.
- A source defect discovered here should receive a new numbered plan with its
  own scope and tests.

