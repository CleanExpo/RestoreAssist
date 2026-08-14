/**
 * Field device capability registry.
 *
 * One typed record per field device RestoreAssist can represent, carrying the
 * transport it actually uses, where its protocol knowledge came from, what its
 * calibration basis is, and how far support has genuinely been taken.
 *
 * The registry exists because `lib/nir-bluetooth-service.ts` holds GATT UUIDs
 * that its own header declares to be placeholders. A device whose protocol is
 * a guess must not be offered for pairing, and a device reached through a
 * vendor's own app and cloud must not be presented as a direct connection.
 * Both facts are properties of the device, not of the pairing code, so they
 * live here and the pairing path consults them.
 *
 * `supportLevel` is the gate. Only `VERIFIED` + `BLE` is pairable; everything
 * else is refused, and an unknown model is refused too.
 */

export type FieldDeviceTransport = "BLE" | "WIFI" | "CLOUD_BRIDGE";

/**
 * VERIFIED       — protocol established from an authoritative source; pairable.
 * BRIDGED        — reachable only through a vendor app/cloud, never directly.
 * VENDOR_PENDING — protocol values are unvalidated placeholders; not pairable.
 * UNSUPPORTED    — represented for completeness; no path exists.
 */
export type FieldDeviceSupportLevel =
  | "VERIFIED"
  | "BRIDGED"
  | "VENDOR_PENDING"
  | "UNSUPPORTED";

/**
 * Where the protocol values in use actually came from. `PLACEHOLDER_UNVALIDATED`
 * is the honest label for the UUIDs carrying `// TODO: validate` in the service.
 */
export type ProtocolSource =
  | "BLUETOOTH_SIG_STANDARD"
  | "VENDOR_DOCUMENTATION"
  | "VENDOR_APP_CLOUD_BRIDGE"
  | "PLACEHOLDER_UNVALIDATED";

export type CalibrationStatus =
  | "VENDOR_PUBLISHED_ACCURACY"
  | "FIELD_CALIBRATION_REQUIRED"
  | "UNVERIFIED";

export type FieldDevicePlatform = "web-chrome" | "android" | "ios";

export interface FieldDeviceProvenance {
  protocolSource: ProtocolSource;
  /** The citable basis — a vendor URL or a repository path. Never an assertion. */
  evidence: string;
  note: string;
}

export interface FieldDeviceCalibration {
  status: CalibrationStatus;
  /** Vendor-published figure quoted verbatim, only where a cited source states one. */
  statedAccuracy?: string;
  note: string;
}

/**
 * Present only on `CLOUD_BRIDGE` devices. `ingestMode` is deliberately explicit
 * so no surface can render a bridged device as automatically synced.
 */
export interface FieldDeviceCloudBridge {
  provider: "MAGICPLAN";
  ingestMode: "MANUAL_EXPORT";
  note: string;
}

export interface FieldDeviceProfile {
  /** Stable key. For BLE devices this matches the service's `DeviceKey`. */
  modelId: string;
  manufacturer: string;
  displayName: string;
  transport: FieldDeviceTransport;
  supportLevel: FieldDeviceSupportLevel;
  captureKinds: readonly string[];
  supportedPlatforms: readonly FieldDevicePlatform[];
  provenance: FieldDeviceProvenance;
  calibration: FieldDeviceCalibration;
  cloudBridge?: FieldDeviceCloudBridge;
}

const PLACEHOLDER_UUID_EVIDENCE =
  "lib/nir-bluetooth-service.ts — profile UUIDs carry `// TODO: validate`";

const PLACEHOLDER_MOISTURE_CALIBRATION: FieldDeviceCalibration = {
  status: "UNVERIFIED",
  note: "No calibration basis established. The moisture byte layout in the service is an assumed 2-byte little-endian value, not a documented one.",
};

