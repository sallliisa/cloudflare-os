# HKA TROM Gatekeeper

This Gatekeeper exposes factual, read-only HKA TROM dashboard data to CloudflareOS. It does not
choose an executive lens, reorder sections, calculate a score, or perform mutations.

The typed session also exposes three bounded drill-down reads:

- `getSpmSlaTrend()` returns monthly SPM/SLA trend points for a period and optional section.
- `getSpmSlaIndicatorDetail()` returns one section's indicator definitions and source booleans,
  capped at 250 indicators.
- `listMajorAssetDamageExposures()` returns paged `OPEN` or `ON_PROGRESS` major-damage rows, with a
  default and maximum page size of 50 and without person, image, coordinate, or raw-file fields.

`getReportCompleteness()` accepts one calendar month only. TROM currently does not distinguish
measured SPM/SLA results from configured defaults, so every indicator reports
`resultBasis: "measured-or-default-unidentified"`. Agents must disclose that limitation and must
not infer missing data as good performance.

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
