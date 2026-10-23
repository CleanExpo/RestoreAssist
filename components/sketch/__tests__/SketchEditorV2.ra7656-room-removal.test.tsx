// @vitest-environment jsdom
/**
 * RA-7656 (Codex round 4) — editor to route handler, real canvas.
 *
 * The real SketchEditorV2 drives the real SketchCanvas (real fabric 7). When a
 * user action takes the last room off the canvas - Undo, keyboard Ctrl+Z,
 * Redo, the selection panel's Delete - the save that follows carries
 * `userRemovedRooms: true`, and the real route handler applies it: the stored
 * rooms are deleted or detached and the new drawing is saved. Loads, a job
 * switch and adding or switching floors never mark a save.
 *
 * Only the database, auth, storage and the browser's ResizeObserver/IndexedDB
 * are stood in for.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType, ForwardedRef } from "react";
import { NextRequest } from "next/server";
import { prisma as scopePrisma } from "@/lib/prisma";

// ── Route-side stand-ins (same shape as ra7656-empty-save.test.ts) ──
vi.mock("@/lib/supabase-server", () => ({ isSupabaseServerConfigured: () => false }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => ({ user: { id: "u_1" } })) }));
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
      update: vi.fn(async () => ({ id: "srv-1" })),
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
      create: vi.fn(async () => ({ id: "sr_new" })),
      update: vi.fn(async () => ({ id: "sr_existing" })),
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

// ── Client-side stand-ins ──
/** Every fabric.Canvas the real SketchCanvas creates (the class is unchanged). */
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
        return React.createElement(Loaded, { ...props, ref });
      });
    },
  };
});

import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/inspections/[id]/sketches/route";
import { SketchEditorV2 } from "../SketchEditorV2";

type Fn = ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  claimSketch: { findFirst: Fn; update: Fn };
  sketchElement: { deleteMany: Fn };
  sketchRoom: { findMany: Fn; deleteMany: Fn; updateMany: Fn };
};

function room(id: string, label: string, x: number) {
  return {
    type: "Polygon",
    left: x,
    top: 0,
    points: [
      { x, y: 0 },
      { x: x + 300, y: 0 },
      { x: x + 300, y: 300 },
      { x, y: 300 },
    ],
    data: { type: "room", id, label, provenance: "operator_measured" },
  };
}
const freehand = { type: "Path", path: [["M", 0, 0], ["L", 50, 50]], data: { type: "freehand" } };

/** What the server holds: Kitchen (no evidence) and Laundry (one pin). */
const storedRows = [
  { id: "sr_kitchen", fabricObjectId: "room-kitchen", pins: 0 },
  { id: "sr_laundry", fabricObjectId: "room-laundry", pins: 1 },
].map(({ id, fabricObjectId, pins }) => ({
  id,
  fabricObjectId,
  name: fabricObjectId,
  geometryJson: null,
  originalAreaM2: null,
  originalGeometryJson: null,
  confirmedAt: null,
  confirmedBy: null,
  provenance: "operator_measured",
  detachedAt: null,
  _count: { evidencePins: pins, moistureReadings: 0, hazards: 0, jobMoistureReadings: 0 },
}));

