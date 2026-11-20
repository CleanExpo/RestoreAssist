import { describe, expect, it } from "vitest";
import { detailErrorFromResponse } from "../DetailLoadErrorPanel";

describe("detailErrorFromResponse", () => {
  it("maps 401 to sign-in copy", () => {
    const copy = detailErrorFromResponse(
      { code: "UNAUTHORIZED", message: "x", status: 401 },
      "report",
    );
    expect(copy.title).toBe("Sign in required");
    expect(copy.message).toContain("report");
  });

  it("maps 404 to not found", () => {
    const copy = detailErrorFromResponse(
      { code: "NOT_FOUND", message: "x", status: 404 },
      "inspection",
    );
    expect(copy.title).toBe("inspection not found");
  });

  it("maps 500 to load failure", () => {
    const copy = detailErrorFromResponse(
      { code: "INTERNAL", message: "Server error", status: 500 },
      "invoice",
    );
    expect(copy.title).toBe("Could not load invoice");
    expect(copy.message).toContain("Server error");
  });
});
