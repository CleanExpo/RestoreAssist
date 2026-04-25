/**
 * NIR BLE Transport — RA-1614
 *
 * Platform-dispatch layer that routes BLE operations to either:
 *   - Web Bluetooth API (Chrome desktop + Android WebView)
 *   - @capacitor-community/bluetooth-le (iOS native + Android native)
 *
 * Use `getBLETransport()` to get the right implementation for the
 * current platform. All consumers should go through this module —
 * never call navigator.bluetooth or BleClient directly from feature code.
 */

import { Capacitor } from "@capacitor/core";

// ─── HANDLE ───────────────────────────────────────────────────────────────────

/**
 * Opaque device handle returned by `requestDevice()`.
 * Do not access fields outside of this module.
 */
export interface BLEHandle {
  /** Which transport created this handle */
  transport: "web" | "capacitor";
  /** Stable identifier (Web BT: device.id, Capacitor: deviceId) */
  deviceId: string;
  /** @internal Web BT objects */
  _web?: {
    device: unknown;
    services: Map<string, unknown>; // uuid → BluetoothRemoteGATTService
    characteristics: Map<string, unknown>; // uuid → BluetoothRemoteGATTCharacteristic
  };
}

// ─── FILTER TYPE ──────────────────────────────────────────────────────────────

export interface BLEDeviceFilter {
  namePrefix?: string;
  name?: string;
}

// ─── TRANSPORT INTERFACE ──────────────────────────────────────────────────────

export interface BLETransport {
  /** Check whether BLE is available on this platform/device */
  isAvailable(): Promise<boolean>;

  /** Show native device picker and return a connected handle */
  requestDevice(
    filters: BLEDeviceFilter[],
    optionalServices: string[],
  ): Promise<BLEHandle>;

  /** Read a single characteristic value */
  readCharacteristic(
    handle: BLEHandle,
    serviceUUID: string,
    charUUID: string,
  ): Promise<DataView>;

  /**
   * Subscribe to characteristic notifications.
   * Returns an unsubscribe function.
   */
  subscribeCharacteristic(
    handle: BLEHandle,
    serviceUUID: string,
    charUUID: string,
    callback: (value: DataView) => void,
  ): Promise<() => Promise<void>>;

  /** Disconnect the device */
  disconnect(handle: BLEHandle): Promise<void>;
}

// ─── WEB BLUETOOTH TRANSPORT ──────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

class WebBluetoothTransport implements BLETransport {
  async isAvailable(): Promise<boolean> {
    if (typeof window === "undefined" || !("bluetooth" in navigator)) {
      return false;
    }
    if (
      window.location.protocol !== "https:" &&
      window.location.hostname !== "localhost"
    ) {
      return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (navigator as any).bluetooth.getAvailability();
  }

  async requestDevice(
    filters: BLEDeviceFilter[],
    optionalServices: string[],
  ): Promise<BLEHandle> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const device = await (navigator as any).bluetooth.requestDevice({
      filters,
      optionalServices,
    });

    const server = await device.gatt.connect();

    return {
      transport: "web",
      deviceId: device.id as string,
      _web: {
        device,
        services: new Map(),
        characteristics: new Map(),
      },
    };
  }

  private async getCharacteristic(
    handle: BLEHandle,
    serviceUUID: string,
    charUUID: string,
  ): Promise<any> {
    if (!handle._web) throw new Error("Not a Web Bluetooth handle");
    const cacheKey = `${serviceUUID}:${charUUID}`;

    if (handle._web.characteristics.has(cacheKey)) {
      return handle._web.characteristics.get(cacheKey);
    }

    const device = handle._web.device as any;
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(serviceUUID);
    const char = await service.getCharacteristic(charUUID);
    handle._web.characteristics.set(cacheKey, char);
    return char;
  }

