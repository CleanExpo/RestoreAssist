import { describe, expect, it } from "vitest";
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

/**
 * The four profiles whose GATT UUIDs carry `// TODO: validate` in
 * lib/nir-bluetooth-service.ts. Hard-coded rather than derived from the
 * registry so that promoting one of them has to break this test on purpose.
 */
const PLACEHOLDER_UUID_MODEL_IDS = [
  "tramex-mep",
  "tramex-cmexv5",
  "delmhorst-bd2100",
  "vaisala-hm70",
] as const;

const S50R_MODEL_ID = "mileseey-s50r-magicplan";

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

describe("no device with a guessed UUID is pairable", () => {
  it.each(PLACEHOLDER_UUID_MODEL_IDS)(
    "refuses %s, whose GATT profile is an unvalidated placeholder",
    (modelId) => {
      const profile = getFieldDeviceProfile(modelId);

      expect(profile).toBeDefined();
      expect(profile!.supportLevel).toBe("VENDOR_PENDING");
      expect(profile!.provenance.protocolSource).toBe(
        "PLACEHOLDER_UNVALIDATED",
      );
      expect(isPairable(profile!)).toBe(false);
    },
  );

  it("admits no pairable profile that rests on a placeholder protocol", () => {
    const pairableOnPlaceholders = FIELD_DEVICE_REGISTRY.filter(
      (profile) =>
        isPairable(profile) &&
        profile.provenance.protocolSource === "PLACEHOLDER_UNVALIDATED",
    );

    expect(pairableOnPlaceholders).toEqual([]);
  });

  it("still permits the one profile on SIG-standard UUIDs — the check discriminates", () => {
    // Positive control. Without this, the assertions above would pass equally
    // well against a registry that simply refused everything.
    const testo = getFieldDeviceProfile("testo-605")!;

    expect(testo.provenance.protocolSource).toBe("BLUETOOTH_SIG_STANDARD");
    expect(isPairable(testo)).toBe(true);
    expect(pairingRefusalReason("testo-605")).toBeNull();
  });
});

describe("the production pairing path refuses pending devices", () => {
  it("refuses vaisala-hm70 before it can reach a browser or native picker", async () => {
    // vaisala-hm70 is a thermo-hygrometer, so it is the one placeholder
    // profile the iOS Capacitor branch would otherwise admit. A guard placed
    // after that branch instead of before it fails this case.
    await expect(pairDevice("vaisala-hm70")).rejects.toThrow(
      /VENDOR_PENDING/,
    );
  });

  it.each(PLACEHOLDER_UUID_MODEL_IDS)(
    "refuses %s from the production pairing path",
    async (modelId) => {
      await expect(pairDevice(modelId as DeviceKey)).rejects.toThrow(
        /VENDOR_PENDING/,
      );
    },
  );

  it("does not refuse testo-605 as pending — the refusal is device-specific", async () => {
    // Positive control, and the one that matters most here: in this
    // environment `window` is undefined, so EVERY key makes pairDevice throw.
    // A bare rejects assertion would pass without the guard existing at all.
    // testo-605 must fail for the unrelated reason instead.
    const message = await pairDevice("testo-605").then(
      () => "resolved",
      (err: unknown) => (err as Error).message,
    );

    expect(message).toMatch(/Web Bluetooth API not available/);
    expect(message).not.toMatch(/VENDOR_PENDING/);
  });
});
