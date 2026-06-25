# Onboarding + Walkthrough Video Series — Production Status

> Living tracker for the `orchestrating-restoreassist-video-series` skill.
> Distribution target: **YouTube unlisted** embeds. Execution model: **plan-and-handoff**
> (credential/GPU steps run on a dev host, not the sandbox). Update every wave.

Last updated: 2026-06-26 · Branch: `chore/ci-test-parity-guard`

## Gate legend

1 Script SSOT · 2 `<Audio>` in composition · 3 In `render-all.ts` · 4 Narration MP3 ·
5 VTT + **slug-keyed** caption · 6 Distributed (YouTube embed live)

## Status

| Wave | Stem | g1 | g2 | g3 | g4 | g5 | g6 | Notes |
|------|------|----|----|----|----|----|----|-------|
| 1 | onboarding-welcome | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | only narration + YouTube remain (handoff) |
| 2 | wizard-signin | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | sandbox work done this session |
| 2 | wizard-signup | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | " |
| 2 | wizard-setup | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | " |
| 2 | wizard-dashboard | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | " |
| 2 | wizard-integrations | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | " |
| 2 | wizard-health | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | " |
| 3 | tutorial-login | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | sandbox work done this session |
| 3 | tutorial-signup | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | " |
| 3 | tutorial-setup-wizard | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | " |
| 3 | tutorial-dashboard | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | " |
| 3 | tutorial-inspections | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | " |
| 3 | tutorial-reports | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | " |
| 3 | tutorial-billing | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | " |
| 3 | tutorial-team | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | " |
| 3 | tutorial-compliance | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | " |
| 3 | tutorial-integrations | ✅ | ✅ | ✅ | ⏳ | ✅ | ⏳ | " |

⏳ = blocked on a handoff (credential/GPU) step. **All 17 videos' sandbox-safe work is complete** — only narration MP3 + render + YouTube upload remain (one handoff).

## Open inconsistencies to reconcile (found while scripting)

- **Domain drift in the source compositions:** wizard scenes show `restoreassist.app`; tutorial scenes show `restoreassist.au`. SSOT narration matches each composition's on-screen text to stay in sync, so the audio inherits the drift. Decide the canonical domain and fix both the compositions and the affected scripts (`wizard-signin`, `tutorial-login`).
- **Registry `durationSec` vs real composition length:** `setup-wizard-signup`/registry tutorial badges mostly match, but `remotion-tutorial-login` badge says 45 s (real ≈40 s) and `remotion-tutorial-signup` says 90 s (real ≈60 s). Cosmetic (badge only); align when convenient.
- **Tutorial caption keys** were also being fixed by a separately-spawned task — this session added the `remotion-tutorial-*` slug keys inline; reconcile at merge.

## Done this session (Wave 2 sandbox-safe)

- 6 SSOT transcripts: `content/videos/wizard-*.script.json`, segments timed to each composition's step scenes (30 fps).
- `<Audio src={staticFile('narration/<stem>.mp3')} />` added to all 6 wizard compositions.
- 6 slug-keyed caption entries added to `components/setup/caption-registry.ts` (fixes the slug≠stem lookup bug for the wizard slugs).
- VTTs regenerated from SSOT via `scripts/generate-series-captions.ts` (pure; already run).
- `scripts/generate-series-narration.ts` created (handoff-ready).

## Handoff run-list (dev host with `.env.local` creds + Chromium)

```bash
# 1. Narration MP3s → public/narration/<stem>.mp3   (ElevenLabs, one voice)
ELEVENLABS_API_KEY=*** ELEVENLABS_VOICE_ID=jSuBIjxMKhqIfb0wCK1F \
  pnpm exec tsx scripts/generate-onboarding-narration.ts        # Wave 1
ELEVENLABS_API_KEY=*** ELEVENLABS_VOICE_ID=jSuBIjxMKhqIfb0wCK1F \
  pnpm exec tsx scripts/generate-series-narration.ts            # Wave 2+3 (16: wizard-* + tutorial-*)

# 2. Render MP4s with baked-in audio (headless Chromium)
pnpm run render:tutorials
for s in onboarding-welcome wizard-signin wizard-signup wizard-setup \
         wizard-dashboard wizard-integrations wizard-health; do
  ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 \
    remotion/output/$s.mp4   # expect: audio   (silent render = wrong staticFile path)
done

# 3. Upload each remotion/output/<stem>.mp4 to YouTube as UNLISTED. Capture the 11-char ids.

# 4. Wire each returned id into the registry (youtubeId-only — drops cloudinaryUrl/localPath):
npx tsx scripts/video-upload.ts --slug remotion-onboarding-welcome --youtube-id <id> --title "Welcome to RestoreAssist"
npx tsx scripts/video-upload.ts --slug setup-wizard-signin        --youtube-id <id> --title "Signing in to RestoreAssist"
# …repeat for signup / setup / dashboard / integrations / health
# Confirm each entry has NO cloudinaryUrl/localPath left, else YouTube never renders (precedence).
```

## Verification gate (after handoff — required)

Per slug, in the running app:
- `/setup` (onboarding + wizard steps): embed plays, narration audible (one voice), CC track loads, duration badge matches.
- Network: no 404 for the YouTube thumbnail/embed; no `VideoExplainer` console error.

## Next wave

Wave 3 — 10 `tutorial-*` videos. Same recipe: write SSOTs (copy exists in
`scripts/generate-narration-tutorials.cjs`), add `<Audio>`, add slug-keyed caption
entries (`remotion-tutorial-*` → `tutorial-*.vtt`), extend the `STEMS` array in both
series generators, regenerate captions. The tutorial caption-key fix may also be
landing via a separately-spawned task — reconcile before editing `caption-registry.ts`.
