/**
 * RA-7091 — RoomPlan capability seam (contract groundwork only).
 *
 * This is the smallest fail-closed contract that decides whether the LiDAR
 * RoomPlan scan path is available or whether the app must stay on the existing
 * MANUAL floor-plan workflow (the hand-drawn Sketch tools + RA-6795 converter).
 * It adds NO native Swift, UI, persistence, APIs, or dependencies — only the
 * typed seam and the deterministic resolver that gates on it.
 *
 * Fail-closed rule: "roomplan" mode is granted ONLY when we are demonstrably
 * running native iOS AND a real native support probe returns supported=true.
 * Web, Android, non-native iOS, an unsupported device, a malformed probe
 * result, a missing plugin, or a probe rejection ALL resolve to explicit
 * "manual" mode with a machine-readable reason. The resolver never throws, so
 * unsupported hardware can never dead-end the operator — it simply keeps the
 * manual workflow. No scanner availability, accuracy, or custody claim is made
 * here; that waits on the real native plugin landing behind RA-1133 / RA-7090.
 */
import { isCapacitorIOS } from "@/lib/capacitor";

/**
 * The native RoomPlan plugin seam. For now it exposes ONLY a support probe —
 * enough to gate availability without committing to a capture API surface.
 */
export interface RoomPlanPlugin {
  isSupported(): Promise<{ supported: boolean }>;
}

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
 * Lazily resolve the registered native RoomPlan plugin via Capacitor's
 * `registerPlugin`, without adding a dependency (`@capacitor/core` is already
 * used by lib/capacitor.ts). Returns null off-native, when the core is
 * unavailable, or when registration fails — the resolver maps null to manual.
 */
function loadRoomPlanPlugin(): RoomPlanPlugin | null {
  if (typeof window === "undefined") return null;
  try {
    const { registerPlugin } = require("@capacitor/core") as {
      registerPlugin: <T>(name: string) => T;
    };
    return registerPlugin<RoomPlanPlugin>("RoomPlan");
  } catch {
    return null;
  }
}

/**
 * Default runtime wrapper — resolves capability from the real environment using
 * the existing Capacitor iOS detection and the registered native seam.
 */
export async function getRoomPlanCapability(): Promise<RoomPlanCapability> {
  const isNativeIOS = isCapacitorIOS();
  return resolveRoomPlanCapability({
    isNativeIOS,
    plugin: isNativeIOS ? loadRoomPlanPlugin() : null,
  });
}
