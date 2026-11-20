/**
 * RA-8325 review thread: the real IndexedDB store's `update` must read and
 * write in ONE readwrite transaction. Two overlapping patches (the receipt
 * flag and the canvas-ingest status) must both survive.
 *
 * The fake below models the one IndexedDB rule that matters here: readwrite
 * transactions on the same store run one after another, readonly ones do not
 * wait. Requests complete on later macrotasks so two callers can interleave.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  enqueueRoomPlanCapture,
  flushRoomPlanServerReceipts,
  getRoomPlanCapture,
  markRoomPlanCaptureIngested,
} from "../roomplan-custody-queue";
import type { CapturedRoom } from "../roomplan-to-fabric";

const ROOM: CapturedRoom = {
  rooms: [
    {
      label: "Study",
      floorPolygon: [
        { x: 0, z: 0 },
        { x: 3, z: 0 },
        { x: 3, z: 3 },
        { x: 0, z: 3 },
      ],
    },
  ],
};

type Row = Record<string, unknown> & { id: string };
const rows = new Map<string, Row>();
let writeLock: Promise<void> = Promise.resolve();

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

class FakeRequest<T> {
  result!: T;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

class FakeTx {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  error: Error | null = null;
  private pending = 0;
  private done = false;
  private release: () => void = () => undefined;
  private ready: Promise<void>;
  constructor(mode: "readonly" | "readwrite") {
    if (mode === "readwrite") {
      const prev = writeLock;
      writeLock = new Promise<void>((r) => {
        this.release = r;
      });
      this.ready = prev;
    } else {
      this.ready = Promise.resolve();
    }
  }
  request<T>(run: () => T): FakeRequest<T> {
    const req = new FakeRequest<T>();
    this.pending++;
    void this.ready.then(tick).then(() => {
      req.result = run();
      req.onsuccess?.();
      this.pending--;
      void this.maybeComplete();
    });
    return req;
  }
  private async maybeComplete() {
    await tick();
    if (this.pending === 0 && !this.done) {
      this.done = true;
      this.release();
      this.oncomplete?.();
    }
  }
  objectStore() {
    return {
      get: (id: string) => this.request(() => rows.get(id)),
      put: (row: Row) =>
        this.request(() => {
          rows.set(row.id, structuredClone(row));
          return row.id;
        }),
      delete: (id: string) => this.request(() => void rows.delete(id)),
      index: () => ({
        getAll: (inspectionId: string) =>
          this.request(() =>
            [...rows.values()].filter((r) => r.inspectionId === inspectionId),
          ),
      }),
    };
  }
}

const fakeDb = {
  objectStoreNames: { contains: () => true },
  transaction: (_s: string, mode: "readonly" | "readwrite" = "readonly") =>
    new FakeTx(mode),
};

const fakeIndexedDB = {
  open: () => {
    const req = new FakeRequest<typeof fakeDb>();
    void tick().then(() => {
      req.result = fakeDb;
      req.onsuccess?.();
    });
    return req;
  },
};

describe("idbStore.update is atomic (RA-8325)", () => {
  beforeAll(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("indexedDB", fakeIndexedDB);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    rows.clear();
    writeLock = Promise.resolve();
  });

  it("a receipt patch and an ingest patch that overlap both survive", async () => {
    const entry = await enqueueRoomPlanCapture({
      inspectionId: "insp-idb",
      floorNumber: 0,
      capturedRoom: ROOM,
    });

    let ingest: Promise<void> | undefined;
    const fetchImpl = async () => {
      // The canvas ingest finishes at the same moment the 2xx arrives.
      ingest = markRoomPlanCaptureIngested(entry.id);
      return new Response("{}", { status: 201 });
    };
    const res = await flushRoomPlanServerReceipts("insp-idb", fetchImpl);
    await ingest;

    expect(res.sent).toBe(1);
    const stored = await getRoomPlanCapture(entry.id);
    expect(stored?.serverReceipt).toBe("sent");
    expect(stored?.status).toBe("ingested");
  });
});
