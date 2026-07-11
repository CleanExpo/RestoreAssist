/**
 * RestoreAssist — AI Front Desk configuration (SKELETON / EXAMPLE).
 *
 * Copy to `frontdesk.config.ts` and fill real values when the shared
 * `@nexus/front-desk` package lands. Ships dark until `RESTOREASSIST_FRONT_DESK_ENABLED=true`.
 * This example file is illustrative only and is not imported by the build.
 */

export interface FrontDeskConfig {
  /** Stable project key. */
  project: string;
  /** Enable flag — reads process.env.RESTOREASSIST_FRONT_DESK_ENABLED. Default off. */
  enabled: boolean;
  /** Assistant display name + brand tokens (reuse this app's design tokens). */
  brand: { assistantName: string; accent: string; logoUrl?: string };
  /** Distinct ElevenLabs voice for this brand. */
  voice: { provider: 'elevenlabs'; voiceId: string; locale: 'en-AU' };
  /** Where the agent's answers are grounded. */
  knowledge: { kind: 'existing-assistant' | 'vector' | 'prompt'; source: string };
  /** Channel priority for this brand. */
  channels: Array<'chat' | 'voice' | 'phone-in' | 'phone-out'>;
  /** Managed media vendor (anchor at kickoff). */
  vendor: 'elevenlabs' | 'vapi' | 'livekit';
  /** Dedicated AU number (BYO SIP), or null until provisioned. */
  phoneNumber: string | null;
  /** Tool adapters this brand exposes to the agent. */
  tools: string[];
  /** Australian compliance profile (shared rules, per-brand identity). */
  compliance: {
    businessIdentity: string;
    recordingDisclosure: boolean;
    aiDisclosure: boolean;
    dncrScrub: boolean;
  };
}

export const config: FrontDeskConfig = {
  project: 'restoreassist',
  enabled: process.env.RESTOREASSIST_FRONT_DESK_ENABLED === 'true',
  brand: { assistantName: 'the RestoreAssist assistant', accent: '#000000' /* TODO brand accent */ },
  voice: { provider: 'elevenlabs', voiceId: 'TODO_RESTOREASSIST_VOICE_ID', locale: 'en-AU' },
  knowledge: { kind: 'prompt', source: 'TODO — this brand\'s knowledge base' },
  channels: ['chat', 'voice', 'phone-in', 'phone-out'],
  vendor: 'elevenlabs',
  phoneNumber: null,
  tools: ['knowledge', 'email', 'data', 'billing', 'human handoff'],
  compliance: {
    businessIdentity: 'RestoreAssist',
    recordingDisclosure: true,
    aiDisclosure: true,
    dncrScrub: true,
  },
};
