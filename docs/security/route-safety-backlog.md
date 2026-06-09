# Route-safety — heuristic candidates for team triage

> **These are HEURISTIC CANDIDATES, NOT confirmed bugs.**
> They are produced by the deterministic scanner at
> `scripts/security/route-safety-scan.mjs` and recorded in
> `scripts/security/route-safety-baseline.json` so CI stays green on day one.
> The guard's job is to stop **NEW** drift in these two classes from landing
> silently — it does not assert that the entries below are exploitable. Each
> needs a human to confirm whether it is a real gap or a legitimate
> non-session-auth pattern, then either gate it or leave it baselined.

## Why this exists

Implements the deep-audit's #1 recommendation: make
"unauthenticated paid-AI proxy" and "mutation route missing auth gate"
impossible to reintroduce silently. See `scripts/security/route-safety-scan.mjs`
header for the full heuristic definitions and the legit-exception patterns
(auth entry routes, `[token]` paths, signed webhooks, `ALLOW_TEST_HELPERS`
test helpers) that are deliberately not flagged.

## How to read this

- **paid-ai-no-auth** — route proxies a paid/metered AI provider
  (HeyGen / ElevenLabs / Synthex client) and has no
  `getServerSession` / `getToken` / `verifyAdminFromDb` gate. This is the
  CRITICAL class: ungated, anyone can spend the company's AI budget.
- **mutation-no-auth** — route exports POST/PUT/PATCH/DELETE and performs a
  Prisma write with no session auth gate. May still be safe if it uses a
  different, equally-valid auth mechanism (a cron bearer secret, a one-time
  invitation token in the body, etc.) — that's exactly what triage decides.

To regenerate the candidate lists after triage:

```bash
node scripts/security/route-safety-scan.mjs --baseline   # rewrite baseline
node scripts/security/route-safety-scan.mjs --json        # inspect machine-readable output
```

---

## Candidate list — paid-ai-no-auth (CRITICAL class — triage first)

| Route | Triage question |
| --- | --- |
| `app/api/heygen/route.ts` | HeyGen avatar-video proxy (`generateAvatarVideo` via `@/lib/synthex/client`). Should require a session before spending avatar credits. |
| `app/api/elevenlabs/voice/route.ts` | ElevenLabs voice proxy. Should require a session before spending voice credits. |
| `app/api/elevenlabs/sfx/route.ts` | ElevenLabs SFX proxy (`generateSFX`). Should require a session before spending credits. |

## Candidate list — mutation-no-auth

| Route | Triage question |
| --- | --- |
| `app/api/cron/sync-invoices/route.ts` | Cron route. Documented to require `CRON_SECRET`; if the bearer-secret check is its real gate, this is a legitimate non-session pattern — confirm and keep baselined. |
| `app/api/cron/sync-xero-payments/route.ts` | Cron route. Documented to be secured by `CRON_SECRET` bearer token via `verifyCronAuth` (timing-safe). Likely a legitimate non-session pattern — confirm. |
| `app/api/portal/invitations/accept/route.ts` | Portal invitation acceptance. Authenticates via a one-time invitation token in the request body (`isPortalInvitationToken`), not a session. Confirm the token check is sufficient. |

---

_Last generated from the tree at branch creation. Re-run the scanner to refresh._
