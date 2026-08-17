# Plan 001: Route Futureppo model streams through a loopback Node relay

> **Implementation instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update this plan's status row in
> `advisor-plans/README.md` after the implementation and review pass.
>
> **Drift check (run first)**:
> `git diff --stat 0527dc2 -- scripts/ai-stream-relay.mjs scripts/ai-stream-relay.test.js .github/workflows/deploy.yml && git status --short -- scripts/ai-stream-relay.mjs scripts/ai-stream-relay.test.js .github/workflows/deploy.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. A mismatch
> is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `0527dc2`, 2026-08-14

## Why this matters

On the `ciddeploy` Linux host, direct HTTPS/SSE requests from workerd to the
configured Futureppo OpenAI-compatible endpoint repeatedly receive HTTP 200
headers but fail to reach a terminal Responses API event. The persisted agent
turn remains active until the Durable Object lifecycle ends, sometimes
accompanied by `Network connection lost` and a native workerd segmentation
fault. The same repository state succeeds under the Darwin workerd binary.

A transport-only A/B test isolated the failure. Workerd rebuilt a previously
stalled request from durable chat state and sent it to a loopback Node 22
relay. Node forwarded the exact 151,376-byte body to the same provider with the
same credential, received HTTP 200 in 7.4 seconds and
`response.completed` after 106.5 seconds. Workerd consumed the relayed SSE,
executed another tool step, sent a second request, received its terminal event
after 11.1 seconds, persisted the final message, and cleared `activeAgents`.

This plan turns that throwaway probe into a narrowly scoped deployment
workaround. It does not change the CloudflareOS kernel. A dedicated PM2 process
will accept only the Responses endpoint on `127.0.0.1`, forward it to one fixed
HTTPS origin with Node's native `fetch`, and stream the response back without
logging or persisting credentials, prompts, or response content.

The relay is not a retry layer. The A/B test also observed a different,
227,180-byte historical request whose upstream connection terminated without a
terminal SSE event even under Node. Such provider failures must surface as
ordinary model errors; automatically replaying a billable request risks
duplicate generations and is explicitly out of scope.

## Current state

### Deployment is a site-specific PM2/workerd stack

`README.md:184-200` says `pnpm run-local` is intended for local trials and that
self-hosted workerd deployment tooling is not yet provided upstream. This fork
therefore owns its site-specific process management in GitHub Actions.

`.github/workflows/deploy.yml:27-56` currently installs dependencies, copies the
deployment wrapper, and manages one PM2 process:

```yaml
- name: Deploy and verify
  run: |
    ssh -i ~/.ssh/id_ed25519 -p 2203 deploy@office.berinovasi.top 'bash -se' <<'REMOTE'
      set -euo pipefail
      export NVM_DIR="$HOME/.nvm"
      export PATH="$NVM_DIR/versions/node/v22.23.2/bin:$PATH"
      PM2_NODE="$NVM_DIR/versions/node/v20.20.2/bin/node"
      PM2="$NVM_DIR/versions/node/v20.20.2/lib/node_modules/pm2/bin/pm2"
      APP_DIR="$HOME/cloudflare-os"

      cd "$APP_DIR"
      git fetch origin main
      git reset --hard origin/main
      pnpm install --frozen-lockfile
      install -m 700 scripts/cfos-run-local-wrapper.mjs "$HOME/cfos-run-local-wrapper.mjs"

      export PUBLIC_BASE_URL=https://cfos.berinovasi.top
      export DISABLE_DEV_WATCHERS=true
      if "$PM2_NODE" "$PM2" describe cfos >/dev/null 2>&1; then
        "$PM2_NODE" "$PM2" restart cfos --update-env --kill-timeout 7000
      else
        "$PM2_NODE" "$PM2" start "$HOME/cfos-run-local-wrapper.mjs" --name cfos \
          --interpreter "$NVM_DIR/versions/node/v22.23.2/bin/node" --kill-timeout 7000 -- --port 8787
      fi

      for attempt in $(seq 1 30); do
        curl --fail --silent --show-error --max-time 5 https://cfos.berinovasi.top/ && exit 0
        sleep 2
      done
      exit 1
    REMOTE
```

`scripts/cfos-run-local-wrapper.mjs:1-53` is already deployment-only. It patches
the upstream dev-server launcher for the public gatekeeper URL and supervises a
single child. Do not fold the relay into this wrapper: a separate PM2 process
gives the relay an independent restart policy, health check, and log stream.

### Model routing already supports a custom server-side API URL

`packages/workshop-backend/src/ai-models.ts:605-620` passes the stored OpenAI
model URL directly to pi's OpenAI Responses adapter:

```ts
case "openai":
  return makeHandle({
    model: {
      id: config.model,
      name: catalog?.name ?? config.model,
      api: "openai-responses",
      provider: "openai",
      baseUrl: config.apiUrl ?? "https://api.openai.com/v1",
      // ...
    },
    apiKey: config.apiToken,
    sessionAffinity,
  });
