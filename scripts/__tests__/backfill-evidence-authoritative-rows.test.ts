/**
 * RA-8388 backfill: the rows Guided Capture never wrote.
 *
 * The decision logic is a pure function, so most of this suite needs no
 * database. The cap, the required `--inspection` scope and the apply path
 * mock Prisma.
 *
 * What each control is FOR, in one line each, because a test whose purpose
 * is not written down is the test that gets weakened to make a build pass:
 *
 * - the photo and reading cases prove the backfill recovers what the client
 *   already captured, which is the whole reason it exists;
 * - `already-present` proves a second run does not double a reading inside an
 *   insurance file;
 * - `old-shape` proves it refuses to invent a material or a depth;
 * - the `--inspection` case proves there is no way to sweep every claim.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const inspectionPhotoFindMany = vi.fn();
const inspectionPhotoCreate = vi.fn();
const moistureFindMany = vi.fn();
const moistureCreate = vi.fn();
const environmentalFindMany = vi.fn();
const environmentalCreate = vi.fn();
const evidenceItemFindMany = vi.fn();
const inspectionFindFirst = vi.fn();
const clientSubmissionFindMany = vi.fn(
  async (..._args: unknown[]): Promise<unknown[]> => [],
);
/**
 * What the plan's reads were wrapped in. `transactionOptions` holds the
 * options every `$transaction` was opened with; `readsOutsideTransaction`
 * counts table reads made on the bare client, which must stay 0 for a plan.
 */
const snapshot = vi.hoisted(() => ({
  transactionOptions: [] as unknown[],
  readsOutsideTransaction: 0,
  inside: false,
}));

vi.mock("@/lib/prisma", () => {
  const read =
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      if (!snapshot.inside) snapshot.readsOutsideTransaction += 1;
      return fn(...args);
    };
  const client = {
    inspection: {
      findFirst: (...args: unknown[]) => inspectionFindFirst(...args),
    },
    clientEvidenceSubmission: {
      findMany: read((...args: unknown[]) => clientSubmissionFindMany(...args)),
    },
    inspectionPhoto: {
      findMany: read((...args: unknown[]) => inspectionPhotoFindMany(...args)),
      create: (...args: unknown[]) => inspectionPhotoCreate(...args),
    },
    moistureReading: {
      findMany: read((...args: unknown[]) => moistureFindMany(...args)),
      create: (...args: unknown[]) => moistureCreate(...args),
    },
    environmentalData: {
      findMany: read((...args: unknown[]) => environmentalFindMany(...args)),
      create: (...args: unknown[]) => environmentalCreate(...args),
    },
    evidenceItem: {
      findMany: read((...args: unknown[]) => evidenceItemFindMany(...args)),
    },
    $disconnect: vi.fn(),
  };
  return {
    prisma: {
      ...client,
      $transaction: async (
        fn: (tx: typeof client) => Promise<unknown>,
        options?: unknown,
      ) => {
        snapshot.transactionOptions.push(options);
        snapshot.inside = true;
        try {
          return await fn(client);
        } finally {
          snapshot.inside = false;
        }
      },
    },
  };
});

import {
  BACKFILL_PAGE,
  BackfillPageCapError,
  applyInspectionBackfill,
  decideBackfill,
  environmentalFingerprint,
  formatPlan,
  inspectionIdFromArgv,
  isOldShapeMetadata,
  moistureFingerprint,
  planFromItems,
  planInspectionBackfill,
  redactedDatabaseTarget,
  runInspectionBackfill,
  type BackfillEvidenceItem,
  type ExistingAuthoritativeRows,
} from "../backfill-evidence-authoritative-rows";
import { exemptFromSigningPolicy } from "@/lib/evidence/signing-policy";
import { buildEvidenceStructuredData } from "@/lib/evidence/structured-data";

const CAPTURED_AT = new Date("2026-11-14T02:15:00.000Z");

function emptyExisting(): ExistingAuthoritativeRows {
  return {
    linkedEvidenceIds: new Set<string>(),
    photoUrls: new Set<string>(),
    moistureFingerprints: new Set<string>(),
    environmentalFingerprints: new Set<string>(),
  };
}

function item(
  overrides: Partial<BackfillEvidenceItem> &
    Pick<BackfillEvidenceItem, "id" | "evidenceClass">,
): BackfillEvidenceItem {
  return {
    inspectionId: "insp-nir-2026-11-b3f306",
    description: null,
    roomName: null,
    structuredData: null,
    capturedAt: CAPTURED_AT,
    capturedLat: null,
    capturedLng: null,
    fileUrl: null,
    thumbnailUrl: null,
    fileMimeType: null,
    fileSizeBytes: null,
    matchesClientSubmission: false,
    ...overrides,
  };
}

