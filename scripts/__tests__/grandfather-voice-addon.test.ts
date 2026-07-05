/**
 * RA-6920 B2 — grandfather backfill for existing ElevenLabs BYOK connections.
 * Runs without a database — prisma is mocked so this always executes in CI.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    providerConnection: { findMany: vi.fn() },
    featureEntitlement: { upsert: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { grandfatherVoiceAddon } from "../grandfather-voice-addon";

const mockFindMany = prisma.providerConnection.findMany as ReturnType<
  typeof vi.fn
>;
const mockUpsert = prisma.featureEntitlement.upsert as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsert.mockResolvedValue({});
});

describe("grandfatherVoiceAddon", () => {
  it("grants an ACTIVE VOICE entitlement for each workspace with an ACTIVE ElevenLabs connection", async () => {
    mockFindMany.mockResolvedValue([
      { workspaceId: "ws_1" },
      { workspaceId: "ws_2" },
    ]);

    const result = await grandfatherVoiceAddon();

    expect(result).toEqual({ granted: 2 });
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { provider: "ELEVENLABS", status: "ACTIVE" },
      select: { workspaceId: true },
    });
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { workspaceId_sku: { workspaceId: "ws_1", sku: "VOICE" } },
      create: { workspaceId: "ws_1", sku: "VOICE", active: true },
      update: { active: true },
    });
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { workspaceId_sku: { workspaceId: "ws_2", sku: "VOICE" } },
      create: { workspaceId: "ws_2", sku: "VOICE", active: true },
      update: { active: true },
    });
  });

  it("dedupes multiple connections on the same workspace into one upsert", async () => {
    mockFindMany.mockResolvedValue([
      { workspaceId: "ws_shared" },
      { workspaceId: "ws_shared" },
    ]);

    const result = await grandfatherVoiceAddon();

    expect(result).toEqual({ granted: 1 });
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("returns zero granted when no workspace has an ACTIVE ElevenLabs connection", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await grandfatherVoiceAddon();

    expect(result).toEqual({ granted: 0 });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("is idempotent — running twice still ends with active:true and no error", async () => {
    mockFindMany.mockResolvedValue([{ workspaceId: "ws_1" }]);

    await grandfatherVoiceAddon();
    const second = await grandfatherVoiceAddon();

    expect(second).toEqual({ granted: 1 });
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    for (const call of mockUpsert.mock.calls) {
      expect(call[0].update).toEqual({ active: true });
    }
  });
});
