# HeyGen + ElevenLabs Integration Guide

Status: ACTIVE — Synthex proxy architecture implemented. Waiting for service token exchange.

## Architecture

RestoreAssist does **not** hold HeyGen or ElevenLabs API keys directly. Instead, it proxies all avatar/voice requests to **Synthex** (`https://synthex.social`), which holds the canonical credentials and CEO voice clone (`aGkVQvWUZi16EH8aZJvT`).

```
RestoreAssist  →  Synthex  →  HeyGen / ElevenLabs
     │                │
     │  X-Service-Token │  HEYGEN_API_KEY
     │  X-Source-App    │  ELEVENLABS_API_KEY
     └──────────────────┘  CEO_VOICE_ID
```

## Files

| Component | Path | Purpose |
|-----------|------|---------|
| Synthex service client | `lib/synthex/client.ts` | Cross-product proxy client |
| AvatarOrb (React) | `components/avatar/AvatarOrb.tsx` | Circular floating avatar on landing page |
| HeyGen video proxy | `app/api/heygen/route.ts` | POST/GET → Synthex `/api/media/generate/video` |
| ElevenLabs voice proxy | `app/api/elevenlabs/voice/route.ts` | TTS → Synthex `/api/media/generate/voice` |
| ElevenLabs SFX proxy | `app/api/elevenlabs/sfx/route.ts` | Direct ElevenLabs (Synthex does not proxy SFX) |
| Placeholder avatar SVG | `public/avatars/phill-mcgurk-orb.svg` | Branded static orb image |
| Landing page integration | `app/page.tsx` | AvatarOrb embedded in hero bottom-left |

## Environment Variables

Add to `.env.local`:

```bash
# Synthex Service Proxy
SYNTHEX_BASE_URL="https://synthex.social"
SYNTHEX_SERVICE_TOKEN="your-shared-secret-here"

# Direct ElevenLabs (only needed for SFX — Synthex does not proxy sound effects)
ELEVENLABS_API_KEY=""
```

## Service Token Setup

1. Generate a shared secret:
   ```bash
   openssl rand -hex 32
   ```

2. Add it to **RestoreAssist** `.env.local` as `SYNTHEX_SERVICE_TOKEN`

3. Add the same value to **Synthex** Vercel env (or `.env.local`):
   ```bash
   # In Synthex project
   npx vercel env add SYNTHEX_SERVICE_TOKEN production
   # Value: same secret as above
   ```

4. Synthex must validate `X-Service-Token` on incoming requests from RestoreAssist.
   (This requires a small middleware update in Synthex — see "Synthex Side" below.)

## API Usage

### Generate avatar video

```bash
curl -X POST https://restoreassist.app/api/heygen \
  -H "Content-Type: application/json" \
  -d '{
    "script": "G'day, I'm Phill McGurk...",
    "aspect_ratio": "16:9"
  }'
```

Response:
```json
{
  "video_id": "vid_abc123",
  "status": "pending",
  "poll_url": "/api/heygen?video_id=vid_abc123&provider=synthesia",
  "poll_interval": 5000
}
```

### Poll for video status

```bash
curl "https://restoreassist.app/api/heygen?video_id=vid_abc123&provider=synthesia"
```

### Generate voice (TTS)

```bash
curl -X POST https://restoreassist.app/api/elevenlabs/voice \
  -H "Content-Type: application/json" \
  -d '{"text": "Welcome to RestoreAssist."}' \
  --output narration.mp3
```

### Stream voice (real-time)

```bash
curl -X POST https://restoreassist.app/api/elevenlabs/voice \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello", "stream": true}' \
  --output stream.mp3
```

### List voices

```bash
curl "https://restoreassist.app/api/elevenlabs/voice?type=all"
```

## Brand Voice Settings

CEO Clone (primary) — ElevenLabs voice ID: `aGkVQvWUZi16EH8aZJvT`

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| Model | eleven_multilingual_v2 | Best English + warmth |
| Stability | 0.55 | Natural cadence, minimal drift |
| Similarity boost | 0.80 | Lip-sync fidelity for avatar video |
| Style | 0.25 | Controlled expressiveness |
| Background | #1C2E47 | RestoreAssist navy |

## Synthex Side (Required)

Synthex must accept cross-product requests. Add middleware to validate `X-Service-Token`:

```typescript
// In Synthex: middleware or route guard
const SERVICE_TOKENS = new Set([
  process.env.SYNTHEX_SERVICE_TOKEN, // shared with RestoreAssist
]);

function validateServiceToken(req: NextRequest): boolean {
  const token = req.headers.get("x-service-token");
  return token ? SERVICE_TOKENS.has(token) : false;
}
```

If token is invalid, return `401 Unauthorized`.

## Pricing

RestoreAssist pays **nothing directly** to HeyGen/ElevenLabs. Costs are consolidated under Synthex:

| Service | Plan | Monthly |
|---------|------|---------|
| HeyGen Starter | Custom avatar + 15 min video/mo | ~$24 |
| ElevenLabs Creator | 100 char credits/second | ~$11 |
| **Total via Synthex** | | **~$35/mo** |

## Content Pipeline for Persona Videos

Using the AvatarOrb + Synthex proxy, generate:

| Market | Video | Script source |
|--------|-------|---------------|
| Customer | "What happens to my flooded home" | 2-3 min FAQ |
| Service Company | "Win more insurance-assessed work" | ROI explainer |
| Broker | "Audit-ready documentation" | Compliance pitch |

All scripts should be under 5000 characters. Multi-part videos are generated separately and stitched with ffmpeg.

## Security Notes

- `SYNTHEX_SERVICE_TOKEN` must be rotated quarterly
- Token is shared only between RestoreAssist and Synthex
- Never log the token or expose it client-side
- Synthex should rate-limit by `X-Source-App` to prevent abuse

---
Last updated: 2026-06-01
Owner: Senior Project Manager (RestoreAssist)
