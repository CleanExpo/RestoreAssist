/**
 * NIR Bluetooth Service — P1 Equipment BLE Pairing
 *
 * Implements the Bluetooth integration requirements from nir-field-reality-spec.ts:
 *   BLUETOOTH_EQUIPMENT.p1_required
 *
 * P1 Equipment (Phase 2 pilot):
 *   - Pin moisture meters: Tramex MEP, Delmhorst BD-2100
 *   - Non-invasive moisture meters: Tramex CMEXv5, GE Protimeter Surveymaster
 *   - Thermo-hygrometers: Testo 605-H1, Vaisala HM70
 *
 * RA-1614: Refactored to dispatch through nir-ble-transport.ts so that
 * native iOS builds use @capacitor-community/bluetooth-le while web builds
 * use the existing Web Bluetooth API path. The hook API (useBluetoothMeter)
 * is unchanged — all callers see the same PairedDevice interface.
 *
 * IMPORTANT — UUID STATUS:
 *   The GATT UUIDs below are placeholder values. Final UUIDs must be validated
 *   against current device firmware from each manufacturer:
 *     Tramex:    Contact sales@tramex.com for BLE SDK documentation
 *     Delmhorst: Contact support@delmhorst.com for BD-2100 BLE spec
 *     Testo:     Testo Smart App SDK (developer.testo.com)
 *     Vaisala:   Vaisala Insight PC software BLE profile documentation
 *
 * BROWSER ONLY: Requires HTTPS (web path) or Capacitor native context (iOS/Android).
 */

import { Capacitor } from "@capacitor/core";
import { getBLETransport, type BLEHandle } from "./nir-ble-transport";

// ─── CONSTANTS & DEVICE PROFILES ─────────────────────────────────────────────

/**
 * GATT service/characteristic UUIDs per device.
 *
 * TODO: Validate all UUIDs against manufacturer firmware documentation
 * before Phase 2 pilot deployment.
 */
const DEVICE_PROFILES = {
  "tramex-mep": {
    name: "Tramex MEP",
    category: "pin-moisture-meter" as const,
    filters: [{ namePrefix: "TRAMEX" }, { namePrefix: "MEP" }],
    serviceUUID: "0000ffe0-0000-1000-8000-00805f9b34fb", // TODO: validate
    characteristicUUID: "0000ffe1-0000-1000-8000-00805f9b34fb", // TODO: validate
    dataPoints: ["moisture_content_percent", "material_type"] as const,
  },
  "delmhorst-bd2100": {
    name: "Delmhorst BD-2100",
    category: "pin-moisture-meter" as const,
    filters: [{ namePrefix: "BD-2100" }, { namePrefix: "DELMHORST" }],
    serviceUUID: "0000fff0-0000-1000-8000-00805f9b34fb", // TODO: validate
    characteristicUUID: "0000fff1-0000-1000-8000-00805f9b34fb", // TODO: validate
    dataPoints: ["moisture_content_percent", "material_type"] as const,
  },
  "tramex-cmexv5": {
    name: "Tramex CMEXv5",
    category: "non-invasive-moisture-meter" as const,
    filters: [{ namePrefix: "CMEX" }, { namePrefix: "CMEXv5" }],
    serviceUUID: "0000ffe0-0000-1000-8000-00805f9b34fb", // TODO: validate
    characteristicUUID: "0000ffe1-0000-1000-8000-00805f9b34fb", // TODO: validate
    dataPoints: ["moisture_content_percent", "mapped_readings"] as const,
  },
  "testo-605": {
    name: "Testo 605-H1",
    category: "thermo-hygrometer" as const,
    filters: [{ namePrefix: "testo 605" }, { namePrefix: "Testo 605" }],
    // Testo Smart App uses standard Environmental Sensing Service (ESS)
    serviceUUID: "0000181a-0000-1000-8000-00805f9b34fb", // ESS standard UUID
    characteristicUUID: "00002a6f-0000-1000-8000-00805f9b34fb", // Humidity characteristic
    temperatureCharUUID: "00002a6e-0000-1000-8000-00805f9b34fb", // Temperature characteristic
    dataPoints: [
      "relative_humidity_percent",
      "temperature_celsius",
      "dew_point_celsius",
    ] as const,
  },
  "vaisala-hm70": {
    name: "Vaisala HM70",
    category: "thermo-hygrometer" as const,
    filters: [{ namePrefix: "HM70" }, { namePrefix: "Vaisala" }],
    serviceUUID: "0000181a-0000-1000-8000-00805f9b34fb", // ESS standard UUID
    characteristicUUID: "00002a6f-0000-1000-8000-00805f9b34fb", // TODO: validate
    dataPoints: [
      "relative_humidity_percent",
      "temperature_celsius",
      "dew_point_celsius",
    ] as const,
  },
} as const;

