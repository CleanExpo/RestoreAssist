/**
 * RA-7091 — RoomPlan capability seam.
 *
 * Decides whether the LiDAR RoomPlan scan path is available or whether the app
 * must stay on the existing MANUAL floor-plan workflow (hand-drawn Sketch tools
 * + RA-6795 converter).
 *
 * Phase 1 wires the real Capacitor `RoomPlan` plugin probe via
 * `lib/capacitor-roomplan-bridge.ts`. Phase 2 adds startCapture / cancelCapture
 * on the same native plugin. Editor ingest / Scan UI land in later phases —
 * this module stays a fail-closed gate only.
 *
 * Fail-closed rule: "roomplan" mode is granted ONLY when we are demonstrably
 * running native iOS AND a real native support probe returns supported=true.
 * Web, Android, non-native iOS, an unsupported device, a malformed probe
 * result, a missing plugin, or a probe rejection ALL resolve to explicit
 * "manual" mode with a machine-readable reason. The resolver never throws.
 */
import { isCapacitorIOS } from "@/lib/capacitor";
import {
  getRoomPlanNativePlugin,
  type RoomPlanNativePlugin,
} from "@/lib/capacitor-roomplan-bridge";

/**
 * The native RoomPlan plugin seam used by the capability gate.
 * Capture methods live on the same native plugin but are invoked via the
 * bridge helpers (`startRoomPlanCapture`) — the gate only needs isSupported.
 */
export type RoomPlanPlugin = Pick<RoomPlanNativePlugin, "isSupported">;

/** Deterministic, machine-readable reasons the app fell back to manual mode. */
export type RoomPlanManualReason =
  | "not_native_ios"
  | "probe_unsupported"
  | "probe_malformed"
  | "probe_error";

/** Discriminated capability result. `manual` always carries a reason. */
export type RoomPlanCapability =
  | { mode: "roomplan" }
  | { mode: "manual"; reason: RoomPlanManualReason };

/** Injected runtime facts the pure resolver decides against. */
export interface RoomPlanCapabilityDeps {
  /** True only when demonstrably inside the native iOS Capacitor shell. */
  isNativeIOS: boolean;
  /** The registered native seam, or null when none is available. */
  plugin: RoomPlanPlugin | null;
}

/** Narrow an unknown probe payload to the expected `{ supported: boolean }`. */
function isSupportProbeResult(v: unknown): v is { supported: boolean } {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { supported?: unknown }).supported === "boolean"
  );
}

/**
 * Pure, deterministic capability decision. Dependency-injected so the
 * discrimination is testable without a native plugin or a LiDAR device.
 * Never throws — a rejected probe is caught and mapped to a manual reason.
 */
export async function resolveRoomPlanCapability(
  deps: RoomPlanCapabilityDeps,
): Promise<RoomPlanCapability> {
  if (!deps.isNativeIOS) return { mode: "manual", reason: "not_native_ios" };
  if (!deps.plugin) return { mode: "manual", reason: "probe_error" };

  let result: unknown;
  try {
    result = await deps.plugin.isSupported();
  } catch {
    return { mode: "manual", reason: "probe_error" };
  }

  if (!isSupportProbeResult(result)) {
    return { mode: "manual", reason: "probe_malformed" };
  }
  return result.supported === true
    ? { mode: "roomplan" }
    : { mode: "manual", reason: "probe_unsupported" };
}

/**
 * Default runtime wrapper — resolves capability from the real environment using
 * Capacitor iOS detection and the registered native RoomPlan seam.
 */
export async function getRoomPlanCapability(): Promise<RoomPlanCapability> {
  const isNativeIOS = isCapacitorIOS();
  return resolveRoomPlanCapability({
    isNativeIOS,
    plugin: isNativeIOS ? getRoomPlanNativePlugin() : null,
  });
}
