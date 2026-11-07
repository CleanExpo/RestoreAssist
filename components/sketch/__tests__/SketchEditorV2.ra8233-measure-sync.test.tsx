// @vitest-environment jsdom
/**
 * RA-8233 (Codex round 1) — editor to route handler, real canvas.
 *
 * The real SketchEditorV2 drives the real SketchCanvas (real fabric 7) and
 * every autosave is answered by the real sketch POST route over a small
 * stateful database stand-in. After a measured Confirm, a geometry edit must
 * put the room back to AI-suggested on screen, as the server stores and bills
 * it — whether the edit lands after the measurement was recorded or before
 * the save that would have carried it.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType, ForwardedRef } from "react";
import { NextRequest } from "next/server";
import { prisma as scopePrisma } from "@/lib/prisma";

vi.mock("@/lib/supabase-server", () => ({ isSupabaseServerConfigured: () => false }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => ({ user: { id: "u_tech" } })) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  writeWithinInspectionScope: async (
    _scope: unknown,
    _data: unknown,
    work: (tx: unknown) => unknown,
  ) => work(scopePrisma),
  assertInspectionAssignedWrite: vi.fn(async () => ({
    ok: true,
    data: {
      inspectionWhere: { id: "job-1" },
      inspectionManyWhere: { id: "job-1" },
      childInspectionFilter: undefined,
      viaAssignment: false,
    },
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    claimSketch: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
      update: vi.fn(),
      create: vi.fn(),
    },
    sketchUnderlayReference: { findFirst: vi.fn(async () => null), update: vi.fn() },
    material: { findMany: vi.fn(async () => []) },
    sketchElement: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    sketchRoom: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    sketchMoistureReading: {
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));

const created = vi.hoisted(() => ({ canvases: [] as unknown[] }));
vi.mock("fabric", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fabric")>();
  class RecordedCanvas extends actual.Canvas {
    constructor(...args: ConstructorParameters<typeof actual.Canvas>) {
      super(...args);
      created.canvases.push(this);
    }
  }
  return { ...actual, Canvas: RecordedCanvas };
});
vi.mock("@/lib/nir-sync-queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nir-sync-queue")>();
  return {
    ...actual,
    enqueueSketchSave: vi.fn(async () => "q1"),
    getPendingEntries: vi.fn(async () => []),
    getFailedEntries: vi.fn(async () => []),
  };
});

const canvasReadyCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return {
    default: (
      loader: () => Promise<{ default: ComponentType<Record<string, unknown>> }>,
    ) => {
      let Loaded: ComponentType<Record<string, unknown>> | null = null;
      const pending = loader().then((mod) => {
        Loaded = (mod.default ?? mod) as ComponentType<Record<string, unknown>>;
      });
      return React.forwardRef(function DynamicSketch(
        props: Record<string, unknown>,
        ref: ForwardedRef<unknown>,
      ) {
        const [, setTick] = React.useState(0);
        React.useEffect(() => {
          let live = true;
          void pending.then(() => {
            if (live) setTick((n) => n + 1);
          });
          return () => {
            live = false;
          };
        }, []);
        if (!Loaded) return null;
        const onReady = props.onReady as ((canvas: unknown) => void) | undefined;
        return React.createElement(Loaded, {
          ...props,
          ...(onReady
            ? {
                onReady: (canvas: unknown) => {
                  onReady(canvas);
                  canvasReadyCalls.count += 1;
                },
              }
            : {}),
          ref,
        });
      });
    },
  };
});

import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/inspections/[id]/sketches/route";
import { SketchEditorV2 } from "../SketchEditorV2";

type Fn = ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  claimSketch: { findFirst: Fn; update: Fn; create: Fn };
  sketchRoom: { findMany: Fn; create: Fn; update: Fn };
};

const ROOM_ID = "ai-suggested-lounge";

const aiRoom = {
  type: "Polygon",
  left: 0,
  top: 0,
  points: [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 300 },
    { x: 0, y: 300 },
  ],
  data: {
    type: "room",
    id: ROOM_ID,
    label: "Lounge",
    provenance: "ai_suggested",
    captureAdapter: "cloud_ai",
    areaM2: 9,
  },
};

/** The server's state: the floor blob and its SketchRoom rows. */
const db = {
  sketchData: {} as Record<string, unknown>,
  rows: [] as Array<Record<string, unknown>>,
};
const posts: Array<Record<string, unknown>> = [];

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function installDb() {
  p.claimSketch.findFirst.mockImplementation(async () => ({
    id: "srv-1",
    sketchData: db.sketchData,
    updatedAt: new Date("2020-01-01T00:00:00Z"),
  }));
  p.claimSketch.update.mockImplementation(
    async ({ data }: { data: { sketchData?: Record<string, unknown> } }) => {
      if (data.sketchData) db.sketchData = data.sketchData;
      return { id: "srv-1", sketchData: db.sketchData };
    },
  );
  p.sketchRoom.findMany.mockImplementation(async () =>
    db.rows.map((r) => ({
      ...r,
      _count: { evidencePins: 0, moistureReadings: 0, hazards: 0, jobMoistureReadings: 0 },
    })),
  );
  p.sketchRoom.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = db.rows.find((r) => r.id === where.id);
      if (row) Object.assign(row, data);
      return row;
    },
  );
  p.sketchRoom.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `sr_${db.rows.length + 1}`, detachedAt: null, ...data };
      db.rows.push(row);
      return row;
    },
  );
}

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.endsWith("/sketches") && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        posts.push(body);
        // The real route answers. The revision header is left off: RA-8056
        // staleness is covered elsewhere and is not what this test measures.
        const res = await POST(
          new NextRequest("http://localhost/api/inspections/job-1/sketches", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
          { params: Promise.resolve({ id: "job-1" }) },
        );
        return jsonResponse(await res.json(), res.status);
      }
      if (url.endsWith("/sketches") && method === "GET") {
        return jsonResponse({
          sketches: [
            { id: "srv-1", floorNumber: 0, floorLabel: "Ground Floor", sketchData: db.sketchData },
          ],
        });
      }
      if (url.includes("/photos")) return jsonResponse({ photos: [] });
      if (url.includes("/materials")) return jsonResponse({ materials: [] });
      return jsonResponse({});
    }),
  );
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  for (let i = 0; i < 30; i++) {
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
  }
}