```

No backend routing change is needed. The affected model can use
`http://127.0.0.1:18789/v1` as its stored API URL; because model inference runs
server-side, that loopback address refers to the `ciddeploy` host, not the
browser.

`packages/workshop-frontend/src/AddModelModal.tsx:182-205` already sends an
advanced `apiUrl` override and the supplied token through the existing model
configuration RPC:

```tsx
const config: AiModelConfig = {
  provider: selection!.provider,
  model: finalModelId,
  apiToken: gatewayMode ? '' : apiToken.trim(),
  ...(!gatewayMode && accountId.trim() && { accountId: accountId.trim() }),
  ...(!gatewayMode && apiUrl.trim() && { apiUrl: apiUrl.trim() }),
}

await authenticatedApi.addModel(profile, config)
```

The API URL field for non-Ollama/non-Cloudflare providers is exposed under
Advanced Settings at `packages/workshop-frontend/src/AddModelModal.tsx:342-358`.
`packages/workshop-backend/src/user.ts:550-557` stores with `put`, so adding the
same model ID replaces that model record while preserving references that use
the ID:

```ts
async addModel(profile: AiChatAuthorInfo, config: AiModelConfig): Promise<void> {
  // gateway validation omitted
  profile.type = "agent";
  this.storage.aiModels.put({profile, config});
}
```

Do not edit Durable Object SQLite files to perform this rollout. Use the
existing AI Providers UI and the existing credential supplied by the operator.

### Repository verification conventions

`package.json:7-17` defines the enforced commands. Root tests begin with
`node --test scripts/*.test.js`, so a new `scripts/ai-stream-relay.test.js` is
automatically part of `pnpm test`; no package script or dependency is needed.
Script tests use `node:test` and `node:assert/strict`, as shown in
`scripts/dev-server-config.test.js:1-73`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused relay tests | `node --test scripts/ai-stream-relay.test.js` | exit 0; all relay tests pass |
| Script test suite | `node --test scripts/*.test.js` | exit 0; all script tests pass |
| Lint | `pnpm lint:check` | exit 0; no lint errors |
| Typecheck/build | `pnpm build` | exit 0 |
| Full tests | `pnpm test` | exit 0; all package tests pass |
| Patch hygiene | `git diff --check` | exit 0; no whitespace errors |

The repository uses pnpm, not npm. Do not add a relay dependency: Node 22 has
all required HTTP, stream, URL, AbortSignal, and fetch APIs.

## Scope

**In scope** (the only source/deployment files to modify):

- `scripts/ai-stream-relay.mjs` — create the loopback streaming relay.
- `scripts/ai-stream-relay.test.js` — create focused, network-local tests.
- `.github/workflows/deploy.yml` — install, supervise, and health-check the
  relay before restarting CloudflareOS.
- `advisor-plans/README.md` — update this plan's status after implementation
  and review.

**In scope as an operator rollout action, not a repository edit**:

- Replace the existing `grok-4.5` model record through the AI Providers UI,
  keeping its provider, ID, display name, and API token unchanged while setting
  its API URL to `http://127.0.0.1:18789/v1`.

**Out of scope** (do not touch even though these areas look related):

- Everything under `packages/workshop-backend/`, including `ai-models.ts`,
  `agent.ts`, `overseer.ts`, model timeouts, and active-agent persistence.
- Everything under `packages/workshop-shared/` and
  `packages/workshop-frontend/`; the existing custom URL form is sufficient.
- Durable Object SQLite files or typed-storage formats.
- The upstream R2/release pipeline under `scripts/release/`; this fork deploys
  through `.github/workflows/deploy.yml`.
- A generic forward proxy, multiple upstream origins, arbitrary paths, public
  listening, TLS termination, caching, buffering entire payloads, or automatic
  retries.
- Fixing or upgrading workerd itself.

## Git workflow

- Branch: `advisor/001-linux-workerd-ai-stream-relay`.
- Use conventional commits, matching recent history such as
  `fix(agent): keep interactive turns alive`.
- Keep the relay/tests and deployment wiring as separate logical commits if
  that makes review clearer.
- Do not push, merge, dispatch the production workflow, or open a PR unless the
  operator explicitly instructs it.

## Steps

### Step 1: Add the fixed-origin loopback relay and its tests

