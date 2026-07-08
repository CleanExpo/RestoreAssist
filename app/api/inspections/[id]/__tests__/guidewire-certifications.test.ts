import { beforeEach, describe, expect, it, vi } from "vitest";

// The route module pulls in next-auth/prisma/idempotency at import time.
// Stub them so we can unit-test the payload builder and the certification
// loader without a live session or database.
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: vi.fn() },
    contractorProfile: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/idempotency", () => ({ withIdempotency: vi.fn() }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import {
  buildNirReportOutput,
  fetchTechnicianCertifications,
} from "../guidewire/route";

const mockedProfileFindUnique = vi.mocked(prisma.contractorProfile.findUnique);

// Minimal inspection shape matching fetchInspectionForGuidewire's projection.
function makeInspection() {
  return {
    id: "insp_1",
    status: "COMPLETED",
    propertyPostcode: "2150",
    propertyAddress: "123 Smith St, Parramatta NSW 2150",
    inspectionDate: new Date("2026-01-01T00:00:00.000Z"),
    submittedAt: new Date("2026-01-02T00:00:00.000Z"),
    classifications: [],
    scopeItems: [],
    costEstimates: [],
    affectedAreas: [],
    moistureReadings: [],
    environmentalData: [],
    photos: [],
  } as unknown as Parameters<typeof buildNirReportOutput>[0];
}

describe("Guidewire technician certifications", () => {
  beforeEach(() => {
    mockedProfileFindUnique.mockReset();
  });

  describe("buildNirReportOutput", () => {
    it("maps loaded certifications into the technician block", () => {
      const out = buildNirReportOutput(makeInspection(), "Tech Name", "user_1", [
        "IICRC WRT #123456",
        "IICRC ASD",
      ]);

      expect(out.technician.certifications).toEqual([
        "IICRC WRT #123456",
        "IICRC ASD",
      ]);
      expect(out.technician.technicianId).toBe("user_1");
      expect(out.technician.name).toBe("Tech Name");
    });

    it("defaults to an empty (still valid) certifications array", () => {
      const out = buildNirReportOutput(makeInspection(), "Tech Name", "user_1");

      expect(out.technician.certifications).toEqual([]);
    });
  });

  describe("fetchTechnicianCertifications", () => {
    it("formats name + number, and name alone when number is null", async () => {
      mockedProfileFindUnique.mockResolvedValue({
        certifications: [
          {
            certificationName: "IICRC WRT",
            certificationNumber: "123456",
          },
          {
            certificationName: "IICRC ASD",
            certificationNumber: null,
          },
        ],
      } as never);

      const certs = await fetchTechnicianCertifications("user_1");

      expect(certs).toEqual(["IICRC WRT #123456", "IICRC ASD"]);
    });

    it("returns [] when the user has no contractor profile", async () => {
      mockedProfileFindUnique.mockResolvedValue(null);

      const certs = await fetchTechnicianCertifications("user_no_profile");

      expect(certs).toEqual([]);
    });

    it("returns [] when the profile has no certifications", async () => {
      mockedProfileFindUnique.mockResolvedValue({
        certifications: [],
      } as never);

      const certs = await fetchTechnicianCertifications("user_1");

      expect(certs).toEqual([]);
    });

    it("queries by userId and filters out rejected/expired and non-technician types", async () => {
      mockedProfileFindUnique.mockResolvedValue(null);

      await fetchTechnicianCertifications("user_1");

      expect(mockedProfileFindUnique).toHaveBeenCalledTimes(1);
      const args = mockedProfileFindUnique.mock.calls[0][0] as {
        where: { userId: string };
        select: {
          certifications: {
            where: {
              verificationStatus: { notIn: string[] };
              certificationType: { notIn: string[] };
              OR: unknown[];
            };
            take: number;
          };
        };
      };

      expect(args.where).toEqual({ userId: "user_1" });

      const certWhere = args.select.certifications.where;
      // Integrity filter: rejected/expired certifications never reach an
      // insurer payload.
      expect(certWhere.verificationStatus.notIn).toEqual(
        expect.arrayContaining(["REJECTED", "EXPIRED"]),
      );
      // Business/insurance registrations are not technician qualifications.
      expect(certWhere.certificationType.notIn).toEqual(
        expect.arrayContaining([
          "INSURANCE_PUBLIC_LIABILITY",
          "INSURANCE_PROFESSIONAL_INDEMNITY",
          "INSURANCE_WORKERS_COMP",
          "BUSINESS_ABN_REGISTRATION",
          "BUSINESS_GST_REGISTRATION",
        ]),
      );
      // Date-expired certifications are excluded even if not yet marked EXPIRED.
      expect(certWhere.OR).toHaveLength(2);
      // Bounded relation read (CLAUDE.md rule 3).
      expect(args.select.certifications.take).toBe(50);
    });
  });
});
