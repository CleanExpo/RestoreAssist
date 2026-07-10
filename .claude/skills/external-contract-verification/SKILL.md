---
name: external-contract-verification
description: Catch the "importer reads a JSON key the external API never returns → silently imports zero rows, mocked tests stay green" failure class BEFORE it ships. Use whenever you write or change code that parses a third-party API response (Ascora, Xero, any REST/webhook payload), map its fields, or write a mock/fixture for one.
automation: manual
intents: integration, importer, api, ascora, xero, response-shape, contract, mock, fixture, webhook
---

# External-Contract Verification

The single most expensive integration bug on this codebase, three times over:
**an importer reads a field the external API does not return, so it imports nothing,
and the mocked test passes because the mock encodes the same wrong shape.**

> Golden rule: **You may not invent an external API's response shape. Derive it from a
> real captured response, or treat the import as unverified.** A hand-written mock proves
> only that your code agrees with itself.

## Why this keeps happening (the mechanism)

- The Ascora list endpoints wrap rows in `{ success, results: [...] }`; `GetInvoicesToSend`
  returns a bare array; `/Jobs/JobLabour/{n}` had yet another shape. The importer read
  `data.jobLabours` — a key Ascora **never** returns — so 600+ jobs drained with
  `fetchErrors: 0, labourLines: 0` (a $607k job "had no labour"). Fixes: PRs #1872, #1882,
  #1885.
- Every one shipped green. `service-layer-architecture` says "mock at the service-module
  boundary" — so the fixture was hand-authored to the **wrong** shape and the unit test
  passed. `ci-parity-verification` only covers DB-gated suites; it cannot see an HTTP
  contract. Nothing in the pipeline compared the mock to reality.

## The protocol (before you claim an importer works)

1. **Capture a real response.** Hit the live endpoint once (or paste a real payload the
   founder provides) and save the raw JSON to a fixture. Never type the shape from memory
   or from the API doc alone — docs drift from prod.
2. **Derive the mock from the capture.** The test fixture must be the captured response (or
   a trimmed copy of it), not a bespoke object. If you can't capture it, say so and mark
   the import **unverified** — do not claim it passes.
3. **Assert keys exist in the real shape.** The parser must read a key that is present in
   the captured payload. Add a test: `expect(realCapture).toHaveProperty('<the key you read>')`.
4. **Alarm on zero.** An import that returns zero rows from a non-empty source is a
   **failure signal, not a success.** Emit a self-diagnostic (see below) and surface it —
   never log `imported: 0` as if it were fine.
5. **Tolerate shape variance at the boundary.** Real APIs return different envelopes per
   endpoint. Normalise defensively: accept `results` / bare-array / `items`, and map field
   aliases, instead of hard-coding one path.

## The pattern that works (normaliser + zero-row diagnostic)

```ts
// Extract rows from whatever envelope the API actually used.
function normalizeRows(data: unknown): Row[] {
  const arr =
    (data as any)?.results ??            // {success, results:[]}
    (Array.isArray(data) ? data : null) ?? // bare array
    (data as any)?.items ?? [];
  return arr.map(mapWithFieldAliases);   // roleName|role|name, hours|numberOfHours, ...
}

// In the importer: record the shapes you saw, so a zero-row run is debuggable.
if (rows.length === 0) {
  metadata.emptyShapes ??= [];
  metadata.emptyShapes.push(Object.keys(data ?? {}));   // names only, no values
  console.warn("[importer] zero rows — response keys:", Object.keys(data ?? {}));
}
```

## Guardrails

- Mocked green ≠ verified for anything crossing an HTTP boundary. State plainly which
  imports are proven against a real capture and which are not.
- When you diagnose a shape bug, always fix it against the **working** endpoint's parse
  pattern (the one that returns rows), not by guessing the broken one.
- Never dequeue/mutate upstream state to "test" (e.g. Ascora `Mark*AsSent`) — read-only.

## Related

- [[ci-parity-verification]] — the sibling class (green-locally-red-in-CI) for DB-gated
  suites. This skill is its external-API counterpart.
- [[data-source-ssot]] — the other silent-divergence class (right shape, wrong store).