Create `scripts/ai-stream-relay.mjs` using only Node standard-library imports.
It must export a constructor/factory that tests can start on an ephemeral port,
and it must start the production server when executed directly.

Implement this exact boundary:

1. Read `AI_STREAM_RELAY_UPSTREAM_ORIGIN` when run directly. Validate it with
   `URL` and refuse startup unless it is an HTTPS origin with no username,
   password, path other than `/`, query, or fragment. The production value is
   `https://api.futureppo.top`; never embed a credential in it.
2. Listen on the hard-coded host `127.0.0.1`. Default to port `18789`; allow a
   validated `AI_STREAM_RELAY_PORT` only for test/operational flexibility.
   Never accept a bind-host environment variable.
3. Return HTTP 200 from `GET /healthz` without contacting the upstream.
4. Accept only `POST /v1/responses`. Return 405 for another method on that
   path and 404 for every other path. Construct the upstream URL from the
   validated fixed origin and the literal `/v1/responses`; never derive an
   upstream host from an inbound header, query, or request body.
5. Forward the inbound request body as a stream to native `fetch` with
   `duplex: "half"`, `redirect: "manual"`, and an abort signal. Do not buffer
   the request body and do not retry.
6. Forward request headers needed by the OpenAI-compatible API, including
   `Authorization` and `Content-Type`, but drop `Host`, `Content-Length`, and
   all standard hop-by-hop headers. Never log header values.
7. Apply a 12-minute upstream timeout. Also abort upstream fetch immediately
   if the workerd client aborts or closes the downstream connection before the
   response finishes. A timeout before response headers should become 504; an
   ordinary upstream failure before headers should become 502. If headers have
   already been sent, terminate the downstream stream rather than attempting
   to append an error body.
8. Copy the upstream status and safe end-to-end headers, then stream the body
   to the workerd client with standard-library pipeline/backpressure handling.
   Drop hop-by-hop response headers plus `Content-Length` and
   `Content-Encoding`: Node fetch may transparently decompress the body, so
   forwarding the upstream encoding/length would corrupt the downstream SSE.
9. Emit one-line JSON lifecycle logs containing only a generated request ID,
   event name, method/path, upstream status, duration, and coarse outcome.
   Never log request/response bodies, header values, URLs containing query
   strings, or caught objects wholesale. Normalize caught failures to a safe
   error name/message string.
10. Handle SIGINT/SIGTERM by stopping acceptance of new connections and
    closing the server. Do not persist request data anywhere.

Create `scripts/ai-stream-relay.test.js`, following the `node:test` structure
in `scripts/dev-server-config.test.js`. Inject a fake `fetch` and a log sink so
tests never contact the real provider and never need credentials. Cover:

- HTTPS-origin validation rejects HTTP, credentials, paths, queries, and
  fragments.
- `GET /healthz` returns 200 without invoking upstream fetch.
- Unknown paths and disallowed methods are rejected without invoking fetch.
- An allowed request forwards the exact path, method, bearer header, content
  type, and streamed body to the fixed origin.
- A multi-chunk `text/event-stream` response reaches the client unchanged and
  backpressure-safe.
- Hop-by-hop, content-length, and content-encoding response headers are absent
  downstream while content type remains.
- A short injected timeout aborts the fake fetch and yields 504 before headers.
- Upstream failure yields 502 before headers.
- A client disconnect aborts the fake upstream signal.
- Logs do not contain sentinel API-token, prompt, or response strings used by
  the test.

**Verify**:

```sh
node --test scripts/ai-stream-relay.test.js
```

Expected: exit 0; all cases above pass; the test performs no external network
request.

### Step 2: Manage the relay as a separate PM2 application

Update only the remote shell block in `.github/workflows/deploy.yml`.

After `pnpm install --frozen-lockfile` and before restarting `cfos`:

1. Copy `scripts/ai-stream-relay.mjs` to
   `$HOME/cfos-ai-stream-relay.mjs` with mode 700, matching the existing wrapper
   installation pattern.
2. Export the non-secret fixed origin:
   `AI_STREAM_RELAY_UPSTREAM_ORIGIN=https://api.futureppo.top`. Do not put the
   model API token in the relay environment; workerd forwards its existing
   request authorization header over loopback.
3. Restart an existing `cfos-ai-relay` PM2 app with `--update-env`, or create
   it with the Node 22.23.2 interpreter, name `cfos-ai-relay`, and the same
   7-second kill timeout convention used for `cfos`.
4. Poll `http://127.0.0.1:18789/healthz` with bounded `curl` attempts. Fail the
   deployment before touching `cfos` if the relay is not healthy.
