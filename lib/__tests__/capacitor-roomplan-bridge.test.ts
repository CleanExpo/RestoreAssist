import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __setRoomPlanRegisterPluginLoaderForTests,
  cancelRoomPlanCapture,
  getRoomPlanNativePlugin,
  probeRoomPlanSupport,
  startRoomPlanCapture,
} from "../capacitor-roomplan-bridge";

/**
 * RA-7091 Phases 1–2 — TS bridge around the native RoomPlan CAPPlugin.
 * Ensures missing/broken seams fail closed so capability resolution never
 * invents LiDAR support, and capture helpers validate the payload shape.
 */

const defaultLoader = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@capacitor/core").registerPlugin as <T>(
      name: string,
    ) => T;
  } catch {
    return null;
  }
};

describe("capacitor-roomplan-bridge", () => {
  afterEach(() => {
    __setRoomPlanRegisterPluginLoaderForTests(defaultLoader);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("getRoomPlanNativePlugin returns null when window is unavailable", () => {
    vi.stubGlobal("window", undefined);
    expect(getRoomPlanNativePlugin()).toBeNull();
  });

  it("getRoomPlanNativePlugin registers Capacitor plugin named RoomPlan", () => {
    const plugin = {
      isSupported: async () => ({ supported: true }),
      startCapture: async () => ({ room: { rooms: [] } }),
      cancelCapture: async () => ({ cancelled: true }),
    };
    const registerPlugin = vi.fn(() => plugin);
    __setRoomPlanRegisterPluginLoaderForTests(() => registerPlugin as never);
    vi.stubGlobal("window", {});

    expect(getRoomPlanNativePlugin()).toBe(plugin);
    expect(registerPlugin).toHaveBeenCalledWith("RoomPlan");
  });

  it("getRoomPlanNativePlugin returns null when registerPlugin loader is missing", () => {
    __setRoomPlanRegisterPluginLoaderForTests(() => null);
    vi.stubGlobal("window", {});
    expect(getRoomPlanNativePlugin()).toBeNull();
  });

  it("probeRoomPlanSupport rejects when plugin seam is missing", async () => {
    vi.stubGlobal("window", undefined);
    await expect(probeRoomPlanSupport()).rejects.toThrow(
      /RoomPlan native plugin unavailable/,
    );
  });

  it("probeRoomPlanSupport returns native probe payload", async () => {
    const plugin = {
      isSupported: vi.fn(async () => ({ supported: false })),
      startCapture: async () => ({ room: { rooms: [] } }),
      cancelCapture: async () => ({ cancelled: false }),
    };
    __setRoomPlanRegisterPluginLoaderForTests(() => (() => plugin) as never);
    vi.stubGlobal("window", {});

    await expect(probeRoomPlanSupport()).resolves.toEqual({
      supported: false,
    });
    expect(plugin.isSupported).toHaveBeenCalledTimes(1);
  });

  it("startRoomPlanCapture returns CapturedRoom JSON from the native plugin", async () => {
    const room = {
      rooms: [
        {
          label: "Kitchen",
          category: "floor",
          floorPolygon: [
            { x: 0, z: 0 },
            { x: 4, z: 0 },
            { x: 4, z: 3 },
            { x: 0, z: 3 },
          ],
        },
      ],
    };
    const plugin = {
      isSupported: async () => ({ supported: true }),
      startCapture: vi.fn(async () => ({ room })),
      cancelCapture: async () => ({ cancelled: false }),
    };
    __setRoomPlanRegisterPluginLoaderForTests(() => (() => plugin) as never);
    vi.stubGlobal("window", {});

    await expect(startRoomPlanCapture()).resolves.toEqual(room);
    expect(plugin.startCapture).toHaveBeenCalledTimes(1);
  });

  it("startRoomPlanCapture rejects malformed native payloads", async () => {
    const plugin = {
      isSupported: async () => ({ supported: true }),
      startCapture: async () => ({ room: { rooms: "nope" } as never }),
      cancelCapture: async () => ({ cancelled: false }),
    };
    __setRoomPlanRegisterPluginLoaderForTests(() => (() => plugin) as never);
    vi.stubGlobal("window", {});

    await expect(startRoomPlanCapture()).rejects.toThrow(/malformed/);
  });

  it("cancelRoomPlanCapture returns false when the plugin is missing", async () => {
    vi.stubGlobal("window", undefined);
    await expect(cancelRoomPlanCapture()).resolves.toBe(false);
  });

  it("cancelRoomPlanCapture forwards native cancelled flag", async () => {
    const plugin = {
      isSupported: async () => ({ supported: true }),
      startCapture: async () => ({ room: { rooms: [] } }),
      cancelCapture: vi.fn(async () => ({ cancelled: true })),
    };
    __setRoomPlanRegisterPluginLoaderForTests(() => (() => plugin) as never);
    vi.stubGlobal("window", {});

    await expect(cancelRoomPlanCapture()).resolves.toBe(true);
    expect(plugin.cancelCapture).toHaveBeenCalledTimes(1);
  });
});
