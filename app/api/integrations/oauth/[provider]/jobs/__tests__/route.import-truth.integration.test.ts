/**
 * RA-7663 — Real-database proof that the job import tells the truth.
 *
 * `route.test.ts` mocks `prisma.report.create` to always succeed, so it
 * cannot see that the real create is rejected: the route passes fields Report
 * lacks, omits required ones, and maps "IN_PROGRESS" to a status ReportStatus
 * does not have. On main the route caught that rejection and still answered
 * `success: true, imported: 0`.
 *
 * Here prisma is NOT mocked. One synthetic ServiceM8 job is seeded and the
 * real database decides. Making the ServiceM8 -> Report mapping work is out of
 * scope (RA-7661); this test only pins that a failed import is reported as one.
 *
 * Runs only when DATABASE_URL is set, like the neighbouring
 * `*.integration.test.ts` suites.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `ra7663-${Date.now().toString(36)}`;
const ids = { user: "", integration: "", externalJob: "" };

describe.skipIf(!HAS_DB)(
  "POST /api/integrations/oauth/servicem8/jobs against a real database (RA-7663)",
  () => {
    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          email: `${S}@test.local`,
          role: "ADMIN",
          subscriptionStatus: "ACTIVE",
        },
      });
      ids.user = user.id;

      const integration = await prisma.integration.create({
        data: {
          userId: user.id,
          provider: "SERVICEM8",
          name: "ServiceM8",
          status: "CONNECTED",
        },
      });
      ids.integration = integration.id;

      const job = await prisma.externalJob.create({
        data: {
          integrationId: integration.id,
          externalId: `${S}-sm8-job-1`,
          title: "Synthetic burst pipe, kitchen",
          status: "IN_PROGRESS",
          address: "1 Example St, Brisbane QLD 4000",
          description: "Synthetic test job",
          rawData: { uuid: `${S}-sm8-job-1` },
        },
      });
      ids.externalJob = job.id;
    });

    afterAll(async () => {
      if (ids.user) {
        await prisma.report.deleteMany({ where: { userId: ids.user } });
        // Integration and ExternalJob cascade from the user.
        await prisma.user.delete({ where: { id: ids.user } });
      }
    });

    it("answers success: false, imported: 0, failed: 1 when the database rejects the report", async () => {
      // The import reads the already-synced ExternalJob row; it must not call
      // ServiceM8. Any outbound fetch fails the test.
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("no external calls in this test"));

      getServerSession.mockResolvedValue({ user: { id: ids.user } });
      const res = await POST(
        new NextRequest(
          "http://localhost/api/integrations/oauth/servicem8/jobs",
          {
            method: "POST",
            body: JSON.stringify({ jobIds: [`${S}-sm8-job-1`] }),
          },
        ),
        { params: Promise.resolve({ provider: "servicem8" }) },
      );
      const body = await res.json();

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();

      // The database really did refuse: no report exists and the job is unlinked.
      expect(await prisma.report.count({ where: { userId: ids.user } })).toBe(
        0,
      );
      const job = await prisma.externalJob.findUnique({
        where: { id: ids.externalJob },
      });
      expect(job?.claimId).toBeNull();

      // And the route says so.
      expect(body.success).toBe(false);
      expect(body.imported).toBe(0);
      expect(body.failed).toBe(1);
      expect(body.errors).toEqual([
        { id: `${S}-sm8-job-1`, error: expect.any(String) },
      ]);
      expect(res.status).toBe(422);
    });
  },
);
