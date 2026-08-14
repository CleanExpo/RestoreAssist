import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCapacitorIOS } from "@/lib/capacitor";
import { scanAndConnect } from "@/lib/capacitor-bluetooth-bridge";
import {
  FIELD_DEVICE_REGISTRY,
  getFieldDeviceProfile,
  isPairable,
  pairingRefusalReason,
} from "@/lib/field-device-registry";
import {
  getP1DeviceProfiles,
  pairDevice,
  type DeviceKey,
} from "@/lib/nir-bluetooth-service";

vi.mock("@/lib/capacitor", () => ({
  isCapacitorIOS: vi.fn(() => false),
}));

vi.mock("@/lib/capacitor-bluetooth-bridge", () => ({
  scanAndConnect: vi.fn(async () => "native-device-id"),
  disconnect: vi.fn(async () => {}),
}));

/**
 * Spy on the gate itself, wrapping the real implementation. The refusal tests
 * exercise the genuine registry; only the two positive-control tests below
 * bypass it, and they do so explicitly rather than by claiming any device is
 * verified.
 */
vi.mock("@/lib/field-device-registry", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/field-device-registry");
  return { ...actual, pairingRefusalReason: vi.fn(actual.pairingRefusalReason) };
});

/** Every key in the service's GATT table. None of these may be pairable. */
const GATT_MODEL_IDS = [
  "tramex-mep",
  "tramex-cmexv5",
  "delmhorst-bd2100",
  "testo-605",
  "vaisala-hm70",
] as const;

const S50R_MODEL_ID = "mileseey-s50r-magicplan";

/**
 * Stands in for the browser picker. It throws so the call is unmistakable in
 * the output, and so no test depends on a fabricated GATT server.
 */