/**
 * What the promote-client route stamps on every record it writes, built by
 * the SAME two calls that route makes (promote-client/route.ts). Not a
 * hand-written literal: if the key or the value the sanitiser writes ever
 * changes, this fixture changes with it and the tests below fail, instead
 * of the backfill quietly going back to counting client photographs.
 */
const PROMOTED_STRUCTURED_DATA = buildEvidenceStructuredData({
  fileSha256: null,
  downgradeReason: exemptFromSigningPolicy("CLIENT_PORTAL_PROMOTION")
    .downgradeReason,
});

/** A stored photograph record, in the shape `evidenceItem.findMany` returns. */
function storedPhoto(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    inspectionId: "insp-1",
    evidenceClass: "PHOTO_DAMAGE",
    description: null,
    roomName: null,
    structuredData: null,
    capturedAt: CAPTURED_AT,
    capturedLat: null,
    capturedLng: null,
    fileUrl: `https://storage.example/evidence/${id}.jpg`,
    thumbnailUrl: null,
    fileMimeType: "image/jpeg",
    fileSizeBytes: 100,
    ...overrides,
  };
}

function digestFrom(lines: string[]): string {
  const line = lines.find((l) => l.includes("plan digest:"));
  const match = line?.match(/plan digest: ([0-9a-f]{64})/);
  if (!match) throw new Error(`no plan digest in: ${lines.join(" | ")}`);
  return match[1];
}

const MOISTURE_PAYLOAD = JSON.stringify({
  location: "Living room south wall",
  surfaceType: "Plasterboard",
  moistureLevel: 18.4,
  depth: "Surface",
});

const AMBIENT_PAYLOAD = JSON.stringify({
  location: "Hallway",
  ambientTemperature: 23.5,
  humidityLevel: 62,
});

describe("RA-8388 authoritative-row backfill: what it recovers", () => {
  it("derives an InspectionPhoto for a photo that only wrote an EvidenceItem", () => {
    const decision = decideBackfill(
      item({
        id: "ev-photo-1",
        evidenceClass: "PHOTO_DAMAGE",
        fileUrl: "https://storage.example/evidence/kitchen.jpg",
        thumbnailUrl: "https://storage.example/evidence/kitchen-thumb.jpg",
        fileMimeType: "image/jpeg",
        fileSizeBytes: 884_120,
        roomName: "Kitchen",
        description: "Skirting lifting below the sink",
        capturedLat: -33.8721,
        capturedLng: 151.0894,
      }),
      emptyExisting(),
    );

    expect(decision.kind).toBe("write");
    if (decision.kind !== "write") return;
    expect(decision.plan.table).toBe("inspectionPhoto");
    if (decision.plan.table !== "inspectionPhoto") return;
    expect(decision.plan.data.url).toBe(
      "https://storage.example/evidence/kitchen.jpg",
    );
    expect(decision.plan.data.location).toBe("Kitchen");
    expect(decision.plan.data.timestamp).toEqual(CAPTURED_AT);
    expect(decision.plan.data.gpsLatitude).toBe(-33.8721);
  });

  it("derives a MoistureReading from a new-shape metadata capture", () => {
    const decision = decideBackfill(
      item({
        id: "ev-moisture-1",
        evidenceClass: "MOISTURE_READING",
        structuredData: MOISTURE_PAYLOAD,
      }),
      emptyExisting(),
    );

    expect(decision.kind).toBe("write");
    if (decision.kind !== "write") return;
    expect(decision.plan.table).toBe("moistureReading");
    if (decision.plan.table !== "moistureReading") return;
    expect(decision.plan.data.location).toBe("Living room south wall");
    expect(decision.plan.data.surfaceType).toBe("Plasterboard");
    expect(decision.plan.data.moistureLevel).toBe(18.4);
    expect(decision.plan.data.depth).toBe("Surface");
    expect(decision.plan.data.recordedAt).toEqual(CAPTURED_AT);
    // The route does not assert a scale it was never told; nor does this.
    expect(
      (decision.plan.data as { unit?: string | null }).unit,
    ).toBeUndefined();
  });

  it("derives EnvironmentalData from an ambient capture", () => {
    const decision = decideBackfill(
      item({
        id: "ev-ambient-1",
        evidenceClass: "AMBIENT_ENVIRONMENTAL",
        structuredData: AMBIENT_PAYLOAD,
      }),
      emptyExisting(),
    );

    expect(decision.kind).toBe("write");
    if (decision.kind !== "write") return;
    expect(decision.plan.table).toBe("environmentalData");
    if (decision.plan.table !== "environmentalData") return;
    expect(decision.plan.data.ambientTemperature).toBe(23.5);
    expect(decision.plan.data.humidityLevel).toBe(62);
  });
});

