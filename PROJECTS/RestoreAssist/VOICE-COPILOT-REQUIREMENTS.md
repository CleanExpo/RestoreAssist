# Voice Copilot — Phase 2 Requirements Spec

**Issue:** RA-396
**Standard:** IICRC S500:2025
**Author:** Phill McGurk (founder, 15+ years field restoration experience)
**Status:** APPROVED — ready for agent build
**Date:** 2026-04-07

---

## Overview

Phase 2 voice copilot provides real-time AI guidance to restoration technicians on-site. It listens, watches (via phone camera), and talks — capturing S500:2025 evidence that gets missed most often in the field, without patronising experienced operators.

**Architecture (unchanged from Phase 1 spec):**

- On-device STT: WhisperKit (iOS) / Moonshine (Android) — <500 MB, works offline
- Cloud VLM: Claude Vision for damage classification and moisture pattern analysis
- On-device TTS: AVSpeechSynthesizer (iOS) / Android TextToSpeech — low latency
- End-to-end target: <15 seconds from observation to audio guidance
- Pattern: Salesforce Field Service hybrid — audio processing on-device, intelligence in cloud

---

## 1. Interaction Mode

**Primary:** Phone speaker + earbuds (interchangeable)

The tech holds the phone in one hand or clips it to their belt/vest. Voice in, voice out. Screen is secondary — used for moisture readings and photo capture only.

**Screen use cases:**

- Confirming a moisture reading value ("Did you mean 18.5% or 81.5%?")
- Displaying a moisture map as it builds
- Showing classification summary before the tech leaves site

**Never:** Force the tech to tap the screen mid-inspection to continue a voice flow. Voice should be fully self-contained.

---

## 2. Trigger Model

**Hybrid — three trigger types:**

### A. Missing Data Alerts (proactive, unprompted)

The AI flags when required S500:2025 evidence items haven't been captured within expected time windows.

Examples:

- "You haven't taken a moisture reading in the subfloor yet — it's been 8 minutes."
- "No photo of the water source logged. Can you get one before you leave?"
- "Psychrometric data missing — what's the ambient temp and RH in this room?"

### B. On-Demand Query (tech-initiated)

Tech asks a question, AI answers.

Examples:

- "What class is this?" → AI analyses latest moisture readings + visible damage → "Based on the readings you've logged — 18% in the wall cavity, 22% at the skirting — this looks like Class 2. Do you want me to log that?"
- "Is this Cat 2 or Cat 3?" → "The source is a washing machine overflow with no sewage contamination — that's Category 2. Confirm?"
- "What sections do I still need to complete for the report?"

### C. Observation Acknowledgment (passive, confirmatory)

AI confirms what it hears the tech say out loud, adds to the report.

Example:

- Tech says: "Moisture reading bathroom wall, 24 percent" → AI: "Got it — bathroom wall, 24% MC. Want me to flag that as elevated?" → Tech: "Yes" → logged.

**Not used:** Constant narration / unsolicited commentary. The AI only speaks when it has something useful to add. Silence is the default.

---

## 3. Data the AI Must Capture (S500:2025 Required Evidence)

These are the items most commonly missing from reports that cause insurance claim delays or rejections — ranked by field frequency:

| Priority | Missing item                                             | S500:2025 ref | Why it gets missed                                              |
| -------- | -------------------------------------------------------- | ------------- | --------------------------------------------------------------- |
| 1        | Psychrometric data (temp + RH) in every affected room    | §6            | Tech forgets to record — not visible in photos                  |
| 2        | Moisture readings at structural elements (studs, joists) | §8            | Requires drilling access holes — skipped under time pressure    |
| 3        | Water source photo (origin point)                        | §9            | Tech finds it, fixes it, moves on — no photo                    |
| 4        | Pre-drying moisture baseline for all affected materials  | §8, §12       | Not recorded until post-drying visit — baseline is gone         |
| 5        | Category classification justification                    | §7.1          | Assumed by tech, not documented                                 |
| 6        | Damage class with square meterage                        | §7.2          | Rough estimates only — no measurement                           |
| 7        | Equipment serial numbers and placement positions         | §14           | Logged in head, not in report                                   |
| 8        | Affected material list with quantities                   | §9            | Generic descriptions ("plasterboard walls") not specific enough |
| 9        | Secondary damage indicators (mould, efflorescence)       | §10.3         | Visible but not photographed                                    |
| 10       | Scope boundary — what's affected vs. adjacent            | §9            | Ambiguous boundaries cause scope creep disputes                 |

The voice copilot's primary job is ensuring items 1–5 are captured before the tech leaves site.

---

## 4. Environment Constraints

### Noise

Sites are loud. Running dehumidifiers, air movers, compressors, traffic. The STT model must handle:

- 60–80 dB ambient noise
- Tech speaking at normal volume from 30–60 cm (clip-on mic preferred; phone mic acceptable)
- Background machinery noise is constant, not intermittent

