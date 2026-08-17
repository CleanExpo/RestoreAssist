import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The onboarding card (components/setup/AiKeyCard) offers a FREE-TEXT model
// slug whenever the OpenRouter catalogue is unavailable, so an arbitrarily
// large or malformed string reaches this route through an ordinary UI path,
// and `model` is persisted alongside an encrypted credential. The client
// mirrors these bounds, but the client is not the authority — these lock the
// server side.

const getServerSession = vi.fn();
const ensureWorkspaceForUser = vi.fn();
const checkPaymentGate = vi.fn();
const hasPermission = vi.fn();
const upsertProviderConnection = vi.fn();
const findFirst = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/workspace/provision", () => ({
  ensureWorkspaceForUser: (...a: unknown[]) => ensureWorkspaceForUser(...a),
}));
vi.mock("@/lib/workspace/payment-gate", () => ({
  checkPaymentGate: (...a: unknown[]) => checkPaymentGate(...a),
}));
vi.mock("@/lib/workspace/permissions", () => ({
  hasPermission: (...a: unknown[]) => hasPermission(...a),
}));
vi.mock("@/lib/workspace/provider-connections", () => ({
  listProviderConnections: vi.fn(),
  upsertProviderConnection: (...a: unknown[]) => upsertProviderConnection(...a),
  disableProviderConnection: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { workspaceMember: { findFirst: (...a: unknown[]) => findFirst(...a) } },
}));
// Run the handler body directly rather than through the idempotency wrapper.
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    req: { text: () => Promise<string> },
    _userId: string,
    fn: (raw: string) => Promise<unknown>,
  ) => fn(await req.text()),
}));

import { POST } from "../route";

const KEY = "sk-or-v1-0123456789abcdefghij";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/workspace/provider-connections", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "u1" } });
  ensureWorkspaceForUser.mockResolvedValue(undefined);
  checkPaymentGate.mockResolvedValue({
    allowed: true,
    workspace: { id: "w1", name: "W" },
  });
  hasPermission.mockResolvedValue(true);
  findFirst.mockResolvedValue({ id: "m1" });
  upsertProviderConnection.mockResolvedValue({ id: "c1" });
});

describe("POST /api/workspace/provider-connections — model slug bounds", () => {
  it("rejects an oversized model slug before it is encrypted or persisted", async () => {
    const res = await POST(
      post({
        provider: "OPENROUTER",
        apiKey: KEY,
        model: `qwen/${"x".repeat(1_000_000)}`,
      }),
    );

    expect(res.status).toBe(400);
    // The point of the bound is that nothing downstream ever sees the value.
    expect(upsertProviderConnection).not.toHaveBeenCalled();
  });

  it("rejects a malformed slug that is not namespace/model", async () => {
    const res = await POST(
      post({ provider: "OPENROUTER", apiKey: KEY, model: "not a slug!" }),
    );

    expect(res.status).toBe(400);
    expect(upsertProviderConnection).not.toHaveBeenCalled();
  });

  it("accepts a real OpenRouter slug, including an optional tag", async () => {
    for (const slug of [
      "deepseek/deepseek-chat",
      "qwen/qwen3-235b-a22b:free",
      "minimax/minimax-m2",
    ]) {
      upsertProviderConnection.mockClear();
      const res = await POST(
        post({ provider: "OPENROUTER", apiKey: KEY, model: slug }),
      );
      expect(res.status).toBe(200);
      expect(upsertProviderConnection).toHaveBeenCalledWith(
        expect.objectContaining({ model: slug }),
      );
    }
  });

  it("still allows a blank model — the server default path", async () => {
    const res = await POST(post({ provider: "OPENROUTER", apiKey: KEY }));

    expect(res.status).toBe(200);
    expect(upsertProviderConnection).toHaveBeenCalledWith(
      expect.objectContaining({ model: undefined }),
    );
  });

  it("rejects an absurdly long API key", async () => {
    const res = await POST(
      post({ provider: "ANTHROPIC", apiKey: "sk-ant-" + "x".repeat(1_000_000) }),
    );

    expect(res.status).toBe(400);
    expect(upsertProviderConnection).not.toHaveBeenCalled();
  });

  it("does not apply the slug rule to first-party providers", async () => {
    const res = await POST(
      post({ provider: "ANTHROPIC", apiKey: KEY, model: "not a slug!" }),
    );

    // `model` is OpenRouter-only; a stray value is ignored, not a 400.
    expect(res.status).toBe(200);
    expect(upsertProviderConnection).toHaveBeenCalledWith(
      expect.objectContaining({ model: undefined }),
    );
  });
});