describe("RA-8388 authoritative-row backfill: what it refuses", () => {
  it("skips a photo whose row is already present, so a second run writes nothing", () => {
    const existing = emptyExisting();
    existing.photoUrls.add("https://storage.example/evidence/kitchen.jpg");

    const decision = decideBackfill(
      item({
        id: "ev-photo-1",
        evidenceClass: "PHOTO_DAMAGE",
        fileUrl: "https://storage.example/evidence/kitchen.jpg",
        fileMimeType: "image/jpeg",
      }),
      existing,
    );

    expect(decision).toEqual({ kind: "skip", reason: "already-present" });
  });

  it("skips a reading whose row is already present", () => {
    const existing = emptyExisting();
    existing.moistureFingerprints.add(
      moistureFingerprint({
        location: "Living room south wall",
        surfaceType: "Plasterboard",
        moistureLevel: 18.4,
        depth: "Surface",
        recordedAt: CAPTURED_AT,
      }),
    );

    const decision = decideBackfill(
      item({
        id: "ev-moisture-1",
        evidenceClass: "MOISTURE_READING",
        structuredData: MOISTURE_PAYLOAD,
      }),
      existing,
    );

    expect(decision).toEqual({ kind: "skip", reason: "already-present" });
  });

  it("skips an ambient reading whose row is already present", () => {
    const existing = emptyExisting();
    existing.environmentalFingerprints.add(
      environmentalFingerprint({
        location: "Hallway",
        ambientTemperature: 23.5,
        humidityLevel: 62,
        recordedAt: CAPTURED_AT,
      }),
    );

    const decision = decideBackfill(
      item({
        id: "ev-ambient-1",
        evidenceClass: "AMBIENT_ENVIRONMENTAL",
        structuredData: AMBIENT_PAYLOAD,
      }),
      existing,
    );

    expect(decision).toEqual({ kind: "skip", reason: "already-present" });
  });

  it("reports an old-shape reading instead of inventing a material or a depth", () => {
    const decision = decideBackfill(
      item({
        id: "ev-legacy-1",
        evidenceClass: "MOISTURE_READING",
        structuredData: JSON.stringify({
          measurementValue: 18.4,
          measurementUnit: "%",
        }),
      }),
      emptyExisting(),
    );

    expect(decision.kind).toBe("report");
    if (decision.kind !== "report") return;
    expect(decision.reason).toBe("old-shape");
  });

  it("tells an old-shape payload apart from a new-shape one", () => {
    expect(
      isOldShapeMetadata({ measurementValue: 18.4, measurementUnit: "%" }),
    ).toBe(true);
    expect(isOldShapeMetadata(JSON.parse(MOISTURE_PAYLOAD))).toBe(false);
    expect(isOldShapeMetadata(null)).toBe(false);
    expect(isOldShapeMetadata("18.4")).toBe(false);
  });

  it("reports a new-shape capture that is missing a required field, naming it", () => {
    const decision = decideBackfill(
      item({
        id: "ev-moisture-2",
        evidenceClass: "MOISTURE_READING",
        structuredData: JSON.stringify({
          location: "Living room south wall",
          moistureLevel: 18.4,
          depth: "Surface",
        }),
      }),
      emptyExisting(),
    );

    // Compared whole so a different report reason cannot slip past silently.
    expect(decision).toEqual({
      kind: "report",
      reason: "incomplete",
      missing: ["Material"],
    });
  });

  it("reports structured data it cannot read rather than guessing at it", () => {
    const decision = decideBackfill(
      item({
        id: "ev-broken-1",
        evidenceClass: "MOISTURE_READING",
        structuredData: "{not json",
      }),
      emptyExisting(),
    );

    expect(decision).toEqual({
      kind: "report",
      reason: "unreadable-structured-data",
    });
  });

  it("writes no row for a note, an equipment log or a document", () => {
    for (const [evidenceClass, structuredData, mimeType] of [
      ["TECHNICIAN_NOTE", JSON.stringify({ note: "Meter calibrated on site" }), null],
      [
        "EQUIPMENT_LOG",
        JSON.stringify({
          equipment: "LGR dehumidifier",
          action: "Deployed",
          location: "Living room",
        }),
        null,
      ],
      ["AUTHORITY_FORM", null, "image/jpeg"],
    ] as const) {
      const decision = decideBackfill(
        item({
          id: `ev-${evidenceClass}`,
          evidenceClass,
          structuredData,
          fileMimeType: mimeType,
          fileUrl: mimeType ? "https://storage.example/evidence/f" : null,
        }),
        emptyExisting(),
      );
      expect(decision).toEqual({
        kind: "skip",
        reason: "no-authoritative-table",
      });
    }

    // A PDF stored under a photograph class still writes no row, but it is
    // no longer folded into "no authoritative table": a photograph class
    // that does not count is listed for a person, never skipped silently.
    const pdf = decideBackfill(
      item({
        id: "ev-pdf-as-photo",
        evidenceClass: "PHOTO_DAMAGE",
        fileMimeType: "application/pdf",
        fileUrl: "https://storage.example/evidence/f",
      }),
      emptyExisting(),
    );
    expect(pdf).toEqual({ kind: "report", reason: "photo-not-image-type" });
  });

  it("reports a photo class whose file URL is missing instead of writing a row with none", () => {
    const decision = decideBackfill(
      item({
        id: "ev-photo-2",
        evidenceClass: "PHOTO_DAMAGE",
        fileMimeType: "image/jpeg",
        fileUrl: null,
      }),
      emptyExisting(),
    );

    expect(decision).toEqual({ kind: "report", reason: "photo-missing-url" });
  });
});

