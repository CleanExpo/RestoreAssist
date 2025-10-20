import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAscoraCustomers } from '../../hooks/useAscoraCustomers';
import { AscoraCustomer } from '../../types/ascora';

export interface AscoraCustomerSyncProps {
  organizationId: string;
  onCustomerClick?: (customer: AscoraCustomer) => void;
  onSyncComplete?: () => void;
  showLinkToContacts?: boolean;
}

type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error';
type SortField = 'name' | 'email' | 'phone' | 'syncStatus' | 'lastSyncedAt';
type SortOrder = 'asc' | 'desc';

interface ConflictData {
  customerId: string;
  localData: Partial<AscoraCustomer>;
  remoteData: Partial<AscoraCustomer>;
  conflictFields: string[];
}

export const AscoraCustomerSync: React.FC<AscoraCustomerSyncProps> = ({
  organizationId,
  onCustomerClick,
  onSyncComplete,
  showLinkToContacts = true
}) => {
  const {
    customers,
    loading,
    syncing,
    error,
    total,
    syncCustomers,
    getCustomer,
    updateCustomer,
    linkToContact,
    searchCustomers,
    getCustomersByStatus,
    getStatistics,
    loadMore,
    hasMore,
    clearError
  } = useAscoraCustomers(organizationId);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<SyncStatus | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [currentConflict, setCurrentConflict] = useState<ConflictData | null>(null);
  const [linkingCustomerId, setLinkingCustomerId] = useState<string | null>(null);

  const itemsPerPage = 20;

  // Get statistics
  const stats = useMemo(() => getStatistics(), [getStatistics]);

  // Filter and sort customers
  const filteredCustomers = useMemo(() => {
    let result = [...customers];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(customer =>
        customer.name?.toLowerCase().includes(query) ||
        customer.email?.toLowerCase().includes(query) ||
        customer.phone?.includes(query) ||
        customer.company?.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(customer => {
        const status = getSyncStatus(customer);
        return status === statusFilter;
      });
    }

    // Apply sorting
    result.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'name':
          aValue = a.name?.toLowerCase() || '';
          bValue = b.name?.toLowerCase() || '';
          break;
        case 'email':
          aValue = a.email?.toLowerCase() || '';
          bValue = b.email?.toLowerCase() || '';
          break;
        case 'phone':
          aValue = a.phone || '';
          bValue = b.phone || '';
          break;
        case 'syncStatus':
          aValue = getSyncStatus(a);
          bValue = getSyncStatus(b);
          break;
        case 'lastSyncedAt':
          aValue = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
          bValue = b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0;
          break;
        default:
          aValue = '';
          bValue = '';
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [customers, searchQuery, statusFilter, sortField, sortOrder]);

  // Paginate customers
  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredCustomers.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredCustomers, currentPage]);

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);

  // Determine sync status for a customer
  const getSyncStatus = useCallback((customer: AscoraCustomer): SyncStatus => {
    if (customer.syncError) return 'error';
    if (customer.hasConflict) return 'conflict';
    if (!customer.lastSyncedAt) return 'pending';
    return 'synced';
  }, []);

  // Get status color
  const getStatusColor = useCallback((status: SyncStatus) => {
    switch (status) {
      case 'synced':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'conflict':
        return 'bg-orange-100 text-orange-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }, []);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Handle sync all
  const handleSyncAll = async () => {
    try {
      await syncCustomers();
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (err) {
      console.error('Error syncing customers:', err);
    }
  };

  // Handle sync selected
  const handleSyncSelected = async () => {
    // In a real implementation, you would have a batch sync endpoint
    console.log('Syncing selected customers:', Array.from(selectedCustomers));
    setSelectedCustomers(new Set());
  };

  // Handle customer selection
  const toggleCustomerSelection = (customerId: string) => {
    const newSelection = new Set(selectedCustomers);
    if (newSelection.has(customerId)) {
      newSelection.delete(customerId);
    } else {
      newSelection.add(customerId);
    }
    setSelectedCustomers(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedCustomers.size === paginatedCustomers.length) {
      setSelectedCustomers(new Set());
    } else {
      setSelectedCustomers(new Set(paginatedCustomers.map(c => c.id)));
    }
  };

  // Handle link to contact
  const handleLinkToContact = async (customerId: string, contactId: string) => {
    setLinkingCustomerId(customerId);
    try {
      await linkToContact(customerId, contactId);
    } catch (err) {
      console.error('Error linking customer to contact:', err);
    } finally {
      setLinkingCustomerId(null);
    }
  };

  // Handle resolve conflict
  const handleResolveConflict = async (resolution: 'local' | 'remote' | 'merge') => {
    if (!currentConflict) return;

    try {
      let resolvedData: Partial<AscoraCustomer>;

      switch (resolution) {
        case 'local':
          resolvedData = currentConflict.localData;
          break;
        case 'remote':
          resolvedData = currentConflict.remoteData;
          break;
        case 'merge':
          // Simple merge strategy: take non-empty values from local, fallback to remote
          resolvedData = {};
          const allFields = new Set([
            ...Object.keys(currentConflict.localData),
            ...Object.keys(currentConflict.remoteData)
          ]);
          allFields.forEach(field => {
            const localValue = (currentConflict.localData as any)[field];
            const remoteValue = (currentConflict.remoteData as any)[field];
            (resolvedData as any)[field] = localValue || remoteValue;
          });
          break;
      }

      await updateCustomer(currentConflict.customerId, resolvedData);
      setShowConflictModal(false);
      setCurrentConflict(null);
    } catch (err) {
      console.error('Error resolving conflict:', err);
    }
  };

  // Show conflict modal for a customer
  const showConflictDetails = (customer: AscoraCustomer) => {
    if (!customer.hasConflict || !customer.conflictData) return;

    setCurrentConflict({
      customerId: customer.id,
      localData: customer.conflictData.local || {},
      remoteData: customer.conflictData.remote || {},
      conflictFields: customer.conflictData.fields || []
    });
    setShowConflictModal(true);
  };

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
    return `${Math.floor(diffMins / 1440)} days ago`;
  };

  // Load more on scroll
  useEffect(() => {
    if (currentPage === totalPages && hasMore && !loading) {
      loadMore();
    }
  }, [currentPage, totalPages, hasMore, loading, loadMore]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Customer Sync</h2>
          <p className="text-sm text-gray-600 mt-1">
            Synchronise customers between RestoreAssist and Ascora CRM
          </p>
        </div>
        <button
          onClick={handleSyncAll}
          disabled={syncing || loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {syncing ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
              Syncing...
            </>
          ) : (
            'Sync All Customers'
          )}
        </button>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 p-4 bg-gray-50 rounded-lg">
          <div>
            <div className="text-sm text-gray-600">Total Customers</div>
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Synced</div>
            <div className="text-2xl font-bold text-green-600">{stats.synced}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Pending</div>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Conflicts</div>
            <div className="text-2xl font-bold text-orange-600">{stats.conflicts}</div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start justify-between">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div>
              <div className="font-medium text-red-900">Error</div>
              <div className="text-sm text-red-700 mt-1">{error}</div>
            </div>
          </div>
          <button onClick={clearError} className="text-red-600 hover:text-red-800">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Filters and Actions */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search customers by name, email, phone, or company..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as SyncStatus | 'all');
            setCurrentPage(1);
          }}
          className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">All Status</option>
          <option value="synced">Synced</option>
          <option value="pending">Pending</option>
          <option value="conflict">Conflicts</option>
          <option value="error">Errors</option>
        </select>
        {selectedCustomers.size > 0 && (
          <button
            onClick={handleSyncSelected}
            disabled={syncing}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            Sync Selected ({selectedCustomers.size})
          </button>
        )}
      </div>

      {/* Customer Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedCustomers.size === paginatedCustomers.length && paginatedCustomers.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    Name
                    {sortField === 'name' && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('email')}
                >
                  <div className="flex items-center gap-1">
                    Email
                    {sortField === 'email' && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('phone')}
                >
                  <div className="flex items-center gap-1">
                    Phone
                    {sortField === 'phone' && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('syncStatus')}
                >
                  <div className="flex items-center gap-1">
                    Status
                    {sortField === 'syncStatus' && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('lastSyncedAt')}
                >
                  <div className="flex items-center gap-1">
                    Last Synced
                    {sortField === 'lastSyncedAt' && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading && paginatedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                      Loading customers...
                    </div>
                  </td>
                </tr>
              ) : paginatedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No customers found
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((customer) => {
                  const status = getSyncStatus(customer);
                  return (
                    <tr key={customer.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedCustomers.has(customer.id)}
                          onChange={() => toggleCustomerSelection(customer.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{customer.name || 'N/A'}</div>
                        {customer.company && (
                          <div className="text-sm text-gray-500">{customer.company}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{customer.email || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{customer.phone || 'N/A'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(customer.lastSyncedAt)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          {status === 'conflict' && (
                            <button
                              onClick={() => showConflictDetails(customer)}
                              className="text-orange-600 hover:text-orange-900"
                            >
                              Resolve
                            </button>
                          )}
                          {onCustomerClick && (
                            <button
                              onClick={() => onCustomerClick(customer)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              View
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredCustomers.length)} of {filteredCustomers.length} customers
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Conflict Resolution Modal */}
      {showConflictModal && currentConflict && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Resolve Conflict</h3>

            <div className="space-y-4 mb-6">
              <p className="text-sm text-gray-600">
                This customer has conflicting data between RestoreAssist and Ascora.
                Choose how to resolve the conflict:
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Local (RestoreAssist)</h4>
                  <div className="space-y-1 text-sm">
                    {currentConflict.conflictFields.map(field => (
                      <div key={field} className="flex justify-between">
                        <span className="text-gray-600">{field}:</span>
                        <span className="font-medium">{(currentConflict.localData as any)[field] || 'N/A'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Remote (Ascora)</h4>
                  <div className="space-y-1 text-sm">
                    {currentConflict.conflictFields.map(field => (
                      <div key={field} className="flex justify-between">
                        <span className="text-gray-600">{field}:</span>
                        <span className="font-medium">{(currentConflict.remoteData as any)[field] || 'N/A'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowConflictModal(false);
                  setCurrentConflict(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleResolveConflict('local')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Use Local
              </button>
              <button
                onClick={() => handleResolveConflict('remote')}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Use Remote
              </button>
              <button
                onClick={() => handleResolveConflict('merge')}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
              >
                Merge Both
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
