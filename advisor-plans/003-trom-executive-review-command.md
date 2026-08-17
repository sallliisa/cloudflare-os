# Plan 003: Start the executive investigation from Cloudflare OS chat

> **Implementation instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update this plan's status row in
> `advisor-plans/README.md` after the implementation and review pass.
>
> **Drift check (run first)**:
> `git diff --stat 910ee92..HEAD -- packages/gatekeeper-trom/src/trom.ts packages/gatekeeper-trom/__tests__/trom.test.ts`
> Plan 002 is expected to change these files. Compare the excerpts and rebase
> this plan onto the completed Plan 002 state before editing. Any unrelated
> structural mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `advisor-plans/002-trom-executive-evidence-api.md`
- **Category**: direction
- **Planned at**: commit `910ee92`, 2026-08-15

## Why this matters

HKA directors should be able to start the new capability in the interface they
already use: Cloudflare OS chat. One fixed slash command turns the factual TROM
reads from Plan 002 into a disciplined investigation prompt without adding a
dashboard, management UI, or second HKA system.

## Current state

`packages/gatekeeper-trom/src/trom.ts:149-157` describes the TROM resource but
does not advertise slash commands:

```ts
return {
  url: "trom://operations",
  title: "HKA TROM Operations",
  snippet: "Read factual operational data from HKA TROM.",
  suggestedBindingName: "TROM",
  tsType: "TromSession",
};
```

The shared API already exists. `packages/workshop-shared/src/gatekeeper.ts:882-921`
defines `SlashCommandDescriptor`, `SlashCommandProvider`, and
`SlashCommandResult`; unknown IDs must be rejected. No shared change is needed.

Reuse the local provider pattern in
`packages/gatekeeper-context/src/library-gatekeeper.ts:43-68`: a small
`RpcTarget` implements `list()`, `invoke()`, and `[Symbol.dispose]()`. Its
Gatekeeper advertises `hasSlashCommands: true` and returns the provider at lines
257-295.

The approved command and exact expansion are fixed at
`docs/superpowers/specs/2026-08-15-trom-executive-investigator-design.md:74-109`.
The text contains no protected TROM data, so invoking it does not require an
observation authorization call. It must offer recurrence only after the
one-off investigation and must not create automation without explicit approval.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm --filter @gadgets/gatekeeper-trom test` | exit 0; all tests pass |
| Type contract | `pnpm --filter @gadgets/gatekeeper-trom types:check` | exit 0 |
| Package build | `pnpm --filter @gadgets/gatekeeper-trom build` | exit 0 |
| Repository lint | `pnpm lint:check` | exit 0 |
| Patch hygiene | `git diff --check` | exit 0 |

## Scope

**In scope**:

- `packages/gatekeeper-trom/src/trom.ts`
- `packages/gatekeeper-trom/__tests__/trom.test.ts`
- `advisor-plans/README.md` — status only after implementation and review

**Out of scope**:

- `packages/workshop-shared/`, Workshop backend/frontend, and Scheduler.
- A dashboard, Gatekeeper UI, second slash command, command arguments, dynamic
  prompt content, or protected-data reads during command expansion.
- Creating the recurring Gadget or schedule; that happens in chat only after
  explicit approval and is validated by Plan 004.
- Any TROM API or write behavior.

## Git workflow

- Branch: `advisor/003-trom-executive-review-command`.
- Use a conventional commit such as
  `feat(trom): add executive review command`.
- Do not push, open a PR, merge, or deploy unless explicitly instructed.

## Steps

### Step 1: Add the fixed provider beside the Gatekeeper

In `src/trom.ts`, import the three slash-command types. Add one documented
`TromSlashCommandProvider` class beside `TromSessionImpl`; do not create another
file or a generic command framework.

The provider must:

- return exactly one descriptor with ID and name `trom-executive-review`;
- use a short description suitable for the picker;
- return the exact fixed expansion from design lines 90-98;
- ignore `args` so the expansion remains fixed and testable;
- not call the authorizer because it reads no protected data;
- reject every unknown ID;
- implement an empty `[Symbol.dispose]()` like the Context provider.

Keep the fixed expansion in one production module constant and reuse it from
`invoke()`. The test should contain its own expected literal so an accidental
edit to the production constant fails visibly.

**Verify**: `pnpm --filter @gadgets/gatekeeper-trom types:check` → exit 0.

### Step 2: Advertise and return the provider

Set `hasSlashCommands: true` in `TromGatekeeper.describe()` and implement
`getSlashCommandProvider()` returning a new provider. Leave the resource URL,
typed session, account provisioning, read-only actions, and catalog unchanged.

**Verify**: `pnpm --filter @gadgets/gatekeeper-trom build` → exit 0.

### Step 3: Test the complete command contract

Extend `__tests__/trom.test.ts` with focused tests that obtain the provider from
the Gatekeeper method and verify:

- `list()` returns exactly one bounded descriptor;
- the descriptor ID and name are exactly `trom-executive-review`;
- `invoke()` returns the exact design text, including the final explicit-
  approval sentence, for both empty and non-empty arguments;
- the fake observation authorizer is never called;
- an unknown ID rejects;
- `describe()` advertises slash commands and the Gatekeeper returns the
  provider.

Use direct equality, not snapshots. `TromGatekeeper` is a Durable Object and
does not need to be constructed for these stateless methods: call `describe()`
and `getSlashCommandProvider()` through the prototype with a typed dummy
receiver, matching their lack of instance-state access. Dispose the provider in
a `finally` block when the test owns it.

**Verify**:

1. `pnpm --filter @gadgets/gatekeeper-trom test` → all tests pass.
2. `pnpm --filter @gadgets/gatekeeper-trom types:check` → exit 0.
3. `pnpm --filter @gadgets/gatekeeper-trom build` → exit 0.
4. `pnpm lint:check` → exit 0.
5. `git diff --check` → exit 0.

## Test plan

Put all new tests in the existing Gatekeeper test file. Cover catalog metadata,
exact expansion, ignored arguments, no observation authorization, unknown IDs,
and Gatekeeper discovery. Existing API and session tests from Plan 002 must
remain green.

## Done criteria

- [ ] `/trom-executive-review` appears through the standard Gatekeeper slash
      provider with no Workshop shared/frontend change.
- [ ] Invocation inserts exactly the approved investigation instruction.
- [ ] Non-empty arguments cannot mutate the fixed instruction.
- [ ] Command discovery and invocation perform no protected TROM read.
- [ ] Unknown command IDs reject.
- [ ] Focused tests, types, build, lint, and patch hygiene pass.
- [ ] No files outside Scope are modified.
- [ ] `advisor-plans/README.md` marks Plan 003 DONE only after review.

## STOP conditions

Stop and report back if:

- Plan 002 is not complete or its in-scope files have unresolved failures.
- Slash-command support now requires a shared, backend, or frontend change.
- The approved fixed expansion has changed without an updated design decision.
- Implementing the command appears to require reading TROM data or submitting
  an action.
- A verification command fails twice after a reasonable correction.

## Maintenance notes

- Keep this provider deliberately single-purpose. Add another command only for
  a separately approved user workflow.
- If the prompt changes, update the design spec, module constant, and exact
  equality test in the same change.
- Plan 004 validates whether the standard agent, `self`, Gadget, and Scheduler
  mechanics can fulfill the recurrence offer without product-kernel code.