describe("RA-8388 backfill: the link to the evidence record (AMENDMENT 05)", () => {
  it("every reading it plans carries the link to the evidence record it came from", () => {
    // Without the link a backfilled reading is indistinguishable from one
    // typed into the NIR form, so that form would be free to rewrite or
    // delete a value an evidence record still vouches for.
    const moisture = decideBackfill(
      item({
        id: "ev-moisture-1",
        evidenceClass: "MOISTURE_READING",
        structuredData: MOISTURE_PAYLOAD,
      }),
      emptyExisting(),
    );
    const ambient = decideBackfill(
      item({
        id: "ev-ambient-1",
        evidenceClass: "AMBIENT_ENVIRONMENTAL",
        structuredData: AMBIENT_PAYLOAD,
      }),
      emptyExisting(),
    );

    if (moisture.kind !== "write" || ambient.kind !== "write") {
      throw new Error("expected both to be planned");
    }
    expect(moisture.plan.data).toMatchObject({ evidenceItemId: "ev-moisture-1" });
    expect(ambient.plan.data).toMatchObject({ evidenceItemId: "ev-ambient-1" });
  });

  it("a record whose linked reading exists is skipped even when its values no longer match", () => {
    // The value fingerprint cannot see this one: the stored reading is this
    // record's row, but a fingerprint built from a different stored value
    // would not match, and the old answer was to write a second reading.
    const existing = emptyExisting();
    existing.linkedEvidenceIds.add("ev-moisture-1");
    existing.moistureFingerprints.add(
      moistureFingerprint({
        location: "Somewhere else entirely",
        surfaceType: "Timber",
        moistureLevel: 99,
        depth: "Subsurface",
        recordedAt: new Date("2020-01-01T00:00:00.000Z"),
      }),
    );

    expect(
      decideBackfill(
        item({
          id: "ev-moisture-1",
          evidenceClass: "MOISTURE_READING",
          structuredData: MOISTURE_PAYLOAD,
        }),
        existing,
      ),
    ).toEqual({ kind: "skip", reason: "already-present" });
  });

  it("a second evidence record with the same values at the same instant is still not doubled", () => {
    // The link answers first, but it does not replace the value check: a
    // repeated submission is a different evidence record with no link of its
    // own, and it must not become a second counted reading.
    const plan = planFromItems(
      "insp-nir-2026-11-b3f306",
      [
        item({
          id: "ev-first",
          evidenceClass: "MOISTURE_READING",
          structuredData: MOISTURE_PAYLOAD,
        }),
        item({
          id: "ev-repeat",
          evidenceClass: "MOISTURE_READING",
          structuredData: MOISTURE_PAYLOAD,
        }),
      ],
      emptyExisting(),
    );

    expect(plan.write).toHaveLength(1);
    expect(plan.write[0].plan.data).toMatchObject({ evidenceItemId: "ev-first" });
    expect(plan.alreadyPresent).toBe(1);
  });

  it("reads the link from the database and writes it back on apply", async () => {
    inspectionPhotoFindMany.mockResolvedValue([]);
    environmentalFindMany.mockResolvedValue([]);
    // One reading already linked to ev-done; ev-todo has none.
    moistureFindMany.mockResolvedValue([
      {
        location: "Edited since",
        surfaceType: "Timber",
        moistureLevel: 40,
        depth: "Surface",
        recordedAt: CAPTURED_AT,
        evidenceItemId: "ev-done",
      },
    ]);
    evidenceItemFindMany.mockResolvedValue([
      item({
        id: "ev-done",
        evidenceClass: "MOISTURE_READING",
        structuredData: MOISTURE_PAYLOAD,
      }),
      item({
        id: "ev-todo",
        evidenceClass: "MOISTURE_READING",
        structuredData: JSON.stringify({
          location: "Bathroom floor",
          surfaceType: "Tile",
          moistureLevel: 27,
          depth: "Surface",
        }),
      }),
    ]);
    moistureCreate.mockResolvedValue({});

    const plan = await planInspectionBackfill("insp-nir-2026-11-b3f306");
    expect(moistureFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ evidenceItemId: true }),
      }),
    );
    expect(plan.alreadyPresent).toBe(1);
    expect(plan.write.map((row) => row.evidenceItemId)).toEqual(["ev-todo"]);

    await applyInspectionBackfill(plan);

    expect(moistureCreate).toHaveBeenCalledTimes(1);
    expect(moistureCreate.mock.calls[0][0].data).toMatchObject({
      evidenceItemId: "ev-todo",
      location: "Bathroom floor",
    });
  });
});

