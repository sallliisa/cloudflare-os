# HKA TROM Gatekeeper

This Gatekeeper exposes factual, read-only HKA TROM dashboard data to CloudflareOS. It does not
choose an executive lens, reorder sections, calculate a score, or perform mutations.

Configure these Worker variables:

- `HKA_TROM_API_URL`: HTTPS base URL for TROM, without `/api`.
- `HKA_TROM_USERNAME`: deployment service-account username.
- `HKA_TROM_PASSWORD`: deployment service-account password.
- `HKA_TROM_ALLOW_INSECURE`: committed as `false`; set it to `true` only for local HTTP testing.

For local development, put the values in the repository root `.dev.vars` and run:

```bash
pnpm dev-server
```

Useful manual prompts:

1. “Using HKA TROM, show me what deserves executive attention this month and make a concise Gadget. Explain the evidence for every item.”
2. “Why did you put that section first? Show the underlying SPM/SLA, open incidents, P1/P2 inspections, equipment availability, report completeness, and cost facts you used.”
3. “Change the lens: prioritize unresolved safety and service reliability, not budget variance. Update the Gadget.”

Never commit `.dev.vars`, credentials, bearer tokens, or live TROM response payloads.
