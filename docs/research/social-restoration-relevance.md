# Social restoration relevance (Margot)

**Date:** 2026-08-04  
**Request (Phil):** Reign in social comments on “restoration” — we were replying to car restoration, teeth restoration, etc. Train the agent on what restoration means for RestoreAssist.

## What restoration means for us

Property / building / disaster restoration after water, flood, storm, fire/smoke, mould, sewage, or biohazard. Insurance claims, IICRC drying/remediation, contents, make-safe. Audience: restoration contractors, assessors, insurers, property managers (AU/NZ).

## False positives (ignore)

| Wrong industry | Examples |
|---|---|
| Automotive | car / classic car / auto body restoration |
| Dental | teeth / smile / veneer restoration |
| Art / antiques | painting, furniture refinishing |
| Hair | hair restoration / transplant |
| Ecology | habitat / wetland / reef restoration |
| Media / objects | film, watch, jewelry restoration |
| IT | data restore, Windows restore |

## Decision table

| Decision | When |
|---|---|
| **ENGAGE** | ≥1 strong property-damage signal (water damage, mould, IICRC, flood claim, etc.) and no wrong-industry signal |
| **IGNORE** | Wrong-industry signal, or bare “restoration” with no property context |
| **UNSURE** | Mixed signals or empty input → **do not comment** (fail closed) |

Bare “restoration” alone is never enough.

## Human reply style

- Sound like a real person (1–3 short sentences)
- No apostrophes, em dashes, or en dashes
- No AI/marketing buzzwords
- Never identify as AI/bot

## Code

- `lib/margot/social-restoration-relevance.ts` — relevance gate
- `lib/margot/social-reply-style.ts` — style sanitize / check
- `lib/margot/social-comment-prompt.ts` — Margot prompt fragment
- `POST /api/margot/social-relevance` — pre-reply check for Hermes / tools
- Tests under `lib/margot/__tests__/`

## Hermes note

Copy `MARGOT_SOCIAL_COMMENT_RULES` into `~/.hermes/SOUL.md` on the Mac mini so Telegram/social automation uses the same gate.