describe("RA-8388 backfill plan", () => {
  it("counts one of each outcome and never plans the same row twice in one pass", () => {
    const plan = planFromItems(
      "insp-nir-2026-11-b3f306",
      [
        item({
          id: "ev-photo-1",
          evidenceClass: "PHOTO_DAMAGE",
          fileUrl: "https://storage.example/evidence/kitchen.jpg",
          fileMimeType: "image/jpeg",
        }),
        // The SAME upload listed twice: one EvidenceItem per capture is the
        // invariant, and a backfill that trusts it blindly doubles the photo.
        item({
          id: "ev-photo-1-dup",
          evidenceClass: "PHOTO_DAMAGE",
          fileUrl: "https://storage.example/evidence/kitchen.jpg",
          fileMimeType: "image/jpeg",
        }),
        item({
          id: "ev-moisture-1",
          evidenceClass: "MOISTURE_READING",
          structuredData: MOISTURE_PAYLOAD,
        }),
        item({
          id: "ev-note-1",
          evidenceClass: "TECHNICIAN_NOTE",
          structuredData: JSON.stringify({ note: "Meter calibrated on site" }),
        }),
        item({
          id: "ev-legacy-1",
          evidenceClass: "MOISTURE_READING",
          structuredData: JSON.stringify({ measurementValue: 18.4 }),
        }),
      ],
      emptyExisting(),
    );

    expect(plan.scanned).toBe(5);
    expect(plan.write).toHaveLength(2);
    expect(plan.alreadyPresent).toBe(1);
    expect(plan.noAuthoritativeTable).toBe(1);
    expect(plan.report).toHaveLength(1);
    expect(plan.report[0].reason).toBe("old-shape");
  });

  it("does not mutate the existing-row sets it was given", () => {
    const existing = emptyExisting();
    planFromItems(
      "insp-1",
      [
        item({
          id: "ev-photo-1",
          evidenceClass: "PHOTO_DAMAGE",
          fileUrl: "https://storage.example/evidence/kitchen.jpg",
          fileMimeType: "image/jpeg",
        }),
      ],
      existing,
    );
    expect(existing.photoUrls.size).toBe(0);
  });
});

