import { describe, it, expect } from "vitest";
import { buildTtsBody } from "../elevenlabs-tts";

describe("buildTtsBody", () => {
  it("uses the multilingual model and the canonical voice settings", () => {
    const body = buildTtsBody("Hello");
    expect(body).toEqual({
      text: "Hello",
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    });
  });
});
