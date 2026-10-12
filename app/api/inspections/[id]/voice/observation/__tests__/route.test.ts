import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), getSession: vi.fn(), addObservation: vi.fn(),
  updateSessionState: vi.fn(), updateMissingItems: vi.fn(),
  markObservationStored: vi.fn(), checkCompletion: vi.fn(),
  parseTranscript: vi.fn(), buildConfirmationPrompt: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.auth }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/voice/session", () => mocks);
vi.mock("@/lib/voice/completion-checker", () => mocks);
vi.mock("@/lib/voice/transcript-parser", () => mocks);
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (req: NextRequest, _userId: string,
    handler: (rawBody: string) => Promise<Response>) => handler(await req.text()),
}));

import { POST } from "../route";

function submit(inspectionId = "inspection-owned") {
  return POST(new NextRequest(`http://localhost/api/inspections/${inspectionId}/voice/observation`, {
    method: "POST", body: JSON.stringify({ sessionId: "voice-owned", transcript: "Kitchen wall is wet" }),
    headers: { "content-type": "application/json" },
  }), { params: Promise.resolve({ id: inspectionId }) });
}

function expectNoFieldAccess() {
  for (const fn of [mocks.updateSessionState, mocks.parseTranscript, mocks.addObservation,
    mocks.markObservationStored, mocks.checkCompletion, mocks.updateMissingItems]) {
    expect(fn).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-owned" } });
  mocks.getSession.mockResolvedValue({ userId: "user-owned", inspectionId: "inspection-owned" });
  mocks.parseTranscript.mockReturnValue({ type: "general_note", parsed: { note: "wet" },
    confidence: "medium", needsConfirmation: true });
  mocks.addObservation.mockResolvedValue({ id: "observation-owned" });
  mocks.buildConfirmationPrompt.mockReturnValue("Please confirm");
  mocks.checkCompletion.mockResolvedValue([{ id: "scope_boundary", complete: false }]);
});

describe("voice observation session and inspection boundary", () => {
  it.each(["inspection-foreign", "inspection-other-owned"])(
    "denies a session under mismatched URL %s before reading or changing field data", async id => {
      const response = await submit(id);
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
      expectNoFieldAccess();
    },
  );
  it("denies another user's session before field access", async () => {
    mocks.getSession.mockResolvedValue({ userId: "other-user", inspectionId: "inspection-owned" });
    expect((await submit()).status).toBe(403);
    expectNoFieldAccess();
  });
  it("denies an expired session before field access", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await submit()).status).toBe(404);
    expectNoFieldAccess();
  });
  it("denies unauthenticated requests before even resolving the session", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await submit()).status).toBe(401);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expectNoFieldAccess();
  });
  it("retains legitimate observation and confirmation on the session's inspection", async () => {
    const response = await submit();
    expect(response.status).toBe(200);
    expect((await response.json()).confirmationPrompt).toBe("Please confirm");
    expect(mocks.addObservation).toHaveBeenCalledOnce();
    expect(mocks.checkCompletion).toHaveBeenCalledWith("inspection-owned");
    expect(mocks.updateMissingItems).toHaveBeenCalledWith("voice-owned", expect.any(Array));
  });
});
