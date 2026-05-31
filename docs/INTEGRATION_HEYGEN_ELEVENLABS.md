# HeyGen + ElevenLabs Integration Guide

Status: IN PROGRESS — Waiting for production API keys and custom avatar upload.

## 1. What was built

| Component | Path | Purpose |
|-----------|------|---------|
| AvatarOrb (React) | `components/avatar/AvatarOrb.tsx` | Circular floating avatar on landing page |
| HeyGen API client | `lib/heygen/client.ts` | Video generation, streaming token, avatar listing |
| ElevenLabs API client | `lib/elevenlabs/client.ts` | TTS, SFX, voice isolation |
| HeyGen video proxy | `app/api/heygen/route.ts` | POST/GET server-side HeyGen proxy |
| ElevenLabs voice proxy | `app/api/elevenlabs/voice/route.ts` | TTS streaming proxy |
| ElevenLabs SFX proxy | `app/api/elevenlabs/sfx/route.ts` | Sound effects proxy |
| Placeholder avatar SVG | `public/avatars/phill-mcgurk-orb.svg` | Branded static orb image |
| .env.example | Root | Updated with production-ready comments |
| Landing page integration | `app/page.tsx` | AvatarOrb embedded in hero bottom-left |

## 2. Next steps to go live

### Step A — Get credentials

1. Create HeyGen account: https://www.heygen.com
   - Subscribe to **Starter plan** ($24/mo) for custom avatars
   - Generate API key: Dashboard → API Access → Create API Key

2. Create ElevenLabs account: https://elevenlabs.io
   - Subscribe to **Creator plan** ($11/mo) for commercial rights
   - Generate API key: Profile → API Keys

### Step B — Create your custom avatar

1. Film 2 minutes of yourself (Phill McGurk) against a neutral background:
   - Facing the camera, head-and-shoulders visible
   - No greenscreen needed — HeyGen handles extraction
   - Speak naturally, maintain eye contact

2. Upload in HeyGen dashboard:
   - Avatars → Create Avatar → Upload video
   - Wait ~1 hour for processing (instant for stock avatars, custom takes longer)

3. Copy the `avatar_id` from the HeyGen dashboard → put it in `.env.local`:
   ```
   HEYGEN_API_KEY="hg_..."
   HEYGEN_AVATAR_ID="abc123..."
   ```

### Step C — Test video generation

```bash
# 1. Set your .env.local credentials
# 2. Generate a first greeting video

npx tsx scripts/heygen-generate.ts \
  --avatar-id "$HEYGEN_AVATAR_ID" \
  --script "G'day, I'm Phill McGurk, founder of RestoreAssist. Our CRM was built right here in Australia for restoration contractors. One system for office and field, fewer gaps, more confidence. Let's get started." \
  --output ./public/videos/heygen/phill-greeting.mp4
```

### Step D — Test voice generation (ElevenLabs)

```bash
# Generate a sample narration variant
npx tsx scripts/elevenlabs-generate.ts \
  --text "Welcome to RestoreAssist. Australia's purpose-built CRM for restoration contractors." \
  --output ./public/audio/narration-sample.mp3
```

### Step E — Deploy

```bash
# Add production vars to Vercel
npx vercel env add HEYGEN_API_KEY production
npx vercel env add HEYGEN_AVATAR_ID production
npx vercel env add ELEVENLABS_API_KEY production

# Deploy
git push origin main
```

## 3. Brand voice settings

Luca (primary) — ElevenLabs voice ID: `onwK4e9ZLuTAKqWW03F9`

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| Model | eleven_multilingual_v2 | Best English + warmth |
| Stability | 0.55 | Natural cadence, minimal drift |
| Similarity boost | 0.80 | Lip-sync fidelity for HeyGen |
| Style | 0.25 | Controlled expressiveness |
| Background | #1C2E47 | RestoreAssist navy |

## 4. Pricing estimate (monthly)

| Service | Plan | Monthly |
|---------|------|---------|
| HeyGen Starter | Custom avatar + 15 min video/mo | ~$24 |
| ElevenLabs Creator | 100 char credits/second | ~$11 |
| **Total** | | **~$35/mo** |

Scale: as you add more videos, upgrade HeyGen to Growth ($69/mo for 60 min).

## 5. Content pipeline for persona videos

Using the AvatarOrb + HeyGen combo, you can generate:

| Market | Video | Script source |
|--------|-------|---------------|
| Customer | "What happens to my flooded home" | 2-3 min FAQ |
| Service Company | "Win more insurance-assessed work" | ROI explainer |
| Broker | "Audit-ready documentation" | Compliance pitch |

All scripts should be under 5000 characters (HeyGen limit). Multi-part videos are generated separately and stitched with ffmpeg.

---
Last updated: 2026-05-31
Owner: Senior Project Manager (RestoreAssist)
