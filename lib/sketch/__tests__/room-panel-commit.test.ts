/**
 * A room label edited in the selection panel writes `data` in place.
 * That edit must schedule a save, and must fire object:modified so the
 * canvas undo history records it — the same sequence as the voice
 * asbestos latch.
 */
import { describe, expect, it, vi } from "vitest";
import { commitRoomPanelEdit } from "@/lib/sketch/room-panel-commit";

describe("commitRoomPanelEdit", () => {
  it("a label edit schedules a save", () => {
    const scheduleSave = vi.fn();
    const fire = vi.fn();
    const room = {
      data: { id: "room-1", type: "room", label: "Room" },
    };
    room.data.label = "Voice test room";
    commitRoomPanelEdit({ fire }, room, scheduleSave);
    expect(room.data.label).toBe("Voice test room");
    expect(fire).toHaveBeenCalledWith("object:modified", { target: room });
    expect(scheduleSave).toHaveBeenCalledTimes(1);
  });
});
