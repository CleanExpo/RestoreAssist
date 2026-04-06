# Sprint L Design: Mobile App Store Setup + AI Capabilities

**Date:** 2026-04-06
**Status:** Approved
**Tracks:** Parallel — App Store Setup (Track 1) + AI Capabilities (Track 2)

---

## Background

RestoreAssist is a Next.js App Router application served via Capacitor 8 as a server-hosted WebView (`restoreassist.com.au`). The Android and iOS app shells already exist with correct permissions declared. This sprint completes the path to both app stores and adds three AI-powered field tools for technicians.

---

## Track 1 — App Store Setup

### Goal

Publish RestoreAssist to Google Play Store and Apple App Store simultaneously using API-first automation rather than browser-based manual workflows. Both platforms expose comprehensive REST APIs that are more reliable than UI automation.

### 1.1 Google Play Publishing

**Authentication:** Google Play Developer API via `googleapis` npm package, authenticated with a service account JSON key. The key JSON is stored as a DigitalOcean App Platform secret (`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`).

**API route:** `app/api/admin/publish/google-play/route.ts`

- POST: create edit → upload AAB → set track → commit
- Returns `{ editId, status, trackName }` — stored in DB for audit trail
- Auth: `getServerSession` + admin role check

**CI/CD:** `.github/workflows/android-release.yml` (extends existing `android-build-field-app.yml`)

- Trigger: tag `android-v*`
- Steps: checkout → setup Java → Gradle build → sign AAB → upload via API route or direct googleapis call
- Secrets required: `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`

**User action required:** Register Google Play Developer account ($38 AUD one-time) at play.google.com/console, create a service account in Google Cloud Console, grant it "Release Manager" role in Play Console.

### 1.2 Apple App Store Publishing

**Authentication:** App Store Connect API using JWT (ES256). Key ID, Issuer ID, and private key (`.p8`) stored as secrets.

**API route:** `app/api/admin/publish/app-store/route.ts`

- POST: upload build metadata, submit for review, poll status
- Returns `{ buildId, status, reviewStatus }`
- Auth: `getServerSession` + admin role check

**CI/CD:** `.github/workflows/ios-release.yml`

- Trigger: tag `ios-v*`
- Runner: `macos-latest` (required for Xcode toolchain)
- Steps: checkout → setup Xcode → Fastlane `gym` (build IPA) → Fastlane `pilot` or direct ASC API upload
- Secrets required: `ASC_API_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY_BASE64`, `APPLE_TEAM_ID`, `IOS_CERTIFICATE_BASE64`, `IOS_PROVISIONING_PROFILE_BASE64`

**User action required:** Register Apple Developer Program ($149 AUD/yr) at developer.apple.com, create App Store Connect API key with "App Manager" role, export provisioning profile and distribution certificate.

### 1.3 Store Asset Generator

Screenshots at required dimensions are generated headlessly using Playwright.

**Script:** `scripts/generate-store-assets.ts`

- Launches local Next.js dev server
- Navigates to key screens: dashboard, job detail, NIR form, moisture readings, report preview
- Resizes viewport to each required dimension and captures screenshot
- Output: `store-assets/google-play/` and `store-assets/app-store/` directories

**Required dimensions:**