type FabricObj = {
  data?: Record<string, unknown>;
  set?: (k: string, v: unknown) => void;
  setCoords?: () => void;
};
type FabricLike = {
  getObjects: () => FabricObj[];
  setActiveObject: (o: unknown) => void;
  fire: (name: string, opts: unknown) => void;
};

async function waitUntil<T>(
  ready: () => T | null | undefined | false,
  what: string,
  { timeoutMs = 15_000, advanceMs = 0 }: { timeoutMs?: number; advanceMs?: number } = {},
): Promise<T> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const value = ready();
    if (value) return value;
    if (performance.now() > deadline) {
      throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`);
    }
    await settle(advanceMs);
  }
}

async function renderJob(): Promise<FabricLike> {
  const canvasesBefore = created.canvases.length;
  const readyBefore = canvasReadyCalls.count;
  render(<SketchEditorV2 inspectionId="job-1" />);
  const fc = await waitUntil(() => {
    if (created.canvases.length <= canvasesBefore) return null;
    if (canvasReadyCalls.count <= readyBefore) return null;
    const latest = created.canvases.at(-1) as FabricLike;
    if (!latest.getObjects().some((o) => o.data?.id === ROOM_ID)) return null;
    if (!screen.queryByRole("button", { name: "Undo (Ctrl+Z)" })) return null;
    return latest;
  }, "the editor's canvas with the AI room loaded", { advanceMs: 50 });
  await settle(0);
  return fc;
}

function lounge(fc: FabricLike): FabricObj {
  return fc.getObjects().find((o) => o.data?.id === ROOM_ID)!;
}

async function selectLounge(fc: FabricLike) {
  const obj = lounge(fc);
  act(() => {
    fc.setActiveObject(obj);
    fc.fire("selection:created", { selected: [obj] });
  });
}

const CONFIRM = "Confirm AI-suggested measurement";
const AI_NOTICE = "AI-suggested geometry — excluded from measured quantities until confirmed.";

async function measureAndConfirm(fc: FabricLike) {
  await selectLounge(fc);
  await waitUntil(() => screen.queryByLabelText("Measured length (m)"), "the measurement inputs");
  fireEvent.change(screen.getByLabelText("Measured length (m)"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Measured width (m)"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: CONFIRM }));
}

function resizeLounge(fc: FabricLike) {
  const obj = lounge(fc);
  act(() => {
    obj.set?.("scaleY", 1.2);
    obj.setCoords?.();
    fc.fire("object:modified", { target: obj });
  });
}

async function nextSave() {
  const before = posts.length;
  await settle(1600);
  await waitUntil(() => posts.length > before, "the autosave POST");
  await settle(0);
}

function storedRow() {
  return db.rows.find((r) => r.fabricObjectId === ROOM_ID);
}

describe("RA-8233 editor stays in step with the server (real canvas, real route)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    posts.length = 0;
    db.sketchData = {
      scaleConfig: { pxPerMetre: 100 },
      objects: [aiRoom],
      raSketchMeta: { aiSuggestedRoomIds: [ROOM_ID] },
    };
    db.rows = [];
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    installDb();
    installFetch();
    return import("@/lib/sketch/ingest-roomplan");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("measured Confirm bills; a later resize shows the room as AI-suggested again", async () => {
    const fc = await renderJob();
    await measureAndConfirm(fc);
    await nextSave();

    expect(posts.at(-1)?.roomMeasurements).toEqual([
      { fabricObjectId: ROOM_ID, lengthM: 3, widthM: 3 },
    ]);
    expect(storedRow()?.provenance).toBe("operator_measured");
    expect(lounge(fc).data?.provenance).toBe("operator_measured");
    expect(screen.queryByText(AI_NOTICE)).toBeNull();

    resizeLounge(fc);
    await nextSave();

    // The second save carries no measurement; the server invalidated the
    // evidence and the editor follows its answer.
    expect(posts.at(-1)?.roomMeasurements).toBeUndefined();
    expect(storedRow()?.provenance).toBe("ai_suggested");
    expect(lounge(fc).data?.provenance).toBe("ai_suggested");
    await selectLounge(fc);
    await waitUntil(() => screen.queryByText(AI_NOTICE), "the AI-suggested notice");
    expect((screen.getByRole("button", { name: CONFIRM }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a resize before the save drops the pending measurement instead of binding it to the new shape", async () => {
    const fc = await renderJob();
    await measureAndConfirm(fc);
    resizeLounge(fc);
    await nextSave();

    expect(posts.every((b) => b.roomMeasurements === undefined)).toBe(true);
    expect(storedRow()?.provenance).toBe("ai_suggested");
    expect(lounge(fc).data?.provenance).toBe("ai_suggested");
  });
});