const requestDevice = vi.fn(async () => {
  throw new Error("web-bluetooth-picker-opened");
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isCapacitorIOS).mockReturnValue(false);
  // Without these, `pairDevice` bails on the environment check before it can
  // reach the picker, and a "picker not called" assertion would pass whether
  // or not the registry gate exists.
  vi.stubGlobal("window", { location: { protocol: "https:" } });
  vi.stubGlobal("navigator", { userAgent: "vitest", bluetooth: { requestDevice } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("no field device is production-verified", () => {
  it("marks every GATT profile VENDOR_PENDING", () => {
    for (const modelId of GATT_MODEL_IDS) {
      const profile = getFieldDeviceProfile(modelId);

      expect(profile, modelId).toBeDefined();
      expect(profile!.supportLevel, modelId).toBe("VENDOR_PENDING");
      expect(isPairable(profile!), modelId).toBe(false);
      expect(pairingRefusalReason(modelId)).toMatch(/VENDOR_PENDING/);
    }
  });

  it("leaves the registry with no pairable device at all", () => {
    expect(FIELD_DEVICE_REGISTRY.filter(isPairable)).toEqual([]);
  });

  it("covers every key the GATT table exposes, so none can escape the gate", () => {
    const gattKeys = getP1DeviceProfiles().map((profile) => profile.key);

    expect([...gattKeys].sort()).toEqual([...GATT_MODEL_IDS].sort());
    for (const key of gattKeys) {
      expect(getFieldDeviceProfile(key)?.supportLevel, key).toBe(
        "VENDOR_PENDING",
      );
    }
  });

  it("does not rest the Testo 605-H1 on a SIG assignment as if it were verification", () => {
    const testo = getFieldDeviceProfile("testo-605")!;

    expect(testo.supportLevel).toBe("VENDOR_PENDING");
    expect(testo.calibration.status).toBe("UNVERIFIED");
    expect(testo.provenance.evidence).toMatch(/605i/);
    expect(testo.provenance.note).toMatch(/no authoritative Testo GATT/i);
  });

  it("refuses an unknown model rather than letting it through", () => {
    expect(pairingRefusalReason("some-unlisted-meter")).toMatch(
      /not in the field device registry/,
    );
  });
});

describe("S50R is a magicplan cloud bridge, never a direct radio", () => {
  it("classifies the S50R as CLOUD_BRIDGE and not as BLE or Wi-Fi", () => {
    const s50r = getFieldDeviceProfile(S50R_MODEL_ID);

    expect(s50r).toBeDefined();
    expect(s50r!.transport).toBe("CLOUD_BRIDGE");
    expect(s50r!.transport).not.toBe("BLE");
    expect(s50r!.transport).not.toBe("WIFI");
    expect(s50r!.supportLevel).toBe("BRIDGED");
  });

  it("routes the S50R through magicplan as a manual export, claiming no sync", () => {
    const s50r = getFieldDeviceProfile(S50R_MODEL_ID)!;

    expect(s50r.cloudBridge).toEqual({
      provider: "MAGICPLAN",
      ingestMode: "MANUAL_EXPORT",
      note: expect.any(String),
    });
    expect(s50r.provenance.protocolSource).toBe("VENDOR_APP_CLOUD_BRIDGE");
  });

  it("registers confirmed live distance only, not area or volume", () => {
    const s50r = getFieldDeviceProfile(S50R_MODEL_ID)!;

    expect([...s50r.captureKinds]).toEqual(["distance_metres"]);
    expect(s50r.provenance.note).toMatch(/plan-derived export statistic/);
  });

  it("offers no direct pairing path for the S50R", () => {
    const s50r = getFieldDeviceProfile(S50R_MODEL_ID)!;

    expect(isPairable(s50r)).toBe(false);
    expect(pairingRefusalReason(S50R_MODEL_ID)).toContain("MAGICPLAN");
  });

  it("keeps the S50R out of the GATT profile table entirely", () => {
    // A DeviceKey for the S50R would mean UUIDs for the S50R, and no vendor
    // GATT schema exists for it. Absence from the table is the guarantee.
    const gattKeys = getP1DeviceProfiles().map((profile) => profile.key);

    expect(gattKeys).not.toContain(S50R_MODEL_ID);
    expect(gattKeys.some((key) => /mileseey|s50r/i.test(key))).toBe(false);
  });
});

describe("no guessed UUID profile reaches a real pairing attempt", () => {
  it.each(GATT_MODEL_IDS)(
    "refuses %s without opening the browser picker",
    async (modelId) => {
      await expect(pairDevice(modelId as DeviceKey)).rejects.toThrow(
        /VENDOR_PENDING/,
      );

      expect(requestDevice).not.toHaveBeenCalled();
      expect(scanAndConnect).not.toHaveBeenCalled();
    },
  );

  it.each(GATT_MODEL_IDS)(
    "refuses %s on the iOS native path too, before any scan",
    async (modelId) => {
      vi.mocked(isCapacitorIOS).mockReturnValue(true);

      await expect(pairDevice(modelId as DeviceKey)).rejects.toThrow(
        /VENDOR_PENDING/,
      );

      expect(scanAndConnect).not.toHaveBeenCalled();
      expect(requestDevice).not.toHaveBeenCalled();
    },
  );

  it("refuses an unknown model from the production pairing path", async () => {
    await expect(
      pairDevice("some-unlisted-meter" as DeviceKey),
    ).rejects.toThrow(/not in the field device registry/);

    expect(requestDevice).not.toHaveBeenCalled();
    expect(scanAndConnect).not.toHaveBeenCalled();
  });
});

describe("positive control — the picker and the native scan are genuinely reachable", () => {
  // These prove the two "not called" assertions above can fail. Neither test
  // asserts that any device is verified: each suspends the registry verdict
  // for one call, which is the only thing standing between pairDevice and the
  // hardware. Without them, a pairDevice that crashed on import would produce
  // the same green.

  it("opens the browser picker when the registry verdict is suspended", async () => {
    vi.mocked(pairingRefusalReason).mockReturnValueOnce(null);

    await expect(pairDevice("testo-605")).rejects.toThrow(
      /web-bluetooth-picker-opened/,
    );

    expect(requestDevice).toHaveBeenCalledTimes(1);
  });

  it("reaches the native scan when the registry verdict is suspended on iOS", async () => {
    vi.mocked(isCapacitorIOS).mockReturnValue(true);
    vi.mocked(pairingRefusalReason).mockReturnValueOnce(null);

    const paired = await pairDevice("testo-605");

    expect(scanAndConnect).toHaveBeenCalledTimes(1);
    expect(paired._capacitorDeviceId).toBe("native-device-id");
  });
});
