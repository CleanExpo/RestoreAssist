/**
 * BLE LiDAR tape client — Bosch GLM 100-25 C and Leica DISTO D2/D510.
 *
 * These devices broadcast distance measurements over BLE using a
 * proprietary GATT service. Reading is parsed from the characteristic
 * notification and returned in metres.
 *
 * Technician workflow:
 *   1. Pair tape via connectTape()
 *   2. Point at wall, press measure button on device
 *   3. readMeasurement() returns distance in metres
 *   4. Call again for next dimension (width, height)
 *   5. disconnectTape() when done
 *
 * BLE UUIDs below are from Bosch open SDK docs and community reverse-engineering
 * of the Leica DISTO protocol. Mark with TODO if vendor confirms otherwise
 * (tracked in RA-1612).
 *
 * RA-1133 Tier 2
 */

import { getBLETransport, type BLEHandle } from "@/lib/nir-ble-transport";

// ─── DEVICE PROFILES ──────────────────────────────────────────────────────────

interface TapeProfile {
  namePrefix: string;
  serviceUuid: string;
  measureCharUuid: string;
  /** bytes → metres conversion function */
  parseMeasurement(bytes: Uint8Array): number;
}

const BOSCH_GLM: TapeProfile = {
  namePrefix: "GLM",
  serviceUuid: "3ab10100-f831-4395-b29d-570977d5bf94", // Bosch measurement service
  measureCharUuid: "3ab10101-f831-4395-b29d-570977d5bf94",
  parseMeasurement(bytes) {
    // Bosch GLM encodes distance as little-endian int32 in 0.1mm units
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const raw = view.getInt32(0, true);
    return raw / 10000; // 0.1mm → metres
  },
};

const LEICA_DISTO: TapeProfile = {
  namePrefix: "DISTO",
  serviceUuid: "3ab10100-f831-4395-b29d-570977d5bf94", // TODO: validate with Leica SDK (RA-1612)
  measureCharUuid: "3ab10102-f831-4395-b29d-570977d5bf94",
  parseMeasurement(bytes) {
    // Leica DISTO: ASCII decimal string e.g. "1.234\r\n"
    const text = new TextDecoder().decode(bytes).trim();
    const value = parseFloat(text);
    return isNaN(value) ? 0 : value;
  },
};

const ALL_PROFILES: TapeProfile[] = [BOSCH_GLM, LEICA_DISTO];

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface TapeConnection {
  deviceId: string;
  deviceName: string;
  profile: "bosch_glm" | "leica_disto";
}

export interface TapeMeasurement {
  metres: number;
  timestamp: string; // ISO-8601
}

// ─── STATE ────────────────────────────────────────────────────────────────────

let _handle: BLEHandle | null = null;
let _profile: TapeProfile | null = null;

// ─── API ──────────────────────────────────────────────────────────────────────

export async function isBleTapeAvailable(): Promise<boolean> {
  const transport = getBLETransport();
  return transport.isAvailable();
}

export async function connectTape(): Promise<TapeConnection> {
  const transport = getBLETransport();
  const filters = ALL_PROFILES.map((p) => ({ namePrefix: p.namePrefix }));
  const services = ALL_PROFILES.map((p) => p.serviceUuid);

  const handle = await transport.requestDevice(filters, services);

  // Match profile by device name
  const profile =
    ALL_PROFILES.find((p) =>
      handle.deviceId.toLowerCase().includes(p.namePrefix.toLowerCase()),
    ) ?? BOSCH_GLM;
  _handle = handle;
  _profile = profile;

  const name = handle.deviceId;
  const profileKey: TapeConnection["profile"] =
    profile === LEICA_DISTO ? "leica_disto" : "bosch_glm";

  return { deviceId: handle.deviceId, deviceName: name, profile: profileKey };
}

/**
 * Wait for the next measurement notification from the tape.
 * User presses the measure button on the device; this resolves when the
 * BLE notification arrives (typically within 2–3 seconds).
 *
 * Rejects after `timeoutMs` if no measurement received.
 */
export async function readMeasurement(timeoutMs = 10_000): Promise<TapeMeasurement> {
  const transport = getBLETransport();
  if (!_handle || !_profile) throw new Error("No tape connected — call connectTape() first");

  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Measurement timeout — device did not send a reading")),
      timeoutMs,
    );

    let unsubscribe: (() => Promise<void>) | null = null;

    transport
      .subscribeCharacteristic(
        _handle!,
        _profile!.serviceUuid,
        _profile!.measureCharUuid,
        (dataView) => {
          clearTimeout(timer);
          const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
          const metres = _profile!.parseMeasurement(bytes);
          unsubscribe?.().catch(() => {});
          resolve({ metres, timestamp: new Date().toISOString() });
        },
      )
      .then((unsub) => { unsubscribe = unsub; })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function disconnectTape(): Promise<void> {
  const transport = getBLETransport();
  if (_handle) {
    await transport.disconnect(_handle).catch(() => {});
    _handle = null;
    _profile = null;
  }
}