**Design implication:** STT confidence threshold must be higher than standard. Low-confidence transcriptions should be confirmed verbally ("Did you say 18 or 80?") before logging.

### PPE

- N95/P2 masks muffle speech — STT must account for muffled fricatives
- Nitrile gloves prevent touchscreen use — voice must be fully operable without screen
- Tyvek suits reduce phone pocket access — clip/belt mount assumed

### Connectivity

- Most residential sites: good 4G/5G
- Subfloor / roof cavity: often zero signal
- The copilot must queue observations locally and sync when connectivity restores — never lose a reading

### Hands

Both hands are often occupied (moisture meter + torch, or meter + notepad). Voice input replaces the need to type. The phone can be on a lanyard or clip — not necessarily in hand.

---

## 5. Trust Calibration

### Junior technician (0–3 years)

- Needs step-by-step guidance: "Next, take moisture readings at the base of every wall in this room."
- Benefits from S500:2025 section references: "S500:2025 §8 requires baseline readings on all affected materials."
- Wants confirmation: "Good — that's 8 readings in the bathroom. Bathroom is complete."

### Mid-level technician (3–8 years)

- Wants prompts, not instructions: "Bathroom — anything left to do here?"
- Doesn't want section numbers read out — just the action.
- Benefits from: completion checklists, time estimates, flagging unusual readings.

### Senior technician / site manager (8+ years)

- Does NOT want to be told what to do.
- Wants: exception alerts only ("Your bathroom reading of 42% is significantly above equilibrium — worth noting?"), not routine prompts.
- Wants: dictation mode — speak observations, AI structures them silently.
- Explicit opt-in for any proactive guidance.

**Implementation:** User profile has a `voiceCopilotMode` enum: `guided | assisted | dictation`. Defaulting to `assisted` for new users. Senior techs set to `dictation`.

---

## 6. Report Completeness Rules — Insurance Rejection Triggers

These are the specific fields that cause insurance claim rejections, from field experience and conversations with Australian insurers (IAG, Suncorp, QBE patterns):

| Rejection trigger                                    | Frequency   | Prevention                                           |
| ---------------------------------------------------- | ----------- | ---------------------------------------------------- |
| No documented water category (Cat 1/2/3)             | Very common | Auto-prompt at inspection start                      |
| Moisture readings taken but no baseline recorded     | Very common | Require baseline reading before equipment placement  |
| Photos not linked to room/location                   | Common      | GPS + room label required at photo capture           |
| Equipment log missing serial numbers                 | Common      | Serial number OCR or manual entry required           |
| Scope includes "affected areas" without measurements | Common      | AI prompts for m² estimate when area is mentioned    |
| No psychrometric readings                            | Common      | Required field — cannot submit report without        |
| Damage class not documented                          | Occasional  | Auto-calculated from readings, requires confirmation |
| Missing tech IICRC certification details             | Occasional  | Pre-filled from profile, shown in report             |
| No sign-off / declaration                            | Occasional  | Digital declaration with timestamp required          |

---

## 7. Phase 2 Build Scope

### In Scope (agent-executable)

1. **`lib/voice/session.ts`** — VoiceSession state machine: `idle → listening → processing → responding → idle`
2. **`lib/voice/transcript-parser.ts`** — Extract structured data from STT transcripts (moisture readings, room names, observations)
3. **`lib/voice/completion-checker.ts`** — Check inspection completeness against S500:2025 required fields; return missing items ranked by priority
4. **`lib/voice/prompts.ts`** — Mode-aware prompt templates for guided / assisted / dictation modes
5. **`POST /api/voice/session`** — Create/update voice session, return next prompt
6. **`POST /api/voice/observation`** — Accept a transcribed observation, parse it, store it, return confirmation
7. **`GET /api/voice/checklist`** — Return outstanding S500:2025 items for current inspection
8. **Mobile UI** — `/dashboard/inspections/[id]/voice` — voice session screen with waveform, transcript, and status

### Out of Scope (Phase 2)

- On-device STT integration (requires native Capacitor plugin — Phase 3)
- WhisperKit / Moonshine model download (requires native build)
- Camera vision in voice session (covered by RA-437 extract-reading endpoint — wire separately)

**Phase 2 uses browser Web Speech API as STT for web demo; native STT in Phase 3.**

---

## Acceptance Criteria

- [ ] Voice session can be started from an open inspection
- [ ] Tech can dictate a moisture reading verbally; it is parsed and stored
- [ ] Completion checker identifies top 3 missing S500:2025 items
- [ ] Mode switching (guided / assisted / dictation) changes prompt verbosity
- [ ] All observations sync to the inspection report in real time
- [ ] Works without screen interaction once session is started

---

_Related: RA-394 (inspection image schema — shared data capture design), RA-437 (vision meter extraction — can be triggered from voice session)_
