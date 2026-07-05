import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const getIntegrationsForUser = vi.fn();
const retrieveRelevantStandards = vi.fn();
const listDriveItems = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
  },
}));
vi.mock("@/lib/ai-provider", () => ({
  getIntegrationsForUser: (...args: unknown[]) =>
    getIntegrationsForUser(...args),
}));
vi.mock("@/lib/standards-retrieval", () => ({
  retrieveRelevantStandards: (...args: unknown[]) =>
    retrieveRelevantStandards(...args),
  buildStandardsContextPrompt: () => "",
}));
vi.mock("@/lib/google-drive", () => ({
  listDriveItems: (...args: unknown[]) => listDriveItems(...args),
  downloadDriveFile: vi.fn(),
}));
vi.mock("@/lib/gap-analysis", () => ({ performGapAnalysis: vi.fn() }));
vi.mock("@/lib/revolutionary-gap-analysis", () => ({
  performRevolutionaryGapAnalysis: vi.fn(),
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/claims/analyze-batch", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  userFindUnique.mockReset();
  getIntegrationsForUser.mockReset();
  retrieveRelevantStandards.mockReset();
  listDriveItems.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  applyRateLimit.mockResolvedValue(null);
  userFindUnique.mockResolvedValue({ subscriptionStatus: "ACTIVE" });
  getIntegrationsForUser.mockResolvedValue([{ apiKey: "anthropic-key" }]);
  retrieveRelevantStandards.mockResolvedValue([]);
  listDriveItems.mockResolvedValue({ files: [] });
});

describe("POST /api/claims/analyze-batch — Rule 5 subscription gate", () => {
  it.each(["CANCELED", "PAST_DUE"])(
    "returns 402 and makes no AI call for %s subscriptions",
    async (status) => {
      userFindUnique.mockResolvedValueOnce({ subscriptionStatus: status });

      const res = await POST(makeRequest({ folderId: "folder-1" }));
      const body = await res.json();

      expect(res.status).toBe(402);
      expect(body.upgradeRequired).toBe(true);
      // The gate runs before any AI spend is incurred.
      expect(getIntegrationsForUser).not.toHaveBeenCalled();
      expect(retrieveRelevantStandards).not.toHaveBeenCalled();
      expect(listDriveItems).not.toHaveBeenCalled();
    },
  );

  it.each(["TRIAL", "ACTIVE", "LIFETIME"])(
    "allows %s subscriptions past the gate",
    async (status) => {
      userFindUnique.mockResolvedValueOnce({ subscriptionStatus: status });

      // No PDFs → the route returns 400 AFTER passing the gate, proving the
      // subscription check let this status through.
      const res = await POST(makeRequest({ folderId: "folder-1" }));

      expect(res.status).toBe(400);
      expect(getIntegrationsForUser).toHaveBeenCalledTimes(1);
    },
  );
});