export const FIELD_DEVICE_REGISTRY: readonly FieldDeviceProfile[] = [
  {
    modelId: "testo-605",
    manufacturer: "Testo",
    displayName: "Testo 605-H1",
    transport: "BLE",
    supportLevel: "VERIFIED",
    captureKinds: [
      "relative_humidity_percent",
      "temperature_celsius",
      "dew_point_celsius",
    ],
    supportedPlatforms: ["web-chrome", "android", "ios"],
    provenance: {
      protocolSource: "BLUETOOTH_SIG_STANDARD",
      evidence:
        "Bluetooth SIG assigned numbers — Environmental Sensing 0x181A, Humidity 0x2A6F, Temperature 0x2A6E; confirmed in-repo at lib/nir-bluetooth-service.ts and app/dashboard/field/bluetooth-pair/page.tsx",
      note: "The only profile whose UUIDs are SIG-standard assigned numbers rather than placeholders, and the only one carrying no `// TODO: validate` line. No Testo vendor GATT document has been obtained; the basis is the standard service, not a manufacturer specification.",
    },
    calibration: {
      status: "FIELD_CALIBRATION_REQUIRED",
      note: "Readings are taken as reported by the instrument. RestoreAssist applies no correction and holds no calibration certificate for the unit in use.",
    },
  },
  {
    modelId: "vaisala-hm70",
    manufacturer: "Vaisala",
    displayName: "Vaisala HM70",
    transport: "BLE",
    supportLevel: "VENDOR_PENDING",
    captureKinds: [
      "relative_humidity_percent",
      "temperature_celsius",
      "dew_point_celsius",
    ],
    supportedPlatforms: ["web-chrome", "android", "ios"],
    provenance: {
      protocolSource: "PLACEHOLDER_UNVALIDATED",
      evidence: PLACEHOLDER_UUID_EVIDENCE,
      note: "Cites the standard Environmental Sensing service, but its humidity characteristic still carries `// TODO: validate`. Using a standard service UUID is not the same claim as this device being verified against it. Requires Vaisala Insight BLE profile documentation.",
    },
    calibration: {
      status: "UNVERIFIED",
      note: "No calibration basis established while the characteristic is unvalidated.",
    },
  },
  {
    modelId: "tramex-mep",
    manufacturer: "Tramex",
    displayName: "Tramex MEP",
    transport: "BLE",
    supportLevel: "VENDOR_PENDING",
    captureKinds: ["moisture_content_percent", "material_type"],
    supportedPlatforms: ["web-chrome", "android"],
    provenance: {
      protocolSource: "PLACEHOLDER_UNVALIDATED",
      evidence: PLACEHOLDER_UUID_EVIDENCE,
      note: "Both service and characteristic UUIDs are placeholders. Requires the Tramex BLE SDK documentation.",
    },
    calibration: PLACEHOLDER_MOISTURE_CALIBRATION,
  },
  {
    modelId: "tramex-cmexv5",
    manufacturer: "Tramex",
    displayName: "Tramex CMEXv5",
    transport: "BLE",
    supportLevel: "VENDOR_PENDING",
    captureKinds: ["moisture_content_percent", "mapped_readings"],
    supportedPlatforms: ["web-chrome", "android"],
    provenance: {
      protocolSource: "PLACEHOLDER_UNVALIDATED",
      evidence: PLACEHOLDER_UUID_EVIDENCE,
      note: "Both service and characteristic UUIDs are placeholders. Requires the Tramex BLE SDK documentation.",
    },
    calibration: PLACEHOLDER_MOISTURE_CALIBRATION,
  },
  {
    modelId: "delmhorst-bd2100",
    manufacturer: "Delmhorst",
    displayName: "Delmhorst BD-2100",
    transport: "BLE",
    supportLevel: "VENDOR_PENDING",
    captureKinds: ["moisture_content_percent", "material_type"],
    supportedPlatforms: ["web-chrome", "android"],
    provenance: {
      protocolSource: "PLACEHOLDER_UNVALIDATED",
      evidence: PLACEHOLDER_UUID_EVIDENCE,
      note: "Both service and characteristic UUIDs are placeholders. Requires the Delmhorst BD-2100 BLE specification.",
    },
    calibration: PLACEHOLDER_MOISTURE_CALIBRATION,
  },
  {
    modelId: "mileseey-s50r-magicplan",
    manufacturer: "MILESEEY",
    displayName: "MILESEEY S50R magicplan Edition",
    transport: "CLOUD_BRIDGE",
    supportLevel: "BRIDGED",
    captureKinds: ["distance_metres", "area", "volume"],
    supportedPlatforms: ["ios", "android"],
    provenance: {
      protocolSource: "VENDOR_APP_CLOUD_BRIDGE",
      evidence:
        "https://mileseeytools.com/pages/s50r-support and https://help.magicplan.app/laser-distance-meters — magicplan lists the S50R magicplan Edition as a tested PrecisionLink device",
      note: "MILESEEY publishes Bluetooth connectivity and iOS/Android app support, and lists no Wi-Fi capability. No public SDK, GATT service/characteristic schema or hardware protocol appears in the official sources reviewed, so no direct RestoreAssist pairing is offered and no UUID is assumed for it. The device is reached only through the magicplan app.",
    },
    calibration: {
      status: "VENDOR_PUBLISHED_ACCURACY",
      statedAccuracy: "±1.5 mm (vendor-published), range 120 m / 400 ft",
      note: "Figure as published by MILESEEY. Not independently verified by RestoreAssist against a physical unit.",
    },
    cloudBridge: {
      provider: "MAGICPLAN",
      ingestMode: "MANUAL_EXPORT",
      note: "Pilot path only: the technician measures in the magicplan app and exports manually. RestoreAssist holds no magicplan credential and performs no automated sync; nothing here establishes a magicplan connection.",
    },
  },
] as const;

export function getFieldDeviceProfile(
  modelId: string,
): FieldDeviceProfile | undefined {
  return FIELD_DEVICE_REGISTRY.find(
    (profile) => profile.modelId === modelId,
  );
}

/** Direct pairing is offered only for a verified BLE protocol. */
export function isPairable(profile: FieldDeviceProfile): boolean {
  return profile.supportLevel === "VERIFIED" && profile.transport === "BLE";
}

/**
 * Why a model may not be paired, or `null` when it may be. Fail-closed: an
 * unrecognised modelId is refused rather than allowed through.
 */
export function pairingRefusalReason(modelId: string): string | null {
  const profile = getFieldDeviceProfile(modelId);

  if (!profile) {
    return `${modelId} is not in the field device registry, so it cannot be paired.`;
  }

  if (isPairable(profile)) return null;

  if (profile.transport === "CLOUD_BRIDGE") {
    const provider = profile.cloudBridge?.provider ?? "a vendor cloud";
    return `${profile.displayName} is a ${provider} bridged device and has no direct RestoreAssist pairing path. Capture in the vendor app and import the export.`;
  }

  if (profile.supportLevel === "VENDOR_PENDING") {
    return `${profile.displayName} is VENDOR_PENDING — its GATT profile is an unvalidated placeholder, so pairing is refused until the manufacturer's protocol documentation is obtained.`;
  }

  return `${profile.displayName} is not supported for direct pairing (support level ${profile.supportLevel}).`;
}
