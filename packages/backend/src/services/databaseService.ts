import { GeneratedReport } from '../types';
import * as pgQueries from '../db/queries';

// Determine which database to use
const USE_POSTGRES = process.env.USE_POSTGRES === 'true';

// In-memory database implementation
class InMemoryDatabase {
  private reports: Map<string, GeneratedReport> = new Map();
  private createdAt: Date = new Date();

  // Create
  create(report: GeneratedReport): GeneratedReport {
    this.reports.set(report.reportId, report);
    return report;
  }

  // Read
  findById(id: string): GeneratedReport | undefined {
    return this.reports.get(id);
  }

  // Read all with pagination
  findAll(options?: {
    page?: number;
    limit?: number;
    sortBy?: 'timestamp' | 'totalCost';
    order?: 'asc' | 'desc';
  }): { reports: GeneratedReport[]; total: number; page: number; totalPages: number } {
    const page = options?.page || 1;
    const limit = options?.limit || 10;
    const sortBy = options?.sortBy || 'timestamp';
    const order = options?.order || 'desc';

    let reportsArray = Array.from(this.reports.values());

    // Sort
    reportsArray.sort((a, b) => {
      const aVal = sortBy === 'timestamp' ? new Date(a.timestamp).getTime() : a.totalCost;
      const bVal = sortBy === 'timestamp' ? new Date(b.timestamp).getTime() : b.totalCost;
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    });

    // Paginate
    const total = reportsArray.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedReports = reportsArray.slice(start, end);

    return {
      reports: paginatedReports,
      total,
      page,
      totalPages
    };
  }

  // Update
  update(id: string, updates: Partial<GeneratedReport>): GeneratedReport | undefined {
    const report = this.reports.get(id);
    if (!report) return undefined;

    const updated = { ...report, ...updates };
    this.reports.set(id, updated);
    return updated;
  }

  // Delete
  delete(id: string): boolean {
    return this.reports.delete(id);
  }

  // Delete old reports
  deleteOlderThan(days: number): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let deletedCount = 0;
    for (const [id, report] of this.reports.entries()) {
      if (new Date(report.timestamp) < cutoffDate) {
        this.reports.delete(id);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  // Statistics
  getStats(): {
    totalReports: number;
    totalValue: number;
    averageValue: number;
    byDamageType: Record<string, number>;
    byState: Record<string, number>;
    recentReports: number;
  } {
    const reports = Array.from(this.reports.values());
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const totalValue = reports.reduce((sum, r) => sum + r.totalCost, 0);
    const byDamageType: Record<string, number> = {};
    const byState: Record<string, number> = {};
    let recentReports = 0;

    reports.forEach(report => {
      // Count by damage type
      byDamageType[report.damageType] = (byDamageType[report.damageType] || 0) + 1;

      // Count by state
      byState[report.state] = (byState[report.state] || 0) + 1;

      // Count recent reports
      if (new Date(report.timestamp) > last24Hours) {
        recentReports++;
      }
    });

    return {
      totalReports: reports.length,
      totalValue,
      averageValue: reports.length > 0 ? totalValue / reports.length : 0,
      byDamageType,
      byState,
      recentReports
    };
  }

  // Admin stats
  getAdminStats(): {
    totalReports: number;
    databaseSize: number;
    oldestReport: string | null;
    newestReport: string | null;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
  } {
    const reports = Array.from(this.reports.values());
    const timestamps = reports.map(r => new Date(r.timestamp).getTime());

    return {
      totalReports: reports.length,
      databaseSize: this.reports.size,
      oldestReport: timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null,
      newestReport: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null,
      uptime: Date.now() - this.createdAt.getTime(),
      memoryUsage: process.memoryUsage()
    };
  }

  // Clear all (for testing)
  clear(): void {
    this.reports.clear();
  }

  // Get count
  count(): number {
    return this.reports.size;
  }
}

// PostgreSQL database implementation
class PostgresDatabase {
  private createdAt: Date = new Date();

  async create(report: GeneratedReport): Promise<GeneratedReport> {
    return pgQueries.createReport(report);
  }

  async findById(id: string): Promise<GeneratedReport | undefined> {
    const report = await pgQueries.findReportById(id);
    return report || undefined;
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    sortBy?: 'timestamp' | 'totalCost';
    order?: 'asc' | 'desc';
  }): Promise<{ reports: GeneratedReport[]; total: number; page: number; totalPages: number }> {
    const page = options?.page || 1;
    const limit = options?.limit || 10;
    const sortBy = options?.sortBy || 'timestamp';
    const order = options?.order || 'desc';

    return pgQueries.findAllReports({ page, limit, sortBy, order });
  }

  async update(id: string, updates: Partial<GeneratedReport>): Promise<GeneratedReport | undefined> {
    const report = await pgQueries.updateReport(id, updates);
    return report || undefined;
  }

  async delete(id: string): Promise<boolean> {
    return pgQueries.deleteReport(id);
  }

  async deleteOlderThan(days: number): Promise<number> {
    return pgQueries.deleteOlderThan(days);
  }

  async getStats(): Promise<{
    totalReports: number;
    totalValue: number;
    averageValue: number;
    byDamageType: Record<string, number>;
    byState: Record<string, number>;
    recentReports: number;
  }> {
    return pgQueries.getStats();
  }

  async getAdminStats(): Promise<{
    totalReports: number;
    databaseSize: number;
    oldestReport: string | null;
    newestReport: string | null;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
  }> {
    const stats = await pgQueries.getAdminStats();
    return {
      ...stats,
      uptime: Date.now() - this.createdAt.getTime(),
      memoryUsage: process.memoryUsage(),
    };
  }

  async clear(): Promise<void> {
    await pgQueries.clearAllReports();
  }

  async count(): Promise<number> {
    return pgQueries.countReports();
  }
}

// Database service wrapper (supports both in-memory and PostgreSQL)
class DatabaseService {
  private inMemoryDb = new InMemoryDatabase();
  private postgresDb = new PostgresDatabase();

