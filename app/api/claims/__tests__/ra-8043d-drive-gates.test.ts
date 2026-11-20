import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-8043d: drive-folders, list-files and analyze-batch all read the one
// platform Drive service account, which every firm shares folders with. A firm
// owner (ADMIN), a plain USER or a paying subscriber must be refused before any
// Drive, rate-limit or AI work; only platform support staff may browse it.

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const listDriveItems = vi.fn();
const applyRateLimit = vi.fn();
const getIntegrationsForUser = vi.fn();
const retrieveRelevantStandards = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
  },
}));
vi.mock("@/lib/google-drive", () => ({
  listDriveItems: (...args: unknown[]) => listDriveItems(...args),
  downloadDriveFile: vi.fn(),
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
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
vi.mock("@/lib/gap-analysis", () => ({ performGapAnalysis: vi.fn() }));
vi.mock("@/lib/revolutionary-gap-analysis", () => ({
  performRevolutionaryGapAnalysis: vi.fn(),
}));

import { POST as driveFolders } from "../drive-folders/route";
import { POST as listFiles } from "../list-files/route";
import { POST as analyzeBatch } from "../analyze-batch/route";

const STAFF = "staff-1";

function req(path: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/claims/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function signIn(id: string, role: string) {
  getServerSession.mockResolvedValue({ user: { id, role } });
  userFindUnique.mockResolvedValue({
    id,
    role,
    organizationId: "org-b",
    subscriptionStatus: "ACTIVE",
  });
}

const routes = [
  ["drive-folders", driveFolders, { parentFolderId: "folder-a" }],
  ["list-files", listFiles, { folderId: "folder-a" }],
  ["analyze-batch", analyzeBatch, { folderId: "folder-a" }],
] as const;

beforeEach(() => {
  process.env.PLATFORM_SUPPORT_USER_IDS = STAFF;
  for (const m of [
    getServerSession,
    userFindUnique,
    listDriveItems,
    applyRateLimit,
    getIntegrationsForUser,
    retrieveRelevantStandards,
  ])
    m.mockReset();
  listDriveItems.mockResolvedValue({ files: [], folders: [] });
  applyRateLimit.mockResolvedValue(null);
  getIntegrationsForUser.mockResolvedValue([]);
  retrieveRelevantStandards.mockResolvedValue([]);
});

describe("RA-8043d — claims Drive routes are platform staff only", () => {
  it.each(routes)(
    "[ra-8043d] %s refuses a firm owner (ADMIN) with an active plan before touching Drive",
    async (_name, handler, body) => {
      signIn("firm-b-owner", "ADMIN");
      const res = await handler(req(_name, body));

      expect(res.status).toBe(403);
      expect(listDriveItems).not.toHaveBeenCalled();
      expect(applyRateLimit).not.toHaveBeenCalled();
      expect(getIntegrationsForUser).not.toHaveBeenCalled();
    },
  );

  it.each(routes)(
    "[ra-8043d] %s refuses a plain USER before touching Drive",
    async (_name, handler, body) => {
      signIn("firm-b-tech", "USER");
      const res = await handler(req(_name, body));

      expect(res.status).toBe(403);
      expect(listDriveItems).not.toHaveBeenCalled();
    },
  );

  it("[ra-8043d] platform support staff can still browse the Drive", async () => {
    signIn(STAFF, "ADMIN");
    listDriveItems.mockResolvedValue({
      files: [{ id: "f1", name: "a.pdf", mimeType: "application/pdf" }],
      folders: [{ id: "sub-1", name: "Claims" }],
    });

    const res = await driveFolders(req("drive-folders", {}));

    expect(res.status).toBe(200);
    expect(listDriveItems).toHaveBeenCalledWith("root");
    expect(await res.json()).toEqual({
      folders: [{ id: "sub-1", name: "Claims" }],
      pdfCount: 1,
    });
  });

  it("[ra-8043d] an allowlisted USER is not promoted to staff", async () => {
    signIn(STAFF, "USER");
    const res = await listFiles(req("list-files", { folderId: "folder-a" }));

    expect(res.status).toBe(403);
    expect(listDriveItems).not.toHaveBeenCalled();
  });
});
