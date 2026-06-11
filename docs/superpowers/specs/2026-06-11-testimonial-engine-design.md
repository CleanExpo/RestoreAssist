# Testimonial Engine — v1 Design

> Status: Draft for review · Date: 2026-06-11 · Owner: RestoreAssist/Synthex
> Builds on: the client claim portal (#1289–#1301) and the claim/inspection data model.

## 1. Problem & opportunity

Every closed restoration claim ends at a moment of peak homeowner goodwill, and we
already hold a uniquely rich record of the job: before/after photos, the moisture
dry-down curve, an IICRC-compliant scope, signed authorities, and a timeline. No
generic "leave us a review" tool can draw on that. The opportunity is to convert
that moment + data into the highest-trust marketing asset a restoration contractor
can own: a **produced video testimonial in the homeowner's own voice**, made to look
professional using the claim's real evidence.

Serves both sides:

- **Our client (the contractor):** a steady stream of publish-ready, branded video
  testimonials → reputation, local ranking, and new-job conversion.
- **Their client (the homeowner):** a frictionless, dignified way to say thanks,
  with consent and privacy respected throughout.

## 2. Scope

**In (v1):**

1. Homeowner records a guided selfie testimonial on the portal they already use.
2. Explicit media-release consent (reusing the authority-signing primitives).
3. Auto-production into a branded video (captions + before/after + dry-down + brand).
4. Contractor reviews and approves (or discards) before anything is publishable.
5. Distribution: downloadable MP4 + a shareable hosted link + copy-for-Google/social.

**Out (later sub-projects, each its own spec):**

- Written / SEO case-study page (v1.1 — reuses this engine's transcript + assets).
- Referral / word-of-mouth loop.
- Insurer-facing quality record.

The v1 artifact is a **video testimonial**, _not_ the written case study; the two are
distinct deliverables. The written case-study page is explicitly deferred.

## 3. Actors & flow

### Homeowner (on the existing `/portal/[token]`)

1. At claim close (status `COMPLETED` / report ready), a "Share your experience" card
   appears on the portal.
2. They read a one-line media-release and sign it (typed signature, the same
   primitive as authority forms) — this is the consent gate.
3. They record 30–60s answering 2–3 guided teleprompter prompts (browser
   `MediaRecorder`). Re-record allowed; submit when happy.
4. Confirmation: "Thanks — your installer will finalise and share this."

### Contractor (dashboard, inspection page)

1. A "Testimonial ready to review" item appears once production completes.
2. Preview the produced video.
3. **Approve** (enables download + share link) or **Discard** (purges raw + produced
   files).
4. Optional manual **"Request testimonial"** button to trigger the invite before
   auto-close (e.g. mid-job milestone).

**Two-key publish rule:** nothing is publishable without BOTH homeowner consent AND
contractor approval.

## 4. Architecture / pipeline

Each stage is an isolated, independently testable unit communicating through the DB
state machine + the existing job queue.

```
[Portal capture] --upload--> [Private storage + signed URL]   (reuse #45 originals-only pattern)
       |                              |
   consent sign                   enqueue job                  (reuse mirror-queue pattern)
       v                              v
[TestimonialRequest]  ---->  [Transcribe: Whisper API] ----> [Remotion Lambda render]
                                                                    |
                                                       produced MP4 -> private storage
                                                                    v
                                              [Contractor approval gate] --approve--> [Distribution]
```

- **Capture:** browser `MediaRecorder` on the portal; chunked upload to a token-gated
  route (same defence chain as the evidence route: rate-limit → BotID → CSRF → token).
- **Storage:** raw + produced files in the **private** bucket, signed-URL only
  (reusing the `originalsOnly` upload path from #1297). Never public pre-approval.
- **Queue:** reuse the existing `StorageMirrorJob`-style queue pattern for the
  transcribe→render pipeline (idempotent, retry with backoff).
- **Transcription:** Whisper API → caption cues (start/end/text) stored on the asset.
- **Render:** Remotion Lambda (native to `packages/videos`), pay-per-render, scales
  per claim with zero server ops.

## 5. Produced composition (Remotion template)

Segments, in order:

1. **Branded intro** (contractor logo + property suburb + job type) — **TTS voiceover**
   (no silent segment; honours the locked "always voiceover / never silent MP4" rule).
2. **Homeowner clip** with burned-in captions from the transcript — the homeowner's
   **own audio** is the asset (never silent).
3. **Proof intercut** — before/after photos + the moisture dry-down chart, drawn from
   the claim record — **TTS voiceover** narrating the proof (no silent segment).
4. **Outro** — contractor brand + CTA — **TTS voiceover**.

Audio rule (explicit): the human voice carries the testimonial body; every
non-testimonial segment carries TTS voiceover, so no part of the MP4 is ever silent.

## 6. Data model (new)

```
model TestimonialRequest {
  id            String   @id @default(cuid())
  inspectionId  String                      // links to the claim
  status        String                      // state machine (see below)
  consentSignatureId String?                // FK to the authority-signature primitive
  invitedAt     DateTime @default(now())
  recordedAt    DateTime?
  approvedAt    DateTime?
  publishedAt   DateTime?
  discardedAt   DateTime?
  @@index([inspectionId])
}

model TestimonialAsset {
  id             String   @id @default(cuid())
  requestId      String   @unique
  rawClipPath    String?                     // private storage path
  transcript     Json?                       // caption cues
  producedPath   String?                     // private storage path (final MP4)
  durationMs     Int?
  createdAt      DateTime @default(now())
}
```

**State machine:** `invited → recorded → consented → processing → ready → approved →
published` with a terminal `discarded` reachable from any pre-publish state. Consent
gating and the two-key publish rule are enforced as pure functions (unit-tested).

## 7. Privacy, consent & security

- Homeowner video is sensitive PII (face + property) → **private bucket, signed-URL
  only**, never public before approval.
- **Consent** is a stored, timestamped media-release signature (reuse authority-sign:
  IP/UA capture, atomic, immutable). No production starts without it.
- **Discard purges** raw + produced files from storage.
- All capture routes inherit the portal defence chain (rate-limit fail-closed →
  BotID → CSRF → token-resolve-only, no IDOR).
- Contractor-side routes are authed + tenancy-gated (`assertInspectionTenancy`).

## 8. Distribution (v1)

Approved video →

- downloadable MP4 (signed URL),
- a hosted shareable link (consent + approval gated),
- one-click copy/share for Google Business & social.

Per-contractor testimonial **gallery page** is v1.1.

## 9. Testing strategy

- **Unit (pure):** state machine transitions, consent/two-key gating, teleprompter
  prompt selection, caption-cue mapping.
- **Integration (mocked):** each pipeline stage (upload → enqueue → transcribe →
  render → approve), with the storage + queue + Whisper + Lambda boundaries mocked.
- **Render smoke:** one real Remotion Lambda render of a fixture claim.
- **Security:** negative tests — no production without consent; no publish without
  approval; private assets never resolve to a public URL; tenancy-denied (403).

## 10. Triggers

- **Automatic:** claim close (`COMPLETED` / report ready) surfaces the portal card.
- **Manual:** contractor "Request testimonial" button on the inspection page.

## 11. Build sequencing (for the implementation plan)

1. Data model + state machine (pure, TDD) — unblocks all.
2. Consent gate (reuse authority-sign) + portal capture UI + token-gated upload route.
3. Pipeline: queue job → Whisper transcription → asset persistence.
4. Remotion Lambda composition template + render stage.
5. Contractor review/approve UI + two-key publish gate.
6. Distribution (download + share link + copy-for-social).
7. Triggers (auto at close + manual button).

First demoable slice: **capture + consent + a minimal produced render** (segments 1–4
of the composition) approved and downloadable — the smallest end-to-end proof.
