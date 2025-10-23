/**
 * Transaction Manager for Database Operations
 * Provides transaction support with automatic rollback and retry logic
 */

import { db, pgp } from './connection';
import { IDatabase } from 'pg-promise';

export type TransactionCallback<T> = (tx: IDatabase<any>) => Promise<T>;

export interface TransactionOptions {
  isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
  deferrable?: boolean;
  readOnly?: boolean;
}

export class TransactionManager {
  /**
   * Execute operations within a transaction with automatic rollback
   */
  async executeInTransaction<T>(
    callback: TransactionCallback<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const {
      isolationLevel = 'READ COMMITTED',
      deferrable = false,
      readOnly = false
    } = options;

    // Create transaction mode
    const mode = new pgp.txMode.TransactionMode({
      isolationLevel: pgp.txMode.isolationLevel[isolationLevel.replace(' ', '_')],
      deferrable,
      readOnly
    });

    return db.tx({ mode }, async (tx) => {
      try {
        // Set transaction-level timeout
        await tx.none('SET LOCAL statement_timeout = 30000'); // 30 seconds
        await tx.none('SET LOCAL lock_timeout = 10000'); // 10 seconds

        // Execute the callback
        const result = await callback(tx);

        return result;
      } catch (error) {
        // Transaction automatically rolled back by pg-promise
        console.error('Transaction rolled back due to error:', error);
        throw error;
      }
    });
  }

  /**
   * Execute with retry logic for deadlock and serialization failures
   */
  async executeWithRetry<T>(
    callback: () => Promise<T>,
    maxRetries: number = 3,
    backoffMs: number = 100
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await callback();
      } catch (error: any) {
        lastError = error;

        // Check for retryable errors
        const isRetryable = this.isRetryableError(error);

        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }

        // Calculate exponential backoff with jitter
        const delay = this.calculateBackoff(backoffMs, attempt);

        console.warn(
          `Retry ${attempt}/${maxRetries} after ${error.code || 'error'}, waiting ${delay}ms`
        );

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Execute multiple operations in parallel within a single transaction
   */
  async executeBatch<T>(
    operations: Array<TransactionCallback<any>>,
    options: TransactionOptions = {}
  ): Promise<T[]> {
    return this.executeInTransaction(async (tx) => {
      const results = await Promise.all(
        operations.map((operation) => operation(tx))
      );
      return results;
    }, options);
  }

  /**
   * Execute with savepoint for nested transactions
   */
  async executeWithSavepoint<T>(
    tx: IDatabase<any>,
    savepointName: string,
    callback: TransactionCallback<T>
  ): Promise<T> {
    try {
      await tx.none(`SAVEPOINT ${savepointName}`);
      const result = await callback(tx);
      await tx.none(`RELEASE SAVEPOINT ${savepointName}`);
      return result;
    } catch (error) {
      await tx.none(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      throw error;
    }
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error.code) return false;

    const retryableCodes = [
      '40001', // serialization_failure
      '40P01', // deadlock_detected
      '55P03', // lock_not_available
      '57014', // query_canceled (timeout)
      '08006', // connection_failure
      '08001', // sqlclient_unable_to_establish_sqlconnection
      '08004', // sqlserver_rejected_establishment_of_sqlconnection
      '53000', // insufficient_resources
      '53100', // disk_full
      '53200', // out_of_memory
      '53300', // too_many_connections
    ];

    return retryableCodes.includes(error.code);
  }

  /**
   * Calculate exponential backoff with jitter
   */
  private calculateBackoff(baseMs: number, attempt: number): number {
    // Exponential backoff: base * 2^(attempt-1)
    const exponential = baseMs * Math.pow(2, attempt - 1);

    // Add jitter (0-25% of exponential value)
    const jitter = Math.random() * exponential * 0.25;

    // Cap at 10 seconds
    return Math.min(exponential + jitter, 10000);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Acquire advisory lock for critical sections
   */
  async acquireAdvisoryLock(
    lockId: number,
    timeoutMs: number = 5000
  ): Promise<boolean> {
    try {
      // Try to acquire lock with timeout
      const result = await db.one(
        'SELECT pg_try_advisory_lock($1) as acquired',
        [lockId]
      );

      if (result.acquired) {
        return true;
      }

      // If immediate acquisition failed, wait with timeout
      const startTime = Date.now();
      while (Date.now() - startTime < timeoutMs) {
        await this.sleep(100);

        const retry = await db.one(
          'SELECT pg_try_advisory_lock($1) as acquired',
          [lockId]
        );

        if (retry.acquired) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Failed to acquire advisory lock:', error);
      return false;
    }
  }

  /**
   * Release advisory lock
   */
  async releaseAdvisoryLock(lockId: number): Promise<boolean> {
    try {
      const result = await db.one(
        'SELECT pg_advisory_unlock($1) as released',
        [lockId]
      );
      return result.released;
    } catch (error) {
      console.error('Failed to release advisory lock:', error);
      return false;
    }
  }

  /**
   * Execute with advisory lock
   */
  async executeWithLock<T>(
    lockId: number,
    callback: () => Promise<T>,
    timeoutMs: number = 5000
  ): Promise<T> {
    const acquired = await this.acquireAdvisoryLock(lockId, timeoutMs);

    if (!acquired) {
      throw new Error(`Failed to acquire lock ${lockId} within ${timeoutMs}ms`);
    }

    try {
      return await callback();
    } finally {
      await this.releaseAdvisoryLock(lockId);
    }
  }
}

// Singleton instance
export const txManager = new TransactionManager();

// Export convenience functions
export const inTransaction = <T>(
  callback: TransactionCallback<T>,
  options?: TransactionOptions
) => txManager.executeInTransaction(callback, options);

export const withRetry = <T>(
  callback: () => Promise<T>,
  maxRetries?: number,
  backoffMs?: number
) => txManager.executeWithRetry(callback, maxRetries, backoffMs);

export const withLock = <T>(
  lockId: number,
  callback: () => Promise<T>,
  timeoutMs?: number
) => txManager.executeWithLock(lockId, callback, timeoutMs);