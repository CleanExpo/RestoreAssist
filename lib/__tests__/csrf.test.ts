import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { validateCsrf } from "@/lib/csrf";

describe("validateCsrf strict origin mode", () => {
  it("rejects a missing Origin when the caller requires it", async () => {
    const response = validateCsrf(
      new NextRequest("https://restoreassist.app/api/team/invites", {
        method: "POST",
      }),
      { requireOrigin: true },
    );

    expect(response?.status).toBe(403);
  });

  it("accepts an exact same-origin state-changing request", () => {
    const response = validateCsrf(
      new NextRequest("https://restoreassist.app/api/team/invites", {
        method: "POST",
        headers: {
          host: "restoreassist.app",
          origin: "https://restoreassist.app",
        },
      }),
      { requireOrigin: true },
    );

    expect(response).toBeNull();
  });

  it("rejects the same host on a different scheme", async () => {
    const response = validateCsrf(
      new NextRequest("https://restoreassist.app/api/team/invites", {
        method: "POST",
        headers: { origin: "http://restoreassist.app" },
      }),
      { requireOrigin: true },
    );

    expect(response?.status).toBe(403);
  });

  it("rejects a different origin", async () => {
    const response = validateCsrf(
      new NextRequest("https://restoreassist.app/api/team/invites", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
      { requireOrigin: true },
    );

    expect(response?.status).toBe(403);
  });
});
