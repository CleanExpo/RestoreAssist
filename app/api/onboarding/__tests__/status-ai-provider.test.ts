import { describe, it, expect } from "vitest";
import { AI_PROVIDER_ROUTE } from "../status/route";
describe("onboarding ai_provider step", () => {
  it("points at the AI-providers page", () => {
    expect(AI_PROVIDER_ROUTE).toBe("/dashboard/settings/ai-providers");
  });
});
