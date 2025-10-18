# Feature 2: Analytics & Reporting - Complete Implementation Guide

**Duration**: Weeks 4-6 (Sprint 3-4)
**Status**: Production-Ready Implementation

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Prerequisites](#prerequisites)
3. [Architecture Overview](#architecture-overview)
4. [Part 1: Backend Analytics Service](#part-1-backend-analytics-service)
5. [Part 2: Analytics API Routes](#part-2-analytics-api-routes)
6. [Part 3: Frontend Analytics Dashboard](#part-3-frontend-analytics-dashboard)
7. [Part 4: PDF Report Generation](#part-4-pdf-report-generation)
8. [Part 5: CSV Export Functionality](#part-5-csv-export-functionality)
9. [Testing & Verification](#testing--verification)
10. [Troubleshooting](#troubleshooting)

---

## Getting Started

This guide implements comprehensive analytics and reporting features for RestoreAssist.

**What You'll Build**:
- Real-time analytics dashboard with interactive charts
- PDF report generation with templates
- CSV export with streaming for large datasets
- Scheduled reports with email delivery
- Performance-optimized analytics queries

**Time Required**: 2-3 weeks

---

## Prerequisites

### Dependencies

```bash
# Backend dependencies
cd packages/backend
npm install --save \
  puppeteer \
  node-cron \
  nodemailer \
  fast-csv \
  date-fns

npm install --save-dev \
  @types/node-cron \
  @types/nodemailer

# Frontend dependencies
cd packages/frontend
npm install --save \
  recharts \
  date-fns \
  react-query \
  zustand \
  jspdf \
  jspdf-autotable
```

### Database Setup

Run this migration first:

```sql
-- Analytics materialized view for performance
CREATE MATERIALIZED VIEW analytics_summary AS
SELECT
  DATE(created_at) as report_date,
  COUNT(*) as total_reports,
  SUM(estimated_cost) as total_cost,
  AVG(estimated_cost) as avg_cost,
  COUNT(DISTINCT user_id) as unique_users,
  jsonb_object_agg(
    damage_category,
    COUNT(*)
  ) FILTER (WHERE damage_category IS NOT NULL) as category_breakdown
FROM reports
GROUP BY DATE(created_at)
WITH DATA;

-- Index for fast lookups
CREATE INDEX idx_analytics_summary_date ON analytics_summary(report_date DESC);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_analytics_summary()
RETURNS trigger AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_summary;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Auto-refresh trigger
CREATE TRIGGER refresh_analytics_summary_trigger
AFTER INSERT OR UPDATE OR DELETE ON reports
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_analytics_summary();
```

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                 Frontend Dashboard                    │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Line Charts │  │  Bar Charts  │  │ Pie Charts │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
│                                                       │
│  ┌────────────────────────────────────────────────┐ │
│  │         Export Buttons (PDF/CSV)               │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│              Analytics API Layer                      │
│  GET /api/analytics/overview                         │
│  GET /api/analytics/trends                           │
│  POST /api/reports/:id/pdf                           │
│  GET /api/reports/export/csv                         │
└──────────────────────┬───────────────────────────────┘
                       │
         ┌─────────────┴──────────────┐
         │                            │
         ▼                            ▼
┌─────────────────┐         ┌──────────────────┐
│ Analytics       │         │  Export          │
│ Service         │         │  Services        │
│ - Aggregation   │         │  - PDF Gen       │
│ - Time-series   │         │  - CSV Export    │
│ - Caching       │         │  - Email Send    │
└────────┬────────┘         └────────┬─────────┘
         │                           │
         └───────────┬───────────────┘
                     ▼
          ┌────────────────────┐
          │  PostgreSQL DB     │
          │  - Reports table   │
          │  - Materialized    │
          │    views           │
          │  - Indexes         │
          └────────────────────┘
```

---

## Part 1: Backend Analytics Service

### Step 1.1: Create Analytics Service

Create `packages/backend/src/services/analytics.service.ts`:

```typescript
import { DatabaseService } from './database.service';
import { startOfDay, endOfDay, subDays, subWeeks, subMonths, format } from 'date-fns';

export interface AnalyticsOverview {
  totalReports: number;
  totalCost: number;
  averageCost: number;
  uniqueUsers: number;
  reportsToday: number;
  reportsThisWeek: number;
  reportsThisMonth: number;
  categoryBreakdown: Record<string, number>;
  trendPercentage: number;
}

export interface TimeSeriesData {
  date: string;
  count: number;
  cost: number;
}

export interface CategoryStats {
  category: string;
  count: number;
  totalCost: number;
  averageCost: number;
  percentage: number;
}

export class AnalyticsService {
  constructor(private db: DatabaseService) {}

  /**
   * Get comprehensive analytics overview
   */
  async getOverview(
    startDate?: Date,
    endDate?: Date
  ): Promise<AnalyticsOverview> {
    const start = startDate || subMonths(new Date(), 3);
    const end = endDate || new Date();

    // Get current period stats
    const currentStats = await this.db.query(`
      SELECT
        COUNT(*)::int as total_reports,
        COALESCE(SUM(estimated_cost), 0) as total_cost,
        COALESCE(AVG(estimated_cost), 0) as average_cost,
        COUNT(DISTINCT user_id)::int as unique_users,
        COUNT(*) FILTER (
          WHERE created_at >= $1 AND created_at <= $2
        )::int as reports_today,
        COUNT(*) FILTER (
          WHERE created_at >= $3 AND created_at <= $2
        )::int as reports_this_week,
        COUNT(*) FILTER (
          WHERE created_at >= $4 AND created_at <= $2
        )::int as reports_this_month
      FROM reports
      WHERE created_at BETWEEN $5 AND $2
    `, [
      startOfDay(new Date()),
      endOfDay(new Date()),
      startOfDay(subWeeks(new Date(), 1)),
      startOfDay(subMonths(new Date(), 1)),
      start
    ]);

    // Get previous period for trend calculation
    const previousPeriodDays = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    const previousStart = subDays(start, previousPeriodDays);

    const previousStats = await this.db.query(`
      SELECT COUNT(*)::int as count
      FROM reports
      WHERE created_at BETWEEN $1 AND $2
    `, [previousStart, start]);

    // Calculate trend percentage
    const currentCount = currentStats.rows[0].total_reports;
    const previousCount = previousStats.rows[0].count;
    const trendPercentage = previousCount > 0
      ? ((currentCount - previousCount) / previousCount) * 100
      : 0;

    // Get category breakdown
    const categoryData = await this.db.query(`
      SELECT
        damage_category as category,
        COUNT(*)::int as count
      FROM reports
      WHERE created_at BETWEEN $1 AND $2
        AND damage_category IS NOT NULL
      GROUP BY damage_category
      ORDER BY count DESC
    `, [start, end]);

    const categoryBreakdown: Record<string, number> = {};
    categoryData.rows.forEach(row => {
      categoryBreakdown[row.category] = row.count;
    });

    return {
      totalReports: currentStats.rows[0].total_reports,
      totalCost: parseFloat(currentStats.rows[0].total_cost),
      averageCost: parseFloat(currentStats.rows[0].average_cost),
      uniqueUsers: currentStats.rows[0].unique_users,
      reportsToday: currentStats.rows[0].reports_today,
      reportsThisWeek: currentStats.rows[0].reports_this_week,
      reportsThisMonth: currentStats.rows[0].reports_this_month,
      categoryBreakdown,
      trendPercentage
    };
  }

  /**
   * Get time-series data for charts
   */
  async getTimeSeries(
    period: 'day' | 'week' | 'month' | 'year',
    startDate?: Date,
    endDate?: Date
  ): Promise<TimeSeriesData[]> {
    const end = endDate || new Date();
    let start: Date;
    let dateFormat: string;
    let truncFunction: string;

    switch (period) {
      case 'day':
        start = startDate || subDays(end, 30);
        dateFormat = 'yyyy-MM-dd';
        truncFunction = 'day';
        break;
      case 'week':
        start = startDate || subWeeks(end, 12);
        dateFormat = 'yyyy-MM-dd';
        truncFunction = 'week';
        break;
      case 'month':
        start = startDate || subMonths(end, 12);
        dateFormat = 'yyyy-MM';
        truncFunction = 'month';
        break;
      case 'year':
        start = startDate || subMonths(end, 36);
        dateFormat = 'yyyy';
        truncFunction = 'year';
        break;
    }

    const result = await this.db.query(`
      SELECT
        DATE_TRUNC($1, created_at) as date,
        COUNT(*)::int as count,
        COALESCE(SUM(estimated_cost), 0) as cost
      FROM reports
      WHERE created_at BETWEEN $2 AND $3
      GROUP BY DATE_TRUNC($1, created_at)
      ORDER BY date ASC
    `, [truncFunction, start, end]);

    return result.rows.map(row => ({
      date: format(new Date(row.date), dateFormat),
      count: row.count,
      cost: parseFloat(row.cost)
    }));
  }

  /**
   * Get category statistics
   */
  async getCategoryStats(
    startDate?: Date,
    endDate?: Date
  ): Promise<CategoryStats[]> {
    const start = startDate || subMonths(new Date(), 3);
    const end = endDate || new Date();

    const result = await this.db.query(`
      WITH category_stats AS (
        SELECT
          damage_category as category,
          COUNT(*)::int as count,
          SUM(estimated_cost) as total_cost,
          AVG(estimated_cost) as average_cost
        FROM reports
        WHERE created_at BETWEEN $1 AND $2
          AND damage_category IS NOT NULL
        GROUP BY damage_category
      ),
      total AS (
        SELECT SUM(count) as total_count
        FROM category_stats
      )
      SELECT
        cs.category,
        cs.count,
        COALESCE(cs.total_cost, 0) as total_cost,
        COALESCE(cs.average_cost, 0) as average_cost,
        ROUND((cs.count::numeric / t.total_count) * 100, 2) as percentage
      FROM category_stats cs
      CROSS JOIN total t
      ORDER BY cs.count DESC
    `, [start, end]);

    return result.rows.map(row => ({
      category: row.category,
      count: row.count,
      totalCost: parseFloat(row.total_cost),
      averageCost: parseFloat(row.average_cost),
      percentage: parseFloat(row.percentage)
    }));
  }

  /**
   * Get user activity statistics
   */
  async getUserActivity(
    startDate?: Date,
    endDate?: Date
  ): Promise<any[]> {
    const start = startDate || subMonths(new Date(), 3);
    const end = endDate || new Date();

    const result = await this.db.query(`
      SELECT
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        COUNT(r.id)::int as report_count,
        SUM(r.estimated_cost) as total_value,
        MAX(r.created_at) as last_report_date
      FROM users u
      LEFT JOIN reports r ON u.id = r.user_id
        AND r.created_at BETWEEN $1 AND $2
      GROUP BY u.id, u.name, u.email
      HAVING COUNT(r.id) > 0
      ORDER BY report_count DESC
      LIMIT 50
    `, [start, end]);

    return result.rows.map(row => ({
      userId: row.user_id,
      userName: row.user_name,
      userEmail: row.user_email,
      reportCount: row.report_count,
      totalValue: parseFloat(row.total_value || 0),
      lastReportDate: row.last_report_date
    }));
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(): Promise<any> {
    const result = await this.db.query(`
      SELECT
        (SELECT COUNT(*) FROM reports)::int as total_reports,
        (SELECT COUNT(*) FROM users)::int as total_users,
        (SELECT pg_database_size(current_database())) as database_size,
        (SELECT COUNT(*) FROM reports WHERE created_at > NOW() - INTERVAL '24 hours')::int as reports_last_24h,
        (SELECT AVG(estimated_cost) FROM reports) as avg_report_value
    `);

    return {
      totalReports: result.rows[0].total_reports,
      totalUsers: result.rows[0].total_users,
      databaseSize: result.rows[0].database_size,
      reportsLast24Hours: result.rows[0].reports_last_24h,
      averageReportValue: parseFloat(result.rows[0].avg_report_value || 0)
    };
  }

  /**
   * Clear analytics cache
   */
  async clearCache(): Promise<void> {
    // Refresh materialized view
    await this.db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_summary');
  }
}
```

---

## Part 2: Analytics API Routes

### Step 2.1: Create Analytics Routes

Create `packages/backend/src/routes/analytics.routes.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { AnalyticsService } from '../services/analytics.service';
import { DatabaseService } from '../services/database.service';
import { z } from 'zod';

const router = Router();
const db = new DatabaseService();
const analyticsService = new AnalyticsService(db);

// Validation schemas
const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

const periodSchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']).default('day'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

/**
 * GET /api/analytics/overview
 * Get comprehensive analytics overview
 */
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = dateRangeSchema.parse(req.query);

    const overview = await analyticsService.getOverview(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    res.json({
      success: true,
      data: overview
    });
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics overview'
    });
  }
});

/**
 * GET /api/analytics/trends
 * Get time-series trend data
 */
router.get('/trends', async (req: Request, res: Response) => {
  try {
    const { period, startDate, endDate } = periodSchema.parse(req.query);

    const trends = await analyticsService.getTimeSeries(
      period,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    res.json({
      success: true,
      data: trends
    });
  } catch (error) {
    console.error('Error fetching trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trend data'
    });
  }
});

/**
 * GET /api/analytics/categories
 * Get category breakdown statistics
 */
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = dateRangeSchema.parse(req.query);

    const categories = await analyticsService.getCategoryStats(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching category stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch category statistics'
    });
  }
});

/**
 * GET /api/analytics/users
 * Get user activity statistics
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = dateRangeSchema.parse(req.query);

    const userActivity = await analyticsService.getUserActivity(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    res.json({
      success: true,
      data: userActivity
    });
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user activity'
    });
  }
});

/**
 * GET /api/analytics/performance
 * Get system performance metrics
 */
router.get('/performance', async (req: Request, res: Response) => {
  try {
    const metrics = await analyticsService.getPerformanceMetrics();

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch performance metrics'
    });
  }
});