const posts: Array<Record<string, unknown>> = [];
let loadedDrawing: Record<string, unknown> = { objects: [] };

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.endsWith("/sketches") && method === "POST") {
        posts.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        return jsonResponse({ id: "srv-1" }, 201);
      }
      if (url.endsWith("/sketches") && method === "GET") {
        return jsonResponse({
          sketches: [
            { id: "srv-1", floorNumber: 0, floorLabel: "Ground Floor", sketchData: loadedDrawing },
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

type FabricLike = {
  getObjects: () => Array<{ data?: { type?: string; id?: string } }>;
  add: (...o: unknown[]) => void;
  remove: (...o: unknown[]) => void;
  setActiveObject: (o: unknown) => void;
  fire: (name: string, opts: unknown) => void;
};

let fabricCanvas: FabricLike | null = null;

async function latestCanvas(after: number) {
  for (let i = 0; i < 60 && created.canvases.length <= after; i++) await settle(0);
  // Let the bootstrap load and onReady finish.
  for (let i = 0; i < 10; i++) await settle(0);
  return (created.canvases.at(-1) as FabricLike | undefined) ?? null;
}

async function renderJob(drawing: Record<string, unknown>) {
  loadedDrawing = drawing;
  const before = created.canvases.length;
  const view = render(<SketchEditorV2 inspectionId="job-1" />);
  fabricCanvas = await latestCanvas(before);
  return view;
}

async function enliven(json: Record<string, unknown>) {
  const fabric = await import("fabric");
  const [obj] = await fabric.util.enlivenObjects([json]);
  return obj;
}

function roomsOn(fc: FabricLike) {
  return fc.getObjects().filter((o) => o.data?.type === "room").map((o) => o.data?.id);
}

function lastPost() {
  return posts.at(-1) as Record<string, unknown> & {
    userRemovedRooms?: unknown;
    sketchData?: { objects?: Array<{ data?: { type?: string } }> };
  };
}

/** Feed the editor's last POST body to the real route handler. */
async function sendLastPostToRoute() {
  const res = await POST(
    new NextRequest("http://localhost/api/inspections/job-1/sketches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(lastPost()),
    }),
    { params: Promise.resolve({ id: "job-1" }) },
  );
  return res;
}

function expectRoutePersistedRemoval(status: number) {
  expect(status).toBe(201);
  const data = p.claimSketch.update.mock.calls.at(-1)?.[0]?.data;
  expect(data.sketchData).toBeDefined();
  expect(
    (data.sketchData.objects as Array<{ data?: { type?: string } }>).some(
      (o) => o.data?.type === "room",
    ),
  ).toBe(false);
  expect(p.sketchRoom.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["sr_kitchen"] } } });
  expect(p.sketchRoom.updateMany.mock.calls.at(-1)?.[0]?.where).toEqual({
    id: { in: ["sr_laundry"] },
    detachedAt: null,
  });
}

/** Wait for the debounced autosave (1.5 s) and the POST it sends. */
async function nextSave() {
  const before = posts.length;
  await settle(1600);
  for (let i = 0; i < 20 && posts.length === before; i++) await settle(100);
}