5. Restart/start `cfos` exactly as the workflow does today, then retain its
   existing public-origin health loop.
6. Replace the public-health loop's current `curl ... && exit 0` shortcut with
   an explicit success branch. Inside that branch, after the public curl has
   succeeded, invoke PM2's save operation through the existing explicit
   `PM2_NODE`/`PM2` paths and only then exit 0. This includes
   `cfos-ai-relay` in PM2 resurrection state without saving a deployment that
   failed either health check. Do not change or delete unrelated PM2
   applications.

Do not combine the two applications into an ecosystem file and do not make the
relay a child of `scripts/cfos-run-local-wrapper.mjs`.

**Verify**:

```sh
git diff --check
node --test scripts/*.test.js
```

Expected: both commands exit 0. Review the workflow diff and confirm the relay
health gate precedes the `cfos` restart and the public health gate remains.

### Step 3: Pass repository verification before rollout

Run the same gates enforced by CI. Do not weaken workerd assertions or skip a
package to make the suite green.

**Verify**:

```sh
pnpm lint:check
pnpm build
pnpm test
git status --short
```

Expected: the first three commands exit 0. `git status --short` lists only the
three in-scope source/deployment files plus the advisor plan status change; no
`packages/*` source file is modified.

### Step 4: Deploy and verify the sidecar before changing model state

Production deployment is an external state change. Do not perform this step
until the operator explicitly authorizes deployment and the implementation is
available to the manual `Deploy CFOS` workflow (normally after merge/push to
`main`). Do not bypass the workflow by resetting the server checkout to an
unpublished commit.

Dispatch `.github/workflows/deploy.yml`, then inspect the host without printing
process environments or command lines that may contain unrelated credentials.

**Verify on `ssh ciddeploy`**:

```sh
curl --fail --silent --show-error --max-time 2 http://127.0.0.1:18789/healthz
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8787/
```

Expected: both exit 0. The first returns the relay's bounded health response;
the second returns the CloudflareOS frontend. Confirm through PM2's named-app
status command that `cfos-ai-relay` and `cfos` are online, but do not dump their
environment variables.

Also run the focused test with the exact production Node binary:

```sh
/home/deploy/.nvm/versions/node/v22.23.2/bin/node --test \
  /home/deploy/cloudflare-os/scripts/ai-stream-relay.test.js
```

Expected: exit 0; all relay tests pass on Node 22.23.2.

### Step 5: Repoint only the affected model through the existing UI

Wait until no agent turn is active. In CloudflareOS's AI Providers UI, add the
Futureppo model again as a custom OpenAI model using:

- The exact existing model ID (`grok-4.5`) so preferred-model and chat
  references continue to resolve.
- The existing display name and API token supplied by the operator. Never copy
  the token into a shell command, plan, log, issue, or commit.
- Advanced Settings API URL: `http://127.0.0.1:18789/v1`.

The existing `addModel` path overwrites the record for the same ID. Do not
delete the model first, and do not edit its Durable Object SQLite database.

Run a new agent task that requires at least two model turns, such as creating a
small gadget and testing it. Observe only redacted relay lifecycle logs and the
workspace's durable outcome.

**Verify**:

- The relay logs a 200 upstream status and a clean stream-finished outcome for
  each successful model step, without any authorization header, prompt, tool
  output, or response text.
- The workspace advances beyond its first model step, persists a final agent
  message, and clears its active-agent state within 12 minutes.
- `cfos` and `cfos-ai-relay` remain online.
- A second normal request still succeeds after the first, proving the relay is
  reusable and did not retain per-request state.

If the upstream itself terminates a stream, it is acceptable for that one agent
turn to end with a model error. The relay must not retry it automatically and
must remain healthy for the next request.

### Step 6: Review the diff and record completion

Review every hunk as untrusted:

- Every source change must trace to Step 1 or Step 2.
- Search the new files and workflow for credential-like literals and for body
  or header logging.
- Confirm the listener host is hard-coded loopback and the upstream destination
  cannot be selected by the caller.
- Confirm no automatic retry exists.
- Confirm the workflow cannot restart `cfos` unless the relay health check has
  passed.

Update the row for Plan 001 in `advisor-plans/README.md` to `DONE` only after
the code review, automated verification, and authorized live smoke test all
pass. Otherwise mark it `BLOCKED` with the concrete reason.

**Verify**:

```sh
git diff --check
git diff --name-only 0527dc2
git ls-files --others --exclude-standard
```

Expected: no whitespace errors. Across the two file-list commands, the
source/deployment changes contain only `scripts/ai-stream-relay.mjs`,
`scripts/ai-stream-relay.test.js`, and `.github/workflows/deploy.yml`;
advisor-plan files may also appear as planning artifacts.

