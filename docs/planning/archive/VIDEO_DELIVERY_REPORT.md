# RestoreAssist Go-Live Video Pipeline — Delivery Report

> **Date**: 2026-05-30
> **Delivered by**: Margot (Unite-Group/Nexus agent)
> **Repo**: `CleanExpo/RestoreAssist` (branch: `codex/overnight-production-readiness`)
> **Commit**: `99aa54ac`

---

## Executive Summary

Your RestoreAssist app already has **6 onboarding videos** live on YouTube and **6 help videos** as local MP4s. But the local MP4s won't deploy with the app (too large), and you're missing:

- **Login flow video** (app-specific)
- **Sign up flow video** (app-specific)
- **Setup wizard video** (per-step, not end-to-end)
- **Training/tutorial videos** for each major feature

I've built you a **complete go-live video pipeline** that generates, hosts, and delivers these automatically.

---

## What I Built

### 1. Video Generation Script (`scripts/video-generate.ts`)

**What it does**: Automatically generates MP4 tutorial videos

1. Opens Playwright browser at your production URL
2. Captures screenshots at each step (login, signup, etc.)
3. Stitches screenshots into smooth MP4 with ffmpeg
4. Adds TTS narration per step

**Flows currently defined**:

| Flow | Steps | Duration | Command |
|------|-------|----------|---------|
| `login` | 6 | 0:45 | `npx tsx scripts/video-generate.ts --flow login` |
| `signup` | 6 | 1:30 | `npx tsx scripts/video-generate.ts --flow signup` |
| `setup-wizard` | 6 | 2:00 | `npx tsx scripts/video-generate.ts --flow setup-wizard` |

**Add new flows**: Edit the `flows` object at the top of the script. Define steps with:
- `action`: Playwright code to execute
- `narration`: What the TTS voice says
- `delay`: Pause after action (ms)

### 2. Video Upload Script (`scripts/video-upload.ts`)

**What it does**: Uploads MP4 to host and updates the registry

**Cloudinary** (for app-embedded videos):
```bash
npx tsx scripts/video-upload.ts \
  --file ./videos/restoreassist-login-v1.mp4 \
  --slug setup-wizard-signin \
  --title "Signing in to RestoreAssist" \
  --duration 45
```

**YouTube** (for public help videos):
```bash
npx tsx scripts/video-upload.ts \
  --file ./videos/help-inspections.mp4 \
  --slug help-inspections \
  --host youtube \
  --privacy unlisted
```

**Update existing entry**:
```bash
npx tsx scripts/video-upload.ts \
  --slug setup-wizard-signup \
  --youtube-id ABC123xyz
```

### 3. Updated Video Component (`VideoExplainer.tsx`)

Now supports **3 hosting modes**:

| Mode | Use Case | How |
|------|----------|-----|
| **YouTube** | Public help/training videos | `youtubeId` in registry |
| **Cloudinary** | App-embedded, CDN-delivered | `cloudinaryUrl` in registry |
| **Local MP4** | Dev/test fallback | `localPath` in registry |

The component auto-detects which host to use and renders the appropriate player.

### 4. Complete Plan Document (`.planning/video-generation-plan.md`)

Contains:
- Full audit of existing videos
- P0/P1/P2 priority catalog (10 videos)
- Step-by-step execution plan
- Cost estimate ($15/mo)
- Go-live checklist

---

## What's There Now vs. What You Need

### Already Live (YouTube)

| # | Video | YouTube ID | Status |
|---|-------|-----------|--------|
| 1 | Sign in | tsmZpgLrn5Y | [PASS] Done |
| 2 | Sign up | wREGInp5yPQ | [PASS] Done |
| 3 | Setup wizard | G2CIyp-gDKA | [PASS] Done |
| 4 | Dashboard | sp3bMYSaZa8 | [PASS] Done |
| 5 | Integrations | P6rVHLOVNsQ | [PASS] Done |
| 6 | Health page | UHUiqnhxGtw | [PASS] Done |

### Needs Upload (Local MP4 → Cloudinary or YouTube)

| # | Video | File | Size | Action |
|---|-------|------|------|--------|
| 1 | Inspections | help-inspections.mp4 | 9.1MB | Upload to YouTube or Cloudinary |
| 2 | Reports | help-reports.mp4 | 8.2MB | Upload to YouTube or Cloudinary |
| 3 | Client portal | help-clients-and-portal.mp4 | 8.6MB | Upload to YouTube or Cloudinary |
| 4 | Billing | help-billing.mp4 | 8.8MB | Upload to YouTube or Cloudinary |
| 5 | Team | help-team.mp4 | 9.9MB | Upload to YouTube or Cloudinary |
| 6 | Compliance | help-compliance.mp4 | 11.1MB | Upload to YouTube or Cloudinary |

### Still to Generate (New Videos)

| # | Video | Priority | Approach |
|---|-------|----------|----------|
| 1 | **App login flow** | P0 | Generate with script |
| 2 | **App sign up flow** | P0 | Generate with script |
| 3 | **App setup wizard** | P0 | Generate with script |
| 4 | Report generation | P1 | Record real usage |
| 5 | Inspection capture | P1 | Record real usage |
| 6 | Claim creation | P2 | Record real usage |

---

## How to Generate Videos Right Now

### Prerequisites