export type DeviceKey = keyof typeof DEVICE_PROFILES;
export type DeviceCategory =
  | "pin-moisture-meter"
  | "non-invasive-moisture-meter"
  | "thermo-hygrometer";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface MoistureReading {
  deviceKey: DeviceKey;
  deviceName: string;
  moistureContentPercent: number;
  /** Material type reported by the device (when available) */
  materialType?: string;
  /** Raw signal value before calibration */
  rawSignal?: number;
  readingTimestamp: string;
}

export interface EnvironmentalReading {
  deviceKey: DeviceKey;
  deviceName: string;
  relativeHumidityPercent: number;
  temperatureCelsius: number;
  dewPointCelsius: number;
  readingTimestamp: string;
}

export type DeviceReading = MoistureReading | EnvironmentalReading;

/**
 * Opaque device handle returned by pairDevice().
 * Callers should only use `disconnect()` — do not access `_handle` directly.
 */
export interface PairedDevice {
  key: DeviceKey;
  name: string;
  category: DeviceCategory;
  /** @internal Transport-agnostic device handle */
  _handle: BLEHandle;
  /** Remove notification listener and disconnect */
  disconnect: () => Promise<void>;
}

export type BluetoothAvailability =
  | "available"
  | "unavailable-no-api"
  | "unavailable-not-https"
  | "unavailable-ios-safari";

// ─── AVAILABILITY CHECK ───────────────────────────────────────────────────────

/**
 * Check if Bluetooth LE is available in the current environment.
 * On iOS native (Capacitor), returns "available" when BLE is enabled.
 * On web, checks the Web Bluetooth API + HTTPS requirement.
 */
export async function checkBluetoothAvailability(): Promise<BluetoothAvailability> {
  if (typeof window === "undefined") return "unavailable-no-api";

  // Native platform: use Capacitor BLE transport
  if (Capacitor.isNativePlatform()) {
    const available = await getBLETransport().isAvailable();
    return available ? "available" : "unavailable-no-api";
  }

  // iOS Safari: Web Bluetooth not supported — and we're not in a native context
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS && !("bluetooth" in navigator)) {
    return "unavailable-ios-safari";
  }

  if (!("bluetooth" in navigator)) {
    return "unavailable-no-api";
  }

  if (
    window.location.protocol !== "https:" &&
    window.location.hostname !== "localhost"
  ) {
    return "unavailable-not-https";
  }

  const available = await getBLETransport().isAvailable();
  return available ? "available" : "unavailable-no-api";
}

// ─── DEVICE PAIRING ───────────────────────────────────────────────────────────

/**
 * Initiate Bluetooth LE pairing for a specific device.
 * On web: triggers the browser's native device picker UI.
 * On iOS native: triggers the Capacitor BLE device picker.
 *
 * Requires a user gesture (button click) — cannot be called programmatically.
 *
 * @param deviceKey - Which device profile to pair with
 * @returns PairedDevice with disconnect function
 */
