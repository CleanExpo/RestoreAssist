import { describe, expect, it } from "vitest";
import {
  resolveRoomPlanCapability,
  type RoomPlanPlugin,
} from "../roomplan-capability";

/**
 * Contract groundwork (RA-7091): the RoomPlan capability resolver must fail
 * CLOSED to the existing manual floor-plan workflow. "roomplan" mode is granted
 * ONLY when running native iOS AND a real support probe returns supported=true;
 * every other path returns "manual" with a deterministic machine-readable reason
 * and NEVER throws. No native plugin or LiDAR device is exercised here — the
 * resolver is pure and dependency-injected so the discrimination is testable
 * without a device.
 */

const supportedPlugin: RoomPlanPlugin = {
  isSupported: async () => ({ supported: true }),
};
const unsupportedPlugin: RoomPlanPlugin = {
  isSupported: async () => ({ supported: false }),
};

describe("resolveRoomPlanCapability — fails closed to manual", () => {
  it("returns mode 'roomplan' only when native iOS AND probe reports supported=true", async () => {
    const result = await resolveRoomPlanCapability({
      isNativeIOS: true,
      plugin: supportedPlugin,
    });
    expect(result).toEqual({ mode: "roomplan" });
  });

  it("returns manual/not_native_ios off native iOS (web, Android, non-native iOS)", async () => {
    const result = await resolveRoomPlanCapability({
      isNativeIOS: false,
      plugin: supportedPlugin,
    });
    expect(result).toEqual({ mode: "manual", reason: "not_native_ios" });
  });

  it("returns manual/probe_unsupported when native but the probe reports supported=false", async () => {
    const result = await resolveRoomPlanCapability({
      isNativeIOS: true,
      plugin: unsupportedPlugin,
    });
    expect(result).toEqual({ mode: "manual", reason: "probe_unsupported" });
  });

  it("returns manual/probe_malformed on a malformed probe result", async () => {
    const result = await resolveRoomPlanCapability({
      isNativeIOS: true,
      plugin: { isSupported: async () => ({ nope: 1 }) as never },
    });
    expect(result).toEqual({ mode: "manual", reason: "probe_malformed" });
  });

  it("returns manual/probe_error on probe rejection without throwing", async () => {
    const result = await resolveRoomPlanCapability({
      isNativeIOS: true,
      plugin: {
        isSupported: async () => {
          throw new Error("native bridge unavailable");
        },
      },
    });
    expect(result).toEqual({ mode: "manual", reason: "probe_error" });
  });

  it("returns manual/probe_error when native but no plugin is registered", async () => {
    const result = await resolveRoomPlanCapability({
      isNativeIOS: true,
      plugin: null,
    });
    expect(result).toEqual({ mode: "manual", reason: "probe_error" });
  });
});
