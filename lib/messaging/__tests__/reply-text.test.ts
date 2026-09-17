import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  isConfirmReply,
  parseJobPick,
  parseLinkCommand,
  REPLIES,
  THUMBS_UP,
} from "../reply-text";
import { extractJobNumber } from "../job-resolution";

describe("isConfirmReply", () => {
  it.each(["yes", " YES ", "y", "Y", THUMBS_UP, "\u{1F44D}\u{FE0F}", "\u{1F44D}\u{1F3FF}"])(
    "accepts %j",
    (t) => expect(isConfirmReply(t)).toBe(true),
  );

  it.each(["yes please", "no", "yeah", "", "\u{1F44E}", "ok"])("rejects %j", (t) =>
    expect(isConfirmReply(t)).toBe(false),
  );
});

describe("parseJobPick", () => {
  it("reads 1 to 3 only", () => {
    expect(parseJobPick(" 2 ")).toBe(2);
    expect(parseJobPick("4")).toBeNull();
    expect(parseJobPick("2 rooms")).toBeNull();
  });
});

describe("parseLinkCommand", () => {
  it("reads the code", () => {
    expect(parseLinkCommand("link ABCD2345")).toBe("ABCD2345");
    expect(parseLinkCommand("/link abcd-2345")).toBe("abcd-2345");
    expect(parseLinkCommand("please link ABCD2345")).toBeNull();
  });
});

describe("extractJobNumber", () => {
  it("matches the real NIR-YYYY-MM-XXXXXX format", () => {
    expect(extractJobNumber("nir-2026-09-a1b2c3 lounge 20%")).toBe("NIR-2026-09-A1B2C3");
    expect(extractJobNumber("job NIR-2026-05-ABCD9999")).toBe("NIR-2026-05-ABCD9999");
  });

  it("ignores other shapes", () => {
    expect(extractJobNumber("INS-1234 lounge")).toBeNull();
    expect(extractJobNumber("NIR-26-09-ABC")).toBeNull();
    expect(extractJobNumber("lounge 20%")).toBeNull();
  });
});

describe("REPLIES.pickJob", () => {
  it("says when there are no active jobs", () => {
    expect(REPLIES.pickJob([], null)).toMatch(/no active jobs/);
  });
});
