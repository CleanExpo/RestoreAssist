/**
 * Unit tests for routeBasic — the setup-wizard Gemma path.
 *
 * Mocks:
 *   - @/lib/ai/gemma-client  (callGemma)
 *   - @/lib/prisma           (prisma.user.findUnique for credit gate)
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gemma-client", () => ({
  callGemma: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

import { callGemma } from "@/lib/ai/gemma-client";
import { prisma } from "@/lib/prisma";
import { routeBasic } from "@/lib/ai/model-router";

const mockCallGemma = callGemma as ReturnType<typeof vi.fn>;
const mockFindUnique = (
  prisma as unknown as { user: { findUnique: ReturnType<typeof vi.fn> } }
).user.findUnique;

/** Minimal GemmaCallResult for happy-path mocks. */
function makeGemmaResult(text: string) {
  return {
    text,
    inputTokens: 10,
    outputTokens: 20,
    cost: 0.0001,
    model: "gemma-4-31b-it",
  };
}

describe("routeBasic", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns text + confidence on a successful Gemma call", async () => {
    mockCallGemma.mockResolvedValueOnce(
      makeGemmaResult("Moisture detected at 35%."),
    );

    const result = await routeBasic("Describe the moisture reading.", {
      bypassCreditGate: true,
    });

    expect(result).not.toBeNull();
    expect(typeof result?.text).toBe("string");
    expect(result?.text).toBe("Moisture detected at 35%.");
    expect(typeof result?.confidence).toBe("number");
    // Non-empty text → default confidence of 0.7
    expect(result?.confidence).toBe(0.7);
  });

  it("bypasses credit gate when bypassCreditGate=true", async () => {
    // Even if the DB would block this user, routeBasic must succeed
    mockFindUnique.mockResolvedValueOnce({ creditsRemaining: 0 });
    mockCallGemma.mockResolvedValueOnce(makeGemmaResult("All good."));

    const result = await routeBasic("hello", {
      userId: "zero-credit-user",
      bypassCreditGate: true,
    });

    expect(result).not.toBeNull();
    // findUnique should NOT have been called when bypass is true
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("enforces credit gate when bypassCreditGate is not set and user has 0 credits", async () => {
    mockFindUnique.mockResolvedValueOnce({ creditsRemaining: 0 });

    const result = await routeBasic("hello", { userId: "zero-credit-user" });

    // Credit-exhausted user → null (not an error thrown, just blocked)
    expect(result).toBeNull();
    // callGemma must not have been reached
    expect(mockCallGemma).not.toHaveBeenCalled();
  });

  it("returns null on underlying Gemma error", async () => {
    mockCallGemma.mockRejectedValueOnce(
      new Error("GEMMA_ENDPOINT_URL is not configured"),
    );

    const result = await routeBasic("trigger an error", {
      bypassCreditGate: true,
    });

    expect(result).toBeNull();
  });
});
