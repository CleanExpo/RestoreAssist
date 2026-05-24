/**
 * Capacitor Bluetooth Bridge — Phase 1 (Testo 605-H1 + Vaisala HM70)
 *
 * Thin wrapper over @capacitor-community/bluetooth-le that provides the
 * same interface as the Web Bluetooth path in nir-bluetooth-service.ts,
 * but runs inside the iOS WKWebView where Web Bluetooth is blocked.
 *
 * Only supports devices that use standard ESS (Environmental Sensing
 * Service) UUIDs — no vendor SDK required:
 *   Service:         0x181A  (Environmental Sensing)
 *   Humidity char:   0x2A6F  (Humidity)
 *   Temperature char:0x2A6E  (Temperature)
 *
 * Phase 2 (Tramex / Delmhorst vendor UUIDs) is explicitly out of scope.
 */

// ESS standard UUIDs
const ESS_SERVICE = "0000181a-0000-1000-8000-00805f9b34fb";
const HUMIDITY_CHAR = "00002a6f-0000-1000-8000-00805f9b34fb";
const TEMPERATURE_CHAR = "00002a6e-0000-1000-8000-00805f9b34fb";

/**
 * Show the native BLE device picker filtered to ESS-capable devices,
 * initialise the plugin, connect, and return the deviceId.
 *
 * @param deviceNames - Name prefixes to filter the scan results (e.g.
 *   ["testo 605", "Testo 605", "HM70", "Vaisala"])
 * @returns deviceId string used by all subsequent calls
 */
export async function scanAndConnect(deviceNames: string[]): Promise<string> {
  const { BleClient } = await import("@capacitor-community/bluetooth-le");

  await BleClient.initialize();

  const device = await BleClient.requestDevice({
    services: [ESS_SERVICE],
    namePrefix: deviceNames[0],
    optionalServices: [],
  });

  await BleClient.connect(device.deviceId);

  return device.deviceId;
}

/**
 * Read the current relative humidity from a connected ESS device.
 * ESS Humidity characteristic: uint16 little-endian, value × 0.01 = %RH
 *
 * @returns Relative humidity as a percentage (0–100)
 */
export async function readHumidity(deviceId: string): Promise<number> {
  const { BleClient } = await import("@capacitor-community/bluetooth-le");

  const dataView = await BleClient.read(deviceId, ESS_SERVICE, HUMIDITY_CHAR);
  // ESS spec: uint16 little-endian, unit 0.01 %
  return dataView.getUint16(0, true) / 100;
}

/**
 * Read the current temperature from a connected ESS device.
 * ESS Temperature characteristic: sint16 little-endian, value × 0.01 = °C
 *
 * @returns Temperature in degrees Celsius
 */
export async function readTemperature(deviceId: string): Promise<number> {
  const { BleClient } = await import("@capacitor-community/bluetooth-le");

  const dataView = await BleClient.read(
    deviceId,
    ESS_SERVICE,
    TEMPERATURE_CHAR,
  );
  // ESS spec: sint16 little-endian, unit 0.01 °C
  return dataView.getInt16(0, true) / 100;
}

/**
 * Disconnect from a connected BLE device.
 */
export async function disconnect(deviceId: string): Promise<void> {
  const { BleClient } = await import("@capacitor-community/bluetooth-le");

  await BleClient.disconnect(deviceId);
}
