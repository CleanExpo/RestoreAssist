/**
 * Content Pipeline — Barrel re-exports
 *
 * Autonomous content generation pipeline for RestoreAssist.
 * Topic selection -> script generation -> voiceover -> video render.
 *
 * @module lib/content-pipeline
 */

// Script generation (Claude API)
export { generateScript } from "./script-generator";
export type {
  ScriptData,
  ScriptGeneratorInput,
  Platform,
} from "./script-generator";

// Voice generation (ElevenLabs + Supabase)
export { generateVoice } from "./voice-generator";
export type { VoiceGeneratorInput } from "./voice-generator";

// Video submission (HeyGen)
export { submitVideo } from "./video-submitter";
export type { VideoSubmitterInput } from "./video-submitter";

// Topic selection (weighted random from DB)
export { selectNextTopic } from "./topic-selector";
export type { SelectedTopic } from "./topic-selector";

// Topic bank (seed definitions)
export { TOPIC_BANK, seedTopics } from "./topic-bank";
export type { TopicSeed } from "./topic-bank";

// Orchestrator (full pipeline engine)
export { runContentPipeline } from "./orchestrator";
export type { PipelineResult } from "./orchestrator";
