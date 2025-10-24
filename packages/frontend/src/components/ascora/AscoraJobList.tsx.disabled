/**
 * AscoraJobList Component
 * List and manage Ascora jobs with filtering and sorting
 *
 * Features:
 * - Table view with sorting
 * - Search and filtering
 * - Status badges
 * - Customer information
 * - Cost display
 * - Status update dropdown
 * - Link to reports
 * - Pagination
 *
 * @module AscoraJobList
 */

import React, { useState, useMemo } from 'react';
import { useAscoraJobs } from '../../hooks/useAscoraJobs';
import {
  Briefcase,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  User,
  DollarSign,
  Calendar,
  MapPin,
  Loader,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface AscoraJobListProps {
  organizationId: string;
  onJobClick?: (jobId: string) => void;
  showReportLink?: boolean;
}

type SortField = 'jobTitle' | 'customerName' | 'jobStatus' | 'estimatedCost' | 'scheduledDate';
type SortOrder = 'asc' | 'desc';

export const AscoraJobList: React.FC<AscoraJobListProps> = ({
  organizationId,
  onJobClick,
  showReportLink = true
}) => {
  const {
    jobs,
    loading,
    error,
    total,
    filterJobs,
    updateJobStatus,
    getStatistics,
    refresh
  } = useAscoraJobs(organizationId);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('scheduledDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const itemsPerPage = 20;

  // Get statistics
  const stats = getStatistics();

  // Filter and sort jobs
  const filteredJobs = useMemo(() => {
    let result = [...jobs];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        job =>
          job.jobTitle?.toLowerCase().includes(query) ||
          job.customerName?.toLowerCase().includes(query) ||
          job.customerEmail?.toLowerCase().includes(query) ||
          job.ascoraJobId?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(job => job.jobStatus === statusFilter);
    }

    // Sort
    result.sort((a, b) => {
      let compareA: any = a[sortField];
      let compareB: any = b[sortField];

      // Handle null/undefined
      if (compareA == null) compareA = '';
      if (compareB == null) compareB = '';

      // String comparison
      if (typeof compareA === 'string') {
        return sortOrder === 'asc'
          ? compareA.localeCompare(compareB)
          : compareB.localeCompare(compareA);
      }

      // Numeric comparison
      return sortOrder === 'asc' ? compareA - compareB : compareB - compareA;
    });

    return result;
  }, [jobs, searchQuery, statusFilter, sortField, sortOrder]);

  // Paginate
  const paginatedJobs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredJobs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredJobs, currentPage]);

  const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Handle status update
  const handleStatusUpdate = async (jobId: string, newStatus: string) => {
    try {
      await updateJobStatus(jobId, newStatus);
    } catch (err) {
      console.error('Status update failed:', err);
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending':
      case 'new':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'in_progress':
      case 'active':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed':
      case 'done':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled':
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Format date
  const formatDate = (date?: string) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString();
  };

  // Sort icon
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Ascora Jobs</h3>
              <p className="text-sm text-gray-600">
                {filteredJobs.length} of {total} jobs
              </p>
            </div>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 text-gray-600 hover:bg-white rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 bg-white rounded-lg border border-blue-200">
            <p className="text-xs text-gray-600 mb-1">Total Jobs</p>
            <p className="text-xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-blue-200">
            <p className="text-xs text-gray-600 mb-1">Estimated</p>
            <p className="text-xl font-bold text-gray-900">
              ${stats.totalEstimatedCost.toLocaleString()}
            </p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-blue-200">
            <p className="text-xs text-gray-600 mb-1">Actual</p>
            <p className="text-xl font-bold text-gray-900">
              ${stats.totalActualCost.toLocaleString()}
            </p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-blue-200">
            <p className="text-xs text-gray-600 mb-1">Average</p>
            <p className="text-xl font-bold text-gray-900">
              ${stats.averageEstimatedCost.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-600 mb-2">Failed to load jobs</p>
            <p className="text-sm text-gray-600">{error}</p>
          </div>
        ) : paginatedJobs.length === 0 ? (
          <div className="p-12 text-center">
            <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600">No jobs found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th
                  className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('jobTitle')}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    Job Title
                    <SortIcon field="jobTitle" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('customerName')}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    Customer
                    <SortIcon field="customerName" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('jobStatus')}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    Status
                    <SortIcon field="jobStatus" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('estimatedCost')}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    Cost
                    <SortIcon field="estimatedCost" />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('scheduledDate')}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    Scheduled
                    <SortIcon field="scheduledDate" />
                  </div>
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedJobs.map((job) => (
                <tr
                  key={job.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => onJobClick?.(job.ascoraJobId)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{job.jobTitle}</p>
                        {showReportLink && job.reportId && (
                          <a
                            href={`/reports/${job.reportId}`}
                            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <FileText className="w-3 h-3" />
                            View Report
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-900">{job.customerName || 'N/A'}</p>
                        {job.customerEmail && (
                          <p className="text-xs text-gray-500">{job.customerEmail}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-medium border ${getStatusColor(
                        job.jobStatus
                      )}`}
                    >
                      {job.jobStatus || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          ${job.estimatedCost?.toLocaleString() || 0}
                        </p>
                        {job.actualCost && (
                          <p className="text-xs text-gray-500">
                            Actual: ${job.actualCost.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-900">
                        {formatDate(job.scheduledDate)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`https://ascora.com/jobs/${job.ascoraJobId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View in Ascora
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
              {Math.min(currentPage * itemsPerPage, filteredJobs.length)} of{' '}
              {filteredJobs.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AscoraJobList;
