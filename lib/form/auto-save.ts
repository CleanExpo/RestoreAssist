/**
 * Auto-Save System for Forms
 *
 * Features:
 * - Debounced save after 2 seconds of inactivity
 * - Periodic save every 10 seconds
 * - IndexedDB for offline draft storage
 * - Visual status indicators
 */

import { useState, useEffect, useRef } from 'react'

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface AutoSaveOptions {
  debounceMs?: number // Default: 2000ms
  periodicSaveMs?: number // Default: 10000ms
  onSave: (data: any) => Promise<void> // Server save function
  onError?: (error: Error) => void
  onStatusChange?: (status: AutoSaveStatus) => void
}

export interface DraftMetadata {
  id: string
  userId: string
  type: 'report' | 'claim' | 'invoice'
  lastSaved: number // timestamp
  data: any
}

// Alias for compatibility
export type FormDraft = DraftMetadata

/**
 * IndexedDB Helper for Draft Storage
 */
class DraftStorage {
  private dbName = 'restoreassist-drafts'
  private storeName = 'drafts'
  private dbVersion = 1
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create object store if doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' })
          objectStore.createIndex('userId', 'userId', { unique: false })
          objectStore.createIndex('type', 'type', { unique: false })
          objectStore.createIndex('lastSaved', 'lastSaved', { unique: false })
        }
      }
    })
  }

  async saveDraft(draft: DraftMetadata): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const objectStore = transaction.objectStore(this.storeName)

      const request = objectStore.put({
        ...draft,
        lastSaved: Date.now()
      })

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getDraft(id: string): Promise<DraftMetadata | null> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const objectStore = transaction.objectStore(this.storeName)

      const request = objectStore.get(id)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  async getAllDrafts(userId: string): Promise<DraftMetadata[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const objectStore = transaction.objectStore(this.storeName)
      const index = objectStore.index('userId')

      const request = index.getAll(IDBKeyRange.only(userId))

      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  }

  async deleteDraft(id: string): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const objectStore = transaction.objectStore(this.storeName)

      const request = objectStore.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async clearOldDrafts(daysOld: number = 30): Promise<void> {
    if (!this.db) await this.init()

    const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const objectStore = transaction.objectStore(this.storeName)
      const index = objectStore.index('lastSaved')

      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime))

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        } else {
          resolve()
        }
      }

      request.onerror = () => reject(request.error)
    })
  }
}

// Singleton instance
const draftStorage = new DraftStorage()

// Export for direct use in components
export { draftStorage }

/**
 * Auto-Save Manager
 */
export class FormAutoSave {
  private debounceTimeout: NodeJS.Timeout | null = null
  private periodicTimeout: NodeJS.Timeout | null = null
  private lastSaveData: string = ''
  private status: AutoSaveStatus = 'idle'
  private isOnline: boolean = navigator.onLine

  constructor(
    private draftId: string,
    private formData: any,
    private options: AutoSaveOptions
  ) {
    // Set up online/offline event listeners
    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)

