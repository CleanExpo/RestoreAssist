import { describe, expect, it } from "vitest";
import { ApiClient } from "../client/api-client.js";

const sha = "a".repeat(64);
const input = {
  inspectionId: "inspection-1",
  buffer: Buffer.from("jpeg-bytes"),
  filename: "evidence.jpg",
  mimeType: "image/jpeg",
  contentSha256: sha,
};

function client(
  responses: Array<{ status?: number; body: unknown }>,
  calls: Array<{ url: string; init: { headers?: Record<string, string> } }> = [],
) {
  let index = 0;
  const session = {
    fetch: async (url: string, init: { headers?: Record<string, string> }) => {
      calls.push({ url, init });
      const response = responses[index++];
      return new Response(JSON.stringify(response.body), {
        status: response.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    },
  };
  return new ApiClient(session as never, "https://restoreassist-sandbox.vercel.app");
}

describe("pilot API evidence contracts", () => {
  it("rejects a 2xx upload with no bound photo receipt", async () => {
    await expect(client([{ body: {} }]).uploadPhoto(input)).rejects.toThrow(/invalid or unbound/);
  });

  it("accepts a hash-bound receipt and proves the photo is readable", async () => {
    const photo = {
      id: "photo-1",
      cocoaSha256: sha,
      fileSize: input.buffer.length,
      mimeType: input.mimeType,
    };
    const api = client([{ status: 201, body: { photo } }, { body: { photos: [photo] } }]);
    const receipt = await api.uploadPhoto(input);
    await expect(api.assertPhotosPersisted(input.inspectionId, [receipt])).resolves.toBeUndefined();
  });

  it("rejects a receipt that cannot be read back", async () => {
    const photo = {
      id: "photo-1",
      cocoaSha256: sha,
      fileSize: input.buffer.length,
      mimeType: input.mimeType,
    };
    const api = client([{ status: 201, body: { photo } }, { body: { photos: [] } }]);
    const receipt = await api.uploadPhoto(input);
    await expect(api.assertPhotosPersisted(input.inspectionId, [receipt])).rejects.toThrow(/not read back/);
  });

  it("rejects non-atomic or incomplete budget receipts", async () => {
    const api = client([
      {
        body: {
          reservationId: "reservation-1",
          workspaceId: "workspace-1",
          ceilingUsd: 5,
          spentTodayUsd: 4.9,
          reservedUsd: 0.2,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    ]);
    await expect(
      api.reservePilotBudget({
        workspaceId: "workspace-1",
        runId: "run-1",
        companyKey: "company-1",
        jobKey: "job-1",
        ceilingUsd: 5,
      }),
    ).rejects.toThrow(/invalid budget reservation/);
  });

  it("rejects a judge response without a server-owned cost receipt", async () => {
    const api = client([
      {
        body: {
          professionalism: 9, specificity: 9, consistency: 9, actionability: 9,
          composite: 90, rationale: "Strong", modelUsed: "claude-haiku", latencyMs: 12,
        },
      },
    ]);
    await expect(api.judgePilotAssessment({
      workspaceId: "workspace-1", inspectionId: "inspection-1", assessmentGenerationId: "generation-1", assessmentSha256: sha,
    })).rejects.toThrow(/invalid server judge receipt/);
  });

  it("uses a stable reservation Idempotency-Key across caller retries of the same request", async () => {
    const calls: Array<{ url: string; init: { headers?: Record<string, string> } }> = [];
    const valid = {
      reservationId: "reservation-1",
      workspaceId: "workspace-1",
      ceilingUsd: 5,
      spentTodayUsd: 0,
      reservedUsd: 5,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const api = client([{ body: valid }, { body: valid }], calls);
    const input = {
      workspaceId: "workspace-1",
      runId: "run-1",
      companyKey: "company-1",
      jobKey: "job-1",
      ceilingUsd: 5,
    };
    await api.reservePilotBudget(input);
    await api.reservePilotBudget(input);

    expect(calls[0].init.headers?.["Idempotency-Key"]).toMatch(/^pilot-[0-9a-f]{64}$/);
    expect(calls[1].init.headers?.["Idempotency-Key"]).toBe(calls[0].init.headers?.["Idempotency-Key"]);
  });

  it("uses a stable judge Idempotency-Key and rejects inconsistent composite receipts", async () => {
    const calls: Array<{ url: string; init: { headers?: Record<string, string> } }> = [];
    const valid = {
      professionalism: 9, specificity: 9, consistency: 9, actionability: 9,
      composite: 90, rationale: "Strong", modelUsed: "claude-haiku", latencyMs: 12, costUsd: 0.001,
    };
    const api = client([{ body: valid }, { body: valid }, { body: { ...valid, composite: 80 } }], calls);
    const input = {
      workspaceId: "workspace-1",
      inspectionId: "inspection-1",
      assessmentGenerationId: "generation-1",
      assessmentSha256: sha,
    };
    await api.judgePilotAssessment(input);
    await api.judgePilotAssessment(input);
    await expect(api.judgePilotAssessment(input)).rejects.toThrow(/invalid server judge receipt/);

    expect(calls[0].init.headers?.["Idempotency-Key"]).toMatch(/^pilot-[0-9a-f]{64}$/);
    expect(calls[1].init.headers?.["Idempotency-Key"]).toBe(calls[0].init.headers?.["Idempotency-Key"]);
    expect(calls[2].init.headers?.["Idempotency-Key"]).toBe(calls[0].init.headers?.["Idempotency-Key"]);
  });
});