export async function pairDevice(deviceKey: DeviceKey): Promise<PairedDevice> {
  const profile = DEVICE_PROFILES[deviceKey];
  const transport = getBLETransport();

  const filters = (profile.filters as ReadonlyArray<{ namePrefix?: string }>).map(
    (f) => ({ namePrefix: f.namePrefix }),
  );
  const handle = await transport.requestDevice(filters, [profile.serviceUUID]);

  const disconnect = async () => {
    await transport.disconnect(handle);
  };

  return {
    key: deviceKey,
    name: profile.name,
    category: profile.category,
    _handle: handle,
    disconnect,
  };
}

// ─── READING FUNCTIONS ────────────────────────────────────────────────────────

/**
 * Read a single moisture measurement from a paired pin or non-invasive meter.
 * For continuous readings, use subscribeToReadings() instead.
 */
export async function readMoistureReading(
  device: PairedDevice,
): Promise<MoistureReading> {
  if (
    device.category !== "pin-moisture-meter" &&
    device.category !== "non-invasive-moisture-meter"
  ) {
    throw new Error(`Device ${device.name} is not a moisture meter`);
  }

  const profile = DEVICE_PROFILES[device.key];
  const value = await getBLETransport().readCharacteristic(
    device._handle,
    profile.serviceUUID,
    profile.characteristicUUID,
  );
  const parsed = parseMoistureValue(device.key, value);

  return {
    deviceKey: device.key,
    deviceName: device.name,
    ...parsed,
    readingTimestamp: new Date().toISOString(),
  };
}

/**
 * Read environmental data (RH, temperature, dew point) from a thermo-hygrometer.
 */
export async function readEnvironmentalData(
  device: PairedDevice,
): Promise<EnvironmentalReading> {
  if (device.category !== "thermo-hygrometer") {
    throw new Error(`Device ${device.name} is not a thermo-hygrometer`);
  }

  const profile = DEVICE_PROFILES[device.key];
  const transport = getBLETransport();

  const rhValue = await transport.readCharacteristic(
    device._handle,
    profile.serviceUUID,
    profile.characteristicUUID,
  );
  const rh = parseHumidityValue(device.key, rhValue);

  // For Testo 605 / Vaisala — read temperature from separate characteristic
  let temperatureCelsius = 22; // fallback default
  const hasTemperatureChar =
    "temperatureCharUUID" in profile && !!profile.temperatureCharUUID;

  if (hasTemperatureChar) {
    try {
      const tempChar = (profile as typeof DEVICE_PROFILES["testo-605"])
        .temperatureCharUUID;
      const tempValue = await transport.readCharacteristic(
        device._handle,
        profile.serviceUUID,
        tempChar,
      );
      temperatureCelsius = parseTemperatureValue(device.key, tempValue);
    } catch {
      // Non-fatal — use fallback
    }
  }

  const dewPointCelsius = calculateDewPoint(rh, temperatureCelsius);

  return {
    deviceKey: device.key,
    deviceName: device.name,
    relativeHumidityPercent: rh,
    temperatureCelsius,
    dewPointCelsius,
    readingTimestamp: new Date().toISOString(),
  };
}

/**
 * Subscribe to continuous readings from a device.
 * Returns an unsubscribe function.
 *
 * @param device - Paired device
 * @param onReading - Callback on each new reading
 * @param onError - Callback on BLE error
 */
