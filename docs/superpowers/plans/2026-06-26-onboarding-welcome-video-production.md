# Onboarding Welcome Video — End-to-End Production Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the narrated `remotion-onboarding-welcome` video the setup wizard already embeds, wire it through the repo's real toolchain (ElevenLabs → Remotion → captions → Cloudinary), and close the review findings the missing asset exposed — so a brand-new client sees a working, captioned welcome video on first sign-in instead of a broken player.

**Architecture:** A single transcript JSON (`content/videos/onboarding-welcome.script.json`) becomes the source of truth that feeds three derived artifacts — the ElevenLabs MP3 narration, the WebVTT captions, and the on-screen step timing — so audio, captions, and visuals can never drift. Narration is embedded *inside* the Remotion composition via `<Audio>`/`staticFile` (the repo currently has **no** audio-muxing step, so this is the only reproducible-from-`npm run render:tutorials` path). The rendered MP4 is uploaded with the existing Cloudinary script, and `VideoExplainer` is hardened so a missing CDN asset degrades gracefully instead of showing a dead `<video>`.

**Tech Stack:** Next.js 15 / React, Remotion 4.0.471 (`@remotion/renderer`, `@remotion/bundler`), ElevenLabs TTS (`eleven_multilingual_v2`, one voice), Cloudinary (`cloudinary` v2), Vitest 4.1.6 + `@testing-library/react` 16.3.2, Linear (work SSOT), `gh` CLI.

## Global Constraints

- **One voice, always:** `ELEVENLABS_VOICE_ID=jSuBIjxMKhqIfb0wCK1F` (CEO clone, canonical for all UGN projects). Model `eleven_multilingual_v2`. Never introduce a second voice.
- **Slug is fixed:** the `VideoExplainerSlug` consumed by the wizard is `remotion-onboarding-welcome` (in `components/setup/video-registry.ts`). Caption-registry keys, analytics, and `getCaptionUrl()` lookups MUST use this exact slug. Rendered file artifacts use the stem `onboarding-welcome` (matches the registry `localPath` `/videos/remotion/onboarding-welcome.mp4` and Cloudinary `public_id`).
- **Composition geometry (do not change):** id `OnboardingWelcome`, 1920×1080, 30fps, 1080 frames = 36.0s (`remotion/index.tsx`).
- **Secrets in `.env.local` only.** Required for asset steps: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Reference names in `.env.example`; never commit values.
- **Sandbox limitation (honest):** the ElevenLabs call, the headless-Chromium Remotion render, and the Cloudinary upload require real credentials and a machine with Chromium — they **cannot** run in the review/CI sandbox. Steps that produce binary assets are marked **[RUN ON DEV/CI HOST]** and verified by inspecting the produced file, not by a unit test.
- **CLAUDE.md rules (enforced in review):** try/catch on all API routes; **no `error.message` in client responses** (internal logs only); response shapes `{ data }` or `{ error }`; `escapeHtml()` for any user content rendered to HTML; **never fabricate APIs** — read the dependency before calling it.
- **Linear is SSOT for ownership.** Claim before working (`[CLAIM]`), release with `[DONE] pr=#NNN`. Verification Gate is always-on: no "done"/"all set" without a VERIFICATION CHECKLIST.
- **Test runner:** `pnpm exec vitest run <file>` (no top-level `test` script exists). Type-check a single file with `pnpm exec tsc --noEmit <file>` only as a smoke check (project-wide alias errors are false positives per CLAUDE.md).
- **Commit cadence:** one commit per task, conventional-commit message, co-authored trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Orchestration (how this routes through the Board & agents)

This is the wrapper, not a code task. The repo's real orchestration primitives (confirmed to exist): Linear (SSOT) + `linear-task-processor` agent + `pr-creator` agent + `/review-pr` (`pr-manager` triage → `orchestrator-reviewer` 18-dimension review) + `deployment-verifier`. There is **no** dedicated "video-generation agent"; production is driven by this plan executed task-by-task.

**Recommended routing:**
1. **Orchestrator (you):** file the Linear epic + child issues (Phase 0, Task 0), claim, cut the branch.
2. **Per task:** dispatch a fresh subagent (subagent-driven-development) to implement one task; review its diff against the two-stage gate before accepting.
3. **Asset tasks (2, 4, 6) [RUN ON DEV/CI HOST]:** a human or a non-sandbox runner executes the marked commands and commits the produced assets (audio/MP4 are git-ignored where applicable; captions and code are committed).
4. **On green:** `pr-creator` opens the PR → `/review-pr <#>` runs `pr-manager` + `orchestrator-reviewer` (activated dimensions for this change: 1 Architecture, 4 Error Handling, 5 Type Safety, 9 Accessibility, 12 Dependency Mgmt, 13 Code Style, 18 UI/UX) → Orchestrator merges → `deployment-verifier` confirms the wizard renders the video on sandbox.

---

## File Structure

