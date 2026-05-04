import { describe, expect, it, vi } from "vitest";
import {
  AnchorIntegrityError,
  assertNoAnchors,
  checkRequiredAnchors,
  createAnchor,
  type MinimalAnchorPrisma,
} from "../geometry-anchors";

function makeMock(opts?: {
  countResult?: number;
  findManyResult?: Array<{ geometryType: string; geometryId: string }>;
}): MinimalAnchorPrisma & { __calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = {
    create: [],
    count: [],
    findMany: [],
    deleteMany: [],
  };
  const mock: MinimalAnchorPrisma = {
    geometryAnchor: {
      create: vi.fn(async (args) => {
        calls.create.push(args);
        return { id: `anc_${calls.create.length}` };
      }),
      count: vi.fn(async (args) => {
        calls.count.push(args);
        return opts?.countResult ?? 0;
      }),
      findMany: vi.fn(async (args) => {
        calls.findMany.push(args);
        return opts?.findManyResult ?? [];
      }),
      deleteMany: vi.fn(async (args) => {
        calls.deleteMany.push(args);
      }),
    },
  };
  return Object.assign(mock, { __calls: calls });
}

describe("geometry-anchors — createAnchor", () => {
  it("creates an anchor when exactly one evidence ref is provided", async () => {
    const mock = makeMock();
    const out = await createAnchor(mock, {
      floorPlanId: "fp1",
      geometryType: "WALL",
      geometryId: "w1",
      moistureReadingId: "mr1",
    });
    expect(out.id).toBe("anc_1");
    expect(mock.__calls.create).toHaveLength(1);
  });

  it("rejects an anchor with zero evidence refs", async () => {
    const mock = makeMock();
    await expect(
      createAnchor(mock, {
        floorPlanId: "fp1",
        geometryType: "WALL",
        geometryId: "w1",
      }),
    ).rejects.toThrow(/exactly one evidence/);
  });

  it("rejects an anchor with multiple evidence refs", async () => {
    const mock = makeMock();
    await expect(
      createAnchor(mock, {
        floorPlanId: "fp1",
        geometryType: "WALL",
        geometryId: "w1",
        moistureReadingId: "mr1",
        inspectionPhotoId: "ph1",
      }),
    ).rejects.toThrow(/exactly one evidence/);
  });
});

describe("geometry-anchors — assertNoAnchors", () => {
  it("is a no-op when no anchors reference the geometry", async () => {
    const mock = makeMock({ countResult: 0 });
    await expect(assertNoAnchors(mock, ["w1", "w2"])).resolves.toBeUndefined();
  });

  it("throws AnchorIntegrityError when anchors exist", async () => {
    const mock = makeMock({ countResult: 3 });
    await expect(assertNoAnchors(mock, ["w1"])).rejects.toBeInstanceOf(
      AnchorIntegrityError,
    );
    await expect(assertNoAnchors(mock, ["w1"])).rejects.toMatchObject({
      anchorCount: 3,
    });
  });

  it("returns immediately on empty input", async () => {
    const mock = makeMock();
    await assertNoAnchors(mock, []);
    expect(mock.__calls.count).toHaveLength(0);
  });
});

describe("geometry-anchors — checkRequiredAnchors", () => {
  it("returns ok:true when required is empty", async () => {
    const mock = makeMock();
    expect(await checkRequiredAnchors(mock, [])).toEqual({ ok: true });
  });

  it("returns ok:true when every required tuple is satisfied", async () => {
    const mock = makeMock({
      findManyResult: [
        { geometryType: "WALL", geometryId: "w1" },
        { geometryType: "ROOM", geometryId: "r1" },
      ],
    });
    const result = await checkRequiredAnchors(mock, [
      { geometryType: "WALL", geometryId: "w1" },
      { geometryType: "ROOM", geometryId: "r1" },
    ]);
    expect(result.ok).toBe(true);
  });

  it("returns ok:false with the missing tuples", async () => {
    const mock = makeMock({
      findManyResult: [{ geometryType: "WALL", geometryId: "w1" }],
    });
    const result = await checkRequiredAnchors(mock, [
      { geometryType: "WALL", geometryId: "w1" },
      { geometryType: "ROOM", geometryId: "r1" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual([
        { geometryType: "ROOM", geometryId: "r1" },
      ]);
    }
  });
});
