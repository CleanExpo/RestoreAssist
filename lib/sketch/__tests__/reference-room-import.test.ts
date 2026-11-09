import { describe, expect, it, vi } from "vitest";
import {
  omitRoomsAlreadyOnCanvas,
  referenceImportFailureMessage,
  requestReferenceRooms,
  type UnderlayReferenceBinding,
} from "../reference-room-import";

const binding: UnderlayReferenceBinding = {
  referenceId: "ref_1",
  contentSha256: "a".repeat(64),
  floorNumber: 2,
};

const room = (id: string) => ({ id, label: id, vertices: [] });

describe("omitRoomsAlreadyOnCanvas", () => {
  it("drops a replayed room whose id is already placed", () => {
    const result = omitRoomsAlreadyOnCanvas(
      [room("a"), room("b")],
      new Set(["a"]),
    );
    expect(result.map((r) => r.id)).toEqual(["b"]);
  });

  it("keeps every room on a canvas that has none of them", () => {
    expect(omitRoomsAlreadyOnCanvas([room("a")], new Set())).toHaveLength(1);
  });
});

describe("requestReferenceRooms", () => {
  it("sends only the binding as JSON, never image bytes or a URL", async () => {
    const submit = vi.fn().mockResolvedValue(new Response("{}"));
    await requestReferenceRooms("insp_1", binding, submit);

    const [url, init] = submit.mock.calls[0];
    expect(url).toBe("/api/inspections/insp_1/sketches/import-from-image");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual(binding);
  });
});

describe("referenceImportFailureMessage", () => {
  it.each([
    [402, { error: "KEY_MISSING" }],
    [429, { error: "RATE_LIMITED" }],
    [503, { error: "MODEL_OVERLOADED" }],
    [500, { error: "UNKNOWN" }],
  ])("keeps the manual route open after a %s", (status, body) => {
    expect(referenceImportFailureMessage(status, body)).toMatch(
      /plan is still on the canvas.*trace the rooms by hand/i,
    );
  });

  it("asks for a fresh upload when the reference is no longer active", () => {
    expect(referenceImportFailureMessage(404, {})).toMatch(/upload it again/i);
  });

  it("says a read is already running on a 409", () => {
    expect(referenceImportFailureMessage(409, {})).toMatch(/already being read/i);
  });

  it("says a possible charge stopped the read, and keeps the manual route", () => {
    const message = referenceImportFailureMessage(409, {
      code: "READ_POSSIBLY_CHARGED",
    });
    expect(message).toMatch(/may already have been charged/i);
    expect(message).toMatch(/trace the rooms by hand/i);
    expect(message).not.toMatch(/already being read/i);
  });

  it("passes the retry time through", () => {
    expect(
      referenceImportFailureMessage(429, { error: "RATE_LIMITED" }, "30"),
    ).toMatch(/30 seconds/);
  });
});
