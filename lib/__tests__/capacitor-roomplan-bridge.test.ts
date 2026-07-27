import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __setRoomPlanRegisterPluginLoaderForTests,
  getRoomPlanNativePlugin,
  probeRoomPlanSupport,
} from "../capacitor-roomplan-bridge";

/**
 * RA-7091 Phase 1 — TS bridge around the native RoomPlan CAPPlugin.
 * Ensures missing/broken seams fail closed (null / throw) so capability
 * resolution never invents LiDAR support.
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
    const plugin = { isSupported: async () => ({ supported: true }) };
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
    };
    __setRoomPlanRegisterPluginLoaderForTests(
      () => (() => plugin) as never,
    );
    vi.stubGlobal("window", {});

    await expect(probeRoomPlanSupport()).resolves.toEqual({
      supported: false,
    });
    expect(plugin.isSupported).toHaveBeenCalledTimes(1);
  });
});
