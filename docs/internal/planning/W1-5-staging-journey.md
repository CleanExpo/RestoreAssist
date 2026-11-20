# W1-5 — Staging five-stage journey (RA-7228)

Run on a **non-production** database only.

## Quick smoke

```bash
bash scripts/w1-5-staging-journey.sh
```

## Seed

```bash
pnpm prisma db seed   # if org seed configured
npx tsx prisma/seed-demo.ts
npx tsx prisma/seed-demo-inspection.ts
npx tsx e2e/seed-full-access-account.ts
```

## Retest checklist (from RA-8184)

1. Purchase / trial signup (no production writes)
2. Admin setup + integrations health (expect unverified when zero connectors)
3. Manager completeness inbox + send gate (technician cannot email report)
4. Field capture + submit (`processingComplete` in JSON)
5. Client report send (manager) with field-evidence gate

## Playwright (optional)

```bash
pnpm exec playwright test e2e/walkthrough --project=chromium
```