| Path | Responsibility | Action |
| --- | --- | --- |
| `content/videos/onboarding-welcome.script.json` | SSOT transcript: segments (text + timing) for one video | Create |
| `content/videos/__tests__/onboarding-welcome.script.test.ts` | Validates transcript shape & fits 36s | Create |
| `scripts/lib/elevenlabs-tts.ts` | Shared ElevenLabs request-body builder + `generateAudio()` (DRY: extracted from `scripts/generate-narration.ts`) | Create |
| `scripts/lib/__tests__/elevenlabs-tts.test.ts` | Unit test for request-body builder | Create |
| `scripts/lib/script-to-vtt.ts` | Pure `segmentsToVtt()` transcript→WebVTT | Create |
| `scripts/lib/__tests__/script-to-vtt.test.ts` | Unit test for VTT generation | Create |
| `scripts/generate-onboarding-narration.ts` | Reads script JSON → writes `public/narration/onboarding-welcome.mp3` | Create |
| `scripts/generate-onboarding-captions.ts` | Reads script JSON → writes `public/videos/captions/onboarding-welcome.vtt` | Create |
| `remotion/compositions/onboarding-welcome.tsx` | Add `<Audio>` narration track; align step timings to script | Modify |
| `remotion/render-all.ts:4-72` | Add `OnboardingWelcome` to `compositionsToRender` | Modify |
| `scripts/video-upload-cloudinary.ts` | Add onboarding entry to video definitions | Modify |
| `components/setup/caption-registry.ts` | Add `remotion-onboarding-welcome` → VTT mapping | Modify |
| `components/setup/VideoExplainer.tsx` | Add `<video onError>` graceful-fallback (review finding #1) | Modify |
| `components/setup/__tests__/VideoExplainer.test.tsx` | Test fallback behavior | Create |
| `lib/setup/checks.ts:110,180,228` | Fix falsy-zero pricing gate; stop leaking `err.message` (review findings #2, #4) | Modify |
| `lib/setup/__tests__/checks.test.ts` | Test pricing gate & note redaction | Create/Modify |
| `components/setup/SetupShell.tsx:55-66` | Surface error on failed `/api/setup/state` refetch (review finding #5) | Modify |

---

# TRACK A — Produce the video

### Task 0: Board setup & branch (orchestration)

**Files:** none (Linear + git).

- [ ] **Step 1: File the epic and child issues in Linear (RestoreAssist team)**

Create one epic and child issues (use the Linear MCP `save_issue`, or the UI). Titles:
- Epic: `Onboarding welcome video — production pipeline + setup-gate fixes`
- `RA: SSOT transcript + ElevenLabs narration for onboarding-welcome`
- `RA: embed narration audio in OnboardingWelcome composition + render`
- `RA: captions + Cloudinary upload + registry wiring for onboarding-welcome`
- `RA: harden VideoExplainer missing-asset fallback`
- `RA: setup-gate fixes (pricing falsy-zero, note redaction, state refetch)`

- [ ] **Step 2: Claim and branch**

Post a Linear comment on the epic: `[CLAIM] swarm=local agent=onboarding-video role=pm intent: produce onboarding-welcome video + setup fixes; lockable-paths: remotion/**, scripts/**, components/setup/**, lib/setup/checks.ts`.

```bash
git checkout main && git pull
git checkout -b feat/onboarding-welcome-video
```

Expected: on a fresh branch off latest `main`.

---

### Task 1: SSOT transcript (the single source the audio, captions, and visuals all derive from)

**Files:**
- Create: `content/videos/onboarding-welcome.script.json`
- Test: `content/videos/__tests__/onboarding-welcome.script.test.ts`

**Interfaces:**
- Produces: a JSON document of shape
  `{ slug: string; voiceId: string; totalSec: number; segments: Array<{ text: string; startSec: number; durationSec: number }> }`
  consumed by Tasks 2, 3, and 5.

- [ ] **Step 1: Write the failing test**

```ts
// content/videos/__tests__/onboarding-welcome.script.test.ts
import { describe, it, expect } from "vitest";
import script from "../onboarding-welcome.script.json";

describe("onboarding-welcome transcript", () => {
  it("targets the correct slug and the canonical single voice", () => {
    expect(script.slug).toBe("remotion-onboarding-welcome");
    expect(script.voiceId).toBe("jSuBIjxMKhqIfb0wCK1F");
  });

  it("has non-empty, time-ordered segments that fit the 36s composition", () => {
    expect(script.segments.length).toBeGreaterThan(0);
    let prevEnd = 0;
    for (const seg of script.segments) {
      expect(seg.text.trim().length).toBeGreaterThan(0);
      expect(seg.startSec).toBeGreaterThanOrEqual(prevEnd); // no overlap
      prevEnd = seg.startSec + seg.durationSec;
    }
    expect(prevEnd).toBeLessThanOrEqual(script.totalSec);
    expect(script.totalSec).toBe(36);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run content/videos/__tests__/onboarding-welcome.script.test.ts`
Expected: FAIL — `Cannot find module '../onboarding-welcome.script.json'`.

- [ ] **Step 3: Create the transcript**

Timings align to the composition scenes (intro 0–5.8s, business 6–13.3s, brand 13.7–21s, pricing 21.3–28.7s, outro 29–36s).

```json
{
  "slug": "remotion-onboarding-welcome",
  "voiceId": "jSuBIjxMKhqIfb0wCK1F",
  "totalSec": 36,
  "segments": [
    { "text": "Welcome to RestoreAssist. Let's get your restoration business ready to work.", "startSec": 0.5, "durationSec": 4.5 },
    { "text": "First, your business details. Enter your A B N and we'll pull your legal name and trading details straight from the Australian Business Register.", "startSec": 6.5, "durationSec": 6.5 },
    { "text": "Next, your brand. Add your logo and colours, so every report and invoice you send out looks like yours.", "startSec": 14.0, "durationSec": 6.0 },
    { "text": "Then your pricing. Set your labour rates and administration fee once, and RestoreAssist applies them automatically.", "startSec": 21.5, "durationSec": 6.0 },
    { "text": "That's it. Once your setup checks pass, your workspace goes live. Welcome aboard.", "startSec": 29.0, "durationSec": 5.5 }
  ]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run content/videos/__tests__/onboarding-welcome.script.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add content/videos/onboarding-welcome.script.json content/videos/__tests__/onboarding-welcome.script.test.ts
git commit -m "feat(video): add onboarding-welcome transcript SSOT"
```

---

### Task 2: ElevenLabs narration (extract shared TTS helper, then generate the MP3)

**Files:**
- Create: `scripts/lib/elevenlabs-tts.ts`
- Test: `scripts/lib/__tests__/elevenlabs-tts.test.ts`
- Create: `scripts/generate-onboarding-narration.ts`

**Interfaces:**
- Produces:
  - `buildTtsBody(text: string): { text: string; model_id: string; voice_settings: { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean } }`
  - `generateAudio(text: string, outputPath: string, opts: { apiKey: string; voiceId: string }): Promise<void>`
  - Binary artifact `public/narration/onboarding-welcome.mp3` (consumed by Task 3 via `staticFile`).

**Why a shared helper:** `scripts/generate-narration.ts:237` already implements `generateAudio`. A second copy would be flagged by the reuse dimension — extract the request shape into `scripts/lib/elevenlabs-tts.ts` so both the bulk generator and this one-off use identical voice settings.

- [ ] **Step 1: Write the failing test for the pure request builder**

```ts
// scripts/lib/__tests__/elevenlabs-tts.test.ts
import { describe, it, expect } from "vitest";
import { buildTtsBody } from "../elevenlabs-tts";

describe("buildTtsBody", () => {
  it("uses the multilingual model and the canonical voice settings", () => {
    const body = buildTtsBody("Hello");
    expect(body).toEqual({
      text: "Hello",
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run scripts/lib/__tests__/elevenlabs-tts.test.ts`
Expected: FAIL — `Cannot find module '../elevenlabs-tts'`.

- [ ] **Step 3: Implement the shared helper**

```ts
// scripts/lib/elevenlabs-tts.ts
/**
 * Shared ElevenLabs TTS helper. SSOT for voice settings so the bulk generator
 * (scripts/generate-narration.ts) and one-off generators stay in lock-step.
 */
import fs from "fs/promises";

export interface TtsBody {
  text: string;
  model_id: string;
  voice_settings: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
  };
}

export function buildTtsBody(text: string): TtsBody {
  return {
    text,
    model_id: "eleven_multilingual_v2",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
    },
  };
}

export async function generateAudio(
  text: string,
  outputPath: string,
  opts: { apiKey: string; voiceId: string },
): Promise<void> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": opts.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(buildTtsBody(text)),
    },
  );
  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/lib/__tests__/elevenlabs-tts.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Write the one-off generator script**

It concatenates the transcript segments into one narration pass and writes to `public/` so Remotion's `staticFile()` can resolve it.

```ts
// scripts/generate-onboarding-narration.ts
/**
 * Generate the onboarding-welcome narration MP3 from the transcript SSOT.
 *
 * Usage (NOT runnable in the review sandbox — needs a real key):
 *   ELEVENLABS_API_KEY=*** ELEVENLABS_VOICE_ID=jSuBIjxMKhqIfb0wCK1F \
 *     pnpm exec tsx scripts/generate-onboarding-narration.ts
 *
 * Output: public/narration/onboarding-welcome.mp3 (resolved by staticFile()).
 */
import fs from "fs/promises";
import path from "path";
import { generateAudio } from "./lib/elevenlabs-tts";
import script from "../content/videos/onboarding-welcome.script.json";

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || script.voiceId;
  if (!apiKey) {
    console.error("[onboarding-narration] ELEVENLABS_API_KEY is required");
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), "public", "narration");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "onboarding-welcome.mp3");

  const fullText = script.segments.map((s) => s.text).join(" ");
  console.log(`[onboarding-narration] generating ${fullText.length} chars → ${outPath}`);
  await generateAudio(fullText, outPath, { apiKey, voiceId });

  const { size } = await fs.stat(outPath);
  if (size < 10_000) throw new Error(`MP3 suspiciously small (${size} bytes)`);
  console.log(`[onboarding-narration] [x] wrote ${size} bytes`);
}

