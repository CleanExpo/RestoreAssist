import * as SQLite from 'expo-sqlite';
import * as Network from 'expo-network';
import { supabase } from '@/lib/supabase';
import type { SyncQueueItem, SyncStatus } from '@/shared/types';

class SyncEngine {
  private db: SQLite.SQLiteDatabase | null = null;
  private isSyncing = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  async initialize(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  // Start periodic sync (every 30 seconds when online)
  startPeriodicSync(intervalMs = 30000) {
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => this.syncAll(), intervalMs);
    // Run immediately on start
    this.syncAll();
  }

  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async isOnline(): Promise<boolean> {
    try {
      const networkState = await Network.getNetworkStateAsync();
      return networkState.isConnected === true && networkState.isInternetReachable === true;
    } catch {
      return false;
    }
  }

  async syncAll(): Promise<{ synced: number; failed: number; remaining: number }> {
    if (this.isSyncing) return { synced: 0, failed: 0, remaining: 0 };
    if (!(await this.isOnline())) return { synced: 0, failed: 0, remaining: 0 };
    if (!this.db) return { synced: 0, failed: 0, remaining: 0 };

    this.isSyncing = true;
    let synced = 0;
    let failed = 0;

    try {
      // Get pending items ordered by creation time
      const items = await this.db.getAllAsync<SyncQueueItem>(
        `SELECT * FROM sync_queue WHERE attempts < maxAttempts ORDER BY createdAt ASC LIMIT 50`
      );

      for (const item of items) {
        try {
          await this.syncItem(item);
          // Remove from queue on success
          await this.db.runAsync('DELETE FROM sync_queue WHERE id = ?', [item.id]);
          // Update entity sync status
          await this.updateEntitySyncStatus(item.entityType, item.entityId, 'synced');
          synced++;
        } catch (error: any) {
          // Increment attempts and record error
          await this.db.runAsync(
            `UPDATE sync_queue SET attempts = attempts + 1, lastAttempt = ?, error = ? WHERE id = ?`,
            [new Date().toISOString(), error.message || 'Unknown error', item.id]
          );
          await this.updateEntitySyncStatus(item.entityType, item.entityId, 'error');
          failed++;
        }
      }

      // Count remaining
      const result = await this.db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM sync_queue WHERE attempts < maxAttempts'
      );
      const remaining = result?.count || 0;

      return { synced, failed, remaining };
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncItem(item: SyncQueueItem): Promise<void> {
    const payload = JSON.parse(item.payload);

    switch (item.entityType) {
      case 'inspection':
        await this.syncInspection(item.action, payload);
        break;
      case 'moisture_reading':
        await this.syncMoistureReading(item.action, payload);
        break;
      case 'photo':
        await this.syncPhoto(item.action, payload);
        break;
      case 'equipment':
        await this.syncEquipment(item.action, payload);
        break;
      case 'environmental':
        await this.syncEnvironmental(item.action, payload);
        break;
      default:
        throw new Error(`Unknown entity type: ${item.entityType}`);
    }
  }

  private async syncInspection(action: string, data: any): Promise<void> {
    if (action === 'create') {
      const { error } = await supabase.from('Inspection').insert({
        jobId: data.jobId,
        status: data.status,
        category: data.category,
        class: data.damageClass,
        propertyAddress: data.propertyAddress,
        latitude: data.latitude,
        longitude: data.longitude,
        notes: data.notes,
        mobileLocalId: data.localId,
      });
      if (error) throw error;
    } else if (action === 'update') {
      const { error } = await supabase
        .from('Inspection')
        .update({
          status: data.status,
          category: data.category,
          class: data.damageClass,
          notes: data.notes,
        })
        .eq('mobileLocalId', data.localId || data.id);
      if (error) throw error;
    }
  }

  private async syncMoistureReading(action: string, data: any): Promise<void> {
    if (action === 'create') {
      const { error } = await supabase.from('MoistureReading').insert({
        inspectionId: data.inspectionId,
        location: data.location,
        material: data.material,
        reading: data.reading,
        unit: data.unit,
        meterType: data.meterType,
        meterSerial: data.meterSerial,
        calibrationDate: data.calibrationDate,
        latitude: data.latitude,
        longitude: data.longitude,
        mobileLocalId: data.localId,
      });
      if (error) throw error;
    }
  }

  private async syncPhoto(action: string, data: any): Promise<void> {
    if (action === 'create') {
      // Upload photo to Supabase Storage
      const response = await fetch(data.uri);
      const blob = await response.blob();
      const fileName = `inspections/${data.inspectionId}/${data.localId}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('inspection-photos')
        .upload(fileName, blob, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('inspection-photos')
        .getPublicUrl(fileName);

      // Save record
      const { error } = await supabase.from('InspectionPhoto').insert({
        inspectionId: data.inspectionId,
        url: urlData.publicUrl,
        caption: data.caption,
        latitude: data.latitude,
        longitude: data.longitude,
        width: data.width,
        height: data.height,
        mobileLocalId: data.localId,
      });
      if (error) throw error;

      // Update local record with remote URL
      if (this.db) {
        await this.db.runAsync(
          'UPDATE photos SET remoteUrl = ? WHERE id = ?',
          [urlData.publicUrl, data.id]
        );
      }
    }
  }

  private async syncEquipment(action: string, data: any): Promise<void> {
    if (action === 'create') {
      const { error } = await supabase.from('EquipmentDeployment').insert({
        inspectionId: data.inspectionId,
        equipmentType: data.equipmentType,
        make: data.make,
        model: data.model,
        serialNumber: data.serialNumber,
        location: data.location,
        deployedAt: data.deployedAt,
        mobileLocalId: data.localId,
      });
      if (error) throw error;
    }
  }

  private async syncEnvironmental(action: string, data: any): Promise<void> {
    if (action === 'create') {
      const { error } = await supabase.from('EnvironmentalData').insert({
        inspectionId: data.inspectionId,
        temperature: data.temperature,
        relativeHumidity: data.relativeHumidity,
        gpp: data.gpp,
        emc: data.emc,
        location: data.location,
        mobileLocalId: data.localId,
      });
      if (error) throw error;
    }
  }

  private async updateEntitySyncStatus(
    entityType: string,
    entityId: string,
    status: SyncStatus
  ): Promise<void> {
    if (!this.db) return;
    const table = {
      inspection: 'inspections',
      moisture_reading: 'moisture_readings',
      photo: 'photos',
      equipment: 'equipment',
      environmental: 'environmental',
    }[entityType];
    if (table) {
      await this.db.runAsync(`UPDATE ${table} SET syncStatus = ? WHERE id = ?`, [status, entityId]);
    }
  }

  async getPendingCount(): Promise<number> {
    if (!this.db) return 0;
    const result = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_queue WHERE attempts < maxAttempts'
    );
    return result?.count || 0;
  }

  async getFailedItems(): Promise<SyncQueueItem[]> {
    if (!this.db) return [];
    return this.db.getAllAsync<SyncQueueItem>(
      'SELECT * FROM sync_queue WHERE attempts >= maxAttempts ORDER BY createdAt DESC'
    );
  }

  async retryFailed(): Promise<void> {
    if (!this.db) return;
    await this.db.runAsync('UPDATE sync_queue SET attempts = 0, error = NULL WHERE attempts >= maxAttempts');
  }
}

export const syncEngine = new SyncEngine();
