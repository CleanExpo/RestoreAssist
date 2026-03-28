// Sensor Abstraction Layer
// v1: Manual input only
// v2: Bluetooth BLE moisture meters (react-native-ble-plx)
// v3: LiDAR room scanning (custom ARKit module)

export interface SensorReading {
  type: 'moisture' | 'temperature' | 'humidity';
  value: number;
  unit: string;
  source: 'manual' | 'bluetooth' | 'sensor';
  deviceName?: string;
  deviceSerial?: string;
  calibrationDate?: string;
  timestamp: string;
}

export interface SensorAdapter {
  readonly name: string;
  readonly type: 'manual' | 'bluetooth' | 'lidar';
  readonly isAvailable: boolean;

  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
  readValue(): Promise<SensorReading>;
}

// v1: Manual input adapter (always available)
export class ManualMoistureAdapter implements SensorAdapter {
  readonly name = 'Manual Entry';
  readonly type = 'manual' as const;
  readonly isAvailable = true;

  private pendingReading: SensorReading | null = null;

  setReading(value: number, unit: string, meterType?: string, meterSerial?: string, calibrationDate?: string) {
    this.pendingReading = {
      type: 'moisture',
      value,
      unit,
      source: 'manual',
      deviceName: meterType,
      deviceSerial: meterSerial,
      calibrationDate,
      timestamp: new Date().toISOString(),
    };
  }
  async readValue(): Promise<SensorReading> {
    if (!this.pendingReading) {
      throw new Error('No reading set. Call setReading() first.');
    }
    const reading = this.pendingReading;
    this.pendingReading = null;
    return reading;
  }
}

export class ManualEnvironmentalAdapter implements SensorAdapter {
  readonly name = 'Manual Entry';
  readonly type = 'manual' as const;
  readonly isAvailable = true;

  private pendingReading: SensorReading | null = null;

  setReading(type: 'temperature' | 'humidity', value: number, unit: string) {
    this.pendingReading = {
      type,
      value,
      unit,
      source: 'manual',
      timestamp: new Date().toISOString(),
    };
  }

  async readValue(): Promise<SensorReading> {
    if (!this.pendingReading) {
      throw new Error('No reading set. Call setReading() first.');
    }
    const reading = this.pendingReading;
    this.pendingReading = null;
    return reading;
  }
}
// v2 placeholder: Bluetooth BLE adapter
// Will be implemented with react-native-ble-plx config plugin
export class BluetoothMoistureAdapter implements SensorAdapter {
  readonly name = 'Bluetooth Moisture Meter';
  readonly type = 'bluetooth' as const;
  readonly isAvailable = false; // Disabled until v2

  async connect(): Promise<void> {
    throw new Error('Bluetooth support coming in v2');
  }

  async disconnect(): Promise<void> {
    throw new Error('Bluetooth support coming in v2');
  }

  async readValue(): Promise<SensorReading> {
    throw new Error('Bluetooth support coming in v2');
  }
}

// Sensor registry - adapters register here
class SensorRegistry {
  private adapters: Map<string, SensorAdapter> = new Map();

  register(id: string, adapter: SensorAdapter) {
    this.adapters.set(id, adapter);
  }

  get(id: string): SensorAdapter | undefined {
    return this.adapters.get(id);
  }

  getAvailable(): SensorAdapter[] {
    return Array.from(this.adapters.values()).filter(a => a.isAvailable);
  }
  getByType(type: SensorAdapter['type']): SensorAdapter[] {
    return Array.from(this.adapters.values()).filter(a => a.type === type && a.isAvailable);
  }
}

// Global registry
export const sensorRegistry = new SensorRegistry();

// Register v1 adapters
sensorRegistry.register('manual-moisture', new ManualMoistureAdapter());
sensorRegistry.register('manual-environmental', new ManualEnvironmentalAdapter());
sensorRegistry.register('bluetooth-moisture', new BluetoothMoistureAdapter());
