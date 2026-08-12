import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Backs the onboarding OpenRouter model picker (components/setup/AiKeyCard).
// These tests lock the two properties the picker relies on: it is session-gated
// (not an open CORS proxy for OpenRouter), and an upstream outage degrades to
// `unavailable` rather than a 5xx that would stall onboarding.

const getServerSession = vi.fn();
const fetchOpenRouterCatalogue = vi.fn();
const reportError = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/workspace/openrouter-catalogue", () => ({
  fetchOpenRouterCatalogue: (...args: unknown[]) =>
    fetchOpenRouterCatalogue(...args),
}));
vi.mock("@/lib/observability", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

import { GET } from "../route";

function req() {
  return new NextRequest("http://localhost/api/workspace/openrouter-models");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/workspace/openrouter-models", () => {
  it("rejects an unauthenticated caller without touching the upstream", async () => {
    getServerSession.mockResolvedValue(null);

    const res = await GET(req());

    expect(res.status).toBe(401);
    expect(fetchOpenRouterCatalogue).not.toHaveBeenCalled();
  });

  it("returns the catalogue for a signed-in caller", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1" } });
    fetchOpenRouterCatalogue.mockResolvedValue({
      recommended: [
        {
          id: "qwen/qwen3",
          name: "Qwen3",
          family: "qwen",
          contextLength: 262144,
        },
      ],
      models: [
        {
          id: "qwen/qwen3",
          name: "Qwen3",
          family: "qwen",
          contextLength: 262144,
        },
      ],
      unavailable: false,
    });

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.recommended[0].id).toBe("qwen/qwen3");
    expect(body.unavailable).toBe(false);
  });

  it("passes an upstream outage through as 200 + unavailable, not a 5xx", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1" } });
    fetchOpenRouterCatalogue.mockResolvedValue({
      recommended: [],
      models: [],
      unavailable: true,
    });

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      recommended: [],
      models: [],
      unavailable: true,
    });
  });

  it("does not 500 the onboarding card when the catalogue helper throws", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1" } });
    fetchOpenRouterCatalogue.mockRejectedValue(new Error("boom"));

    const res = await GET(req());

    // The route's contract is "never fails hard". A 5xx here would surface as a
    // broken onboarding step for what is an optional convenience, so a thrown
    // helper must degrade to the same payload an upstream outage produces.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      recommended: [],
      models: [],
      unavailable: true,
    });
  });

  it("reports the degradation rather than swallowing it silently", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1" } });
    const boom = new Error("boom");
    fetchOpenRouterCatalogue.mockRejectedValue(boom);

    await GET(req());

    expect(reportError).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({ route: "/api/workspace/openrouter-models" }),
    );
  });
});
