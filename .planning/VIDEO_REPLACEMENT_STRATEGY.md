# RestoreAssist Video Replacement Strategy

> **Date**: 2026-05-30  
> **Status**: Phase 1 complete (generated videos deployed). Phase 2 ready when time permits.  
> **Location**: `/Users/phillmcgurk/RestoreAssist-overnight/.planning/`

---

## Current State (Phase 1 — DONE)

| Category | Count | Quality | Source |
|----------|-------|---------|--------|
| Tutorial videos | 9 | Medium | Auto-generated branded animations |
| Help videos | 6 | High | Real screen recordings |
| YouTube onboarding | 6 | High | Professional recordings |

**Total**: 21 videos in registry, 15 MP4 files deployed to `public/videos/`

---

## Phase 2: Replacement Priority Matrix

### P0 — Replace ASAP (user-facing onboarding)

These are the first impression videos. Real app recordings will significantly improve conversion.

| # | Video | Current | Replacement | Effort | Impact |
|---|-------|---------|-------------|--------|--------|
| 1 | **Login** | 30s branded animation | Real screen recording of login flow | 30 min | High |
| 2 | **Signup** | 38s branded animation | Real screen recording of signup flow | 30 min | High |
| 3 | **Setup Wizard** | 39s branded animation | Real screen recording of wizard | 45 min | High |

### P1 — Replace before scale (core features)

| # | Video | Current | Replacement | Effort | Impact |
|---|-------|---------|-------------|--------|--------|
| 4 | **Dashboard** | 29s branded animation | Real dashboard walkthrough | 30 min | Medium |
| 5 | **Inspections** | 31s branded animation | Real inspection capture flow | 45 min | High |
| 6 | **Reports** | 31s branded animation | Real report generation flow | 45 min | High |

### P2 — Nice to have (admin/features)

| # | Video | Current | Replacement | Effort | Impact |
|---|-------|---------|-------------|--------|--------|
| 7 | **Billing** | 29s branded animation | Real Stripe checkout flow | 30 min | Low |
| 8 | **Team** | 29s branded animation | Real team invitation flow | 30 min | Low |
| 9 | **Compliance** | 30s branded animation | Real compliance features | 30 min | Low |

---

## How to Record Replacements

### Option A: iOS Screen Recording (Recommended)

**Best for**: Login, signup, dashboard, billing

1. Open RestoreAssist app on iPhone/iPad
2. Settings → Control Centre → Add "Screen Recording"
3. Open Control Centre → tap Screen Recording button
4. Walk through the flow naturally
5. Stop recording → video saves to Photos
6. AirDrop to Mac → edit in iMovie (trim start/end, add logo)
7. Export as 720p MP4 → replace file in `public/videos/tutorials/`

**Time per video**: 15-30 minutes

### Option B: macOS QuickTime + Safari

**Best for**: Setup wizard, team management, compliance

1. Open Safari → navigate to restoreassist.au
2. QuickTime Player → File → New Screen Recording
3. Select browser window → record
4. Walk through flow
5. Trim in QuickTime → export as 720p
6. Replace file in `public/videos/tutorials/`

**Time per video**: 15-30 minutes

### Option C: Professional (Fiverr/Upwork)

**Best for**: All videos at once

1. Hire voiceover artist + screen recorder on Fiverr
2. Provide script from `scripts/video-branded.ts` flow definitions
3. Receive edited MP4s
4. Replace files in `public/videos/tutorials/`

**Cost**: $200-500 for all 9 videos  
**Time**: 3-5 days turnaround

---

## Replacement Workflow

```bash
cd /Users/phillmcgurk/RestoreAssist-overnight

# 1. Record new video (e.g., login)
#    Save as: restoreassist-login-v2.mp4

# 2. Replace the file
mv ~/Desktop/restoreassist-login-v2.mp4 public/videos/tutorials/restoreassist-login-v1.mp4

# 3. Update registry (if title/duration changed)
#    Edit: components/setup/video-registry.ts

# 4. Commit and deploy
git add public/videos/tutorials/restoreassist-login-v1.mp4 components/setup/video-registry.ts
git commit -m "feat(videos): replace login tutorial with real recording"
git push origin codex/overnight-production-readiness
```

---

## Quality Checklist for Replacements

- [ ] **Resolution**: 1280x720 minimum (1920x1080 preferred)
- [ ] **Duration**: 30-90 seconds (match current)
- [ ] **Audio**: Clear voiceover or background music
- [ ] **Branding**: RestoreAssist logo visible or watermark
- [ ] **Captions**: Optional but recommended for accessibility
- [ ] **File size**: Under 20MB per video
- [ ] **Format**: MP4 (H.264)

---

## Scripts Available

| Script | Purpose |
|--------|---------|
| `scripts/video-branded.ts` | Generate new branded animations (if needed) |
| `scripts/video-upload-cloudinary.ts` | Upload to Cloudinary CDN |
| `scripts/video-generate.ts` | Playwright screenshot-based generation |

---

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-05-30 | Deploy generated videos as v1 | Go-live deadline — real recordings take time |
| 2026-05-30 | Keep help videos as-is | Already high-quality real recordings |
| 2026-05-30 | Create replacement strategy | Clear path to upgrade without blocking launch |

---

## Next Actions

| Priority | Action | Owner | When |
|----------|--------|-------|------|
| P0 | Record login tutorial on iOS | Phill | This week |
| P0 | Record signup tutorial on iOS | Phill | This week |
| P0 | Record setup wizard in Safari | Phill | This week |
| P1 | Record inspections flow | Phill | Next week |
| P1 | Record reports generation | Phill | Next week |
| P2 | Consider Fiverr for all 9 | Margot | If Phill too busy |

---

**Bottom line**: Current videos are good enough for go-live. Replacements will improve conversion but aren't blockers.
