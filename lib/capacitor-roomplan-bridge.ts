/**
 * Capacitor RoomPlan Bridge — RA-7091 Phase 1
 *
 * Thin TS wrapper over the local native `RoomPlan` CAPPlugin (ios/App).
 * Mirrors the bluetooth-bridge shape: lazy registerPlugin, iOS-native only,
 * no capture lifecycle yet (Phase 2). Support probe is the only Phase 1 API.
 *
 * Fail-closed: callers must treat null / throw / supported:false as
 * "stay on manual floor-plan workflow".
 */

import type { RoomPlanPlugin } from "@/lib/sketch/roomplan-capability";

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
export function getRoomPlanNativePlugin(): RoomPlanPlugin | null {
  if (typeof window === "undefined") return null;
  try {
    const registerPlugin = registerPluginLoader();
    if (!registerPlugin) return null;
    return registerPlugin<RoomPlanPlugin>("RoomPlan");
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
