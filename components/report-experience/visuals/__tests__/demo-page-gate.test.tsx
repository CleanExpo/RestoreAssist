import { describe, it, expect, vi, beforeEach } from "vitest";

const blocked = vi.hoisted(() => ({ value: true }));
vi.mock("@/app/api/test/_helpers", () => ({ testHelpersBlocked: () => blocked.value }));

import Page, { metadata } from "@/app/dev/report-experience/visuals/page";

describe("RA-8107 demo page gate", () => {
  beforeEach(() => {
    blocked.value = true;
  });

  it("is not found while the test-helper switch is off (production default)", () => {
    expect(() => Page()).toThrowError(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });

  it("renders only when the switch is on", () => {
    blocked.value = false;
    expect(() => Page()).not.toThrow();
  });

  it("is never indexed", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
