/**
 * Capacitor RoomPlan Bridge — RA-7091 Phases 1–2
 *
 * Thin TS wrapper over the local native `RoomPlan` CAPPlugin (ios/App).
 * Phase 1: support probe. Phase 2: startCapture / cancelCapture returning
 * CapturedRoom-shaped JSON for `roomPlanToFabric()`.
 *
 * Fail-closed: callers must treat null / throw / supported:false as
 * "stay on manual floor-plan workflow".
 */

import type { CapturedRoom } from "@/lib/sketch/roomplan-to-fabric";

/** Native plugin surface for RoomPlan (probe + capture). */
export interface RoomPlanNativePlugin {
  isSupported(): Promise<{ supported: boolean }>;
  startCapture(): Promise<{ room: CapturedRoom }>;
  cancelCapture(): Promise<{ cancelled: boolean }>;
}

type RegisterPlugin = <T>(name: string) => T;

let registerPluginLoader: () => RegisterPlugin | null = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- match capacitor lazy load
    const { registerPlugin } = require("@capacitor/core") as {
      registerPlugin: RegisterPlugin;
    };
    return registerPlugin;
  } catch {
    return null;
  }
};

/** @internal test seam — reset with the default loader after assertions. */
export function __setRoomPlanRegisterPluginLoaderForTests(
  loader: () => RegisterPlugin | null,
): void {
  registerPluginLoader = loader;
}

/**
 * Lazily resolve the registered native RoomPlan plugin.
 * Returns null off-window, when @capacitor/core is unavailable, or when
 * registration fails — never throws.
 */
export function getRoomPlanNativePlugin(): RoomPlanNativePlugin | null {
  if (typeof window === "undefined") return null;
  try {
    const registerPlugin = registerPluginLoader();
    if (!registerPlugin) return null;
    return registerPlugin<RoomPlanNativePlugin>("RoomPlan");
  } catch {
    return null;
  }
}

/**
 * Probe native RoomPlan support. Rejects when the plugin seam is missing so
 * callers can map rejection → manual/probe_error.
 */
export async function probeRoomPlanSupport(): Promise<{ supported: boolean }> {
  const plugin = getRoomPlanNativePlugin();
  if (!plugin) {
    throw new Error("RoomPlan native plugin unavailable");
  }
  return plugin.isSupported();
}

/**
 * Present the native RoomCaptureView session and return CapturedRoom JSON.
 * Rejects with Capacitor error codes: unsupported | already_in_progress |
 * cancelled | permission_denied | capture_failed.
 */
export async function startRoomPlanCapture(): Promise<CapturedRoom> {
  const plugin = getRoomPlanNativePlugin();
  if (!plugin) {
    throw new Error("RoomPlan native plugin unavailable");
  }
  const result = await plugin.startCapture();
  if (!result?.room || !Array.isArray(result.room.rooms)) {
    throw new Error("RoomPlan capture returned malformed room payload");
  }
  return result.room;
}

/** Dismiss an in-flight RoomPlan capture (no-op if none active). */
export async function cancelRoomPlanCapture(): Promise<boolean> {
  const plugin = getRoomPlanNativePlugin();
  if (!plugin) return false;
  const result = await plugin.cancelCapture();
  return result?.cancelled === true;
}
