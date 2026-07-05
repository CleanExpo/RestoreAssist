# Codex Handoff — RestoreAssist onboarding video track

> **Audience:** Codex / OpenAI 20x Max Plan (account `phill.mcgurk@gmail.com`).
> **Purpose:** Run the RestoreAssist onboarding video track in parallel with Claude's SP-3 engineering track. When Anthropic 529s, this is the work that doesn't stall.
> **Authored:** 2026-05-15 by Claude during SP-3 implementation.

---

## 1. What's already shipped

Existing MP4s at `/Users/phill-mac/Pi-CEO/Pi-Dev-Ops/remotion-studio/output/`:

**RA-specific (8):**
- `ra-setup-wizard-signup-60s-2026-05-12.mp4` — signup flow walkthrough
- `ra-setup-wizard-signin-30s-2026-05-12.mp4` — sign-in flow
- `ra-setup-wizard-setup-120s-2026-05-12.mp4` — `/setup` wizard end-to-end (ABN → AI hydration → activate)
- `ra-setup-wizard-dashboard-120s-2026-05-12.mp4` — newly-activated dashboard tour
- `ra-setup-wizard-integrations-90s-2026-05-12.mp4` — Xero / MYOB / QB / ServiceM8 / Ascora walkthrough
- `ra-setup-wizard-health-60s-2026-05-12.mp4` — Workspace Health tour
- `ra-wave-1-launch-poc-v2.mp4` — Wave 1 launch promo (LinkedIn, 82s, 1:1)
- `ra-app-store-preview-30s.mp4` — App Store / Play Store preview (30s)

**Single-feature explainers (5):**
- `ra-byok.mp4` · `ra-day-in-life.mp4` · `ra-dispute-defence.mp4` · `ra-field-to-pdf.mp4` · `ra-nir-smoke.mp4`

**Total:** 13 RA videos already in `output/`.

---

## 2. Tooling substrate

```
~/Pi-CEO/Pi-Dev-Ops/remotion-studio/
├── src/
│   ├── compositions/             # one .tsx per video shape (Explainer, Intro, SocialAd, etc.)
│   ├── brands/                   # local-only — canonical brand configs live in Synthex
│   └── Root.tsx                  # registers all Compositions
├── render/
│   ├── render.ts                 # npx tsx render/render.ts <compositionId> --out=output/<filename>.mp4
│   └── voiceover.ts              # ElevenLabs synthesis
├── briefs/                       # JSON briefs + storyboard JSONs per video
└── output/                       # rendered MP4s
```

**Brand config:** `Synthex/packages/brand-config/src/brands/ra.ts` — voice (Phill clone via ElevenLabs voice ID `EXAVITQu4vr4xnSDxMaL` default; alias `phill-elevenlabs-pro` via env `ELEVENLABS_VOICE_ID`), navy `#1C2E47`, warm `#8A6B4E`, light `#D4A574`, dark bg `#050505`.

**Render command:**
```bash
cd ~/Pi-CEO/Pi-Dev-Ops/remotion-studio
npx tsx render/render.ts <CompositionId> --out=output/<filename>.mp4
```

**Voiceover:** must always be included in production renders. Never pass `--skipTts` for a shipping video.

---

## 3. What's missing (proposed scope for the Codex track)

**Tier 1 — production-critical (start here):**

| # | Slug | Duration | Audience | Hook |
|---|---|---|---|---|
| V1 | `ra-onboarding-first-inspection` | 90-120s | Tradie post-setup | "Your first inspection — from photo to PDF in 8 minutes" |
| V2 | `ra-onboarding-claim-types-iicrc` | 120s | Tradie + admin | "Pick the right standard: S500 water, S520 mould, S540 trauma, S700 fire" |
| V3 | `ra-onboarding-handover-to-client` | 60s | Tradie | "Hand the job back: the close-and-handover flow" |
| V4 | `ra-onboarding-evidence-capture` | 90s | Tradie | "Chain-of-custody photos: every shot timestamped + hashed" |
| V5 | `ra-onboarding-tech-invite` | 60s | Admin | "Invite your crew: licence verification + role-based access" |
| V6 | `ra-onboarding-byok-upgrade` | 60s | Admin post-trial | "Bring your own AI key, save 60-80% on premium tasks" |

**Tier 2 — value-add (queue after Tier 1):**

| # | Slug | Duration | Audience |
|---|---|---|---|
| V7 | `ra-onboarding-billing-stripe` | 60s | Admin |
| V8 | `ra-onboarding-portal-client-view` | 60s | Client-facing |
| V9 | `ra-onboarding-mobile-app-android` | 45s | Tradie |
| V10 | `ra-onboarding-mobile-app-ios` | 45s | Tradie |
| V11 | `ra-onboarding-reports-pdf-anatomy` | 90s | Admin / insurer-facing |
| V12 | `ra-onboarding-completed-tab-reopen` | 60s | Admin |

**Tier 3 — compliance / training (later):**

| # | Slug | Duration |
|---|---|---|
| V13 | `ra-compliance-s500-water-walkthrough` | 5-7 min |
| V14 | `ra-compliance-s520-mould-walkthrough` | 5-7 min |
| V15 | `ra-compliance-s540-trauma-walkthrough` | 5-7 min |
| V16 | `ra-compliance-s700-fire-walkthrough` | 5-7 min |
| V17 | `ra-compliance-whs-incident-reporting` | 4 min |

