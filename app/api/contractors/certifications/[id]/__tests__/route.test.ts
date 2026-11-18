/**
 * RA-8457 — a contractor who corrects a REJECTED certification must send it
 * back for review. Before this change the edit saved the new details and left
 * the status REJECTED, so nothing could ever look at it again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const certFindUnique = vi.fn();
const certUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    contractorCertification: {
      findUnique: (...args: unknown[]) => certFindUnique(...args),
      update: (...args: unknown[]) => certUpdate(...args),
    },
  },
}));

import { PATCH } from "../route";

const CONTRACTOR = "contractor-ra8457";

function existing(verificationStatus: string) {
  return {
    id: "cert-1",
    profileId: "profile-1",
    verificationStatus,
    verifiedAt: new Date("2026-11-01T00:00:00Z"),
    verifiedBy: "operator-1",
    verificationNotes: "Number does not match the register",
    profile: { userId: CONTRACTOR },
  };
}

function patch(body: unknown) {
  const request = new NextRequest(
    "http://localhost/api/contractors/certifications/cert-1",
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return PATCH(request, { params: Promise.resolve({ id: "cert-1" }) });
}

describe("PATCH /api/contractors/certifications/[id] (RA-8457)", () => {
  beforeEach(() => {
    getServerSession.mockResolvedValue({ user: { id: CONTRACTOR } });
    certFindUnique.mockReset();
    certUpdate.mockReset();
    certUpdate.mockImplementation(async ({ data }) => ({
      id: "cert-1",
      ...data,
    }));
  });

  it("returns a corrected REJECTED certification to PENDING and clears the old decision", async () => {
    certFindUnique.mockResolvedValue(existing("REJECTED"));
    const res = await patch({ certificationNumber: "IICRC-12345" });
    expect(res.status).toBe(200);
    const { data } = certUpdate.mock.calls[0][0];
    expect(data).toMatchObject({
      certificationNumber: "IICRC-12345",
      verificationStatus: "PENDING",
      verifiedAt: null,
      verifiedBy: null,
      verificationNotes: null,
    });
  });

  it("leaves the status of a PENDING certification alone", async () => {
    certFindUnique.mockResolvedValue(existing("PENDING"));
    const res = await patch({ certificationNumber: "IICRC-12345" });
    expect(res.status).toBe(200);
    const { data } = certUpdate.mock.calls[0][0];
    expect(data).not.toHaveProperty("verificationStatus");
  });

  it("still refuses to edit a VERIFIED certification", async () => {
    certFindUnique.mockResolvedValue(existing("VERIFIED"));
    const res = await patch({ certificationNumber: "IICRC-99999" });
    expect(res.status).toBe(400);
    expect(certUpdate).not.toHaveBeenCalled();
  });

  it("ignores a status sent in the body", async () => {
    certFindUnique.mockResolvedValue(existing("PENDING"));
    await patch({ verificationStatus: "VERIFIED", certificationName: "WRT" });
    const { data } = certUpdate.mock.calls[0][0];
    expect(data).not.toHaveProperty("verificationStatus");
  });
});