describe("RA-8388 backfill: the database side", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inspectionPhotoFindMany.mockResolvedValue([]);
    moistureFindMany.mockResolvedValue([]);
    environmentalFindMany.mockResolvedValue([]);
    evidenceItemFindMany.mockResolvedValue([]);
    inspectionPhotoCreate.mockResolvedValue({ id: "photo-1" });
    moistureCreate.mockResolvedValue({ id: "mr-1" });
    environmentalCreate.mockResolvedValue({ id: "ed-1" });
    clientSubmissionFindMany.mockResolvedValue([]);
    // Resolves whatever it is asked for, by id, unless a test says otherwise.
    inspectionFindFirst.mockImplementation(async (args: unknown) => {
      const where = (args as { where: { OR: Array<Record<string, string>> } })
        .where;
      const id = where.OR.map((clause) => clause.id).find(Boolean) ?? "insp-1";
      return { id, inspectionNumber: "NIR-2026-11-TEST01" };
    });
    snapshot.transactionOptions.length = 0;
    snapshot.readsOutsideTransaction = 0;
  });

  it("fingerprints an existing row and a planned row with the same function", async () => {
    moistureFindMany.mockResolvedValue([
      {
        location: "Living room south wall",
        surfaceType: "Plasterboard",
        moistureLevel: 18.4,
        depth: "Surface",
        recordedAt: CAPTURED_AT,
      },
    ]);
    evidenceItemFindMany.mockResolvedValue([
      {
        id: "ev-moisture-1",
        inspectionId: "insp-1",
        evidenceClass: "MOISTURE_READING",
        description: null,
        roomName: null,
        structuredData: MOISTURE_PAYLOAD,
        capturedAt: CAPTURED_AT,
        capturedLat: null,
        capturedLng: null,
        fileUrl: null,
        thumbnailUrl: null,
        fileMimeType: null,
        fileSizeBytes: null,
      },
    ]);

    const plan = await planInspectionBackfill("insp-1");

    expect(plan.write).toHaveLength(0);
    expect(plan.alreadyPresent).toBe(1);
  });

  it("refuses to continue when one inspection hits the row cap, writing nothing", async () => {
    inspectionPhotoFindMany.mockResolvedValue(
      Array.from({ length: BACKFILL_PAGE }, () => ({ url: "u" })),
    );

    await expect(planInspectionBackfill("insp-1")).rejects.toBeInstanceOf(
      BackfillPageCapError,
    );
    expect(inspectionPhotoCreate).not.toHaveBeenCalled();
  });

  it("writes nothing on a dry run", async () => {
    evidenceItemFindMany.mockResolvedValue([
      {
        id: "ev-photo-1",
        inspectionId: "insp-1",
        evidenceClass: "PHOTO_DAMAGE",
        description: null,
        roomName: null,
        structuredData: null,
        capturedAt: CAPTURED_AT,
        capturedLat: null,
        capturedLng: null,
        fileUrl: "https://storage.example/evidence/kitchen.jpg",
        thumbnailUrl: null,
        fileMimeType: "image/jpeg",
        fileSizeBytes: 100,
      },
    ]);

    const lines: string[] = [];
    const result = await runInspectionBackfill(
      ["--inspection", "insp-1"],
      (line) => lines.push(line),
    );

    expect(result.ok).toBe(true);
    expect(result.plan?.write).toHaveLength(1);
    expect(inspectionPhotoCreate).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("dry run");
  });

  it("writes the planned rows only with --apply", async () => {
    const plan = {
      inspectionId: "insp-1",
      scanned: 1,
      write: [
        {
          evidenceItemId: "ev-photo-1",
          plan: {
            table: "inspectionPhoto" as const,
            data: {
              inspectionId: "insp-1",
              url: "https://storage.example/evidence/kitchen.jpg",
            },
          },
        },
      ],
      alreadyPresent: 0,
      noAuthoritativeTable: 0,
      report: [],
    };

    const written = await applyInspectionBackfill(plan);

    expect(written).toEqual([
      { table: "inspectionPhoto", id: "photo-1", evidenceItemId: "ev-photo-1" },
    ]);
    expect(inspectionPhotoCreate).toHaveBeenCalledTimes(1);
    expect(moistureCreate).not.toHaveBeenCalled();
  });

  it("refuses to run without --inspection, so it can never sweep every job", async () => {
    const lines: string[] = [];
    const result = await runInspectionBackfill([], (line) => lines.push(line));

    // Not ok, so the command exits non-zero: a missing scope must never
    // read as a clean run with nothing to do.
    expect(result.ok).toBe(false);
    expect(result.plan).toBeNull();
    expect(evidenceItemFindMany).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("--inspection <id> is required");
  });

  it("treats a bare --inspection with no value as no scope at all", () => {
    expect(inspectionIdFromArgv(["--inspection"])).toBeNull();
    expect(inspectionIdFromArgv(["--inspection", "--apply"])).toBeNull();
    expect(inspectionIdFromArgv(["--inspection", "insp-1"])).toBe("insp-1");
  });

  it("names the database it is pointed at without printing the credential", () => {
    const target = redactedDatabaseTarget(
      "postgresql://user:hunter2@db.example.com:5432/restoreassist",
    );
    expect(target).toEqual({
      host: "db.example.com",
      database: "restoreassist",
    });
    expect(JSON.stringify(target)).not.toContain("hunter2");
  });
});

/**
 * Founder ruling 16/11/2026: a photograph a client sent through the portal
 * and a technician accepted is evidence, and is never a counted photograph.
 *
 * The promote-client route stores it as PHOTO_DAMAGE with a mime type and a
 * URL, which is exactly what the backfill looks for. Two signals mark it,
 * and either one is enough:
 *   - the downgrade reason every promotion has stamped since 26/07/2026;
 *   - a `ClientEvidenceSubmission` on the same inspection with the same file
 *     URL, which also covers promotions made before that marker existed.
 */