main().catch((err) => {
  console.error("[onboarding-narration] fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 6: [RUN ON DEV/CI HOST] Generate the audio and verify**

Run:
```bash
ELEVENLABS_API_KEY=*** ELEVENLABS_VOICE_ID=jSuBIjxMKhqIfb0wCK1F \
  pnpm exec tsx scripts/generate-onboarding-narration.ts
ls -la public/narration/onboarding-welcome.mp3
```
Expected: file exists, > 10 KB, script logs `[x] wrote <N> bytes`.

- [ ] **Step 7: Commit** (commit the code; the MP3 may be git-ignored — check `.gitignore` for `public/narration`; if ignored, document that the asset is produced by the script)

```bash
git add scripts/lib/elevenlabs-tts.ts scripts/lib/__tests__/elevenlabs-tts.test.ts scripts/generate-onboarding-narration.ts
git commit -m "feat(video): shared ElevenLabs helper + onboarding narration generator"
```

---

### Task 3: Embed narration in the OnboardingWelcome composition

**Files:**
- Modify: `remotion/compositions/onboarding-welcome.tsx`

**Interfaces:**
- Consumes: `public/narration/onboarding-welcome.mp3` from Task 2.
- Produces: the `OnboardingWelcome` composition now renders an audio track (verified by ffprobe in Task 4).

**Note (read before editing):** the repo has **no** audio-muxing step and **no** existing `<Audio>`/`staticFile` usage in `remotion/`. Remotion's `staticFile()` resolves from the project-root `public/` folder — that is why Task 2 writes the MP3 there. `renderMedia` (used by `render-all.ts`) bakes `<Audio>` into the output automatically; no extra render flags are needed.

- [ ] **Step 1: Add the import**

In `remotion/compositions/onboarding-welcome.tsx`, line 2, change:

```ts
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
```
to:
```ts
import {AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame} from 'remotion';
```

- [ ] **Step 2: Render the audio track**

Inside the composition's top-level returned `<AbsoluteFill>` (the outermost element), add as the **first** child:

```tsx
<Audio src={staticFile('narration/onboarding-welcome.mp3')} />
```

`<Audio>` plays from frame 0 for its natural length; the transcript was timed (Task 1) so the 36s visual matches the narration pacing.

- [ ] **Step 3: Smoke-check the composition compiles**

Run: `pnpm exec tsc --noEmit remotion/compositions/onboarding-welcome.tsx`
Expected: no errors originating from this file (ignore project-wide path-alias noise per CLAUDE.md). Confirm `Audio` and `staticFile` are imported and used.

- [ ] **Step 4: Commit**

```bash
git add remotion/compositions/onboarding-welcome.tsx
git commit -m "feat(video): embed ElevenLabs narration in OnboardingWelcome composition"
```

---

### Task 4: Register in the render manifest and render the MP4

**Files:**
- Modify: `remotion/render-all.ts` (the `compositionsToRender` array, ends line ~72)

**Interfaces:**
- Consumes: the composition from Task 3.
- Produces: `remotion/output/onboarding-welcome.mp4`, copied to `public/videos/remotion/onboarding-welcome.mp4` (the registry `localPath` and Cloudinary source).

**Why:** `OnboardingWelcome` is registered in `remotion/index.tsx` but is **absent** from `compositionsToRender`, so `npm run render:tutorials` never produces it (the root cause behind the registry pointing at a non-existent asset).

- [ ] **Step 1: Add the manifest entry**

In `remotion/render-all.ts`, add to the `compositionsToRender` array (e.g. directly after the `// Original 4 tutorials` block, before line 6's first entry or grouped with a new comment):

```ts
  // New-client welcome (top of /setup)
  {id: 'OnboardingWelcome', fileName: 'onboarding-welcome.mp4'},
```

- [ ] **Step 2: [RUN ON DEV/CI HOST] Render and verify the audio stream exists**

Run:
```bash
pnpm run render:tutorials
ls -la remotion/output/onboarding-welcome.mp4
# verify a real audio stream is baked in (proves Task 3 worked):
ffprobe -v error -select_streams a -show_entries stream=codec_type \
  -of csv=p=0 remotion/output/onboarding-welcome.mp4
```
Expected: MP4 exists; ffprobe prints `audio`. (If it prints nothing, the `<Audio>` tag or the `public/narration/onboarding-welcome.mp3` path is wrong — fix Task 3 before continuing.)

- [ ] **Step 3: [RUN ON DEV/CI HOST] Place the local fallback asset**

Run:
```bash
mkdir -p public/videos/remotion
cp remotion/output/onboarding-welcome.mp4 public/videos/remotion/onboarding-welcome.mp4
ls -la public/videos/remotion/onboarding-welcome.mp4
```
Expected: file present at the registry `localPath` location.

- [ ] **Step 4: Commit the manifest change** (the MP4 itself is typically git-ignored / Cloudinary-hosted — confirm against `.gitignore`)

```bash
git add remotion/render-all.ts
git commit -m "feat(video): render OnboardingWelcome in render:tutorials manifest"
```

---

### Task 5: Captions (derive WebVTT from the same transcript)

**Files:**
- Create: `scripts/lib/script-to-vtt.ts`
- Test: `scripts/lib/__tests__/script-to-vtt.test.ts`
- Create: `scripts/generate-onboarding-captions.ts`
- Modify: `components/setup/caption-registry.ts`

**Interfaces:**
- Consumes: the transcript JSON (Task 1).
- Produces:
  - `segmentsToVtt(segments: Array<{ text: string; startSec: number; durationSec: number }>): string`
  - `public/videos/captions/onboarding-welcome.vtt`
  - `CAPTION_REGISTRY["remotion-onboarding-welcome"] = "/videos/captions/onboarding-welcome.vtt"`

- [ ] **Step 1: Write the failing test for the VTT builder**

```ts
// scripts/lib/__tests__/script-to-vtt.test.ts
import { describe, it, expect } from "vitest";
import { segmentsToVtt } from "../script-to-vtt";

describe("segmentsToVtt", () => {
  it("emits a valid WEBVTT document with mm:ss.mmm cues", () => {
    const vtt = segmentsToVtt([
      { text: "Hello there.", startSec: 0.5, durationSec: 4.5 },
      { text: "Second line.", startSec: 6.5, durationSec: 6.5 },
    ]);
    expect(vtt.startsWith("WEBVTT\n")).toBe(true);
    expect(vtt).toContain("00:00.500 --> 00:05.000");
    expect(vtt).toContain("Hello there.");
    expect(vtt).toContain("00:06.500 --> 00:13.000");
    expect(vtt).toContain("Second line.");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run scripts/lib/__tests__/script-to-vtt.test.ts`
Expected: FAIL — `Cannot find module '../script-to-vtt'`.

- [ ] **Step 3: Implement the VTT builder**

```ts
// scripts/lib/script-to-vtt.ts
export interface VttSegment {
  text: string;
  startSec: number;
  durationSec: number;
}

function fmt(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const ms = Math.round((totalSec - Math.floor(totalSec)) * 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

export function segmentsToVtt(segments: VttSegment[]): string {
  const cues = segments.map((seg) => {
    const start = fmt(seg.startSec);
    const end = fmt(seg.startSec + seg.durationSec);
    return `${start} --> ${end}\n${seg.text}`;
  });
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/lib/__tests__/script-to-vtt.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Write the caption generator and run it**

```ts
// scripts/generate-onboarding-captions.ts
/**
 * Generate public/videos/captions/onboarding-welcome.vtt from the transcript.
 * Pure/deterministic — safe to run anywhere (no network).
 *   pnpm exec tsx scripts/generate-onboarding-captions.ts
 */
import fs from "fs/promises";
import path from "path";
import { segmentsToVtt } from "./lib/script-to-vtt";
import script from "../content/videos/onboarding-welcome.script.json";

async function main() {
  const outDir = path.join(process.cwd(), "public", "videos", "captions");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "onboarding-welcome.vtt");
  await fs.writeFile(outPath, segmentsToVtt(script.segments));
  console.log(`[onboarding-captions] [x] wrote ${outPath}`);
}

main().catch((err) => {
  console.error("[onboarding-captions] fatal:", err);
  process.exit(1);
});
```

Run:
```bash
pnpm exec tsx scripts/generate-onboarding-captions.ts
cat public/videos/captions/onboarding-welcome.vtt
```
Expected: a valid `WEBVTT` file with 5 cues printed.

- [ ] **Step 6: Register the caption under the exact slug**

In `components/setup/caption-registry.ts`, inside the `CAPTION_REGISTRY` object, add:

```ts
  // New-client welcome (top of /setup) — keyed by the VideoExplainerSlug
  "remotion-onboarding-welcome": "/videos/captions/onboarding-welcome.vtt",
```

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/script-to-vtt.ts scripts/lib/__tests__/script-to-vtt.test.ts \
  scripts/generate-onboarding-captions.ts public/videos/captions/onboarding-welcome.vtt \
  components/setup/caption-registry.ts
git commit -m "feat(video): onboarding-welcome captions (VTT) + registry entry"
```

---

### Task 6: Upload to Cloudinary and confirm the registry URL resolves

**Files:**
- Modify: `scripts/video-upload-cloudinary.ts` (the `// ── Video definitions ──` block, ~line 70)

**Interfaces:**
- Consumes: `public/videos/remotion/onboarding-welcome.mp4` (Task 4).
- Produces: a live Cloudinary asset at the URL already hard-coded in `video-registry.ts` (`…/restoreassist/videos/remotion/onboarding-welcome.mp4`).

- [ ] **Step 1: Add the onboarding video definition**

Read the existing `videos` array in `scripts/video-upload-cloudinary.ts` and append an entry that matches its shape (slug, filePath under `public/`, folder, title). Mirror the neighbouring entries exactly — folder `restoreassist/videos/remotion`, `public_id`/slug `onboarding-welcome`, `filePath` `public/videos/remotion/onboarding-welcome.mp4`, title `Welcome to RestoreAssist`.

- [ ] **Step 2: [RUN ON DEV/CI HOST] Upload and capture the versioned URL**

Run:
```bash
npx tsx scripts/video-upload-cloudinary.ts --slug onboarding-welcome
```
Expected: log shows a `secure_url` like `https://res.cloudinary.com/dmaulkthb/video/upload/v<timestamp>/restoreassist/videos/remotion/onboarding-welcome.mp4`; the script auto-updates `components/setup/video-registry.ts`.

- [ ] **Step 3: Verify the CDN asset is reachable**

Run:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  "https://res.cloudinary.com/dmaulkthb/video/upload/restoreassist/videos/remotion/onboarding-welcome.mp4"
```
Expected: `200` (not `404`). If `404`, the upload folder/public_id didn't match the registry path — reconcile before merging.

- [ ] **Step 4: Commit the registry + uploader changes**

```bash
git add scripts/video-upload-cloudinary.ts components/setup/video-registry.ts
git commit -m "feat(video): upload onboarding-welcome to Cloudinary + wire registry URL"
```

---

### Task 7: Harden VideoExplainer so a missing asset never shows a dead player (review finding #1)

**Files:**
- Modify: `components/setup/VideoExplainer.tsx` (the `renderVideo` function, ~line 165–225)
- Create: `components/setup/__tests__/VideoExplainer.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: when the `<video>` `src` fails to load, the component shows a branded "video unavailable" panel instead of a broken native player. New internal state `hasError` on `VideoExplainer`.

**Context:** Today the native `<video>` (line ~175) has no `onError`, while only the YouTube `<img>` path has a fallback. A bad CDN/local asset renders a black player with dead controls at the top of the first-run wizard.

- [ ] **Step 1: Write the failing test**

```tsx
// components/setup/__tests__/VideoExplainer.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VideoExplainer } from "../VideoExplainer";

// Force the lazy IntersectionObserver gate open so the <video> mounts.
beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
        cb([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {}
    },
  );
});

describe("VideoExplainer fallback", () => {
  it("shows an 'unavailable' panel when the video source errors", () => {
    render(<VideoExplainer slug="remotion-onboarding-welcome" trackEngagement={false} />);
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    fireEvent.error(video!);
    expect(screen.getByText(/video unavailable/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run components/setup/__tests__/VideoExplainer.test.tsx`
Expected: FAIL — no element matching `/video unavailable/i`.

- [ ] **Step 3: Add error state and the onError handler**

In `VideoExplainer.tsx`, add to the state block (near the other `useState` calls, ~line 73):

```tsx
const [hasError, setHasError] = useState(false);
```

In `renderVideo`, on the `<video>` element (after `onEnded={handleEnded}`), add:

```tsx
onError={() => setHasError(true)}
```

Then, at the start of `renderVideo` (before the `return`), short-circuit to a graceful panel:

```tsx
if (hasError) {
  return (
    <div className={wrapperClass} role="img" aria-label={`${title} — video unavailable`}>
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-brand-navy text-center text-white">
        <span className="text-sm font-medium">Video unavailable</span>
        <span className="text-xs text-white/70">{title}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run components/setup/__tests__/VideoExplainer.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add components/setup/VideoExplainer.tsx components/setup/__tests__/VideoExplainer.test.tsx
git commit -m "fix(setup): graceful fallback when onboarding video asset fails to load"
```

---

# TRACK B — Close the remaining review findings

### Task 8: Fix the falsy-zero pricing gate (review finding #2)

**Files:**
- Modify: `lib/setup/checks.ts:110` (the `ready` expression in `pricingCheck`)
- Test: `lib/setup/__tests__/checks.test.ts`

**Context:** `const ready = !!p?.masterQualifiedNormalHours && !!p?.administrationFee;` — both are non-null `Float` columns. A client who sets `administrationFee = 0` (waived fee) has a complete config, but `!!0` is `false`, so the check goes `red` and `/api/setup/activate` permanently refuses activation.

- [ ] **Step 1: Write the failing test**

```ts
// lib/setup/__tests__/checks.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationPricingConfig: { findUnique: vi.fn() },
  },
}));
import { prisma } from "@/lib/prisma";
import { pricingCheck } from "../checks";

describe("pricingCheck", () => {
  it("is green when admin fee is 0 (a legitimate waived fee)", async () => {
    (prisma.organizationPricingConfig.findUnique as any).mockResolvedValue({
      masterQualifiedNormalHours: 40,
      administrationFee: 0,
    });
    const result = await pricingCheck("org-1");
    expect(result.status).toBe("green");
  });

  it("is red when the pricing row is missing entirely", async () => {
    (prisma.organizationPricingConfig.findUnique as any).mockResolvedValue(null);
    const result = await pricingCheck("org-1");
    expect(result.status).toBe("red");
  });
});
```

> If `pricingCheck` is not currently exported, export it: change `const pricingCheck: Check = …` to `export const pricingCheck: Check = …` in `lib/setup/checks.ts`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run lib/setup/__tests__/checks.test.ts`
Expected: FAIL — first test gets `status: "red"` (the falsy-zero bug), or an import error if `pricingCheck` isn't exported yet.

- [ ] **Step 3: Fix the gate (presence check, not truthiness)**

In `lib/setup/checks.ts`, line ~110, change:

```ts
const ready = !!p?.masterQualifiedNormalHours && !!p?.administrationFee;
```
to:
```ts
const ready = p != null && p.masterQualifiedNormalHours != null && p.administrationFee != null;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run lib/setup/__tests__/checks.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/setup/checks.ts lib/setup/__tests__/checks.test.ts
git commit -m "fix(setup): pricing gate accepts a 0 admin fee (presence check, not truthiness)"
```

---

### Task 9: Stop leaking raw exception text to the client (review finding #4)

**Files:**
- Modify: `lib/setup/checks.ts:180,228` (the `catch` blocks of `sampleReportRenderCheck` and `chainOfCustodyCheck`)
- Test: `lib/setup/__tests__/checks.test.ts` (extend)

**Context:** these catch blocks set `note: err instanceof Error ? err.message : "…"`, and `/api/setup/activate` returns `c.note` to the client in the 400 `failedChecks[]`. CLAUDE.md: *"No `error.message` in 500s. Internal logs only."* The raw pdf-lib/crypto message leaks. Other checks use fixed notes — match that.

- [ ] **Step 1: Write the failing test**

```ts
// append to lib/setup/__tests__/checks.test.ts
import { sampleReportRenderCheck } from "../checks";

vi.mock("@/lib/generate-iicrc-report-pdf", () => ({
  generateIICRCReportPDF: vi.fn(async () => {
    throw new Error("SECRET pdf-lib internal: /var/task/node_modules/...");
  }),
}));

describe("sampleReportRenderCheck note redaction", () => {
  it("never returns the raw exception message to the client", async () => {
    const result = await sampleReportRenderCheck("org-1");
    expect(result.status).toBe("red");
    expect(result.note).not.toContain("SECRET");
    expect(result.note).toBe("Sample report rendering failed");
  });
});
```

> Export `sampleReportRenderCheck` if not already (`export const …`). The existing `@/lib/prisma` mock from Task 8 must also provide `organization.findUnique` returning `null` — extend the mock object: `organization: { findUnique: vi.fn(async () => null) }`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run lib/setup/__tests__/checks.test.ts`
Expected: FAIL — `note` equals the raw `SECRET …` message.

- [ ] **Step 3: Redact the notes; log internally**

In `lib/setup/checks.ts`, `sampleReportRenderCheck` catch (~line 177-181):

```ts
} catch (err) {
  console.error("[setup-check] sample_report_render failed:", err);
  return {
    capability: "sample_report_render",
    label: "Sample report rendering",
    status: "red",
    note: "Sample report rendering failed",
  };
}
```

And `chainOfCustodyCheck` catch (~line 225-229):

```ts
} catch (err) {
  console.error("[setup-check] chain_of_custody failed:", err);
  return {
    capability: "chain_of_custody",
    label: "Photo chain-of-custody",
    status: "red",
    note: "Chain-of-custody primitives failed",
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run lib/setup/__tests__/checks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/setup/checks.ts lib/setup/__tests__/checks.test.ts
git commit -m "fix(setup): redact raw exception text from activation check notes"
```

---

### Task 10: Surface a refetch error instead of silently freezing the wizard (review finding #5)

**Files:**
- Modify: `components/setup/SetupShell.tsx:55-66` (the `/api/setup/state` refetch on READY)

**Context:** when a hydration job hits `READY`, SetupShell refetches `/api/setup/state` and only updates the store if `data?.data?.organization` exists. On a 401/404 the body is `{ error }`, so `setOrg` never runs and the just-completed section keeps showing its old state with no error shown.

- [ ] **Step 1: Add a non-OK branch to the refetch**

In `components/setup/SetupShell.tsx`, the `.then((r) => r.json())` chain (~line 57), change to check `r.ok` and surface a console error + a user-visible flag. Minimal, dependency-free fix — handle the error path explicitly:

```tsx
fetch('/api/setup/state')
  .then(async (r) => {
    if (!r.ok) throw new Error(`state refetch ${r.status}`);
    return r.json();
  })
  .then((data) => {
    if (data?.data?.organization) {
      const { hydrationJobs: _drop, pricingConfig: _p, ...orgOnly } = data.data.organization;
      setOrg({
        ...orgOnly,
        setupStartedAt: orgOnly.setupStartedAt ? new Date(orgOnly.setupStartedAt).toISOString() : null,
        setupCompletedAt: orgOnly.setupCompletedAt ? new Date(orgOnly.setupCompletedAt).toISOString() : null,
      });
    }
  })
  .catch((err) => {
    console.error('[setup] state refresh failed:', err);
    // Surface to the user rather than freezing mid-hydrate.
    setSectionStatus(jobKindToSectionKey('ABR'), 'error');
  });
```

> Verify `setSectionStatus` accepts an `'error'`/equivalent state in this store (check `jobStatusToHydrationState`); if the store has no error state, instead set a local `refreshFailed` boolean and render a small "Couldn't refresh — reload the page" notice above the cards. Pick whichever the existing store supports — do not invent a status value.

- [ ] **Step 2: Verify in the running app**

Per the Verification Gate, this is UI behavior — verify via the preview in Task 11's checklist (simulate a 401 by signing out mid-hydration). No isolated unit test (it's an effect tied to EventSource + fetch); the integration check in Task 11 covers it.

- [ ] **Step 3: Commit**

```bash
git add components/setup/SetupShell.tsx
git commit -m "fix(setup): surface state-refetch failure instead of freezing the wizard"
```

> **CONFIG_ERROR UI surfacing (review finding #3)** is intentionally deferred to its own Linear ticket: it requires threading `errorMessage` through the SSE stream (`app/api/setup/hydrate/stream/route.ts`) and `BusinessDetailsCard`, which is a separate, larger change than this video-production PR should carry. File it as `RA: surface ABR CONFIG_ERROR distinctly in setup wizard` and link it to the epic.

---

### Task 11: End-to-end verification + review handoff

**Files:** none (verification + orchestration).

- [ ] **Step 1: Run the full unit suite for touched areas**

Run:
```bash
pnpm exec vitest run content/videos scripts/lib lib/setup components/setup
```
Expected: all green.

- [ ] **Step 2: Verify the wizard in the preview**

Start the dev server and open `/setup` as a new client (no `setupCompletedAt`). 

**VERIFICATION CHECKLIST**
1. **Where:** the `/setup` wizard, top of the page.
2. **How:** sign in as a user whose Organization has `setupCompletedAt = null`; the wizard renders.
3. **What to see:** a playing `<video>` titled "Welcome to RestoreAssist" with audible narration in the single CEO voice and an English captions track (toggle CC). The video controls work; the duration badge shows `0:36`.
4. **What NOT to see:** a black/broken player, a dead control bar, a 404 in the network panel for `onboarding-welcome.mp4`, or any console error from `VideoExplainer`/`SetupShell`.
5. **Confirm:** "Does the welcome video play with sound + captions, and does the wizard advance normally?"

- [ ] **Step 3: Verify the missing-asset fallback**

Temporarily break the registry URL (point `cloudinaryUrl`/`localPath` at a nonexistent path in a throwaway local edit), reload `/setup`, and confirm the branded "Video unavailable" panel appears (not a dead player). Revert the throwaway edit.

- [ ] **Step 4: Open the PR and route through review**

```bash
git push -u origin feat/onboarding-welcome-video
```
Then run `/review-pr <#>` (activates dimensions 1, 4, 5, 9, 12, 13, 18). Address any Critical/Important findings. On `APPROVED`, the Orchestrator merges; `deployment-verifier` confirms `/setup` renders the video on the sandbox deployment.

- [ ] **Step 5: Close out Linear**

Post `[DONE] pr=#<NNN>` on the epic and move child issues to In Review. Leave the deferred CONFIG_ERROR ticket in Backlog, linked.

---

## Self-Review (performed against the request)

**Spec coverage:**
- "generate the script" → Task 1 (transcript SSOT). [x]
- "the process / everything required for production" → Tasks 0–6 chain audio→composition→render→captions→CDN. [x]
- "the videos" → Tasks 3–4 (embed audio, render MP4). [x]
- "the editing" → Task 1 timing + Task 3 audio embed are the edit; captions Task 5. [x]
- "using elevenlabs, 1 voice" → Task 2, Global Constraints pin `jSuBIjxMKhqIfb0wCK1F`. [x]
- "work through all these found issues" → Track A Task 7 (finding #1, broken player), Track B Tasks 8–10 (findings #2, #4, #5); finding #3 explicitly deferred to a linked ticket with rationale. [x]
- "using the Sub Agents, Senior Agents, Orchestrator Agent, and the Board" → Orchestration section + Task 0 + Task 11 use the real primitives (Linear, `pr-creator`, `/review-pr`, `deployment-verifier`); the report's finding that no dedicated "video-gen agent" exists is reflected by driving production through this task plan. [x]

**Placeholder scan:** no "TBD/handle errors/similar to" — every code step shows complete code. Asset/network/render steps that cannot be unit-tested are explicitly marked **[RUN ON DEV/CI HOST]** with a concrete file/ffprobe/curl verification instead of a fake test. [x]

**Type/name consistency:** slug `remotion-onboarding-welcome` used identically in caption-registry, VideoExplainer test, and transcript; file stem `onboarding-welcome` used identically in narration MP3, render `fileName`, `public/videos/remotion/…mp4`, and Cloudinary `public_id`; `segmentsToVtt`, `buildTtsBody`, `generateAudio`, `pricingCheck`, `sampleReportRenderCheck` names match between definition and test. [x]

**Open risks the executor must confirm (not fabricated):**
1. Remotion `staticFile()` resolving `public/narration/onboarding-welcome.mp3` — verified by the ffprobe audio-stream check in Task 4 Step 2. If empty, the asset path is wrong.
2. Whether `public/narration/**` and `public/videos/remotion/*.mp4` are git-ignored — check `.gitignore` before assuming the binaries commit; the *code* always commits.
3. `setSectionStatus` accepting an error state (Task 10) — confirm against the store; do not invent a status value.

---

**Verification gate compliance:** this plan does not declare the feature complete. Completion is gated on Task 11's checklist being confirmed by a human in the running app.