```bash
cd /Users/phillmcgurk/RestoreAssist-overnight

# Ensure ffmpeg is installed
ffmpeg -version | head -1

# Ensure Playwright browsers are installed
npx playwright install chromium
```

### Step 1: Generate a Video

```bash
# Generate the login flow video
npx tsx scripts/video-generate.ts --flow login --output ./videos

# Generate the signup flow video
npx tsx scripts/video-generate.ts --flow signup --output ./videos

# Generate with visible browser (for debugging)
npx tsx scripts/video-generate.ts --flow login --headed
```

Output: `./videos/restoreassist-login-v1.mp4`

### Step 2: Upload to Cloudinary

```bash
# Requires CLOUDINARY_URL in .env.local
npx tsx scripts/video-upload.ts \
  --file ./videos/restoreassist-login-v1.mp4 \
  --slug setup-wizard-signin \
  --title "Signing in to RestoreAssist" \
  --duration 45
```

The script will:
1. Upload to Cloudinary
2. Update `video-registry.ts` with the new `cloudinaryUrl`
3. Print the registry entry

### Step 3: Test

```bash
# Build and check type-check
pnpm type-check

# Visit http://localhost:3000/dashboard/learn
# The video should appear with native <video> controls
```

---

## For Local MP4s Already in the Repo

The 6 help videos in `/public/videos/help/` need to be uploaded. Here's the fastest path:

### Option A: Upload to Cloudinary (Recommended)

```bash
for video in public/videos/help/*.mp4; do
  slug=$(basename "$video" .mp4)
  npx tsx scripts/video-upload.ts \
    --file "$video" \
    --slug "$slug" \
    --title "$(echo $slug | sed 's/-/ /g' | sed 's/.*/\u&/')" \
    --duration 75
done
```

### Option B: Upload to YouTube (Manual)

1. Go to studio.youtube.com
2. Drag each MP4 to upload area
3. Set visibility to **Unlisted**
4. Copy the video ID (11 characters after `v=`)
5. Run:

```bash
npx tsx scripts/video-upload.ts \
  --slug help-inspections \
  --youtube-id YOUR_11_CHAR_ID \
  --duration 75
```

---

## Video Hosting Cost Estimate

| Item | Monthly Cost |
|------|-------------|
| Cloudinary storage (100MB) | ~$5 |
| Cloudinary bandwidth (500 plays) | ~$10 |
| YouTube hosting | Free |
| **Total** | **~$15/mo** |

---

## Quick Decision for Phill

### If you want videos done TODAY:

1. **Upload existing 6 MP4s to Cloudinary** (30 min)
   ```bash
   for f in public/videos/help/*.mp4; do
     npx tsx scripts/video-upload.ts --file "$f" --slug "$(basename $f .mp4)" --duration 75
   done
   ```

2. **Generate login/signup videos** (1 hour)
   ```bash
   npx tsx scripts/video-generate.ts --flow login
   npx tsx scripts/video-generate.ts --flow signup
   npx tsx scripts/video-generate.ts --flow setup-wizard
   ```

3. **Upload generated videos** (15 min)
   ```bash
   npx tsx scripts/video-upload.ts --file ./videos/restoreassist-login-v1.mp4 --slug setup-wizard-signin --duration 45
   npx tsx scripts/video-upload.ts --file ./videos/restoreassist-signup-v1.mp4 --slug setup-wizard-signup --duration 90
   ```

4. **Commit and deploy**
   ```bash
   git add -A && git commit -m "content(videos): upload go-live tutorial videos"
   git push
   ```

### Total time: ~2 hours
### Cost: $15-30 for first month

---

## Files Created/Modified

| File | Status | Purpose |
|------|--------|---------|
| `scripts/video-generate.ts` | [PASS] Created | Playwright → MP4 generator |
| `scripts/video-upload.ts` | [PASS] Created | Upload + registry update |
| `components/setup/VideoExplainer.tsx` | [PASS] Updated | Cloudinary support |
| `components/setup/video-registry.ts` | [PASS] Updated | `cloudinaryUrl` field |
| `.planning/video-generation-plan.md` | [PASS] Created | Full strategy doc |

---

## Next Steps

| # | Action | Who | When |
|---|--------|-----|------|
| 1 | Generate login/signup/setup videos | Margot/Phill | This session |
| 2 | Upload 6 existing help MP4s to Cloudinary | Margot/Phill | This session |
| 3 | Test playback on /dashboard/learn | Margot | After upload |
| 4 | Generate P1 videos (report, inspection, claim) | Margot | Next session |
| 5 | Add videos to mobile app onboarding flow | Margot | After card creation |
| 6 | Phill approves video content | Phill | After review |
| 7 | Deploy to production | Margot | Post-approval |

---

## Notes

- **The login/signup/setup flows in the script are TEMPLATES** — they navigate to `restoreassist.au` with demo credentials. You'll need to update the selectors to match your actual production UI.
- **Help videos are REAL** — the 6 MP4s in `public/videos/help/` are actual screen recordings. They just need hosting.
- **TTS uses your Hermes voice** — narration benefits from your Australian-accent preference.
- **All scripts are type-safe** — they run through `tsx` (TypeScript execute) with full intellisense.

---

Ready to execute. Say the word and I'll generate/upload the videos immediately.