## Test plan

- Unit tests live in `scripts/ai-stream-relay.test.js` and use only loopback
  test servers or an injected fake fetch. They must never access
  `api.futureppo.top`.
- Model the test structure after `scripts/dev-server-config.test.js`: ESM,
  `node:test`, and `node:assert/strict`; no test framework or dependency.
- Security regression cases cover fixed-origin validation, route/method
  restriction, header filtering, log redaction, and cancellation.
- Transport regression cases cover streamed request forwarding, multi-chunk SSE
  forwarding, transparent-decompression header removal, and timeouts.
- Deployment verification runs the focused suite under the remote Node 22.23.2
  binary, checks loopback health, then performs a credentialed multi-turn agent
  smoke test through the existing UI configuration.

## Rollback

If the relay causes a regression:

1. Wait for active agent turns to stop.
2. Re-add the same `grok-4.5` model ID through AI Providers with the existing
   token and its original HTTPS API URL. Do not delete it first.
3. Confirm a direct request behaves as it did before the rollout.
4. Stop and delete only the named `cfos-ai-relay` PM2 application, then save the
   PM2 process list. Do not touch `cfos` or unrelated PM2 apps.
5. Revert the relay/workflow commit through normal git history and redeploy.

The relay persists no data, so there is no relay-state migration or backup to
restore.

## Done criteria

All must hold:

- [ ] `node --test scripts/ai-stream-relay.test.js` exits 0 on local CI Node and
      remote Node 22.23.2.
- [ ] `pnpm lint:check`, `pnpm build`, and `pnpm test` exit 0.
- [ ] The relay listens only on `127.0.0.1:18789` and exposes only `/healthz`
      plus `POST /v1/responses`.
- [ ] The upstream origin is validated, fixed by deployment configuration, and
      cannot be supplied by an inbound request.
- [ ] No credential, header value, prompt, tool result, request body, or
      response body is logged or persisted by the relay.
- [ ] The relay streams without buffering the full request/response and has no
      retry path.
- [ ] Deployment health-checks the relay before restarting `cfos` and saves the
      PM2 process list after both apps are healthy.
- [ ] The `grok-4.5` record is updated through the existing UI, not through
      direct SQLite mutation.
- [ ] A new multi-turn agent run reaches a final persisted message and clears
      active-agent state through the relay.
- [ ] No file under `packages/` is modified.
- [ ] `git diff --check` exits 0 and `advisor-plans/README.md` marks Plan 001
      `DONE` only after live verification.

## STOP conditions

Stop and report instead of improvising if:

- Any in-scope file has drifted from the current-state excerpts since commit
  `0527dc2` in a way that changes startup, model routing, or deployment order.
- The relay cannot bind only to `127.0.0.1`, or workerd cannot reach the
  loopback listener in a production-like smoke test.
- The provider requires a second endpoint, redirect, WebSocket, or protocol
  transformation beyond transparent HTTP/SSE forwarding.
- Correct forwarding requires logging, persisting, or separately configuring
  the model API token.
- The implementation appears to require changing any `packages/*` source file
  or Durable Object storage directly.
- The operator cannot safely re-enter the existing model credential through
  the UI.
- Any test makes a real provider request or exposes a sentinel secret in logs.
- The relay receives an upstream redirect. Keep `redirect: "manual"`; do not
  follow it until the destination and credential-forwarding implications are
  reviewed.
- A verification step fails twice after a reasonable, in-scope correction.
- The implementation is not on the revision the production workflow will
  deploy, or production deployment has not been explicitly authorized.

## Maintenance notes

- This is an instance-specific workaround for the self-hosted Linux
  workerd/Futureppo transport combination, not a general CloudflareOS feature.
- If workerd is upgraded or the provider edge changes, repeat the direct-vs-
  relay A/B before removing the relay. Remove it only after several direct
  multi-turn runs reach terminal SSE events on `ciddeploy`.
- Reviewers should scrutinize fixed-origin validation, loopback binding,
  authorization-header handling, transparent decompression, abort propagation,
  and log redaction more closely than code style.
- Node's fetch/stream behavior is part of the workaround. Keep the remote Node
  runtime pinned at 22.23.2 until a deliberate compatibility test approves a
  runtime change.
- The CloudflareOS backend already supplies session-affinity and provider
  headers. The relay must stay transport-transparent and must not synthesize,
  remove, or inspect application-level JSON/SSE events.
- A previously exposed Cloudflare Tunnel credential must be rotated separately.
  That security operation is unrelated to this plan and must not be encoded in
  relay configuration.
