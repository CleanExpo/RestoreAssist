/**
 * Secure Storage Utility
 * Provides secure alternatives to localStorage for sensitive data
 * Uses sessionStorage for temporary data and warns about sensitive data in localStorage
 */

interface SecureStorageOptions {
  encrypt?: boolean;
  expiryMs?: number;
}

interface StoredItem {
  value: any;
  expiry?: number;
  encrypted?: boolean;
}

class SecureStorage {
  private readonly SENSITIVE_KEYS = [
    'token', 'accessToken', 'refreshToken', 'apiKey',
    'password', 'secret', 'credential', 'auth'
  ];

  /**
   * Store data in sessionStorage (cleared when browser closes)
   * Preferred for sensitive data like tokens
   */
  public setSession(key: string, value: any, options?: SecureStorageOptions): void {
    this.warnIfSensitive(key, 'sessionStorage');

    const item: StoredItem = {
      value,
      expiry: options?.expiryMs ? Date.now() + options.expiryMs : undefined,
      encrypted: options?.encrypt || false
    };

    // In production, encrypt sensitive data
    if (options?.encrypt && typeof value === 'string') {
      // TODO: Implement client-side encryption
      console.warn('Client-side encryption not yet implemented. Use HTTPS and avoid storing highly sensitive data.');
    }

    try {
      sessionStorage.setItem(key, JSON.stringify(item));
    } catch (error) {
      console.error('Failed to store in sessionStorage:', error);
    }
  }

  /**
   * Get data from sessionStorage
   */
  public getSession(key: string): any {
    try {
      const itemStr = sessionStorage.getItem(key);
      if (!itemStr) return null;

      const item: StoredItem = JSON.parse(itemStr);

      // Check expiry
      if (item.expiry && Date.now() > item.expiry) {
        sessionStorage.removeItem(key);
        return null;
      }

      // TODO: Decrypt if encrypted
      if (item.encrypted) {
        console.warn('Decryption not yet implemented');
      }

      return item.value;
    } catch (error) {
      console.error('Failed to get from sessionStorage:', error);
      return null;
    }
  }

  /**
   * Remove from sessionStorage
   */
  public removeSession(key: string): void {
    sessionStorage.removeItem(key);
  }

  /**
   * Clear all sessionStorage
   */
  public clearSession(): void {
    sessionStorage.clear();
  }

  /**
   * Store non-sensitive data in localStorage (persists across sessions)
   * DO NOT use for tokens or sensitive data
   */
  public setLocal(key: string, value: any, options?: SecureStorageOptions): void {
    // Prevent storing sensitive data
    if (this.isSensitiveKey(key)) {
      console.error(`SECURITY WARNING: Attempted to store sensitive data "${key}" in localStorage. Use sessionStorage instead.`);
      throw new Error('Cannot store sensitive data in localStorage');
    }

    const item: StoredItem = {
      value,
      expiry: options?.expiryMs ? Date.now() + options.expiryMs : undefined
    };

    try {
      localStorage.setItem(key, JSON.stringify(item));
    } catch (error) {
      console.error('Failed to store in localStorage:', error);
    }
  }

  /**
   * Get non-sensitive data from localStorage
   */
  public getLocal(key: string): any {
    // Warn if accessing potentially sensitive data
    if (this.isSensitiveKey(key)) {
      console.warn(`SECURITY WARNING: Accessing potentially sensitive data "${key}" from localStorage.`);
    }

    try {
      const itemStr = localStorage.getItem(key);
      if (!itemStr) return null;

      const item: StoredItem = JSON.parse(itemStr);

      // Check expiry
      if (item.expiry && Date.now() > item.expiry) {
        localStorage.removeItem(key);
        return null;
      }

      return item.value;
    } catch (error) {
      console.error('Failed to get from localStorage:', error);
      return null;
    }
  }

  /**
   * Remove from localStorage
   */
  public removeLocal(key: string): void {
    localStorage.removeItem(key);
  }

  /**
   * Migrate sensitive data from localStorage to sessionStorage
   */
  public migrateSensitiveData(): void {
    const keysToMigrate: string[] = [];

    // Find sensitive keys in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && this.isSensitiveKey(key)) {
        keysToMigrate.push(key);
      }
    }

    // Migrate each key
    keysToMigrate.forEach(key => {
      const value = localStorage.getItem(key);
      if (value) {
        console.warn(`Migrating sensitive data "${key}" from localStorage to sessionStorage`);
        try {
          const parsed = JSON.parse(value);
          this.setSession(key, parsed.value || parsed);
        } catch {
          this.setSession(key, value);
        }
        localStorage.removeItem(key);
      }
    });

    if (keysToMigrate.length > 0) {
      console.log(`Migrated ${keysToMigrate.length} sensitive items to sessionStorage`);
    }
  }

  /**
   * Check if a key name suggests sensitive data
   */
  private isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return this.SENSITIVE_KEYS.some(sensitive =>
      lowerKey.includes(sensitive.toLowerCase())
    );
  }

  /**
   * Warn about sensitive data storage
   */
  private warnIfSensitive(key: string, storage: string): void {
    if (this.isSensitiveKey(key) && storage === 'localStorage') {
      console.error(`SECURITY WARNING: Storing sensitive data "${key}" in ${storage} is not recommended.`);
    }
  }

  /**
   * Get storage statistics
   */
  public getStats(): {
    sessionCount: number;
    localCount: number;
    sensitiveMisplaced: number;
  } {
    let sensitiveMisplaced = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && this.isSensitiveKey(key)) {
        sensitiveMisplaced++;
      }
    }

    return {
      sessionCount: sessionStorage.length,
      localCount: localStorage.length,
      sensitiveMisplaced
    };
  }
}

// Singleton instance
const secureStorage = new SecureStorage();

// Auto-migrate on initialization
if (typeof window !== 'undefined') {
  secureStorage.migrateSensitiveData();
}

export default secureStorage;

/**
 * React hook for secure storage
 */
export function useSecureStorage() {
  return {
    // Session storage (for sensitive data)
    setToken: (token: string) => secureStorage.setSession('accessToken', token, { expiryMs: 15 * 60 * 1000 }),
    getToken: () => secureStorage.getSession('accessToken'),
    setRefreshToken: (token: string) => secureStorage.setSession('refreshToken', token, { expiryMs: 7 * 24 * 60 * 60 * 1000 }),
    getRefreshToken: () => secureStorage.getSession('refreshToken'),
    clearAuth: () => {
      secureStorage.removeSession('accessToken');
      secureStorage.removeSession('refreshToken');
      secureStorage.removeSession('sessionToken');
    },

    // General storage
    setSession: secureStorage.setSession.bind(secureStorage),
    getSession: secureStorage.getSession.bind(secureStorage),
    setLocal: secureStorage.setLocal.bind(secureStorage),
    getLocal: secureStorage.getLocal.bind(secureStorage),

    // Utilities
    migrateSensitiveData: secureStorage.migrateSensitiveData.bind(secureStorage),
    getStats: secureStorage.getStats.bind(secureStorage)
  };
}