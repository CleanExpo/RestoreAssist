---
name: orchestrating-restoreassist-video-series
description: Use when producing, scripting, or shipping the RestoreAssist onboarding + walkthrough video SERIES as a batch (not one clip) — the setup-wizard / getting-started tutorial / onboarding-welcome videos need scripts written, narrated, rendered, captioned, and wired into the live app for distribution; when picking up where a prior session left off across many slugs; or when a polished walkthrough must land on YouTube and resolve in <VideoExplainer>.
---

# Orchestrating the RestoreAssist Video Series

## Overview

This is the **conductor** over the whole onboarding + walkthrough video series. Each individual video is produced with the per-video pipeline; this skill sequences the *set* — tracking every slug's state, driving the next ones to "done", and landing them in the live app on **YouTube unlisted** embeds for distribution.

**Core principle:** the series advances one **status-derived wave** at a time. You never start from zero — you read the repo to see what each video already has, then do only the missing steps. A video is "done" only when its slug plays in the running app, not when a file exists.

**REQUIRED SUB-SKILL:** Use `producing-restoreassist-videos` for the mechanics of any *single* video (the five artifacts, ElevenLabs voice, render-all wiring, caption gotchas). This skill does NOT repeat that — it orchestrates many runs of it.

## The series (this is "all these videos")

Defined by registry slug → Remotion composition id → file stem. Stems are the MP3/MP4/VTT/`public_id` filename; slugs key the registry and analytics. **Captions are the trap:** `getCaptionUrl(slug)` looks up `CAPTION_REGISTRY[slug]` by the *slug*, but the file on disk is *stem*-named — and the registry is currently keyed inconsistently (onboarding by slug, wizards by stem). See the caption-key note below.

| Wave | Slug | Composition id | File stem | Live surface |
|------|------|----------------|-----------|--------------|
| 1 Onboarding | `remotion-onboarding-welcome` | `OnboardingWelcome` | `onboarding-welcome` | top of `/setup` |
| 2 Setup wizard | `setup-wizard-signin` | `WizardSignin` | `wizard-signin` | setup wizard step |
| 2 | `setup-wizard-signup` | `WizardSignup` | `wizard-signup` | setup wizard step |
| 2 | `setup-wizard-setup` | `WizardSetup` | `wizard-setup` | setup wizard step |
| 2 | `setup-wizard-dashboard` | `WizardDashboard` | `wizard-dashboard` | setup wizard step |
| 2 | `setup-wizard-integrations` | `WizardIntegrations` | `wizard-integrations` | setup wizard step |
| 2 | `setup-wizard-health` | `WizardHealth` | `wizard-health` | setup wizard step |
| 3 Tutorials | `remotion-tutorial-login` | `TutorialLogin` | `tutorial-login` | `/dashboard/learn` |
| 3 | `remotion-tutorial-signup` | `TutorialSignup` | `tutorial-signup` | `/dashboard/learn` |
| 3 | `remotion-tutorial-setup-wizard` | `TutorialSetupWizard` | `tutorial-setup-wizard` | `/dashboard/learn` |
| 3 | `remotion-tutorial-dashboard` | `TutorialDashboard` | `tutorial-dashboard` | `/dashboard/learn` |
| 3 | `remotion-tutorial-inspections` | `TutorialInspections` | `tutorial-inspections` | `/dashboard/learn` |
| 3 | `remotion-tutorial-reports` | `TutorialReports` | `tutorial-reports` | `/dashboard/learn` |
| 3 | `remotion-tutorial-billing` | `TutorialBilling` | `tutorial-billing` | `/dashboard/learn` |
| 3 | `remotion-tutorial-team` | `TutorialTeam` | `tutorial-team` | `/dashboard/learn` |
| 3 | `remotion-tutorial-compliance` | `TutorialCompliance` | `tutorial-compliance` | `/dashboard/learn` |
| 3 | `remotion-tutorial-integrations` | `TutorialIntegrations` | `tutorial-integrations` | `/dashboard/learn` |
| 4 Help (note) | `help-inspections` … `help-compliance` (6) | — none — | `help-*` | `/dashboard/help/*` |

**Wave 4 has no Remotion compositions** — the `help-*` entries are CDN screen-capture clips, not part of the Remotion pipeline. Do NOT invent compositions for them; flag them as a separate track and stop at Wave 3 unless asked. Waves 1–3 = **17 Remotion videos**, the true scope.

## Per-video status — derive it, don't guess

For each stem, the video has six gates. Read the repo to mark each ✅/❌ before doing any work:

| Gate | Evidence in repo |
|------|------------------|
| 1 Scripted (SSOT) | `content/videos/<stem>.script.json` exists, timed to the composition |
| 2 Composition has `<Audio>` | `remotion/compositions/<file>.tsx` references `staticFile('narration/<stem>.mp3')`. Most series compositions import only `AbsoluteFill, Sequence` — they have NO `Audio`/`staticFile` yet. Copy the exact pattern from `remotion/compositions/onboarding-welcome.tsx` (`import {Audio, staticFile} …` + `<Audio src={staticFile('narration/<stem>.mp3')} />`). |
| 3 In render list | `<id>` present in `compositionsToRender` in `remotion/render-all.ts` (all 17 already are) |
| 4 Narrated | `public/narration/<stem>.mp3` exists (≥10 KB). `public/narration/` does not exist yet — it's created by the narration handoff step. |
| 5 Captioned | VTT file at `public/videos/captions/<stem>.vtt` **AND** `getCaptionUrl(slug)` resolves it — i.e. `caption-registry.ts` has an entry **keyed by the registry slug**. A present VTT is NOT enough. (See caption-key note.) |
| 6 Distributed | registry entry resolves to a working **YouTube** embed in the live app |