  async readCharacteristic(
    handle: BLEHandle,
    serviceUUID: string,
    charUUID: string,
  ): Promise<DataView> {
    const char = await this.getCharacteristic(handle, serviceUUID, charUUID);
    return char.readValue() as DataView;
  }

  async subscribeCharacteristic(
    handle: BLEHandle,
    serviceUUID: string,
    charUUID: string,
    callback: (value: DataView) => void,
  ): Promise<() => Promise<void>> {
    const char = await this.getCharacteristic(handle, serviceUUID, charUUID);
    await char.startNotifications();

    const handler = (event: Event) => {
      const target = event.target as any;
      if (target.value) callback(target.value as DataView);
    };

    char.addEventListener("characteristicvaluechanged", handler);

    return async () => {
      char.removeEventListener("characteristicvaluechanged", handler);
      await char.stopNotifications().catch(() => {});
    };
  }

  async disconnect(handle: BLEHandle): Promise<void> {
    if (!handle._web) return;
    const device = handle._web.device as any;
    device.gatt?.disconnect();
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── CAPACITOR BLE TRANSPORT ──────────────────────────────────────────────────

class CapacitorBLETransport implements BLETransport {
  private initialized = false;

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    const { BleClient } = await import("@capacitor-community/bluetooth-le");
    await BleClient.initialize({ androidNeverForLocation: true });
    this.initialized = true;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      const { BleClient } = await import("@capacitor-community/bluetooth-le");
      // isEnabled() throws if BLE is not available at all
      const enabled = await BleClient.isEnabled();
      return enabled;
    } catch {
      return false;
    }
  }

  async requestDevice(
    filters: BLEDeviceFilter[],
    optionalServices: string[],
  ): Promise<BLEHandle> {
    await this.ensureInitialized();
    const { BleClient } = await import("@capacitor-community/bluetooth-le");

    const device = await BleClient.requestDevice({
      services: optionalServices,
      optionalServices: [],
      allowDuplicates: false,
      // namePrefix filter — use the first filter's namePrefix if present
      namePrefix: filters.find((f) => f.namePrefix)?.namePrefix,
    });

    await BleClient.connect(device.deviceId, () => {
      // Disconnected callback — no-op; callers use disconnect() explicitly
    });

    return {
      transport: "capacitor",
      deviceId: device.deviceId,
    };
  }

  async readCharacteristic(
    handle: BLEHandle,
    serviceUUID: string,
    charUUID: string,
  ): Promise<DataView> {
    await this.ensureInitialized();
    const { BleClient } = await import("@capacitor-community/bluetooth-le");
    return BleClient.read(handle.deviceId, serviceUUID, charUUID);
  }

  async subscribeCharacteristic(
    handle: BLEHandle,
    serviceUUID: string,
    charUUID: string,
    callback: (value: DataView) => void,
  ): Promise<() => Promise<void>> {
    await this.ensureInitialized();
    const { BleClient } = await import("@capacitor-community/bluetooth-le");

    await BleClient.startNotifications(
      handle.deviceId,
      serviceUUID,
      charUUID,
      callback,
    );

    return async () => {
      await BleClient.stopNotifications(
        handle.deviceId,
        serviceUUID,
        charUUID,
      ).catch(() => {});
    };
  }

  async disconnect(handle: BLEHandle): Promise<void> {
    await this.ensureInitialized();
    const { BleClient } = await import("@capacitor-community/bluetooth-le");
    await BleClient.disconnect(handle.deviceId).catch(() => {});
  }
}

// ─── FACTORY ──────────────────────────────────────────────────────────────────

let _transport: BLETransport | null = null;

/**
 * Returns the correct BLE transport for the current platform.
 * Result is cached — safe to call repeatedly.
 */
export function getBLETransport(): BLETransport {
  if (_transport) return _transport;
  _transport = Capacitor.isNativePlatform()
    ? new CapacitorBLETransport()
    : new WebBluetoothTransport();
  return _transport;
}