    // Start periodic save
    this.startPeriodicSave()
  }

  /**
   * Schedule a debounced save
   * Call this whenever form data changes
   */
  scheduleSave(immediateIfOffline: boolean = false): void {
    // Clear existing debounce timeout
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout)
    }

    // If offline, save to IndexedDB immediately
    if (!this.isOnline && immediateIfOffline) {
      this.saveToOfflineQueue()
      return
    }

    // Debounce server save
    const debounceMs = this.options.debounceMs || 2000

    this.debounceTimeout = setTimeout(() => {
      this.executeSave()
    }, debounceMs)
  }

  /**
   * Force an immediate save
   */
  async forceSave(): Promise<void> {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout)
    }

    await this.executeSave()
  }

  /**
   * Execute the save operation
   */
  private async executeSave(): Promise<void> {
    const dataStr = JSON.stringify(this.formData)

    // Skip if data hasn't changed
    if (dataStr === this.lastSaveData) {
      return
    }

    this.setStatus('saving')

    try {
      if (this.isOnline) {
        // Save to server
        await this.options.onSave(this.formData)

        // Also save to IndexedDB as backup
        await this.saveToIndexedDB()

        this.lastSaveData = dataStr
        this.setStatus('saved')

        // Reset status to idle after 2 seconds
        setTimeout(() => {
          if (this.status === 'saved') {
            this.setStatus('idle')
          }
        }, 2000)
      } else {
        // Offline: save to IndexedDB only
        await this.saveToOfflineQueue()
        this.setStatus('saved')
      }
    } catch (error) {
      console.error('[Auto-Save] Error:', error)
      this.setStatus('error')

      // Try fallback to IndexedDB
      try {
        await this.saveToOfflineQueue()
      } catch (indexedDBError) {
        console.error('[Auto-Save] IndexedDB fallback failed:', indexedDBError)
      }

      if (this.options.onError) {
        this.options.onError(error as Error)
      }
    }
  }

  /**
   * Save to IndexedDB for offline access
   */
  private async saveToIndexedDB(): Promise<void> {
    await draftStorage.saveDraft({
      id: this.draftId,
      userId: this.formData.userId || 'unknown',
      type: this.formData.type || 'report',
      lastSaved: Date.now(),
      data: this.formData
    })
  }

  /**
   * Save to offline queue (IndexedDB)
   */
  private async saveToOfflineQueue(): Promise<void> {
    await this.saveToIndexedDB()
    console.log('[Auto-Save] Saved to offline queue:', this.draftId)
  }

  /**
   * Start periodic save timer
   */
  private startPeriodicSave(): void {
    const periodicMs = this.options.periodicSaveMs || 10000

    this.periodicTimeout = setInterval(() => {
      // Only save if data has changed
      const dataStr = JSON.stringify(this.formData)
      if (dataStr !== this.lastSaveData) {
        this.executeSave()
      }
    }, periodicMs)
  }

  /**
   * Handle online event
   */
  private handleOnline = async (): Promise<void> => {
    this.isOnline = true
    console.log('[Auto-Save] Connection restored, syncing drafts...')

    // Try to sync offline drafts
    await this.syncOfflineDrafts()
  }

  /**
   * Handle offline event
   */
  private handleOffline = (): void => {
    this.isOnline = false
    console.log('[Auto-Save] Connection lost, switching to offline mode')
  }

  /**
   * Sync offline drafts when connection restored
   */
  private async syncOfflineDrafts(): Promise<void> {
    try {
      const draft = await draftStorage.getDraft(this.draftId)

      if (draft && draft.data) {
        await this.options.onSave(draft.data)
        console.log('[Auto-Save] Synced offline draft:', this.draftId)
      }
    } catch (error) {
      console.error('[Auto-Save] Failed to sync offline drafts:', error)
    }
  }

  /**
   * Set status and notify callback
   */
  private setStatus(status: AutoSaveStatus): void {
    this.status = status

    if (this.options.onStatusChange) {
      this.options.onStatusChange(status)
    }
  }

  /**
   * Get current status
   */
  getStatus(): AutoSaveStatus {
    return this.status
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout)
    }

    if (this.periodicTimeout) {
      clearInterval(this.periodicTimeout)
    }

    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('offline', this.handleOffline)
  }
}

/**
 * React Hook for Auto-Save
 */
export function useAutoSave(
  draftId: string,
  formData: any,
  options: AutoSaveOptions
): {
  status: AutoSaveStatus
  forceSave: () => Promise<void>
  scheduleSave: () => void
} {
  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const autoSaveRef = useRef<FormAutoSave | null>(null)

  useEffect(() => {
    // Initialize auto-save
    autoSaveRef.current = new FormAutoSave(draftId, formData, {
      ...options,
      onStatusChange: (newStatus) => {
        setStatus(newStatus)
        if (options.onStatusChange) {
          options.onStatusChange(newStatus)
        }
      }
    })

    // Clean up on unmount
    return () => {
      if (autoSaveRef.current) {
        autoSaveRef.current.destroy()
      }
    }
  }, [draftId])

  // Update form data reference
  useEffect(() => {
    if (autoSaveRef.current) {
      // @ts-ignore - accessing private property for update
      autoSaveRef.current.formData = formData
    }
  }, [formData])

  return {
    status,
    forceSave: async () => {
      if (autoSaveRef.current) {
        await autoSaveRef.current.forceSave()
      }
    },
    scheduleSave: () => {
      if (autoSaveRef.current) {
        autoSaveRef.current.scheduleSave()
      }
    }
  }
}

/**
 * Draft Recovery Utilities
 */
export const draftRecovery = {
  /**
   * Get a specific draft
   */
  async getDraft(draftId: string): Promise<DraftMetadata | null> {
    return draftStorage.getDraft(draftId)
  },

  /**
   * Get all drafts for a user
   */
  async getAllDrafts(userId: string): Promise<DraftMetadata[]> {
    return draftStorage.getAllDrafts(userId)
  },

  /**
   * Delete a draft
   */
  async deleteDraft(draftId: string): Promise<void> {
    return draftStorage.deleteDraft(draftId)
  },

  /**
   * Clear old drafts (default: 30 days)
   */
  async clearOldDrafts(daysOld: number = 30): Promise<void> {
    return draftStorage.clearOldDrafts(daysOld)
  }
}
