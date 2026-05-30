# RestoreAssist Go-Live Video Pipeline — Implementation Plan

> **Status**: Ready for execution  
> **Last updated**: 2026-05-30  
> **Owner**: Margot (Unite-Group agent)  
> **Files**: See package at end of this doc

---

## 1. Audit Summary

### What exists

**Setup/Onboarding (YouTube — LIVE)**
| # | Video | YouTube ID | Duration | Covers |
|---|-------|-----------|----------|--------|
| 1 | Sign in | tsmZpgLrn5Y | 0:30 | Login button, Google auth, dashboard |
| 2 | Sign up | wREGInp5yPQ | 1:00 | Registration, wizard start |
| 3 | Setup wizard | G2CIyp-gDKA | 2:00 | ABN, AI hydration, activate |
| 4 | Dashboard | sp3bMYSaZa8 | 2:00 | Jobs, claims, day one |
| 5 | Integrations | P6rVHLOVNsQ | 1:30 | Xero, MYOB, etc. |
| 6 | Health page | UHUiqnhxGtw | 1:00 | Status page |

**Help/Training (Local MP4 — NOT PRODUCTION)**
| # | Video | Path | Duration | Covers |
|---|-------|------|----------|--------|
| 1 | Inspections | /videos/help/... | 1:15 | Chain-of-custody capture |
| 2 | Reports | /videos/help/... | 1:15 | AI S500 reports |
| 3 | Client portal | /videos/help/... | 1:15 | Share reports |
| 4 | Billing | /videos/help/... | 1:15 | Trials, Stripe |
| 5 | Team | /videos/help/... | 1:15 | Invite technician |
| 6 | Compliance | /videos/help/... | 1:15 | IICRC citations |

### What's missing for go-live

| Priority | Video | Why missing | Approach |
|----------|-------|-------------|----------|
| **P0** | **Login flow (app)** | Only web YouTube exists | Playwright capture iOS/Android |
| **P0** | **Sign up flow (app)** | Only web YouTube exists | Playwright capture iOS/Android |
| **P0** | **Training mode** | No concept exists in app | Build training-mode + capture |
| **P1** | **Report generation** | Only help overview exists | Per-screen capture + stitch |
| **P1** | **Claim creation** | Fragmented across flows | Full workflow capture |
| **P2** | **Inspection capture (mobile)** | Local MP4 is placeholder | Real device + screen record |
| **P2** | **Team invite + verify** | Local MP4 is placeholder | Full flow capture |

---

## 2. Video Generation Strategy

### Option A: Playwright → Screen Recording (FAST — this session)

1. **Capture**: Use Playwright to navigate production URLs, capture screenshots per step
2. **Generate**: Use ffmpeg to stitch screenshots into MP4 with smooth transitions
3. **Voice**: Use text-to-speech for Australian-accent narration per step
4. **Output**: MP4 files ready for upload

```bash
# Per-flow script pattern
node scripts/video-generate.js \
  --flow login \
  --env production \
  --voice australian-male \
  --output ./videos/login-flow.mp4
```

**Pros**: No recording equipment, reproducible, easy to update when UI changes  
**Cons**: Slightly robotic, not "real finger on screen"

### Option B: Screen Recording Software (MANUAL)

1. **iOS**: Use built-in Screen Recording (Control Center)
2. **Android**: Use Android Studio Emulator recording
3. **Web**: QuickTime / OBS
4. **Edit**: iMovie / DaVinci Resolve
5. **Voice**: Record natural narration or use TTS

**Pros**: Real touch interactions, authentic  
**Cons**: Manual process, hard to reproduce on UI updates

### Option C: Remotion Programmatic (REQUIRES SETUP)

The repo already has `@remotion/lambda` installed but no composition defined.

1. **Build**: Create Remotion compositions with screenshots + animations
2. **Render**: Deploy to Lambda for parallel rendering
3. **Output**: 1080p MP4 files

**Pros**: Pixel-perfect, brand-consistent, scalable  
**Cons**: 2-4 hours setup, overkill for simple task videos

### RECOMMENDATION: Option A (Playwright + ffmpeg + TTS)

Fastest to production. We can automate everything from the command line.

---

## 3. Production Upload Strategy

### For App-Embedded Videos (Login, Sign up, Setup)

**Host**: Cloudinary (already connected in app)

```typescript
// Upload script
import { uploadFileToCloudinary } from "@/lib/cloudinary";

const result = await uploadFileToCloudinary(
  fs.readFileSync("./videos/login-flow.mp4"),
  "login-flow-v1",
  "video/mp4",
  "restoreassist-videos",
  { resourceType: "video", tags: ["onboarding", "login", "go-live-v1"] }
);
// result.url → https://res.cloudinary.com/.../restoreassist-videos/login-flow-v1.mp4
```

**Why**: Signed URLs, CDN delivery, automatic transcoding, already integrated

### For Public Help/Training Videos

**Host**: YouTube Unlisted → Embed via `VideoExplainer`

- Upload to YouTube Studio as Unlisted
- Grab 11-char video ID
- Update `video-registry.ts` with `youtubeId`

**Why**: Zero bandwidth cost, SEO benefit, familiar UX

### For Native Mobile App

**Host**: Bundle MP4s in app package + fallback to Cloudinary

- Store small videos (<5MB) in app bundle for offline
- Stream larger videos from Cloudinary when online

---

## 4. Generated Video Catalog (Go-Live Edition)

### P0 — Must Have

