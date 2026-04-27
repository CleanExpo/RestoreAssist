# Dependency Audit — 2026-04-21 (RA-1110)

**Current state:** 110 runtime + 22 dev = **132 total**. Ticket target: 150 → ≤ 110. We're already 12 under the starting count; the rest needs product calls.

Audit method: categorise by purpose, grep for actual usage, classify each as **Keep** / **Prune** / **Decide**.

This doc is a baseline so the user can approve each prune. This PR does **NOT** modify `package.json` — autonomous blind-prune is too risky. Follow-up PRs land one prune category at a time with grep verification in the body.

---

## AI providers (3 installed)

**Installed:** `@anthropic-ai/sdk` ^0.90.0, `@google/generative-ai` ^0.21.0, `openai` ^4.104.0

**Verdict:** **Decide.** Confirm runtime reach via grep. If only Anthropic is on the hot path, the other two can stay installed but lazy-load. Pi-CEO's `model_policy.py` + `@/lib/ai-provider.ts` suggest a routing layer exists — make sure all three are truly reachable before pruning.

Prune check:
```
rg -l "from ['\"]@anthropic-ai/sdk['\"]" lib/ app/
rg -l "from ['\"]@google/generative-ai['\"]" lib/ app/
rg -l "from ['\"]openai['\"]" lib/ app/
```

---

## PDF libraries (4)

**Installed:** `jspdf` ^4.2.1, `pdf-lib` ^1.17.1, `pdf-parse` ^2.4.5, `pdfjs-dist` ^5.4.394

**Verdict:** **Keep all** — different purposes: jspdf (client generation), pdf-lib (server merge/redact), pdf-parse (server read/OCR), pdfjs-dist (browser preview). Confirm via grep before deciding anything.

---

## Image / canvas (4)

**Installed:** `canvas-confetti`, `fabric`, `html2canvas`, `sharp`

**Verdict:** **Decide.**
- `sharp` — server-side Cloudinary fallback, keep
- `fabric` — sketch tool (RA-1125), keep
- `html2canvas` — is it used? If only for PDF export, may duplicate `pdf-lib`
- `canvas-confetti` — one surface (signup celebration). Lazy-import to shave ~40 KB from first-load

---

## Puppeteer + Playwright

**Installed:** `puppeteer`, `@types/puppeteer`, `@playwright/test` (dev)

**Verdict:** **Prune `@types/puppeteer`** — puppeteer ships its own types since v14+. Keep puppeteer (runtime) + @playwright/test (e2e).

Prune check: `cat node_modules/puppeteer/package.json | jq .types` — if non-null, safe to drop `@types/puppeteer`.

---

## dotenv

**Installed:** `dotenv` ^17.2.3

**Verdict:** **Prune** unless Node scripts outside the Next runtime import it directly.

Prune check: `rg "from ['\"]dotenv['\"]" --type ts` — if empty, remove.

---

## Redundant `@types/*` (7)

**Installed:** `@types/bcryptjs`, `@types/canvas-confetti`, `@types/jsonwebtoken`, `@types/nodemailer`, `@types/jspdf`, `@types/qrcode`, `@types/archiver`

**Verdict:** **Decide per-package.** Modern versions of bcryptjs, jsonwebtoken, nodemailer, jspdf, qrcode ship types inline.

Prune check each: `cat node_modules/<pkg>/package.json | jq -r '.types // .typings'`. Remove `@types/<pkg>` when the underlying package self-types.

---

## Radix UI (27 scoped)

**Verdict:** **Keep all.** Each is a distinct shadcn primitive. They share a React runtime via peer deps; removing unused ones gives tree-shaking gains, not install-size gains. Bundler does that for free.

---

## Capacitor (8)

**Verdict:** **Keep all.** Mobile app core + plugins. Only prune if abandoning the native track.

---

## Date libs

**Installed:** `date-fns`, `react-day-picker`

**Verdict:** **Keep.** react-day-picker peer-depends on date-fns. Switching to dayjs/luxon is a multi-day refactor — wrong tradeoff for a 2-dep shave.

---

## Recommended prune order (safest first)

1. **`dotenv`** — remove if grep is clean. ~150 KB, zero runtime risk.
2. **`@types/puppeteer`** — puppeteer self-types. ~10 KB, zero risk.
3. **Redundant `@types/*`** one-by-one — each verified via `cat node_modules/<pkg>/package.json | jq .types`.
4. **Lazy-load `canvas-confetti`** — shave from first-load without removing.
5. **AI providers** — only after auditing actual runtime reach. Likely lazy-load rather than remove.

**Expected result after safe prune (steps 1–3):** 132 → ~124. Further reduction needs product decisions (which AI provider to standardise on, whether to keep Remotion, etc.) — out of scope for a mechanical audit.

## What this PR does

- Creates this audit doc — baseline for user to approve each prune
- Does **NOT** modify `package.json`
- Follow-up PRs land one prune category at a time with grep-verification notes

## What this PR does NOT do

- Remove any dependency
- Run `npm/pnpm uninstall`
- Change `build.sh` / CI
- Make architectural decisions about AI routing, Remotion, mobile track
