import { create } from 'zustand';
import * as SQLite from 'expo-sqlite';
import uuid from 'react-native-uuid';
import type {
  Inspection,
  MoistureReading,
  InspectionPhoto,
  EquipmentDeployment,
  EnvironmentalReading,
  SyncStatus,
  WaterDamageCategory,
  WaterDamageClass,
  MaterialType,
  EquipmentType,
} from '@/shared/types';

interface InspectionState {
  currentInspection: Inspection | null;
  inspections: Inspection[];
  moistureReadings: MoistureReading[];
  photos: InspectionPhoto[];
  equipment: EquipmentDeployment[];
  environmental: EnvironmentalReading[];
  isLoading: boolean;

  // Database
  initDB: () => Promise<void>;

  // Inspection CRUD
  createInspection: (jobId: string, address: string, lat?: number, lng?: number) => Promise<Inspection>;
  updateInspection: (id: string, updates: Partial<Inspection>) => Promise<void>;
  loadInspections: () => Promise<void>;
  setCurrentInspection: (inspection: Inspection | null) => void;
  // Moisture Readings
  addMoistureReading: (data: {
    inspectionId: string;
    location: string;
    material: MaterialType;
    reading: number;
    unit: 'percentage' | 'raw';
    meterType: string;
    meterSerial?: string;
    calibrationDate?: string;
    lat?: number;
    lng?: number;
  }) => Promise<MoistureReading>;
  loadMoistureReadings: (inspectionId: string) => Promise<void>;

  // Photos
  addPhoto: (data: {
    inspectionId: string;
    uri: string;
    caption: string;
    lat?: number;
    lng?: number;
    width: number;
    height: number;
  }) => Promise<InspectionPhoto>;
  loadPhotos: (inspectionId: string) => Promise<void>;

  // Equipment
  addEquipment: (data: {
    inspectionId: string;
    equipmentType: EquipmentType;
    make: string;
    model: string;
    serialNumber?: string;
    location: string;
  }) => Promise<EquipmentDeployment>;  loadEquipment: (inspectionId: string) => Promise<void>;

  // Environmental
  addEnvironmentalReading: (data: {
    inspectionId: string;
    temperature: number;
    relativeHumidity: number;
    gpp?: number;
    emc?: number;
    location: string;
  }) => Promise<EnvironmentalReading>;
  loadEnvironmental: (inspectionId: string) => Promise<void>;
}

let db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('restoreassist.db');
    await initializeTables(db);
  }
  return db;
}

