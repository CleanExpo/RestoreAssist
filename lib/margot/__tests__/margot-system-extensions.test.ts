import { describe, expect, it } from "vitest";
import {
  finalizeMargotPublicReply,
  MARGOT_PUBLIC_CHAT_SYSTEM_PROMPT,
  sanitizeMargotCustomerReply,
  withMargotSocialRules,
} from "../margot-system-extensions";

describe("withMargotSocialRules", () => {
  it("appends social comment rules once", () => {
    const base = "You are Margot.";
    const once = withMargotSocialRules(base);
    const twice = withMargotSocialRules(once);

    expect(once).toContain("Social commenting (RestoreAssist)");
    expect(once).toContain("Relevance gate");
    expect(twice).toBe(once);
  });
});

describe("MARGOT_PUBLIC_CHAT_SYSTEM_PROMPT", () => {
  it("keeps a first-person Margot persona without the full social dump", () => {
    expect(MARGOT_PUBLIC_CHAT_SYSTEM_PROMPT).toContain("Speak in first person");
    expect(MARGOT_PUBLIC_CHAT_SYSTEM_PROMPT).toContain("claim summaries");
    expect(MARGOT_PUBLIC_CHAT_SYSTEM_PROMPT).toContain("Social comments");
    expect(MARGOT_PUBLIC_CHAT_SYSTEM_PROMPT).not.toContain(
      "Relevance gate (run before every reply)",
    );
  });
});

describe("finalizeMargotPublicReply", () => {
  it("accepts a normal Margot answer", () => {
    const text =
      "Sure. For a kitchen water claim summary, cover: source and category of water, rooms affected, moisture readings, drying plan, and photos tied to each area.";
    expect(finalizeMargotPublicReply(text)).toBe(text);
  });

  it("rejects meta-narration leaks", () => {
    expect(
      finalizeMargotPublicReply(
        "We need to answer as Margot, RestoreAssist help assistant. Provide concise guidance on writing a c",
      ),
    ).toBeNull();
  });

  it("strips thinking blocks", () => {
    const cleaned = finalizeMargotPublicReply(
      "<think>plan the answer</think>\nHere is a clear kitchen claim summary outline with source, category, and drying steps.",
    );
    expect(cleaned).toContain("kitchen claim summary");
    expect(cleaned).not.toContain("think");
  });

  it("keeps markdown bold for the chat UI to render", () => {
    const cleaned = finalizeMargotPublicReply(
      "From there you can:\n\n1. **Add your business details** - company name\n2. **Invite team members** - send invites",
    );
    expect(cleaned).toContain("**Add your business details**");
    expect(cleaned).toContain("**Invite team members**");
  });
});

describe("sanitizeMargotCustomerReply", () => {
  it("keeps bold markers and normalises fancy dashes", () => {
    expect(
      sanitizeMargotCustomerReply(
        "Create a dummy water‑damage case and **run a test job**.",
      ),
    ).toBe("Create a dummy water-damage case and **run a test job**.");
  });
});