- Google Play: 1080×1920 (phone), 1200×1920 (7" tablet)
- App Store: 1290×2796 (iPhone 15 Pro Max), 2048×2732 (iPad Pro 12.9")

**API route:** `app/api/admin/publish/assets/route.ts`

- POST: triggers asset generation, returns signed URLs to generated screenshots

---

## Track 2 — AI Capabilities

### Goal

Three field-facing AI tools that work within the existing Capacitor mobile shell. All use existing permissions (camera, microphone) already declared in `Info.plist` and `AndroidManifest.xml`.

### 2.1 Voice Copilot

Two modes, one component: `components/voice/VoiceCopilot.tsx`

**Dictation mode (push-to-talk):**

- Technician holds button → `MediaRecorder` captures audio via `@capacitor/microphone`
- POST to `/api/voice/transcribe` → OpenAI Whisper API → transcribed text
- JS fills the currently focused form field (no page reload, no state reset)
- Use case: logging moisture readings, notes, observations hands-free in wet environments

**Conversational mode (IICRC guidance):**

- Technician speaks a question → same Whisper transcription path
- Transcription → RAG retrieval (see 2.3) → Claude synthesis → ElevenLabs TTS
- POST to `/api/voice/respond` → streams audio/mpeg back → Capacitor audio playback
- Answers include spoken citations: _"Per IICRC S500:2025 section 7.3..."_
- Use case: on-site compliance guidance without needing to search the standards manually

**New files:**

- `app/api/voice/transcribe/route.ts`
- `app/api/voice/respond/route.ts`
- `lib/voice/recorder.ts` — audio capture hook, WebM chunking, session state
- `components/voice/VoiceCopilot.tsx` — mode toggle, PTT button, visual feedback

**New env vars:** `OPENAI_API_KEY` (Whisper), `ELEVENLABS_API_KEY` (already exists), `ELEVENLABS_VOICE_ID` (already exists)

### 2.2 Vision Meter Reading Extraction

Technician taps "Scan Reading" → camera opens → image captured → Claude Vision extracts the numeric reading.

**Supported hardware:**

- **Delmhorst** J-Lite, BD-2100 (LED 7-segment display)
- **Protimeter** MMS3, Surveymaster (LCD display with scale bar)
- **Tramex** CMEX5, ME5 (analog dial + digital display)

**API route:** `app/api/vision/extract-reading/route.ts`

- POST: receives base64 JPEG + optional hint (meter brand if known)
- Claude Vision call with brand-specific prompt (Tramex analog dial parsing differs from LED)
- Returns `{ brand, model, value, unit, confidence }`
- Confidence < 0.7 → UI shows "Verify manually" warning and still pre-fills
- Confidence ≥ 0.7 → silently pre-fills moisture log field

**New files:**

- `app/api/vision/extract-reading/route.ts`
- `lib/vision/meter-prompts.ts` — brand-specific prompt templates per meter family

### 2.3 IICRC RAG Knowledge Base

**Problem with current approach:** `lib/standards-retrieval.ts` does live per-request processing — downloads PDFs from Google Drive, sends full text to Claude for extraction on every report generation call. This is slow (5–15s per request) and expensive.

**Upgrade:** Pre-index PDF chunks into pgvector. Retrieval becomes a single DB query (~50ms). The existing Google Drive integration (`lib/google-drive.ts`, `downloadDriveFile`) is reused for the one-time ingestion.

**Standards indexed:**

- `IICRC S500:2025` — Standard for Professional Water Damage Restoration (7th Ed)
- `IICRC S520:2023` — Standard for Professional Mould Remediation (3rd Ed)
- `IICRC S700:2022` — Standard for Professional Fire and Smoke Damage Restoration (2nd Ed)
- Any additional PDFs present in Google Drive folder `1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1` are also indexed

**Database changes:**

- Enable `pgvector` extension via migration
- New Prisma model `IicrcChunk`: `id`, `standard` (e.g., "S500"), `section` (e.g., "§7.3"), `content` (chunk text), `embedding Unsupported("vector(1536)")`, `createdAt`
- Migration: `npx prisma migrate dev --name add_iicrc_rag_pgvector`

**New files:**

- `scripts/ingest-iicrc.ts` — idempotent ingestion script (safe to re-run whenever PDFs are updated in Drive): Drive download → chunk (1000 tokens, 200 overlap) → `text-embedding-3-small` → upsert to `IicrcChunk` (upsert by content hash, not insert)
- `lib/rag/retrieve.ts` — cosine similarity query, returns top-5 chunks with `{ standard, section, content }`
- `lib/rag/embed.ts` — thin wrapper around `text-embedding-3-small`

**Upgrade path for `lib/standards-retrieval.ts`:**

- `retrieveRelevantStandards()` first attempts vector search via `lib/rag/retrieve.ts`
- Falls back to existing live Drive download path if vector store is empty (safe for zero-downtime rollout)

**New env vars:** `OPENAI_API_KEY` (shared with voice copilot for embeddings)

---

## Section 3 — Architecture Overview

### Deployment

Both tracks deploy into the same Next.js application on DigitalOcean App Platform (`king-prawn-app`, region: syd). No new services required.

```
RestoreAssist (Next.js / DigitalOcean App Platform)
│
├── Track 1 — App Store Setup (admin-only routes)
│   ├── app/api/admin/publish/google-play/route.ts
│   ├── app/api/admin/publish/app-store/route.ts
│   ├── app/api/admin/publish/assets/route.ts
│   └── .github/workflows/
│       ├── android-release.yml
│       └── ios-release.yml
│
└── Track 2 — AI Capabilities (field technician routes)
    ├── app/api/voice/transcribe/route.ts
    ├── app/api/voice/respond/route.ts
    ├── app/api/vision/extract-reading/route.ts
    ├── lib/rag/retrieve.ts
    ├── lib/rag/embed.ts
    ├── lib/vision/meter-prompts.ts
    ├── lib/voice/recorder.ts
    ├── components/voice/VoiceCopilot.tsx
    └── scripts/ingest-iicrc.ts
```

### Data Flows

**Google Play publish:**

```
Admin dashboard → POST /api/admin/publish/google-play
  → googleapis: createEdit → uploadBundle → assignTrack → commitEdit
  → { editId, status } stored in DB
```

**Apple App Store publish:**

```
Admin dashboard → POST /api/admin/publish/app-store
  → JWT-signed fetch to App Store Connect API
  → { buildId, reviewStatus } stored in DB
```

**Voice dictation:**

```
PTT button held → MediaRecorder (WebM) → release
  → POST /api/voice/transcribe → Whisper API
  → transcribed text → fills active form field
```

**Voice conversational:**

```
Question spoken → Whisper transcription
  → lib/rag/retrieve.ts (pgvector cosine search, top-5 chunks)
  → Claude: synthesise with citations
  → ElevenLabs TTS → audio/mpeg stream
  → Capacitor audio playback
```

**Vision meter extraction:**

```
Camera tap → @capacitor/camera → base64 JPEG
  → POST /api/vision/extract-reading → Claude Vision
  → { brand, model, value, unit, confidence }
  → confidence ≥ 0.7: silently pre-fills moisture log field
  → confidence < 0.7: pre-fills + "Verify manually" warning
```

**RAG ingestion (one-time):**

```
scripts/ingest-iicrc.ts
  → downloadDriveFile() from lib/google-drive.ts
  → chunk PDFs (1000 tokens, 200 overlap)
  → text-embedding-3-small → vector(1536)
  → INSERT INTO IicrcChunk
```

### Shared Infrastructure

| Concern              | Solution                                                           |
| -------------------- | ------------------------------------------------------------------ |
| Auth on admin routes | Existing `getServerSession` + admin role check                     |
| Auth on field routes | Existing `getServerSession` (all users)                            |
| Database             | Existing Postgres + pgvector extension                             |
| Mobile permissions   | Camera + mic already in `Info.plist` and `AndroidManifest.xml`     |
| Secrets management   | DigitalOcean App Platform secrets (same pattern as existing)       |
| Standards PDFs       | Already in Google Drive folder `1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1` |
| Cron/scheduling      | Track 1 uses GitHub Actions tags — no new DO scheduled tasks       |

### New Environment Variables Required

| Variable                           | Track   | Where to add                            |
| ---------------------------------- | ------- | --------------------------------------- |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Track 1 | DO App Platform + GitHub Actions secret |
| `ASC_API_KEY_ID`                   | Track 1 | DO App Platform + GitHub Actions secret |
| `ASC_ISSUER_ID`                    | Track 1 | DO App Platform + GitHub Actions secret |
| `ASC_PRIVATE_KEY_BASE64`           | Track 1 | GitHub Actions secret only              |
| `APPLE_TEAM_ID`                    | Track 1 | GitHub Actions secret                   |
| `IOS_CERTIFICATE_BASE64`           | Track 1 | GitHub Actions secret                   |
| `IOS_PROVISIONING_PROFILE_BASE64`  | Track 1 | GitHub Actions secret                   |
| `OPENAI_API_KEY`                   | Track 2 | DO App Platform                         |

### User Actions Required (Before Implementation Can Complete)

1. **Register Google Play Developer account** — play.google.com/console ($38 AUD one-time)
2. **Create Google Play service account** — Google Cloud Console → grant "Release Manager" in Play Console → export JSON key
3. **Register Apple Developer Program** — developer.apple.com ($149 AUD/yr)
4. **Create App Store Connect API key** — "App Manager" role → download `.p8` private key file
5. **Create iOS distribution certificate + provisioning profile** — via Xcode or Apple Developer portal

---

## Out of Scope

- Push notifications (separate sprint)
- In-app purchases / subscription billing via App Store (Stripe handles billing on web)
- S540 (Trauma/Crime Scene) conversational guidance — standard not currently integrated in app logic
- Android/iOS specific UI shell changes — Capacitor WebView handles all UI
- Ultraplan (explicitly excluded per user decision)
