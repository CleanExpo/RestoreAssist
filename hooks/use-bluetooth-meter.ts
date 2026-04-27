"use client";

/**
 * useBluetoothMeter — RA-1611
 *
 * Shared hook extracted from /dashboard/field/bluetooth-pair (RA-1121 MVP).
 * Manages BLE device pairing, one-shot reads, and session-level device
 * persistence (so a second reading in the same form session does not
 * re-prompt the browser picker).
 *
 * BROWSER ONLY — do not import in RSC or edge routes.
 *
 * Usage:
 *   const { availability, paired, pairing, reading, pair, read, disconnect, lastReading } =
 *     useBluetoothMeter("testo-605");
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkBluetoothAvailability,
  pairDevice,
  readEnvironmentalData,
  readMoistureReading,
  type BluetoothAvailability,
  type DeviceKey,
  type DeviceReading,
  type EnvironmentalReading,
  type MoistureReading,
  type PairedDevice,
} from "@/lib/nir-bluetooth-service";

export interface UseBluetoothMeterReturn {
  /** null while probing */
  availability: BluetoothAvailability | null;
  paired: PairedDevice | null;
  pairing: boolean;
  reading: boolean;
  lastReading: DeviceReading | null;
  /** Open browser device picker and pair */
  pair: () => Promise<void>;
  /** Fetch one reading from the currently paired device */
  read: () => Promise<DeviceReading | null>;
  /** Disconnect without clearing lastReading */
  disconnect: () => Promise<void>;
}

export function useBluetoothMeter(deviceKey: DeviceKey): UseBluetoothMeterReturn {
  const [availability, setAvailability] = useState<BluetoothAvailability | null>(null);
  const [paired, setPaired] = useState<PairedDevice | null>(null);
  const [pairing, setPairing] = useState(false);
  const [reading, setReading] = useState(false);
  const [lastReading, setLastReading] = useState<DeviceReading | null>(null);

  // Keep a ref to the paired device so callbacks don't close over stale state
  const pairedRef = useRef<PairedDevice | null>(null);
  pairedRef.current = paired;

  useEffect(() => {
    let alive = true;
    checkBluetoothAvailability().then((result) => {
      if (alive) setAvailability(result);
    });
    return () => {
      alive = false;
    };
  }, []);

  const pair = useCallback(async () => {
    if (pairedRef.current) return; // already paired — don't re-prompt
    setPairing(true);
    try {
      const device = await pairDevice(deviceKey);
      setPaired(device);
      pairedRef.current = device;
    } finally {
      setPairing(false);
    }
  }, [deviceKey]);

  const read = useCallback(async (): Promise<DeviceReading | null> => {
    const device = pairedRef.current;
    if (!device) return null;
    setReading(true);
    try {
      let result: DeviceReading;
      if (device.category === "thermo-hygrometer") {
        result = await readEnvironmentalData(device);
      } else {
        result = await readMoistureReading(device);
      }
      setLastReading(result);
      return result;
    } catch {
      return null;
    } finally {
      setReading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const device = pairedRef.current;
    if (!device) return;
    await device.disconnect();
    setPaired(null);
    pairedRef.current = null;
  }, []);

  return { availability, paired, pairing, reading, lastReading, pair, read, disconnect };
}

// ─── Type guards ──────────────────────────────────────────────────────────────

export function isEnvironmentalReading(r: DeviceReading): r is EnvironmentalReading {
  return "relativeHumidityPercent" in r;
}

export function isMoistureReading(r: DeviceReading): r is MoistureReading {
  return "moistureContentPercent" in r;
}
