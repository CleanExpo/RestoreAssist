/**
 * RA-396: Voice Copilot — shared types for Phase 2.
 * Phase 2 uses Web Speech API for STT (browser-based demo).
 * Phase 3 will replace with WhisperKit (iOS) / Moonshine (Android) via Capacitor plugin.
 */

// ─── Session ──────────────────────────────────────────────────────────────────

export type VoiceCopilotMode = "guided" | "assisted" | "dictation";

export type VoiceSessionState =
  | "idle"
  | "listening"
  | "processing"
  | "responding";

export interface VoiceSession {
  sessionId: string;
  inspectionId: string;
  userId: string;
  mode: VoiceCopilotMode;
  state: VoiceSessionState;
  startedAt: string; // ISO
  observations: VoiceObservation[];
  missingItems: S500CompletionItem[];
}

// ─── Observations ─────────────────────────────────────────────────────────────

export type ObservationType =
  | "moisture_reading"
  | "room_entry"
  | "category_statement"
  | "class_statement"
  | "equipment_note"
  | "psychrometric"
  | "photo_note"
  | "general_note";

export interface VoiceObservation {
  id: string;
  sessionId: string;
  rawTranscript: string; // What the tech actually said
  type: ObservationType;
  parsed: ParsedObservation;
  confidence: "high" | "medium" | "low";
  needsConfirmation: boolean;
  confirmedAt?: string; // ISO — set when tech confirms verbally
  storedAt?: string; // ISO — set when written to DB
  createdAt: string; // ISO
}

export interface ParsedObservation {
  room?: string;
  value?: number;
  unit?: "%" | "WME" | "RH" | "°C" | "%" | "unknown";
  material?: string;
  category?: 1 | 2 | 3;
  damageClass?: 1 | 2 | 3 | 4;
  equipment?: string;
  note?: string;
  s500Section?: string;
}

// ─── S500:2025 Completion Checking ────────────────────────────────────────────

export type S500CompletionItemId =
  | "psychrometric_per_room"
  | "moisture_baseline_structural"
  | "water_source_photo"
  | "pre_drying_baseline"
  | "category_documented"
  | "class_with_area"
  | "equipment_serials"
  | "affected_materials"
  | "secondary_damage_indicators"
  | "scope_boundary";

export interface S500CompletionItem {
  id: S500CompletionItemId;
  label: string;
  s500Section: string;
  priority: 1 | 2 | 3; // 1 = must-have before leaving site
  complete: boolean;
  completedAt?: string;
  prompt: {
    guided: string; // Full instruction for junior tech
    assisted: string; // Brief prompt for mid-level
    dictation: string; // Exception-only alert for senior
  };
}

// ─── API shapes ───────────────────────────────────────────────────────────────

export interface CreateSessionRequest {
  inspectionId: string;
  mode?: VoiceCopilotMode;
}

export interface CreateSessionResponse {
  session: VoiceSession;
  greeting: string; // First thing the copilot says
  pendingItems: S500CompletionItem[];
}

export interface SubmitObservationRequest {
  sessionId: string;
  transcript: string; // Raw text from STT
}

export interface SubmitObservationResponse {
  observation: VoiceObservation;
  confirmationPrompt?: string; // What the copilot says back
  storedDirectly: boolean; // true if high-confidence, no confirmation needed
  updatedMissingItems: S500CompletionItem[];
}

export interface GetChecklistResponse {
  inspectionId: string;
  items: S500CompletionItem[];
  completedCount: number;
  totalCount: number;
  criticalMissing: S500CompletionItem[]; // priority 1 items not yet done
  readyToLeave: boolean;
}