describe("RA-8388 backfill: client-promoted photographs never count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inspectionPhotoFindMany.mockResolvedValue([]);
    moistureFindMany.mockResolvedValue([]);
    environmentalFindMany.mockResolvedValue([]);
    evidenceItemFindMany.mockResolvedValue([]);
    clientSubmissionFindMany.mockResolvedValue([]);
  });

  it("a record carrying the promotion marker is reported, not written", () => {
    const decision = decideBackfill(
      item({
        id: "ev-client-1",
        evidenceClass: "PHOTO_DAMAGE",
        fileUrl: "https://storage.example/portal/front-door.jpg",
        fileMimeType: "image/jpeg",
        structuredData: PROMOTED_STRUCTURED_DATA,
      }),
      emptyExisting(),
    );
    expect(decision).toEqual({ kind: "report", reason: "client-promoted" });
  });

  it("a record whose file matches a portal submission is reported even with no marker", () => {
    const decision = decideBackfill(
      item({
        id: "ev-client-old",
        evidenceClass: "PHOTO_DAMAGE",
        fileUrl: "https://storage.example/portal/old.jpg",
        fileMimeType: "image/jpeg",
        matchesClientSubmission: true,
      }),
      emptyExisting(),
    );
    expect(decision).toEqual({ kind: "report", reason: "client-promoted" });
  });

  it("reads the portal submissions for the job and plans only the technician's photograph", async () => {
    clientSubmissionFindMany.mockResolvedValue([
      { fileUrl: "https://storage.example/evidence/ev-client-old.jpg" },
    ]);
    evidenceItemFindMany.mockResolvedValue([
      storedPhoto("ev-tech"),
      storedPhoto("ev-client-marked", {
        structuredData: PROMOTED_STRUCTURED_DATA,
      }),
      // Promoted before the marker existed: nothing on the record says so.
      storedPhoto("ev-client-old"),
    ]);

    const plan = await planInspectionBackfill("insp-1");

    expect(clientSubmissionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ inspectionId: "insp-1" }),
      }),
    );
    expect(plan.write.map((row) => row.evidenceItemId)).toEqual(["ev-tech"]);
    expect(
      plan.report.map((row) => [row.evidenceItemId, row.reason]),
    ).toEqual([
      ["ev-client-marked", "client-promoted"],
      ["ev-client-old", "client-promoted"],
    ]);

    // Named in the printed plan under its own reason, with its own count.
    const text = formatPlan(plan, null).join("\n");
    expect(text).toContain("client-promoted\tevidence=ev-client-marked");
    expect(text).toContain("client-promoted\tevidence=ev-client-old");
    expect(text).toMatch(/client-promoted photographs[^\n]*: 2/);
  });

  it("refuses to plan when the portal-submission read is cut off at the cap", async () => {
    // A truncated list would let a client photograph past the join.
    clientSubmissionFindMany.mockResolvedValue(
      Array.from({ length: BACKFILL_PAGE }, () => ({ fileUrl: "u" })),
    );
    evidenceItemFindMany.mockResolvedValue([storedPhoto("ev-tech")]);

    await expect(planInspectionBackfill("insp-1")).rejects.toBeInstanceOf(
      BackfillPageCapError,
    );
  });

  it("a photograph whose provenance cannot be read is reported, not assumed to be the technician's", () => {
    const decision = decideBackfill(
      item({
        id: "ev-photo-bad-json",
        evidenceClass: "PHOTO_DAMAGE",
        fileUrl: "https://storage.example/evidence/x.jpg",
        fileMimeType: "image/jpeg",
        structuredData: "{not json",
      }),
      emptyExisting(),
    );
    expect(decision).toEqual({
      kind: "report",
      reason: "unreadable-structured-data",
    });
  });
});

/**
 * The conditions a production run of this script has to meet. Each one is a
 * way the previous version could report success on the wrong thing.
 */
