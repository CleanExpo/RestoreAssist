import { describe, expect, it } from "vitest";
import { META_PROVIDER_DESCRIPTION } from "../meta-provider-copy";

describe("Meta provider capability copy (RA-8198)", () => {
  it("does not promise Margot chat for a Meta-only workspace", () => {
    const d = META_PROVIDER_DESCRIPTION.toLowerCase();
    expect(d).toContain("vision");
    expect(d).toContain("report drafting");
    expect(d).not.toMatch(/used for report drafting and chat/);
    expect(d).toContain("margot chat still needs an anthropic key");
  });
});