| # | Video ID | Flow | Duration | Steps | Voiceover |
|---|----------|------|----------|-------|-----------|
| 1 | `ra-login-01` | Open app → tap login → enter email → password → face-ID → dashboard | 0:45 | 6 | Welcome back to RestoreAssist. Tap Login, enter your email... |
| 2 | `ra-signup-01` | Open app → create account → business name → ABN → verify email → wizard | 1:30 | 8 | Welcome to RestoreAssist. Let's get your restoration business set up... |
| 3 | `ra-setup-wizard-01` | Wizard step 1 → step 2 → ... → activate | 2:00 | 5 | The Setup Wizard will walk you through five quick steps... |
| 4 | `ra-training-mode-01` | Enable training mode → walk through dummy claim → complete inspection | 3:00 | 10 | Training mode lets you practice without affecting real data... |

### P1 — Important

| # | Video ID | Flow | Duration | Steps |
|---|----------|------|----------|-------|
| 5 | `ra-report-gen-01` | Open claim → start report → AI draft → review → sign → share | 1:30 | 6 |
| 6 | `ra-claim-create-01` | New claim → address → insurer → room → damage type → severity | 1:00 | 6 |
| 7 | `ra-inspection-01` | Enter room → capture photos → annotate → chain-of-custody → save | 2:00 | 8 |

### P2 — Nice to Have

| # | Video ID | Flow | Duration |
|---|----------|------|----------|
| 8 | `ra-portal-01` | Client opens portal → views report → downloads PDF | 1:00 |
| 9 | `ra-team-invite-01` | Settings → invite tech → email sent → tech accepts → verify licence | 1:30 |
| 10 | `ra-billing-01` | Trial status → upgrade → Stripe checkout → receipt | 1:00 |

---

## 5. Technical Implementation Plan

### Step 1: Create Playwright capture script (30 min)

```bash
# scripts/generate-video.js
# Uses Playwright to capture screenshots at each step
# Uses ffmpeg to stitch into MP4
# Uses TTS for narration
```

### Step 2: Generate P0 videos (1 hour)

- login, signup, setup-wizard, training-mode
- Upload to Cloudinary
- Update `video-registry.ts` with `cloudinaryUrl` field

### Step 3: Update `VideoExplainer` component (15 min)

```typescript
// Add cloudinaryUrl support to RegistryEntry
export interface RegistryEntry {
  youtubeId?: string;
  localPath?: string;
  cloudinaryUrl?: string;  // NEW
  title: string;
  durationSec: number;
}

// Render cloudinary-hosted video
if (cloudinaryUrl) {
  return <video src={cloudinaryUrl} controls playsInline ... />;
}
```

### Step 4: Mobile app integration (30 min)

- Add video playback via Capacitor Media plugin
- Bundle critical videos in app binary
- Stream non-critical from Cloudinary

### Step 5: Generate P1/P2 videos (async — next session)

- Report generation, claim creation, inspection
- Upload to YouTube as Unlisted
- Update registry

---

## 6. Scripts Package

### Video Generation Script

Location: `scripts/video-generate.ts`
Purpose: Playwright-based screenshot → ffmpeg → MP4

### Video Upload Script

Location: `scripts/video-upload.ts`
Purpose: Upload MP4 to Cloudinary + update registry

### TTS Narration Script

Location: `scripts/video-tts.ts`
Purpose: Generate Australian-accent narration per step

---

## 7. Cost Estimate

| Item | Cost | Notes |
|------|------|-------|
| Cloudinary storage | ~$5/mo | 100MB video library |
| Cloudinary bandwidth | ~$10/mo | 500 views/month |
| YouTube hosting | Free | Unlisted videos |
| TTS generation | Free | Built-in Hermes TTS |
| Playwright execution | Free | Local browser automation |
| ffmpeg | Free | Open source |
| **Total** | **~$15/mo** | |

---

## 8. Go-Live Checklist

### Phase 1: Foundation (This session — 2 hours)

- [ ] Create `scripts/video-generate.ts` (Playwright capture)
- [ ] Create `scripts/video-upload.ts` (Cloudinary)
- [ ] Generate `ra-login-01` MP4
- [ ] Generate `ra-signup-01` MP4
- [ ] Generate `ra-setup-wizard-01` MP4
- [ ] Generate `ra-training-mode-01` MP4
- [ ] Upload all P0 videos to Cloudinary
- [ ] Update `VideoExplainer` for Cloudinary URLs
- [ ] Update `video-registry.ts` with new entries
- [ ] Test video playback in `/dashboard/learn`

### Phase 2: Polish (Next session — 1 hour)

- [ ] Generate P1 videos (report, claim, inspection)
- [ ] Generate P2 videos (portal, team, billing)
- [ ] Upload to YouTube as Unlisted
- [ ] Convert help videos from local MP4 to Cloudinary
- [ ] Mobile app integration (Capacitor)
- [ ] Offline playback test

### Phase 3: Go-Live Sign-Off

- [ ] All P0 videos verified on staging
- [ ] Video playback works on iOS + Android
- [ ] Video playback works on web (Chrome, Safari, Firefox)
- [ ] Accessibility: captions/subtitles available
- [ ] Analytics: views tracked
- [ ] Phill approval

---

## 9. Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `.planning/video-generation-plan.md` | Create | This document |
| `scripts/video-generate.ts` | Create | Playwright → MP4 |
| `scripts/video-upload.ts` | Create | Cloudinary upload |
| `scripts/video-tts.ts` | Create | TTS narration |
| `components/setup/video-registry.ts` | Update | Add cloudinaryUrl field |
| `components/setup/VideoExplainer.tsx` | Update | Cloudinary video player |
| `public/videos/` | Upload | Generated MP4s (temp) |
| `/dashboard/learn/page.tsx` | Update | Link new videos |

---

Ready to execute Phase 1. Phill — confirm and I'll start building the generation scripts immediately.
