import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { AscoraInvoice, AscoraPayment } from '../../types/ascora';

export interface AscoraInvoiceManagerProps {
  organizationId: string;
  onInvoiceClick?: (invoice: AscoraInvoice) => void;
  onPaymentRecorded?: (invoiceId: string) => void;
  showJobLink?: boolean;
}

type PaymentStatus = 'paid' | 'partial' | 'unpaid' | 'overdue';
type SortField = 'invoiceNumber' | 'jobNumber' | 'amount' | 'status' | 'dueDate' | 'createdAt';
type SortOrder = 'asc' | 'desc';

interface PaymentFormData {
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  reference: string;
  notes: string;
}

export const AscoraInvoiceManager: React.FC<AscoraInvoiceManagerProps> = ({
  organizationId,
  onInvoiceClick,
  onPaymentRecorded,
  showJobLink = true
}) => {
  const [invoices, setInvoices] = useState<AscoraInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all');
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<AscoraInvoice | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentFormData>({
    amount: 0,
    paymentMethod: 'credit_card',
    paymentDate: new Date().toISOString().split('T')[0],
    reference: '',
    notes: ''
  });

  const itemsPerPage = 20;

  // Fetch invoices
  useEffect(() => {
    fetchInvoices();
  }, [organizationId]);

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/organizations/${organizationId}/ascora/invoices`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch invoices');
      }

      const data = await response.json();
      setInvoices(data.invoices || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch invoices');
    } finally {
      setLoading(false);
    }
  };

  // Get payment status
  const getPaymentStatus = useCallback((invoice: AscoraInvoice): PaymentStatus => {
    const totalAmount = invoice.totalAmount || 0;
    const paidAmount = invoice.paidAmount || 0;

    if (paidAmount >= totalAmount) return 'paid';
    if (paidAmount > 0) return 'partial';

    const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
    const now = new Date();

    if (dueDate && dueDate < now) return 'overdue';
    return 'unpaid';
  }, []);

  // Get status color
  const getStatusColor = useCallback((status: PaymentStatus) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'partial':
        return 'bg-blue-100 text-blue-800';
      case 'unpaid':
        return 'bg-yellow-100 text-yellow-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }, []);

  // Filter and sort invoices
  const filteredInvoices = useMemo(() => {
    let result = [...invoices];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(invoice =>
        invoice.invoiceNumber?.toLowerCase().includes(query) ||
        invoice.jobNumber?.toLowerCase().includes(query) ||
        invoice.customerName?.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(invoice => {
        const status = getPaymentStatus(invoice);
        return status === statusFilter;
      });
    }

    // Apply date range filter
    if (dateRangeStart) {
      const startDate = new Date(dateRangeStart);
      result = result.filter(invoice => {
        const invoiceDate = invoice.createdAt ? new Date(invoice.createdAt) : null;
        return invoiceDate && invoiceDate >= startDate;
      });
    }

    if (dateRangeEnd) {
      const endDate = new Date(dateRangeEnd);
      endDate.setHours(23, 59, 59, 999);
      result = result.filter(invoice => {
        const invoiceDate = invoice.createdAt ? new Date(invoice.createdAt) : null;
        return invoiceDate && invoiceDate <= endDate;
      });
    }

    // Apply sorting
    result.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'invoiceNumber':
          aValue = a.invoiceNumber?.toLowerCase() || '';
          bValue = b.invoiceNumber?.toLowerCase() || '';
          break;
        case 'jobNumber':
          aValue = a.jobNumber?.toLowerCase() || '';
          bValue = b.jobNumber?.toLowerCase() || '';
          break;
        case 'amount':
          aValue = a.totalAmount || 0;
          bValue = b.totalAmount || 0;
          break;
        case 'status':
          aValue = getPaymentStatus(a);
          bValue = getPaymentStatus(b);
          break;
        case 'dueDate':
          aValue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
          bValue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
          break;
        case 'createdAt':
          aValue = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bValue = b.createdAt ? new Date(b.createdAt).getTime() : 0;
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
  }, [invoices, searchQuery, statusFilter, dateRangeStart, dateRangeEnd, sortField, sortOrder, getPaymentStatus]);

  // Paginate invoices
  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredInvoices.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredInvoices, currentPage]);

  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);

  // Calculate statistics
  const statistics = useMemo(() => {
    const stats = {
      totalInvoices: filteredInvoices.length,
      totalAmount: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      overdueCount: 0,
      overdueAmount: 0
    };

    filteredInvoices.forEach(invoice => {
      const totalAmount = invoice.totalAmount || 0;
      const paidAmount = invoice.paidAmount || 0;
      const outstanding = totalAmount - paidAmount;

      stats.totalAmount += totalAmount;
      stats.totalPaid += paidAmount;
      stats.totalOutstanding += outstanding;

      if (getPaymentStatus(invoice) === 'overdue') {
        stats.overdueCount++;
        stats.overdueAmount += outstanding;
      }
    });

    return stats;
  }, [filteredInvoices, getPaymentStatus]);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Open payment modal
  const openPaymentModal = (invoice: AscoraInvoice) => {
    const outstanding = (invoice.totalAmount || 0) - (invoice.paidAmount || 0);
    setSelectedInvoice(invoice);
    setPaymentForm({
      amount: outstanding,
      paymentMethod: 'credit_card',
      paymentDate: new Date().toISOString().split('T')[0],
      reference: '',
      notes: ''
    });
    setShowPaymentModal(true);
  };

  // Handle record payment
  const handleRecordPayment = async () => {
    if (!selectedInvoice) return;

    setRecording(true);
    setError(null);

    try {
      const payment: AscoraPayment = {
        invoiceId: selectedInvoice.id,
        amount: paymentForm.amount,
        paymentMethod: paymentForm.paymentMethod,
        paymentDate: paymentForm.paymentDate,
        reference: paymentForm.reference,
        notes: paymentForm.notes
      };

      const response = await fetch(
        `/api/organizations/${organizationId}/ascora/invoices/${selectedInvoice.id}/payment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(payment)
        }
      );

      if (!response.ok) {
        throw new Error('Failed to record payment');
      }

      const updatedInvoice = await response.json();

      // Update local state
      setInvoices(prev =>
        prev.map(inv => (inv.id === updatedInvoice.id ? updatedInvoice : inv))
      );

      setShowPaymentModal(false);
      setSelectedInvoice(null);

      if (onPaymentRecorded) {
        onPaymentRecorded(selectedInvoice.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setRecording(false);
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Invoice Manager</h2>
          <p className="text-sm text-gray-600 mt-1">
            Track and manage invoices from Ascora CRM
          </p>
        </div>
        <button
          onClick={fetchInvoices}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
              Refreshing...
            </>
          ) : (
            'Refresh Invoices'
          )}
        </button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-5 gap-3 p-4 bg-gray-50 rounded-lg">
        <div>
          <div className="text-sm text-gray-600">Total Invoices</div>
          <div className="text-2xl font-bold text-gray-900">{statistics.totalInvoices}</div>
        </div>
        <div>
          <div className="text-sm text-gray-600">Total Amount</div>
          <div className="text-2xl font-bold text-gray-900">{formatCurrency(statistics.totalAmount)}</div>
        </div>
        <div>
          <div className="text-sm text-gray-600">Paid</div>
          <div className="text-2xl font-bold text-green-600">{formatCurrency(statistics.totalPaid)}</div>
        </div>
        <div>
          <div className="text-sm text-gray-600">Outstanding</div>
          <div className="text-2xl font-bold text-yellow-600">{formatCurrency(statistics.totalOutstanding)}</div>
        </div>
        <div>
          <div className="text-sm text-gray-600">Overdue</div>
          <div className="text-2xl font-bold text-red-600">
            {statistics.overdueCount} ({formatCurrency(statistics.overdueAmount)})
          </div>
        </div>
      </div>

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
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-2">
          <input
            type="text"
            placeholder="Search by invoice number, job number, or customer..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as PaymentStatus | 'all');
              setCurrentPage(1);
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="paid">Paid</option>
            <option value="partial">Partially Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={dateRangeStart}
            onChange={(e) => {
              setDateRangeStart(e.target.value);
              setCurrentPage(1);
            }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Start Date"
          />
          <input
            type="date"
            value={dateRangeEnd}
            onChange={(e) => {
              setDateRangeEnd(e.target.value);
              setCurrentPage(1);
            }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="End Date"
          />
        </div>
      </div>

      {/* Invoice Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('invoiceNumber')}
                >
                  <div className="flex items-center gap-1">
                    Invoice #
                    {sortField === 'invoiceNumber' && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('jobNumber')}
                >
                  <div className="flex items-center gap-1">
                    Job #
                    {sortField === 'jobNumber' && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('amount')}
                >
                  <div className="flex items-center gap-1">
                    Amount
                    {sortField === 'amount' && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Paid
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center gap-1">
                    Status
                    {sortField === 'status' && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('dueDate')}
                >
                  <div className="flex items-center gap-1">
                    Due Date
                    {sortField === 'dueDate' && (
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
              {loading && paginatedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                      Loading invoices...
                    </div>
                  </td>
                </tr>
              ) : paginatedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    No invoices found
                  </td>
                </tr>
              ) : (
                paginatedInvoices.map((invoice) => {
                  const status = getPaymentStatus(invoice);
                  const outstanding = (invoice.totalAmount || 0) - (invoice.paidAmount || 0);
                  return (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {invoice.invoiceNumber || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {invoice.jobNumber || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {invoice.customerName || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {formatCurrency(invoice.totalAmount || 0)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {formatCurrency(invoice.paidAmount || 0)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                          {status === 'partial' ? 'Partial' : status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {formatDate(invoice.dueDate)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          {status !== 'paid' && outstanding > 0 && (
                            <button
                              onClick={() => openPaymentModal(invoice)}
                              className="text-green-600 hover:text-green-900"
                            >
                              Record Payment
                            </button>
                          )}
                          {onInvoiceClick && (
                            <button
                              onClick={() => onInvoiceClick(invoice)}
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
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredInvoices.length)} of {filteredInvoices.length} invoices
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

      {/* Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Record Payment</h3>

            <div className="space-y-4 mb-6">
              <div>
                <div className="text-sm text-gray-600">Invoice: {selectedInvoice.invoiceNumber}</div>
                <div className="text-sm text-gray-600">
                  Outstanding: {formatCurrency((selectedInvoice.totalAmount || 0) - (selectedInvoice.paidAmount || 0))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method *
                </label>
                <select
                  value={paymentForm.paymentMethod}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="credit_card">Credit Card</option>
                  <option value="debit_card">Debit Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="check">Check</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Date *
                </label>
                <input
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, paymentDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, reference: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Transaction ID, Check #, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Additional payment notes..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedInvoice(null);
                }}
                disabled={recording}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={recording || paymentForm.amount <= 0}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {recording ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    Recording...
                  </>
                ) : (
                  'Record Payment'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