describe("RA-8388 backfill: release preconditions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inspectionPhotoFindMany.mockResolvedValue([]);
    moistureFindMany.mockResolvedValue([]);
    environmentalFindMany.mockResolvedValue([]);
    evidenceItemFindMany.mockResolvedValue([storedPhoto("ev-photo-1")]);
    clientSubmissionFindMany.mockResolvedValue([]);
    inspectionPhotoCreate.mockResolvedValue({ id: "photo-new-1" });
    moistureCreate.mockResolvedValue({ id: "mr-new-1" });
    environmentalCreate.mockResolvedValue({ id: "ed-new-1" });
    inspectionFindFirst.mockResolvedValue({
      id: "insp-1",
      inspectionNumber: "NIR-2026-11-B3F306",
    });
    snapshot.transactionOptions.length = 0;
    snapshot.readsOutsideTransaction = 0;
  });

  async function run(argv: string[]) {
    const lines: string[] = [];
    const result = await runInspectionBackfill(argv, (line) =>
      lines.push(line),
    );
    return { result, lines, text: lines.join("\n") };
  }

  it("accepts the job number and plans against the inspection it resolves to", async () => {
    const { result, text } = await run(["--inspection", "NIR-2026-11-B3F306"]);

    expect(inspectionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { id: "NIR-2026-11-B3F306" },
            { inspectionNumber: "NIR-2026-11-B3F306" },
          ],
        },
      }),
    );
    // The evidence is read by the resolved internal id, never by the number.
    expect(evidenceItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ inspectionId: "insp-1" }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.plan?.inspectionId).toBe("insp-1");
    expect(text).toContain("insp-1");
    expect(text).toContain("NIR-2026-11-B3F306");
  });

  it("an inspection that does not exist is a failure, not an empty plan", async () => {
    inspectionFindFirst.mockResolvedValue(null);

    const { result, text } = await run(["--inspection", "NIR-2026-11-NOPE00"]);

    expect(result.ok).toBe(false);
    expect(result.plan).toBeNull();
    expect(text).toContain("inspection not found");
    expect(evidenceItemFindMany).not.toHaveBeenCalled();
    expect(inspectionPhotoCreate).not.toHaveBeenCalled();
  });

  it("the dry run prints a digest of the planned writes that is stable between runs", async () => {
    const first = await run(["--inspection", "insp-1"]);
    // A different wall clock must not change it: `uploadedAt` is stamped at
    // plan time and is not part of what a person approved.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-01-01T00:00:00.000Z"));
    let second;
    try {
      second = await run(["--inspection", "insp-1"]);
    } finally {
      vi.useRealTimers();
    }
    expect(digestFrom(second.lines)).toBe(digestFrom(first.lines));

    // One more photograph is a different plan, so a different digest.
    evidenceItemFindMany.mockResolvedValue([
      storedPhoto("ev-photo-1"),
      storedPhoto("ev-photo-2"),
    ]);
    const third = await run(["--inspection", "insp-1"]);
    expect(digestFrom(third.lines)).not.toBe(digestFrom(first.lines));
  });

  it("--apply without the digest of a dry run writes nothing and fails", async () => {
    const { result, text } = await run(["--inspection", "insp-1", "--apply"]);

    expect(result.ok).toBe(false);
    expect(inspectionPhotoCreate).not.toHaveBeenCalled();
    expect(text).toContain("--expect-plan");
  });

  it("--apply with a digest that no longer matches writes nothing and fails", async () => {
    const dry = await run(["--inspection", "insp-1"]);
    const approved = digestFrom(dry.lines);
    // The job took another capture between the dry run and the apply.
    evidenceItemFindMany.mockResolvedValue([
      storedPhoto("ev-photo-1"),
      storedPhoto("ev-photo-2"),
    ]);

    const { result, text } = await run([
      "--inspection",
      "insp-1",
      "--apply",
      "--expect-plan",
      approved,
    ]);

    expect(result.ok).toBe(false);
    expect(inspectionPhotoCreate).not.toHaveBeenCalled();
    expect(text).toContain("does not match");
  });

  it("--apply with the matching digest writes, and prints one line per created row", async () => {
    const dry = await run(["--inspection", "insp-1"]);

    const { result, lines } = await run([
      "--inspection",
      "insp-1",
      "--apply",
      "--expect-plan",
      digestFrom(dry.lines),
    ]);

    expect(result.ok).toBe(true);
    expect(inspectionPhotoCreate).toHaveBeenCalledTimes(1);
    // Table, the NEW row's id, and the evidence record it was derived from:
    // what a person needs to undo exactly this run and nothing else.
    expect(
      lines.filter((line) => line.includes("created\t")),
    ).toEqual([
      "[ra-8388-backfill] created\ttable=inspectionPhoto\tid=photo-new-1\tevidence=ev-photo-1",
    ]);
  });

  it("a run that fails part way has already printed the rows it did write", async () => {
    evidenceItemFindMany.mockResolvedValue([
      storedPhoto("ev-photo-1"),
      storedPhoto("ev-photo-2"),
    ]);
    const dry = await run(["--inspection", "insp-1"]);
    inspectionPhotoCreate
      .mockResolvedValueOnce({ id: "photo-new-1" })
      .mockRejectedValueOnce(new Error("connection lost"));

    const lines: string[] = [];
    await expect(
      runInspectionBackfill(
        ["--inspection", "insp-1", "--apply", "--expect-plan", digestFrom(dry.lines)],
        (line) => lines.push(line),
      ),
    ).rejects.toThrow("connection lost");

    expect(lines.filter((line) => line.includes("created\t"))).toEqual([
      "[ra-8388-backfill] created\ttable=inspectionPhoto\tid=photo-new-1\tevidence=ev-photo-1",
    ]);
  });

  it("reads the evidence and the existing rows in ONE repeatable-read snapshot", async () => {
    await planInspectionBackfill("insp-1");

    expect(evidenceItemFindMany).toHaveBeenCalledTimes(1);
    expect(inspectionPhotoFindMany).toHaveBeenCalledTimes(1);
    // Every table read ran inside the transaction, and there was one.
    expect(snapshot.readsOutsideTransaction).toBe(0);
    expect(snapshot.transactionOptions).toEqual([
      expect.objectContaining({
        isolationLevel: "RepeatableRead",
        maxWait: expect.any(Number),
        timeout: expect.any(Number),
      }),
    ]);
  });
});