  // Synchronous methods (only for in-memory)
  create(report: GeneratedReport): GeneratedReport {
    if (USE_POSTGRES) {
      throw new Error('Use createAsync() with PostgreSQL');
    }
    return this.inMemoryDb.create(report);
  }

  findById(id: string): GeneratedReport | undefined {
    if (USE_POSTGRES) {
      throw new Error('Use findByIdAsync() with PostgreSQL');
    }
    return this.inMemoryDb.findById(id);
  }

  findAll(options?: {
    page?: number;
    limit?: number;
    sortBy?: 'timestamp' | 'totalCost';
    order?: 'asc' | 'desc';
  }): { reports: GeneratedReport[]; total: number; page: number; totalPages: number } {
    if (USE_POSTGRES) {
      throw new Error('Use findAllAsync() with PostgreSQL');
    }
    return this.inMemoryDb.findAll(options);
  }

  update(id: string, updates: Partial<GeneratedReport>): GeneratedReport | undefined {
    if (USE_POSTGRES) {
      throw new Error('Use updateAsync() with PostgreSQL');
    }
    return this.inMemoryDb.update(id, updates);
  }

  delete(id: string): boolean {
    if (USE_POSTGRES) {
      throw new Error('Use deleteAsync() with PostgreSQL');
    }
    return this.inMemoryDb.delete(id);
  }

  deleteOlderThan(days: number): number {
    if (USE_POSTGRES) {
      throw new Error('Use deleteOlderThanAsync() with PostgreSQL');
    }
    return this.inMemoryDb.deleteOlderThan(days);
  }

  getStats(): {
    totalReports: number;
    totalValue: number;
    averageValue: number;
    byDamageType: Record<string, number>;
    byState: Record<string, number>;
    recentReports: number;
  } {
    if (USE_POSTGRES) {
      throw new Error('Use getStatsAsync() with PostgreSQL');
    }
    return this.inMemoryDb.getStats();
  }

  getAdminStats(): {
    totalReports: number;
    databaseSize: number;
    oldestReport: string | null;
    newestReport: string | null;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
  } {
    if (USE_POSTGRES) {
      throw new Error('Use getAdminStatsAsync() with PostgreSQL');
    }
    return this.inMemoryDb.getAdminStats();
  }

  clear(): void {
    if (USE_POSTGRES) {
      throw new Error('Use clearAsync() with PostgreSQL');
    }
    this.inMemoryDb.clear();
  }

  count(): number {
    if (USE_POSTGRES) {
      throw new Error('Use countAsync() with PostgreSQL');
    }
    return this.inMemoryDb.count();
  }

  // Async methods (work with both in-memory and PostgreSQL)
  async createAsync(report: GeneratedReport): Promise<GeneratedReport> {
    return USE_POSTGRES ? this.postgresDb.create(report) : this.inMemoryDb.create(report);
  }

  async findByIdAsync(id: string): Promise<GeneratedReport | undefined> {
    return USE_POSTGRES ? this.postgresDb.findById(id) : this.inMemoryDb.findById(id);
  }

  async findAllAsync(options?: {
    page?: number;
    limit?: number;
    sortBy?: 'timestamp' | 'totalCost';
    order?: 'asc' | 'desc';
  }): Promise<{ reports: GeneratedReport[]; total: number; page: number; totalPages: number }> {
    return USE_POSTGRES ? this.postgresDb.findAll(options) : this.inMemoryDb.findAll(options);
  }

  async updateAsync(id: string, updates: Partial<GeneratedReport>): Promise<GeneratedReport | undefined> {
    return USE_POSTGRES ? this.postgresDb.update(id, updates) : this.inMemoryDb.update(id, updates);
  }

  async deleteAsync(id: string): Promise<boolean> {
    return USE_POSTGRES ? this.postgresDb.delete(id) : this.inMemoryDb.delete(id);
  }

  async deleteOlderThanAsync(days: number): Promise<number> {
    return USE_POSTGRES ? this.postgresDb.deleteOlderThan(days) : this.inMemoryDb.deleteOlderThan(days);
  }

  async getStatsAsync(): Promise<{
    totalReports: number;
    totalValue: number;
    averageValue: number;
    byDamageType: Record<string, number>;
    byState: Record<string, number>;
    recentReports: number;
  }> {
    return USE_POSTGRES ? this.postgresDb.getStats() : this.inMemoryDb.getStats();
  }

  async getAdminStatsAsync(): Promise<{
    totalReports: number;
    databaseSize: number;
    oldestReport: string | null;
    newestReport: string | null;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
  }> {
    return USE_POSTGRES ? this.postgresDb.getAdminStats() : this.inMemoryDb.getAdminStats();
  }

  async clearAsync(): Promise<void> {
    return USE_POSTGRES ? this.postgresDb.clear() : this.inMemoryDb.clear();
  }

  async countAsync(): Promise<number> {
    return USE_POSTGRES ? this.postgresDb.count() : this.inMemoryDb.count();
  }

  // Check if using PostgreSQL
  isUsingPostgres(): boolean {
    return USE_POSTGRES;
  }
}

// Singleton instance
export const db = new DatabaseService();
