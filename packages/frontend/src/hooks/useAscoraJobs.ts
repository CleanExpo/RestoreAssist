/**
 * useAscoraJobs Hook
 * Job CRUD operations and syncing for Ascora CRM
 *
 * Features:
 * - Create jobs from reports
 * - List and filter jobs
 * - Update job status
 * - Add notes and attachments
 * - Real-time sync
 *
 * @module useAscoraJobs
 */

import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';

// ===== Type Definitions =====

export interface AscoraJob {
  id: string;
  reportId?: string;
  ascoraJobId: string;
  jobTitle: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  jobStatus: string;
  description?: string;
  jobAddress?: string;
  jobType?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  estimatedCost?: number;
  actualCost?: number;
  scheduledDate?: string;
  completedDate?: string;
  assignedTo?: string;
  assignedToName?: string;
  invoiceStatus?: string;
  invoiceAmount?: number;
  paymentStatus?: string;
  customFields?: Record<string, any>;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobRequest {
  reportId: string;
}

export interface JobFilters {
  status?: string;
  customerId?: string;
  limit?: number;
  offset?: number;
}

export interface JobNote {
  id: string;
  jobId: string;
  note: string;
  createdAt: string;
}

// ===== Main Hook =====

export function useAscoraJobs(organizationId: string) {
  const [jobs, setJobs] = useState<AscoraJob[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [updating, setUpdating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [currentFilters, setCurrentFilters] = useState<JobFilters>({
    limit: 50,
    offset: 0
  });

  // ===== Fetch Jobs =====

  const fetchJobs = useCallback(
    async (filters: JobFilters = {}) => {
      if (!organizationId) return;

      setLoading(true);
      setError(null);

      try {
        const params = {
          ...currentFilters,
          ...filters
        };

        const response = await axios.get(
          `/api/organizations/${organizationId}/ascora/jobs`,
          { params }
        );

        if (response.data.success) {
          setJobs(response.data.data.jobs);
          setTotal(response.data.data.total);
          setCurrentFilters(params);
        } else {
          throw new Error(response.data.message || 'Failed to fetch jobs');
        }
      } catch (err: any) {
        console.error('[useAscoraJobs] Fetch failed:', err);
        setError(err.response?.data?.message || 'Failed to fetch jobs');
        setJobs([]);
      } finally {
        setLoading(false);
      }
    },
    [organizationId, currentFilters]
  );

  // ===== Get Single Job =====

  const getJob = useCallback(
    async (jobId: string): Promise<AscoraJob | null> => {
      setError(null);

      try {
        const response = await axios.get(
          `/api/organizations/${organizationId}/ascora/jobs/${jobId}`
        );

        if (response.data.success) {
          return response.data.data;
        } else {
          throw new Error(response.data.message || 'Job not found');
        }
      } catch (err: any) {
        console.error('[useAscoraJobs] Get job failed:', err);
        setError(err.response?.data?.message || 'Failed to get job');
        return null;
      }
    },
    [organizationId]
  );

  // ===== Create Job from Report =====

  const createJob = useCallback(
    async (reportId: string): Promise<{ jobId: string; ascoraJobId: string } | null> => {
      setCreating(true);
      setError(null);

      try {
        const response = await axios.post(
          `/api/organizations/${organizationId}/ascora/jobs`,
          { reportId }
        );

        if (response.data.success) {
          // Refresh job list
          await fetchJobs();
          return response.data.data;
        } else {
          throw new Error(response.data.message || 'Failed to create job');
        }
      } catch (err: any) {
        console.error('[useAscoraJobs] Create failed:', err);
        const errorMessage = err.response?.data?.message || 'Failed to create job';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setCreating(false);
      }
    },
    [organizationId, fetchJobs]
  );

  // ===== Update Job Status =====

  const updateJobStatus = useCallback(
    async (jobId: string, status: string): Promise<void> => {
      setUpdating(true);
      setError(null);

      try {
        const response = await axios.put(
          `/api/organizations/${organizationId}/ascora/jobs/${jobId}/status`,
          { status }
        );

        if (response.data.success) {
          // Update local state
          setJobs(prev =>
            prev.map(job =>
              job.ascoraJobId === jobId ? { ...job, jobStatus: status } : job
            )
          );
        } else {
          throw new Error(response.data.message || 'Failed to update status');
        }
      } catch (err: any) {
        console.error('[useAscoraJobs] Status update failed:', err);
        const errorMessage = err.response?.data?.message || 'Failed to update job status';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setUpdating(false);
      }
    },
    [organizationId]
  );

  // ===== Add Job Note =====

  const addNote = useCallback(
    async (jobId: string, note: string): Promise<JobNote | null> => {
      setError(null);

      try {
        const response = await axios.post(
          `/api/organizations/${organizationId}/ascora/jobs/${jobId}/notes`,
          { note }
        );

        if (response.data.success) {
          return response.data.data;
        } else {
          throw new Error(response.data.message || 'Failed to add note');
        }
      } catch (err: any) {
        console.error('[useAscoraJobs] Add note failed:', err);
        const errorMessage = err.response?.data?.message || 'Failed to add note';
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    [organizationId]
  );

  // ===== Add Attachment =====

  const addAttachment = useCallback(
    async (jobId: string, file: File): Promise<void> => {
      setError(null);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await axios.post(
          `/api/organizations/${organizationId}/ascora/jobs/${jobId}/attachments`,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          }
        );

        if (!response.data.success) {
          throw new Error(response.data.message || 'Failed to add attachment');
        }
      } catch (err: any) {
        console.error('[useAscoraJobs] Add attachment failed:', err);
        const errorMessage = err.response?.data?.message || 'Failed to add attachment';
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    [organizationId]
  );

  // ===== Filter Jobs =====

  const filterJobs = useCallback(
    async (filters: JobFilters): Promise<void> => {
      await fetchJobs(filters);
    },
    [fetchJobs]
  );

  // ===== Search Jobs =====

  const searchJobs = useCallback(
    (query: string): AscoraJob[] => {
      if (!query.trim()) return jobs;

      const lowerQuery = query.toLowerCase();
      return jobs.filter(
        job =>
          job.jobTitle?.toLowerCase().includes(lowerQuery) ||
          job.customerName?.toLowerCase().includes(lowerQuery) ||
          job.customerEmail?.toLowerCase().includes(lowerQuery) ||
          job.description?.toLowerCase().includes(lowerQuery) ||
          job.ascoraJobId?.toLowerCase().includes(lowerQuery)
      );
    },
    [jobs]
  );

  // ===== Get Jobs by Status =====

  const getJobsByStatus = useCallback(
    (status: string): AscoraJob[] => {
      return jobs.filter(job => job.jobStatus === status);
    },
    [jobs]
  );

  // ===== Get Jobs by Customer =====

  const getJobsByCustomer = useCallback(
    (customerId: string): AscoraJob[] => {
      return jobs.filter(job => job.customerId === customerId);
    },
    [jobs]
  );

  // ===== Get Job Statistics =====

  const getStatistics = useCallback((): {
    total: number;
    byStatus: Record<string, number>;
    totalEstimatedCost: number;
    totalActualCost: number;
    averageEstimatedCost: number;
  } => {
    const byStatus: Record<string, number> = {};
    let totalEstimatedCost = 0;
    let totalActualCost = 0;
    let estimatedCount = 0;

    jobs.forEach(job => {
      // Count by status
      byStatus[job.jobStatus] = (byStatus[job.jobStatus] || 0) + 1;

      // Sum costs
      if (job.estimatedCost) {
        totalEstimatedCost += job.estimatedCost;
        estimatedCount++;
      }
      if (job.actualCost) {
        totalActualCost += job.actualCost;
      }
    });

    return {
      total: jobs.length,
      byStatus,
      totalEstimatedCost,
      totalActualCost,
      averageEstimatedCost: estimatedCount > 0 ? totalEstimatedCost / estimatedCount : 0
    };
  }, [jobs]);

  // ===== Pagination =====

  const loadMore = useCallback(async (): Promise<void> => {
    await fetchJobs({
      ...currentFilters,
      offset: (currentFilters.offset || 0) + (currentFilters.limit || 50)
    });
  }, [fetchJobs, currentFilters]);

  const hasMore = useCallback((): boolean => {
    return jobs.length < total;
  }, [jobs.length, total]);

  // ===== Refresh =====

  const refresh = useCallback(async (): Promise<void> => {
    await fetchJobs(currentFilters);
  }, [fetchJobs, currentFilters]);

  // ===== Clear Error =====

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ===== Initial Load =====

  useEffect(() => {
    fetchJobs();
  }, [organizationId]); // Only run on mount/org change

  // ===== Return Hook Interface =====

  return {
    // State
    jobs,
    loading,
    creating,
    updating,
    error,
    total,
    currentFilters,

    // Actions
    createJob,
    getJob,
    updateJobStatus,
    addNote,
    addAttachment,
    filterJobs,
    refresh,
    clearError,

    // Utilities
    searchJobs,
    getJobsByStatus,
    getJobsByCustomer,
    getStatistics,

    // Pagination
    loadMore,
    hasMore: hasMore()
  };
}

export default useAscoraJobs;