### Caption-key note (verified gotcha)

`getCaptionUrl(slug)` returns `CAPTION_REGISTRY[slug] || null` — keyed by the **registry slug**, not the stem.

- `remotion-onboarding-welcome` is keyed correctly (slug → `onboarding-welcome.vtt`). ✅
- The six `setup-wizard-*` slugs are **missing** from `CAPTION_REGISTRY` — only their *stem* keys exist (`"wizard-signin"`, not `"setup-wizard-signin"`). So `getCaptionUrl("setup-wizard-signin")` returns `null` and the VTT, though committed, never loads. ❌

So gate 5 for a wizard video requires **adding a slug-keyed entry**, e.g. `"setup-wizard-signin": "/videos/captions/wizard-signin.vtt"`. Mark gate 5 ✅ only after the slug (not the stem) resolves.

Fast status sweep:
```bash
for s in onboarding-welcome wizard-signin tutorial-login …; do
  printf "%-22s script:%s mp3:%s vtt:%s\n" "$s" \
    "$([ -f content/videos/$s.script.json ] && echo y || echo n)" \
    "$([ -f public/narration/$s.mp3 ] && echo y || echo n)" \
    "$([ -f public/videos/captions/$s.vtt ] && echo y || echo n)"
done
```

## What you do vs what you hand off

**Plan-and-handoff** — credential/GPU steps cannot run in the sandbox. Do everything sandbox-safe, then emit ONE run-list for a human/dev host.

| You do (sandbox-safe) | Hand off (real env) |
|-----------------------|---------------------|
| Write each `*.script.json` (scripting) | ElevenLabs narration MP3 (`ELEVENLABS_API_KEY`) |
| Add `<Audio>`, register in `render-all.ts` | `pnpm run render:tutorials` (headless Chromium) |
| Generate VTT captions (pure) + registry | **YouTube unlisted upload** (manual — OAuth) |
| Patch `video-registry.ts` once `youtubeId` returns | — |

Maintain a living tracker at `docs/superpowers/plans/<date>-video-series-status.md` (the existing `…-onboarding-welcome-video-production.md` is the worked template). Update it every wave so the next session resumes instantly.

## Distribution = YouTube (the precedence trap)

`VideoExplainer` resolves sources in strict order (VideoExplainer.tsx): **`cloudinaryUrl` → `localPath` → `youtubeId`**. Almost every series entry ships with `cloudinaryUrl` AND `localPath` already set, so adding `youtubeId` **does nothing** — the iframe branch is never reached.

To flip a slug to YouTube, the registry entry must become **`youtubeId`-only**:
```ts
"remotion-tutorial-login": {
  youtubeId: "ABC123xyz",            // unlisted id returned by the human upload
  title: "Signing in to RestoreAssist",
  durationSec: 45,
  category: "getting-started",
  // cloudinaryUrl + localPath REMOVED — else they win and YouTube never shows
},
```
`scripts/video-upload.ts --host youtube` is an OAuth **placeholder** — it does not upload. The real upload is a human step; you only wire the returned id. To patch the registry deterministically once the id is back:
```bash
npx tsx scripts/video-upload.ts --slug <slug> --youtube-id <id> --title "<title>"
```
Then confirm the entry is `youtubeId`-only (no `cloudinaryUrl`/`localPath` left). And add the slug-keyed caption entry (caption-key note) in the same change.

## Orchestration loop

1. Build/refresh the status table for the wave (sweep above).
2. For each video missing gates 1–3 & 5: do the sandbox-safe work via `producing-restoreassist-videos`.
3. Emit the consolidated handoff run-list (narration → render → "upload these N MP4s to YouTube unlisted, return ids").
4. When ids return: patch the registry to `youtubeId`-only, run `pnpm tsc --noEmit components/setup/video-registry.ts` style check, commit.
5. **Verify in the live app** before claiming the wave done (gate below).
6. Update the tracker; advance to the next wave.

## Verification gate (do not skip — required by repo rules)

A green render and a registry entry are NOT proof. For each shipped slug:
1. Open its live surface (e.g. `/setup`, `/dashboard/learn`) as the relevant user state.
2. The embed plays, narration is audible (one voice), CC track works, duration badge matches.
3. Network panel: no 404 for the YouTube thumbnail/embed; no `VideoExplainer` console error.
4. Provide the per-slug checklist: where to check, how to get there, what to see, what NOT to see (dead player / silent audio / missing CC), confirmation prompt.

## Common mistakes

- **`youtubeId` added but `cloudinaryUrl`/`localPath` left in place** → YouTube never renders (precedence). Remove the other two.
- **Captions keyed by stem, not slug** → `getCaptionUrl(slug)` returns `null`, CC silently absent. The six `setup-wizard-*` slugs are missing from `CAPTION_REGISTRY` today; add slug-keyed entries. A committed VTT alone does NOT mean captioned.
- **Treating `help-*` as Remotion** → no composition exists; that's a different track.
- **Scripting drift** → timings in `*.script.json` must match the composition's scene timing, or captions/audio desync. One transcript is SSOT.
- **Claiming the series done after rendering** → render ≠ distributed ≠ verified. Only the live-app check closes a video.
- **Re-deriving the per-video pipeline here** → use `producing-restoreassist-videos`; keep this skill about sequencing.
- **Losing state between sessions** → if you didn't update the tracker doc, the next session redoes work. Update it every wave.
