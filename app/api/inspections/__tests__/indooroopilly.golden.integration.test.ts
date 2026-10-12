/**
 * Indooroopilly golden case (spec AC-1, AC-2, AC-4 data layer, AC-6).
 *
 * The live job: a report already exists, no inspection is linked, and the
 * technician's readings are MC 11.8 % and 13.9 % (Bedroom 4; the western
 * wall backs onto the bathroom) plus separate RH readings. Replayed through
 * the real routes on a synthetic job, with no attendance date supplied:
 *
 *   1. link one inspection to the report; a retry links no second one (AC-1)
 *   2. no attendance date is invented (AC-2)
 *   3. capture MC 11.8 and 13.9 on the field screen and RH separately
 *   4. the NIR form, opened before the 13.9 capture, autosaves
 *   5. reopen by report: 11.8 and 13.9 are both there with their locations,
 *      RH stays in environmental data and never becomes a moisture reading
 *      (AC-4: no "all below 12 %"), and the meth screen is not NEGATIVE (AC-6)
 *
 * The form save uses the contract in claude-review-findings part 5, item 1
 * (`id` on loaded rows, `baseIds`). Facts only: no client data is copied.
 * Report wording (recommendations, entry point, no invented microbial growth)
 * is AI-drafted and stays a human-reviewed obligation, not asserted here.
 *
 * Runs only with DATABASE_URL (npm run test:db).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { prisma } from "@/lib/prisma";
import { GET, POST } from "../route";
import { POST as captureMoisture } from "../[id]/moisture/route";
import { POST as captureEnvironmental } from "../[id]/environmental/route";
import { PUT as saveDraft } from "../[id]/draft-snapshot/route";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `indro-${Date.now().toString(36)}`;
const ids = { owner: "", report: "", insp: "" };
const address = { propertyAddress: "1 Golden Case St, Indooroopilly QLD", propertyPostcode: "4068" };
const CEILING = "Bedroom 4 ceiling";
const WESTERN_WALL = "Bedroom 4 western wall (backs onto bathroom)";

const as = () => getServerSession.mockResolvedValue({ user: { id: ids.owner } });
const json = (method: string, url: string, body?: unknown, key?: string) =>
  new NextRequest(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const inspParams = () => ({ params: Promise.resolve({ id: ids.insp }) });

describe.skipIf(!HAS_DB)("Indooroopilly golden case", () => {
  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${S}-owner@test.local`, role: "ADMIN" },
    });
    const report = await prisma.report.create({
      data: {
        title: `${S}-report`,
        clientName: `${S} client`,
        ...address,
        hazardType: "WATER",
        insuranceType: "UNKNOWN",
        userId: owner.id,
        status: "DRAFT",
      },
      select: { id: true },
    });
    Object.assign(ids, { owner: owner.id, report: report.id });
    as();
  });

  afterAll(async () => {
    await prisma.inspection.deleteMany({ where: { report: { title: { startsWith: S } } } });
    await prisma.report.deleteMany({ where: { title: { startsWith: S } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: S } } });
  });

  it("links exactly one inspection to the report and invents no attendance date", async () => {
    const first = await POST(json("POST", "http://localhost/api/inspections", { ...address, reportId: ids.report }, `${S}-link-1`));
    expect(first.status).toBe(201);
    ids.insp = (await first.json()).inspection.id;
    const retry = await POST(json("POST", "http://localhost/api/inspections", { ...address, reportId: ids.report }, `${S}-link-2`));
    expect([200, 201, 409]).toContain(retry.status);
    expect(await prisma.inspection.count({ where: { reportId: ids.report } })).toBe(1);
    expect(await prisma.report.count({ where: { title: { startsWith: S } } })).toBe(1);
    const row = await prisma.inspection.findUniqueOrThrow({ where: { id: ids.insp } });
    expect(row.inspectionDate).toBeNull();
  });

  it("keeps MC 11.8 and 13.9 with their locations and RH apart, through a form autosave and a reopen", async () => {
    expect(ids.insp).not.toBe("");
    const mc = async (location: string, moistureLevel: number, key: string) => {
      const res = await captureMoisture(
        json("POST", `http://localhost/api/inspections/${ids.insp}/moisture`, { location, surfaceType: "Plasterboard", moistureLevel, depth: "Surface" }, key),
        inspParams(),
      );
      expect(res.status).toBe(201);
    };
    await mc(CEILING, 11.8, `${S}-mc-1`);
    // The NIR form opens now: it holds 11.8 only.
    const loaded = await prisma.moistureReading.findMany({ where: { inspectionId: ids.insp } });
    await mc(WESTERN_WALL, 13.9, `${S}-mc-2`);
    for (const [rh, key] of [[68, `${S}-rh-1`], [71, `${S}-rh-2`]] as const) {
      const res = await captureEnvironmental(
        json("POST", `http://localhost/api/inspections/${ids.insp}/environmental`, { humidityLevel: rh, ambientTemperature: 24, airCirculation: false }, key),
        inspParams(),
      );
      expect(res.status).toBe(200);
    }

    const saved = await saveDraft(
      json("PUT", `http://localhost/api/inspections/${ids.insp}/draft-snapshot`, {
        environmentalData: null,
        moistureReadings: loaded.map((r) => ({
          id: r.id, location: r.location, surfaceType: r.surfaceType, moistureLevel: r.moistureLevel, depth: r.depth,
        })),
        baseIds: { moistureReadings: loaded.map((r) => r.id) },
        affectedAreas: [],
        scopeItems: [],
      }),
      inspParams(),
    );
    expect(saved.status).toBeLessThan(300);

    const reopened = await GET(json("GET", `http://localhost/api/inspections?reportId=${ids.report}`));
    expect(reopened.status).toBe(200);
    const insp = (await reopened.json()).inspection;
    type Row = { location: string; moistureLevel: number; surfaceType: string; depth: string };
    const rows = insp.moistureReadings as Row[];
    // Exactly these two, every field: no reading lost, none invented, none rewritten.
    expect(
      rows.map((r) => [r.location, r.moistureLevel, r.surfaceType, r.depth]).sort(),
    ).toEqual([
      [CEILING, 11.8, "Plasterboard", "Surface"],
      [WESTERN_WALL, 13.9, "Plasterboard", "Surface"],
    ].sort());
    const readings = rows.map((r) => [r.location, r.moistureLevel]);
    // RH is environmental data, never a moisture reading, so no
    // "all readings below 12 %" summary can swallow it.
    expect(readings.map(([, v]) => v)).not.toContain(68);
    expect(readings.map(([, v]) => v)).not.toContain(71);
    // The autosave kept the 11.8 row it loaded, so it is the same row (photo
    // and pin links point at reading ids), not a re-created copy.
    const after = await prisma.moistureReading.findMany({ where: { inspectionId: ids.insp }, select: { id: true, moistureLevel: true } });
    expect(after.find((r) => r.moistureLevel === 11.8)?.id).toBe(loaded[0].id);
    const rh = await prisma.environmentalData.findMany({ where: { inspectionId: ids.insp }, select: { humidityLevel: true } });
    expect(rh.map((r) => r.humidityLevel).sort()).toEqual([68, 71]);
    expect(readings.some(([, v]) => (v as number) >= 12)).toBe(true);
  });

  it("does not record a meth screen result nobody tested", async () => {
    const report = await prisma.report.findUniqueOrThrow({ where: { id: ids.report } });
    expect(report.methamphetamineScreen).not.toBe("NEGATIVE");
  });
});
