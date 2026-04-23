"use client";

/**
 * RA-1121 MVP — Web Bluetooth pair + read proof-of-infrastructure page.
 *
 * Why this exists as a standalone page rather than baked into the
 * moisture-capture form: the `lib/nir-bluetooth-service.ts` pairing
 * path is real but the UUID table only has the Testo 605-H1 set
 * confirmed (Environmental Sensing Service standard UUIDs). Every
 * other device profile in the skeleton has vendor-SDK-pending UUIDs
 * that will 404 on `getPrimaryService`. Shipping the MVP on a
 * dedicated page lets a technician validate the end-to-end BLE path
 * with the one device that works today, without gating the rest of
 * the moisture-form UX on hardware we don't have UUIDs for.
 *
 * Surface:
 *   - Availability probe (HTTPS + Web Bluetooth + non-iOS-Safari).
 *   - Pair button — opens the browser's native device picker.
 *   - Read button — fetches RH / temp / dew point on click.
 *   - Disconnect.
 *
 * Follow-up tickets track: integration into MoistureReadingEntryForm,
 * vendor-SDK UUID acquisition for Delmhorst / Tramex / Protimeter /
 * Trotec / Gann, Capacitor BLE plugin for iOS native, Ubibot cloud
 * poller.
 */

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  checkBluetoothAvailability,
  pairDevice,
  readEnvironmentalData,
  type BluetoothAvailability,
  type EnvironmentalReading,
  type PairedDevice,
} from "@/lib/nir-bluetooth-service";

type AvailabilityLabel = {
  kind: BluetoothAvailability;
  title: string;
  description: string;
};

const AVAILABILITY_LABELS: Record<BluetoothAvailability, AvailabilityLabel> = {
  available: {
    kind: "available",
    title: "Web Bluetooth available",
    description:
      "You can pair a Testo 605-H1. Make sure the meter is powered on and within 3m.",
  },
  "unavailable-no-api": {
    kind: "unavailable-no-api",
    title: "Web Bluetooth not available",
    description:
      "This browser or OS does not expose the Web Bluetooth API. Chrome on desktop or Android works; Firefox and Safari do not.",
  },
  "unavailable-not-https": {
    kind: "unavailable-not-https",
    title: "HTTPS required",
    description:
      "Web Bluetooth is only exposed on HTTPS origins (or localhost). Load this page over HTTPS to pair.",
  },
  "unavailable-ios-safari": {
    kind: "unavailable-ios-safari",
    title: "iOS Safari not supported",
    description:
      "iOS requires the native app (Capacitor BLE plugin) for Bluetooth meter pairing — this web page cannot reach the hardware.",
  },
};

export default function BluetoothPairPage() {
  const [availability, setAvailability] =
    useState<BluetoothAvailability | null>(null);
  const [paired, setPaired] = useState<PairedDevice | null>(null);
  const [pairing, setPairing] = useState(false);
  const [reading, setReading] = useState(false);
  const [lastReading, setLastReading] =
    useState<EnvironmentalReading | null>(null);

  useEffect(() => {
    let alive = true;
    checkBluetoothAvailability().then((result) => {
      if (alive) setAvailability(result);
    });
    return () => {
      alive = false;
    };
  }, []);

  const label = availability ? AVAILABILITY_LABELS[availability] : null;
  const canPair = availability === "available" && !paired && !pairing;

  async function handlePair() {
    setPairing(true);
    try {
      const device = await pairDevice("testo-605");
      setPaired(device);
      toast.success(`Paired: ${device.name}`);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Pairing cancelled or failed: ${err.message}`
          : "Pairing failed",
      );
    } finally {
      setPairing(false);
    }
  }

  async function handleRead() {
    if (!paired) return;
    setReading(true);
    try {
      const result = await readEnvironmentalData(paired);
      setLastReading(result);
      toast.success("Reading captured");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Read failed — try again",
      );
    } finally {
      setReading(false);
    }
  }

  async function handleDisconnect() {
    if (!paired) return;
    await paired.disconnect();
    setPaired(null);
    setLastReading(null);
    toast("Disconnected");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Bluetooth Meter Pairing
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          MVP surface for RA-1121. Currently pairs with Testo 605-H1
          thermo-hygrometers; additional meters follow as vendor-SDK
          UUIDs are confirmed.
        </p>
      </header>

      {label ? (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-lg border p-4 ${
            label.kind === "available"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-100"
              : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-100"
          }`}
        >
          <div className="font-medium">{label.title}</div>
          <div className="text-sm mt-0.5">{label.description}</div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-600 dark:text-slate-300">
          Checking Bluetooth availability…
        </div>
      )}

      <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium text-slate-900 dark:text-slate-100">
              Testo 605-H1 (Thermo-hygrometer)
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300">
              {paired ? "Connected" : "Not paired"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!paired ? (
              <Button onClick={handlePair} disabled={!canPair}>
                {pairing ? "Pairing…" : "Pair meter"}
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleRead}
                  disabled={reading}
                  variant="default"
                >
                  {reading ? "Reading…" : "Read now"}
                </Button>
                <Button onClick={handleDisconnect} variant="outline">
                  Disconnect
                </Button>
              </>
            )}
          </div>
        </div>

        {lastReading ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-md border border-slate-200 dark:border-slate-700 p-3 text-sm font-mono tabular-nums"
          >
            <div>
              RH: <span className="font-semibold">{lastReading.relativeHumidityPercent.toFixed(1)}%</span>
            </div>
            <div>
              Temp: <span className="font-semibold">{lastReading.temperatureCelsius.toFixed(1)} °C</span>
            </div>
            <div>
              Dew point: <span className="font-semibold">{lastReading.dewPointCelsius.toFixed(1)} °C</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              @ {new Date(lastReading.readingTimestamp).toLocaleString("en-AU")}
            </div>
          </div>
        ) : null}
      </section>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Follow-up work: pair dialog inside MoistureReadingEntryForm,
        Delmhorst / Tramex / Protimeter / Trotec / Gann UUID tables,
        Capacitor BLE plugin for iOS, Ubibot cloud poller (RA-1611..).
      </p>
    </div>
  );
}