/**
 * POST /api/analytics/refresh
 * Refresh analytics cache
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    await analyticsService.clearCache();

    res.json({
      success: true,
      message: 'Analytics cache refreshed successfully'
    });
  } catch (error) {
    console.error('Error refreshing analytics cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh analytics cache'
    });
  }
});

export default router;
```

### Step 2.2: Register Routes in Server

Update `packages/backend/src/server.ts`:

```typescript
import analyticsRoutes from './routes/analytics.routes';

// ... existing code

app.use('/api/analytics', analyticsRoutes);
```

---

## Part 3: Frontend Analytics Dashboard

### Step 3.1: Create Analytics Store

Create `packages/frontend/src/stores/analyticsStore.ts`:

```typescript
import { create } from 'zustand';
import { AnalyticsOverview, TimeSeriesData, CategoryStats } from '../types/analytics';

interface AnalyticsStore {
  overview: AnalyticsOverview | null;
  trends: TimeSeriesData[];
  categories: CategoryStats[];
  isLoading: boolean;
  error: string | null;
  dateRange: {
    start: Date;
    end: Date;
  };

  fetchOverview: () => Promise<void>;
  fetchTrends: (period: 'day' | 'week' | 'month' | 'year') => Promise<void>;
  fetchCategories: () => Promise<void>;
  setDateRange: (start: Date, end: Date) => void;
}

export const useAnalyticsStore = create<AnalyticsStore>((set, get) => ({
  overview: null,
  trends: [],
  categories: [],
  isLoading: false,
  error: null,
  dateRange: {
    start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
    end: new Date()
  },

  fetchOverview: async () => {
    set({ isLoading: true, error: null });
    try {
      const { start, end } = get().dateRange;
      const response = await fetch(
        `/api/analytics/overview?startDate=${start.toISOString()}&endDate=${end.toISOString()}`
      );

      if (!response.ok) throw new Error('Failed to fetch overview');

      const data = await response.json();
      set({ overview: data.data, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false
      });
    }
  },

  fetchTrends: async (period) => {
    set({ isLoading: true, error: null });
    try {
      const { start, end } = get().dateRange;
      const response = await fetch(
        `/api/analytics/trends?period=${period}&startDate=${start.toISOString()}&endDate=${end.toISOString()}`
      );

      if (!response.ok) throw new Error('Failed to fetch trends');

      const data = await response.json();
      set({ trends: data.data, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false
      });
    }
  },

  fetchCategories: async () => {
    set({ isLoading: true, error: null });
    try {
      const { start, end } = get().dateRange;
      const response = await fetch(
        `/api/analytics/categories?startDate=${start.toISOString()}&endDate=${end.toISOString()}`
      );

      if (!response.ok) throw new Error('Failed to fetch categories');

      const data = await response.json();
      set({ categories: data.data, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false
      });
    }
  },

  setDateRange: (start, end) => {
    set({ dateRange: { start, end } });
  }
}));
```

### Step 3.2: Create Analytics Dashboard Component

Create `packages/frontend/src/pages/AnalyticsDashboard.tsx`:

```typescript
import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { useAnalyticsStore } from '../stores/analyticsStore';
import { format, subDays, subMonths } from 'date-fns';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export function AnalyticsDashboard() {
  const {
    overview,
    trends,
    categories,
    isLoading,
    error,
    dateRange,
    fetchOverview,
    fetchTrends,
    fetchCategories,
    setDateRange
  } = useAnalyticsStore();

  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('day');

  useEffect(() => {
    fetchOverview();
    fetchTrends(period);
    fetchCategories();
  }, [dateRange]);

  useEffect(() => {
    fetchTrends(period);
  }, [period]);

  const handlePeriodChange = (newPeriod: typeof period) => {
    setPeriod(newPeriod);
  };

  const handlePresetRange = (preset: '7d' | '30d' | '90d' | '1y') => {
    const end = new Date();
    let start: Date;

    switch (preset) {
      case '7d':
        start = subDays(end, 7);
        break;
      case '30d':
        start = subDays(end, 30);
        break;
      case '90d':
        start = subDays(end, 90);
        break;
      case '1y':
        start = subMonths(end, 12);
        break;
    }

    setDateRange(start, end);
  };

  const handleExportPDF = async () => {
    try {
      const response = await fetch('/api/reports/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'analytics',
          dateRange: {
            start: dateRange.start.toISOString(),
            end: dateRange.end.toISOString()
          }
        })
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      a.click();
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export PDF');
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch(
        `/api/reports/export/csv?startDate=${dateRange.start.toISOString()}&endDate=${dateRange.end.toISOString()}`
      );

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export CSV');
    }
  };

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">Error loading analytics: {error}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
        <p className="text-gray-600 mt-2">
          View comprehensive analytics and generate reports
        </p>
      </div>

      {/* Controls */}
      <div className="mb-6 flex justify-between items-center">
        <div className="flex gap-2">
          <button
            onClick={() => handlePresetRange('7d')}
            className="px-4 py-2 bg-white border rounded hover:bg-gray-50"
          >
            Last 7 Days
          </button>
          <button
            onClick={() => handlePresetRange('30d')}
            className="px-4 py-2 bg-white border rounded hover:bg-gray-50"
          >
            Last 30 Days
          </button>
          <button
            onClick={() => handlePresetRange('90d')}
            className="px-4 py-2 bg-white border rounded hover:bg-gray-50"
          >
            Last 90 Days
          </button>
          <button
            onClick={() => handlePresetRange('1y')}
            className="px-4 py-2 bg-white border rounded hover:bg-gray-50"
          >
            Last Year
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleExportPDF}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Export PDF
          </button>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Reports"
            value={overview.totalReports.toLocaleString()}
            trend={overview.trendPercentage}
            isLoading={isLoading}
          />
          <StatCard
            title="Total Cost"
            value={`$${overview.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            isLoading={isLoading}
          />
          <StatCard
            title="Average Cost"
            value={`$${overview.averageCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            isLoading={isLoading}
          />
          <StatCard
            title="Active Users"
            value={overview.uniqueUsers.toLocaleString()}
            isLoading={isLoading}
          />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Trend Chart */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Report Trends</h2>
            <select
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value as typeof period)}
              className="border rounded px-3 py-1"
            >
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </select>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="count"
                stroke="#8884d8"
                name="Reports"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cost"
                stroke="#82ca9d"
                name="Cost ($)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Category Breakdown */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Category Breakdown</h2>

          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={categories}
                dataKey="count"
                nameKey="category"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label
              >
                {categories.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cost by Category Chart */}
      {categories.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h2 className="text-xl font-semibold mb-4">Cost by Category</h2>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categories}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="totalCost" fill="#8884d8" name="Total Cost ($)" />
              <Bar dataKey="averageCost" fill="#82ca9d" name="Average Cost ($)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category Table */}
      {categories.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Detailed Category Stats</h2>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Count
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Total Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Average Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Percentage
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {categories.map((category) => (
                  <tr key={category.category}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">
                      {category.category}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {category.count.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      ${category.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      ${category.averageCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {category.percentage}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Stat Card Component
interface StatCardProps {
  title: string;
  value: string | number;
  trend?: number;
  isLoading?: boolean;
}

function StatCard({ title, value, trend, isLoading }: StatCardProps) {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-sm font-medium text-gray-500 mb-2">{title}</h3>
      {isLoading ? (
        <div className="h-8 bg-gray-200 animate-pulse rounded"></div>
      ) : (
        <>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          {trend !== undefined && (
            <p className={`text-sm mt-2 ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}% from previous period
            </p>
          )}
        </>
      )}
    </div>
  );
}
```

---

**Due to length constraints, I'll continue with Parts 4-5 (PDF Generation and CSV Export) in the next message. This implementation guide is comprehensive with:**

✅ Complete Analytics Service with database queries
✅ Full Analytics API routes with validation
✅ Complete Analytics Dashboard with Recharts
✅ State management with Zustand
✅ Responsive design and export buttons
✅ Real-time data fetching

Would you like me to continue with Parts 4-5 (PDF Generation & CSV Export), or would you like me to proceed directly to Feature 3 (Team Collaboration)?