async function initializeTables(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS inspections (
      id TEXT PRIMARY KEY,
      localId TEXT,
      jobId TEXT NOT NULL,
      status TEXT DEFAULT 'DRAFT',
      category TEXT,
      damageClass TEXT,
      propertyAddress TEXT NOT NULL,      latitude REAL,
      longitude REAL,
      notes TEXT DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      syncStatus TEXT DEFAULT 'local'
    );

    CREATE TABLE IF NOT EXISTS moisture_readings (
      id TEXT PRIMARY KEY,
      localId TEXT,
      inspectionId TEXT NOT NULL,
      location TEXT NOT NULL,
      material TEXT NOT NULL,
      reading REAL NOT NULL,
      unit TEXT DEFAULT 'percentage',
      meterType TEXT NOT NULL,
      meterSerial TEXT,
      calibrationDate TEXT,
      latitude REAL,
      longitude REAL,
      timestamp TEXT NOT NULL,
      syncStatus TEXT DEFAULT 'local'
    );

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      localId TEXT,
      inspectionId TEXT NOT NULL,
      uri TEXT NOT NULL,
      remoteUrl TEXT,
      caption TEXT DEFAULT '',
      latitude REAL,
      longitude REAL,
      timestamp TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      syncStatus TEXT DEFAULT 'local'
    );    CREATE TABLE IF NOT EXISTS equipment (
      id TEXT PRIMARY KEY,
      localId TEXT,
      inspectionId TEXT NOT NULL,
      equipmentType TEXT NOT NULL,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      serialNumber TEXT,
      location TEXT NOT NULL,
      deployedAt TEXT NOT NULL,
      removedAt TEXT,
      runHours REAL,
      syncStatus TEXT DEFAULT 'local'
    );

    CREATE TABLE IF NOT EXISTS environmental (
      id TEXT PRIMARY KEY,
      localId TEXT,
      inspectionId TEXT NOT NULL,
      temperature REAL NOT NULL,
      relativeHumidity REAL NOT NULL,
      gpp REAL,
      emc REAL,
      location TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      syncStatus TEXT DEFAULT 'local'
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      maxAttempts INTEGER DEFAULT 5,
      lastAttempt TEXT,
      error TEXT,
      createdAt TEXT NOT NULL
    );
  `);
}
export const useInspectionStore = create<InspectionState>((set, get) => ({
  currentInspection: null,
  inspections: [],
  moistureReadings: [],
  photos: [],
  equipment: [],
  environmental: [],
  isLoading: false,

  initDB: async () => {
    await getDB();
  },

  createInspection: async (jobId, address, lat, lng) => {
    const database = await getDB();
    const now = new Date().toISOString();
    const localId = uuid.v4() as string;
    const inspection: Inspection = {
      id: localId,
      localId,
      jobId,
      status: 'DRAFT',
      category: null,
      damageClass: null,
      propertyAddress: address,
      latitude: lat || null,
      longitude: lng || null,
      notes: '',
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    };
    await database.runAsync(
      `INSERT INTO inspections (id, localId, jobId, status, category, damageClass, propertyAddress, latitude, longitude, notes, createdAt, updatedAt, syncStatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [inspection.id, inspection.localId!, inspection.jobId, inspection.status, null, null, inspection.propertyAddress, inspection.latitude, inspection.longitude, inspection.notes, inspection.createdAt, inspection.updatedAt, inspection.syncStatus]
    );

    // Add to sync queue
    await database.runAsync(
      `INSERT INTO sync_queue (id, entityType, entityId, action, payload, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid.v4() as string, 'inspection', localId, 'create', JSON.stringify(inspection), now]
    );

    set((state) => ({
      inspections: [inspection, ...state.inspections],
      currentInspection: inspection,
    }));

    return inspection;
  },

  updateInspection: async (id, updates) => {
    const database = await getDB();
    const now = new Date().toISOString();
    const setClauses: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'localId') {
        setClauses.push(`${key} = ?`);
        values.push(value);
      }
    }
    setClauses.push('updatedAt = ?');
    values.push(now);
    setClauses.push('syncStatus = ?');
    values.push('local');
    values.push(id);
    await database.runAsync(
      `UPDATE inspections SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    set((state) => ({
      inspections: state.inspections.map((i) =>
        i.id === id ? { ...i, ...updates, updatedAt: now, syncStatus: 'local' as SyncStatus } : i
      ),
      currentInspection: state.currentInspection?.id === id
        ? { ...state.currentInspection, ...updates, updatedAt: now, syncStatus: 'local' as SyncStatus }
        : state.currentInspection,
    }));
  },

  loadInspections: async () => {
    set({ isLoading: true });
    const database = await getDB();
    const rows = await database.getAllAsync<Inspection>(
      'SELECT * FROM inspections ORDER BY updatedAt DESC'
    );
    set({ inspections: rows, isLoading: false });
  },

  setCurrentInspection: (inspection) => {
    set({ currentInspection: inspection });
  },

  addMoistureReading: async (data) => {
    const database = await getDB();
    const now = new Date().toISOString();
    const localId = uuid.v4() as string;
    const reading: MoistureReading = {
      id: localId,
      localId,
      inspectionId: data.inspectionId,
      location: data.location,
      material: data.material,
      reading: data.reading,
      unit: data.unit,
      meterType: data.meterType,
      meterSerial: data.meterSerial || null,
      calibrationDate: data.calibrationDate || null,
      latitude: data.lat || null,
      longitude: data.lng || null,
      timestamp: now,
      syncStatus: 'local',
    };
    await database.runAsync(
      `INSERT INTO moisture_readings (id, localId, inspectionId, location, material, reading, unit, meterType, meterSerial, calibrationDate, latitude, longitude, timestamp, syncStatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [reading.id, reading.localId!, reading.inspectionId, reading.location, reading.material, reading.reading, reading.unit, reading.meterType, reading.meterSerial, reading.calibrationDate, reading.latitude, reading.longitude, reading.timestamp, reading.syncStatus]
    );

    await database.runAsync(
      `INSERT INTO sync_queue (id, entityType, entityId, action, payload, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid.v4() as string, 'moisture_reading', localId, 'create', JSON.stringify(reading), now]
    );

    set((state) => ({ moistureReadings: [...state.moistureReadings, reading] }));
    return reading;
  },

  loadMoistureReadings: async (inspectionId) => {
    const database = await getDB();
    const rows = await database.getAllAsync<MoistureReading>(
      'SELECT * FROM moisture_readings WHERE inspectionId = ? ORDER BY timestamp DESC',
      [inspectionId]
    );
    set({ moistureReadings: rows });
  },

  addPhoto: async (data) => {
    const database = await getDB();
    const now = new Date().toISOString();
    const localId = uuid.v4() as string;
    const photo: InspectionPhoto = {
      id: localId,
      localId,
      inspectionId: data.inspectionId,
      uri: data.uri,
      remoteUrl: null,
      caption: data.caption,
      latitude: data.lat || null,
      longitude: data.lng || null,
      timestamp: now,
      width: data.width,
      height: data.height,
      syncStatus: 'local',
    };
    await database.runAsync(
      `INSERT INTO photos (id, localId, inspectionId, uri, remoteUrl, caption, latitude, longitude, timestamp, width, height, syncStatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [photo.id, photo.localId!, photo.inspectionId, photo.uri, null, photo.caption, photo.latitude, photo.longitude, photo.timestamp, photo.width, photo.height, photo.syncStatus]
    );

    await database.runAsync(
      `INSERT INTO sync_queue (id, entityType, entityId, action, payload, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid.v4() as string, 'photo', localId, 'create', JSON.stringify(photo), now]
    );

    set((state) => ({ photos: [...state.photos, photo] }));
    return photo;
  },

  loadPhotos: async (inspectionId) => {
    const database = await getDB();
    const rows = await database.getAllAsync<InspectionPhoto>(
      'SELECT * FROM photos WHERE inspectionId = ? ORDER BY timestamp DESC',
      [inspectionId]
    );
    set({ photos: rows });
  },

  addEquipment: async (data) => {
    const database = await getDB();
    const now = new Date().toISOString();
    const localId = uuid.v4() as string;
    const equip: EquipmentDeployment = {
      id: localId,
      localId,
      inspectionId: data.inspectionId,
      equipmentType: data.equipmentType,
      make: data.make,
      model: data.model,
      serialNumber: data.serialNumber || null,
      location: data.location,
      deployedAt: now,
      removedAt: null,
      runHours: null,
      syncStatus: 'local',
    };
    await database.runAsync(
      `INSERT INTO equipment (id, localId, inspectionId, equipmentType, make, model, serialNumber, location, deployedAt, syncStatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [equip.id, equip.localId!, equip.inspectionId, equip.equipmentType, equip.make, equip.model, equip.serialNumber, equip.location, equip.deployedAt, equip.syncStatus]
    );

    set((state) => ({ equipment: [...state.equipment, equip] }));
    return equip;
  },

  loadEquipment: async (inspectionId) => {
    const database = await getDB();
    const rows = await database.getAllAsync<EquipmentDeployment>(
      'SELECT * FROM equipment WHERE inspectionId = ? ORDER BY deployedAt DESC',
      [inspectionId]
    );
    set({ equipment: rows });
  },

  addEnvironmentalReading: async (data) => {
    const database = await getDB();
    const now = new Date().toISOString();
    const localId = uuid.v4() as string;
    const reading: EnvironmentalReading = {
      id: localId,
      localId,
      inspectionId: data.inspectionId,
      temperature: data.temperature,
      relativeHumidity: data.relativeHumidity,
      gpp: data.gpp || null,
      emc: data.emc || null,
      location: data.location,
      timestamp: now,
      syncStatus: 'local',
    };

    await database.runAsync(
      `INSERT INTO environmental (id, localId, inspectionId, temperature, relativeHumidity, gpp, emc, location, timestamp, syncStatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [reading.id, reading.localId!, reading.inspectionId, reading.temperature, reading.relativeHumidity, reading.gpp, reading.emc, reading.location, reading.timestamp, reading.syncStatus]
    );

    set((state) => ({ environmental: [...state.environmental, reading] }));
    return reading;
  },

  loadEnvironmental: async (inspectionId) => {
    const database = await getDB();
    const rows = await database.getAllAsync<EnvironmentalReading>(
      'SELECT * FROM environmental WHERE inspectionId = ? ORDER BY timestamp DESC',
      [inspectionId]
    );
    set({ environmental: rows });
  },
}));