describe("RA-7656 editor room removal (real canvas, real route)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    posts.length = 0;
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    installFetch();
    p.claimSketch.findFirst.mockResolvedValue({
      id: "srv-1",
      sketchData: { objects: [room("room-kitchen", "Kitchen", 0), room("room-laundry", "Laundry", 400)] },
      updatedAt: new Date("2020-01-01T00:00:00Z"),
    });
    p.sketchRoom.findMany.mockImplementation(async () => storedRows);
    return import("@/lib/sketch/ingest-roomplan");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("RA-7656 editor room removal: Undo (toolbar button) of the last room marks the save and the route removes the rooms", async () => {
    await renderJob({ objects: [freehand] });
    const fc = fabricCanvas!;
    expect(fc).not.toBeNull();
    const kitchen = await enliven(room("room-kitchen", "Kitchen", 0));
    act(() => fc.add(kitchen));
    await nextSave();
    // The editor refreshes the Undo button on the next edit, as a user sees it.
    const stroke = await enliven(freehand);
    act(() => fc.add(stroke));
    await nextSave();
    expect(posts.every((b) => b.userRemovedRooms === undefined)).toBe(true);

    const undo = screen.getByRole("button", { name: "Undo (Ctrl+Z)" });
    expect((undo as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(undo); // takes the stroke off: no room leaves
    await nextSave();
    expect(roomsOn(fc)).toEqual(["room-kitchen"]);
    expect(lastPost().userRemovedRooms).toBeUndefined();
    fireEvent.click(undo); // takes the room off
    await nextSave();
    expect(roomsOn(fc)).toEqual([]);
    expect(lastPost().sketchData?.objects?.some((o) => o.data?.type === "room")).toBe(false);
    expect(lastPost().userRemovedRooms).toBe(true);
    expectRoutePersistedRemoval((await sendLastPostToRoute()).status);
  });

  it("RA-7656 editor room removal: keyboard Ctrl+Z of the last room marks the next save", async () => {
    await renderJob({ objects: [freehand] });
    const fc = fabricCanvas!;
    const kitchen = await enliven(room("room-kitchen", "Kitchen", 0));
    act(() => fc.add(kitchen));
    await nextSave();

    await act(async () => {
      fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    });
    await settle(0);
    expect(roomsOn(fc)).toEqual([]);
    // Keyboard undo does not schedule a save by itself; the next stroke does.
    const path = await enliven(freehand);
    act(() => fc.add(path));
    await nextSave();
    expect(lastPost().userRemovedRooms).toBe(true);
    expectRoutePersistedRemoval((await sendLastPostToRoute()).status);
  });

  it("RA-7656 editor room removal: Redo that takes the last room off again marks the save", async () => {
    await renderJob({ objects: [freehand, room("room-kitchen", "Kitchen", 0)] });
    const fc = fabricCanvas!;
    const kitchen = fc.getObjects().find((o) => o.data?.id === "room-kitchen");
    act(() => fc.remove(kitchen));
    await nextSave();
    expect(lastPost().userRemovedRooms).toBe(true); // acknowledged: the mark is spent

    const undo = screen.getByRole("button", { name: "Undo (Ctrl+Z)" });
    const stroke = await enliven(freehand);
    act(() => fc.add(stroke)); // refreshes the Undo button
    await nextSave();
    expect(lastPost().userRemovedRooms).toBeUndefined();
    fireEvent.click(undo); // stroke off
    await nextSave();
    fireEvent.click(undo); // Kitchen back: nothing left the canvas
    await nextSave();
    expect(roomsOn(fc)).toEqual(["room-kitchen"]);
    expect(lastPost().userRemovedRooms).toBeUndefined();

    // Redo (the toolbar's Redo state only refreshes on an edit, so use the
    // canvas's keyboard shortcut, then the next stroke saves).
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "z", ctrlKey: true, shiftKey: true });
    });
    await settle(0);
    expect(roomsOn(fc)).toEqual([]);
    const after = await enliven(freehand);
    act(() => fc.add(after));
    await nextSave();
    expect(lastPost().userRemovedRooms).toBe(true);
    expectRoutePersistedRemoval((await sendLastPostToRoute()).status);
  });

  it("RA-7656 editor room removal: the selection panel's Delete on the last room marks the save", async () => {
    await renderJob({ objects: [freehand, room("room-kitchen", "Kitchen", 0)] });
    const fc = fabricCanvas!;
    const kitchen = fc.getObjects().find((o) => o.data?.id === "room-kitchen");
    act(() => {
      fc.setActiveObject(kitchen);
      fc.fire("selection:created", { selected: [kitchen] });
    });
    await settle(0);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await nextSave();
    expect(roomsOn(fc)).toEqual([]);
    expect(lastPost().userRemovedRooms).toBe(true);
    expectRoutePersistedRemoval((await sendLastPostToRoute()).status);
  });

  it("RA-7656 editor room removal: loading a drawing with rooms, then an ordinary edit, carries no mark", async () => {
    await renderJob({ objects: [room("room-kitchen", "Kitchen", 0), room("room-laundry", "Laundry", 400)] });
    const fc = fabricCanvas!;
    expect(roomsOn(fc)).toEqual(["room-kitchen", "room-laundry"]);
    const path = await enliven(freehand);
    act(() => fc.add(path));
    await nextSave();
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((b) => b.userRemovedRooms === undefined)).toBe(true);
  });

  it("RA-7656 editor room removal: switching jobs (canvas unmount + reload) carries no mark", async () => {
    const view = await renderJob({ objects: [room("room-kitchen", "Kitchen", 0)] });
    loadedDrawing = { objects: [freehand] };
    const before = created.canvases.length;
    view.rerender(<SketchEditorV2 inspectionId="job-2" />);
    const fc = await latestCanvas(before);
    expect(fc).not.toBeNull();
    expect(created.canvases.length).toBeGreaterThan(before);
    const path = await enliven(freehand);
    act(() => fc!.add(path));
    await nextSave();
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((b) => b.userRemovedRooms === undefined)).toBe(true);
  });

  it("RA-7656 editor room removal: adding a floor and switching floors carries no mark", async () => {
    await renderJob({ objects: [room("room-kitchen", "Kitchen", 0)] });
    fireEvent.click(screen.getByRole("button", { name: "Add floor" }));
    await settle(0);
    await nextSave();
    fireEvent.click(screen.getByRole("button", { name: "Ground Floor" }));
    await settle(0);
    const path = await enliven(freehand);
    act(() => fabricCanvas!.add(path));
    await nextSave();
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((b) => b.userRemovedRooms === undefined)).toBe(true);
  });
});
