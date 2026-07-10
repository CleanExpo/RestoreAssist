# RestoreAssist — AI Front Desk (scaffold)

> **Status:** scaffold only. Ships **dark** — nothing here is wired into the build yet.
> This folder is **additive**; it edits no existing files.

RestoreAssist's instance of the portfolio **AI Front Desk** — a single agent "brain"
reused across **web chat, in-app voice, and phone (inbound + outbound)** to
qualify, book, and route enquiries. Built once as a shared `@nexus/front-desk`
capability; each brand deploys it via the per-project config in this folder.

- **This desk's job:** Customer support, onboarding, and report/quote guidance for restoration professionals using RestoreAssist.
- **Lead channel:** web chat (then in-app voice)
- **Stack it plugs into:** Next.js 16 · Prisma · Resend · Supabase · Stripe · AI SDK

## Files
| File | What it is |
|---|---|
| `SPEC.md` | The per-project front-desk spec — role, channels, tools, voice, number, compliance, phases. |
| `frontdesk.config.example.ts` | Typed config skeleton — the shape each brand fills for the shared package. |
| `frontdesk.env.example` | Env keys (feature flag + vendor + number), all **off/empty** by default. |

## How it goes live (later)
1. The shared `@nexus/front-desk` package is built on CARSI (reference implementation).
2. This project copies `frontdesk.config.example.ts` → `frontdesk.config.ts` and fills the real values.
3. Set `RESTOREASSIST_FRONT_DESK_ENABLED=true` in the environment to enable; unset/false = fully dark.

Portfolio dossier (architecture, vendor shortlist, AU compliance, roadmap): https://claude.ai/code/artifact/e8e5f57c-6120-4062-87f2-b85c559fa3dd