---

## 4. Briefs structure (mirror existing)

For each new video, produce **three** files in `~/Pi-CEO/Pi-Dev-Ops/remotion-studio/briefs/`:

1. `<slug>.json` — director brief (composition type, channel, duration, aspect, hook one-liner)
2. `<slug>.storyboard.json` — scene-by-scene voiceover + on-screen text + b-roll callouts
3. `<slug>.script-spec.md` — Pixar-5-beat / Apple-4-act architecture justification

Reference: `briefs/ra-2026-05-15-wave-1-launch.*` for the exact shape.

---

## 5. Process (per video)

1. Pick the next slug from Tier 1.
2. Generate the 3 brief files (matching the existing shape).
3. Register the composition in `src/Root.tsx` if it's a new composition type — otherwise reuse `Explainer`.
4. Build the storyboard-driven composition file at `src/compositions/<PascalCaseName>.tsx`.
5. Synthesise voiceover via `render/voiceover.ts` (uses `ELEVENLABS_API_KEY` from `.env`).
6. Render: `npx tsx render/render.ts <CompositionId> --out=output/<slug>.mp4`.
7. Validate duration / codec / 1080×1080 (or 1920×1080 for landscape) / file size <50 MB.
8. Optionally upload to `restoreassist.app/videos/<slug>` (Cloudinary or YouTube unlisted).
9. Embed in the corresponding in-app `<VideoExplainer slug="...">` component if it exists.

---

## 6. Brand voice (locked)

- **Tone:** professional, AI-led, "we do the work so you don't have to"
- **Customer:** Australian water-damage tradies (sole traders + small companies)
- **Forbidden phrases:** "leverage", "utilise", "best-in-class", "world-class", "game-changer", "revolutionary", "seamless", "powerful", "unlock", "journey", "excited", "thrilled", "delighted", "synergy", "in today's competitive landscape", "we are excited to announce", "tapestry"
- **IICRC citations:** always include edition + section, e.g. `S500:2021 §7.1`
- **Australian compliance:** GST 10%, ABN 11 digits, state codes via `lib/nir-jurisdictional-matrix.ts`

---

## 7. Env vars needed in Codex session

```bash
# Pull from ~/.hermes/.env or Vercel envs:
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=phill-elevenlabs-pro      # resolves to Phill's voice clone
ELEVENLABS_FALLBACK_VOICE_ID=EXAVITQu4vr4xnSDxMaL  # Sarah default

# Optional (for upload):
CLOUDINARY_URL=...
YOUTUBE_UPLOAD_TOKEN=...
```

**Never log these values to chat.** Reference by env var name only.

---

## 8. Parallel-provider coordination rules

- **Codex owns:** `~/Pi-CEO/Pi-Dev-Ops/remotion-studio/**` + voiceover scripts + video-related Linear tickets.
- **Claude owns:** RestoreAssist repo (Next.js, Prisma, Stripe, SP-3 onwards).
- **Shared files (READ-ONLY for the other side):**
  - `Synthex/packages/brand-config/src/brands/ra.ts` — Codex reads to align brand voice
  - `docs/superpowers/specs/2026-05-12-onboarding-redesign-design.md` — Codex reads for setup-wizard video accuracy
- **If a file must change in the shared zone:** the side that owns the source-of-truth makes the edit; the other side pulls + reacts.
- **No cross-tool agent dispatch:** Codex doesn't fire Claude subagents and vice versa.

---

## 9. First action item for Codex

**Generate the brief trio for V1 — `ra-onboarding-first-inspection`.** The 3 files at `~/Pi-CEO/Pi-Dev-Ops/remotion-studio/briefs/ra-onboarding-first-inspection.{json,storyboard.json,script-spec.md}`.

Storyboard scope:
- Hook (0-3s): "Photo to PDF in 8 minutes"
- Beat 1: Tradie arrives on site, opens app, hits "+ New inspection"
- Beat 2: Pick claim type (S500 water) — picker UI from PR #1034
- Beat 3: Capture photos with chain-of-custody fab (Sub-project #7)
- Beat 4: Add readings + scope items
- Beat 5: AI generates draft report
- Beat 6: Review → Close → invoice → Handover
- CTA: "Your first inspection is your shortest one — try the free trial"

After V1 ships, surface to Phill for sign-off before queuing V2.

---

## 10. Status tracking

Each shipped video should produce:
1. A Linear ticket in the RestoreAssist team labelled `onboarding-video` linked to the slug
2. An entry in `~/2nd Brain/2nd Brain/Wiki/restoreassist.md` under a `## Onboarding videos` section (URL + slug + status)
3. The MP4 in `~/Pi-CEO/Pi-Dev-Ops/remotion-studio/output/`

When done with a video, ping Phill in the Codex session with a one-line summary so Claude (this session) doesn't try to duplicate.

---

## 11. If you (Codex) hit a hard block

Examples:
- ElevenLabs API quota exhausted
- Cloudinary upload fails
- Brand asset disagreement between Synthex/packages/brand-config and existing video

Surface to Phill. Don't pivot the brand voice or invent assets unilaterally — those decisions belong to him.
