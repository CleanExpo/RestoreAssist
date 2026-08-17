"use client";

/**
 * RA-1121 — field device surface.
 *
 * Every device RestoreAssist can represent is listed from
 * `lib/field-device-registry.ts`, which carries its transport, the provenance
 * of its protocol, its calibration basis and its support level. The page
 * renders those facts rather than restating them, so the catalogue cannot
 * drift from what the pairing path will actually allow.
 *
 * Only a VERIFIED BLE profile offers a pair button, and no device is VERIFIED
 * today — every GATT profile is VENDOR_PENDING, so this page shows the reason
 * instead of a pair button and `pairDevice()` refuses them regardless of the
 * UI. The MILESEEY S50R magicplan Edition is a magicplan cloud-bridge pilot
 * with a manual export step — it has no direct pairing path here and nothing
 * on this page represents a magicplan connection or an automated sync.
 *
 * Surface:
 *   - Availability probe (HTTPS + Web Bluetooth + non-iOS-Safari).
 *   - Provenance, calibration, transport and support status for every device.
 *   - Pair / Read / Disconnect, rendered only for a device the registry marks
 *     pairable. Nothing qualifies until a vendor profile is validated.
 */

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FIELD_DEVICE_REGISTRY,
  isPairable,
  pairingRefusalReason,
  type FieldDeviceProfile,
  type FieldDeviceSupportLevel,
  type FieldDeviceTransport,
} from "@/lib/field-device-registry";
import {
  checkBluetoothAvailability,
  pairDevice,
  readEnvironmentalData,
  type BluetoothAvailability,
  type DeviceKey,
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
    title: "Web Bluetooth available — no device to pair with",
    description:
      "This browser can reach Bluetooth hardware, but no direct hardware profile is currently production-verified, so there is nothing to pair. Each device below shows what is missing.",
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

const TRANSPORT_LABELS: Record<FieldDeviceTransport, string> = {
  BLE: "Bluetooth LE (direct)",
  WIFI: "Wi-Fi (direct)",
  CLOUD_BRIDGE: "Vendor app + cloud bridge",
};

const SUPPORT_LABELS: Record<FieldDeviceSupportLevel, string> = {
  VERIFIED: "Verified",
  BRIDGED: "Bridged",
  VENDOR_PENDING: "Vendor pending",
  UNSUPPORTED: "Unsupported",
};

const SUPPORT_VARIANTS: Record<
  FieldDeviceSupportLevel,
  "default" | "secondary" | "destructive" | "outline"
> = {
  VERIFIED: "default",
  BRIDGED: "secondary",
  VENDOR_PENDING: "outline",
  UNSUPPORTED: "destructive",
};

const CALIBRATION_LABELS: Record<
  FieldDeviceProfile["calibration"]["status"],
  string
> = {
  VENDOR_PUBLISHED_ACCURACY: "Vendor-published accuracy",
  FIELD_CALIBRATION_REQUIRED: "Field calibration required",
  UNVERIFIED: "Unverified",
};

function DeviceFacts({ profile }: { profile: FieldDeviceProfile }) {
  return (
    <dl className="grid gap-3 text-xs sm:grid-cols-2">
      <div>
        <dt className="font-medium text-slate-900 dark:text-slate-100">
          Transport
        </dt>
        <dd className="text-slate-600 dark:text-slate-300">
          {TRANSPORT_LABELS[profile.transport]}
        </dd>
      </div>
      <div>
        <dt className="font-medium text-slate-900 dark:text-slate-100">
          Calibration
        </dt>
        <dd className="text-slate-600 dark:text-slate-300">
          {CALIBRATION_LABELS[profile.calibration.status]}
          {profile.calibration.statedAccuracy
            ? ` — ${profile.calibration.statedAccuracy}`
            : ""}
          <span className="block mt-0.5">{profile.calibration.note}</span>
        </dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="font-medium text-slate-900 dark:text-slate-100">
          Protocol provenance
        </dt>
        <dd className="text-slate-600 dark:text-slate-300">
          {profile.provenance.note}
          <span className="block mt-0.5 break-words text-slate-500 dark:text-slate-400">
            Source: {profile.provenance.evidence}
          </span>
        </dd>
      </div>
    </dl>
  );
}

export default function BluetoothPairPage() {
  const [availability, setAvailability] =
    useState<BluetoothAvailability | null>(null);
  const [paired, setPaired] = useState<PairedDevice | null>(null);
  const [pairing, setPairing] = useState(false);
  const [reading, setReading] = useState(false);
  const [lastReading, setLastReading] = useState<EnvironmentalReading | null>(
    null,
  );

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
  // A green banner would read as "you can pair something". Nothing in the
  // registry is pairable, so the banner only turns positive when one is.
  const anyPairable = FIELD_DEVICE_REGISTRY.some(isPairable);

  async function handlePair(modelId: string) {
    setPairing(true);
    try {
      const device = await pairDevice(modelId as DeviceKey);
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
          Field Devices
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Each device shows the transport it uses, where its protocol came from
          and how far support has been taken. Direct pairing is offered only
          where the protocol is verified, and no direct hardware profile is
          currently production-verified.
        </p>
      </header>

      {label ? (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-lg border p-4 ${
            label.kind === "available" && anyPairable
              ? "border-success-subtle-foreground/30 bg-success-subtle text-success-subtle-foreground"
              : "border-warning-subtle-foreground/30 bg-warning-subtle text-warning-subtle-foreground"
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

      <div className="space-y-4">
        {FIELD_DEVICE_REGISTRY.map((profile) => {
          const pairableProfile = isPairable(profile);
          const refusal = pairingRefusalReason(profile.modelId);
          const isThisPaired = paired?.key === profile.modelId;
          const canPair =
            pairableProfile &&
            availability === "available" &&
            !paired &&
            !pairing;

          return (
            <Card key={profile.modelId}>
              <CardHeader>
                <CardTitle className="text-base">
                  {profile.displayName}
                </CardTitle>
                <CardDescription>
                  {profile.manufacturer} · {profile.captureKinds.join(", ")}
                </CardDescription>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant={SUPPORT_VARIANTS[profile.supportLevel]}>
                    {SUPPORT_LABELS[profile.supportLevel]}
                  </Badge>
                  <Badge variant="outline">{profile.transport}</Badge>
                  {profile.cloudBridge ? (
                    <Badge variant="outline">
                      {profile.cloudBridge.provider} · manual export
                    </Badge>
                  ) : null}
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {isThisPaired ? "Connected" : "Not paired"}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <DeviceFacts profile={profile} />

                {profile.cloudBridge ? (
                  <p className="rounded-md border border-slate-200 dark:border-slate-700 p-3 text-xs text-slate-600 dark:text-slate-300">
                    {profile.cloudBridge.note}
                  </p>
                ) : null}

                {refusal ? (
                  <p className="rounded-md border border-warning-subtle-foreground/30 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
                    {refusal}
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    {!isThisPaired ? (
                      <Button
                        onClick={() => handlePair(profile.modelId)}
                        disabled={!canPair}
                      >
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
                )}

                {isThisPaired && lastReading ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="rounded-md border border-slate-200 dark:border-slate-700 p-3 text-sm font-mono tabular-nums"
                  >
                    <div>
                      RH:{" "}
                      <span className="font-semibold">
                        {lastReading.relativeHumidityPercent.toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      Temp:{" "}
                      <span className="font-semibold">
                        {lastReading.temperatureCelsius.toFixed(1)} °C
                      </span>
                    </div>
                    <div>
                      Dew point:{" "}
                      <span className="font-semibold">
                        {lastReading.dewPointCelsius.toFixed(1)} °C
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      @{" "}
                      {new Date(lastReading.readingTimestamp).toLocaleString(
                        "en-AU",
                      )}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Vendor-pending profiles are promoted only once the manufacturer&apos;s
        GATT documentation for that exact model is obtained and validated
        against a physical unit&apos;s firmware. A Bluetooth SIG standard UUID
        is not a substitute — it defines what a value means, not what a device
        implements. The MILESEEY S50R remains a magicplan manual-export pilot
        until MILESEEY publishes an authoritative protocol.
      </p>
    </div>
  );
}