export async function subscribeToReadings(
  device: PairedDevice,
  onReading: (reading: DeviceReading) => void,
  onError?: (error: Error) => void,
): Promise<() => void> {
  const profile = DEVICE_PROFILES[device.key];
  const transport = getBLETransport();

  const handleValue = (dataView: DataView) => {
    try {
      if (device.category === "thermo-hygrometer") {
        const rh = parseHumidityValue(device.key, dataView);
        const reading: EnvironmentalReading = {
          deviceKey: device.key,
          deviceName: device.name,
          relativeHumidityPercent: rh,
          temperatureCelsius: 22, // updated on next full read
          dewPointCelsius: calculateDewPoint(rh, 22),
          readingTimestamp: new Date().toISOString(),
        };
        onReading(reading);
      } else {
        const parsed = parseMoistureValue(device.key, dataView);
        const reading: MoistureReading = {
          deviceKey: device.key,
          deviceName: device.name,
          ...parsed,
          readingTimestamp: new Date().toISOString(),
        };
        onReading(reading);
      }
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const unsubscribeAsync = await transport.subscribeCharacteristic(
    device._handle,
    profile.serviceUUID,
    profile.characteristicUUID,
    handleValue,
  );

  return () => {
    unsubscribeAsync().catch(() => {});
  };
}

// ─── DATA PARSERS ─────────────────────────────────────────────────────────────

/**
 * Parse moisture meter DataView into a typed reading.
 *
 * TODO: Validate byte layout against actual device firmware documentation.
 * Current implementation assumes a common 2-byte little-endian moisture value
 * with a 0.1% resolution (value / 10 = percent).
 */
function parseMoistureValue(
  deviceKey: DeviceKey,
  dataView: DataView,
): Pick<
  MoistureReading,
  "moistureContentPercent" | "materialType" | "rawSignal"
> {
  // Tramex MEP / BD-2100 / CMEXv5 assumed byte layout:
  //   Byte 0-1: moisture reading (uint16 little-endian, value × 0.1 = %)
  //   Byte 2:   material type code (0=wood, 1=drywall, 2=concrete, 3=generic)
  // TODO: validate against manufacturer firmware spec

  if (dataView.byteLength < 2) {
    throw new Error(
      `Unexpected data length from ${deviceKey}: ${dataView.byteLength} bytes`,
    );
  }

  const rawSignal = dataView.getUint16(0, true);
  const moistureContentPercent = rawSignal / 10;

  const MATERIAL_CODES: Record<number, string> = {
    0: "wood",
    1: "drywall",
    2: "concrete",
    3: "generic",
  };

  const materialCode =
    dataView.byteLength > 2 ? dataView.getUint8(2) : undefined;
  const materialType =
    materialCode !== undefined ? MATERIAL_CODES[materialCode] : undefined;

  return { moistureContentPercent, materialType, rawSignal };
}

/**
 * Parse humidity characteristic DataView (ESS standard: uint16 × 0.01 = %)
 * Covers Testo 605-H1 and Vaisala HM70 using ESS GATT profile.
 */
function parseHumidityValue(deviceKey: DeviceKey, dataView: DataView): number {
  // ESS Humidity characteristic: uint16 little-endian, value × 0.01 = %RH
  if (dataView.byteLength < 2) {
    throw new Error(
      `Unexpected humidity data length from ${deviceKey}: ${dataView.byteLength} bytes`,
    );
  }
  return dataView.getUint16(0, true) / 100;
}

/**
 * Parse temperature characteristic DataView (ESS standard: sint16 × 0.01 = °C)
 */
function parseTemperatureValue(
  deviceKey: DeviceKey,
  dataView: DataView,
): number {
  if (dataView.byteLength < 2) {
    throw new Error(
      `Unexpected temperature data length from ${deviceKey}: ${dataView.byteLength} bytes`,
    );
  }
  return dataView.getInt16(0, true) / 100;
}

/**
 * Magnus formula approximation for dew point calculation.
 * Used when the device does not directly report dew point.
 * Accuracy: ±0.35°C over 0–60°C range.
 */
function calculateDewPoint(
  relativeHumidity: number,
  temperatureCelsius: number,
): number {
  const a = 17.625;
  const b = 243.04;
  const alpha =
    Math.log(relativeHumidity / 100) +
    (a * temperatureCelsius) / (b + temperatureCelsius);
  return Math.round(((b * alpha) / (a - alpha)) * 10) / 10;
}

// ─── UTILITY ──────────────────────────────────────────────────────────────────

/** Get all P1 device profiles for display in the pairing UI */
export function getP1DeviceProfiles() {
  return Object.entries(DEVICE_PROFILES).map(([key, profile]) => ({
    key: key as DeviceKey,
    name: profile.name,
    category: profile.category,
    dataPoints: [...profile.dataPoints],
  }));
}
