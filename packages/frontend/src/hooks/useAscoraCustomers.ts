/**
 * useAscoraCustomers Hook
 * Customer management and syncing for Ascora CRM
 *
 * Features:
 * - List and search customers
 * - Create and update customers
 * - Link to RestoreAssist contacts
 * - Sync operations
 *
 * @module useAscoraCustomers
 */

import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';

// ===== Type Definitions =====

export interface AscoraCustomer {
  id: string;
  ascoraCustomerId: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  streetAddress?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  country?: string;
  customerType?: string;
  billingAddress?: string;
  taxId?: string;
  notes?: string;
  customFields?: Record<string, any>;
  syncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerFilters {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateCustomerRequest {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  streetAddress?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

export interface UpdateCustomerRequest extends Partial<CreateCustomerRequest> {}

// ===== Main Hook =====

export function useAscoraCustomers(organizationId: string) {
  const [customers, setCustomers] = useState<AscoraCustomer[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [updating, setUpdating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [currentFilters, setCurrentFilters] = useState<CustomerFilters>({
    limit: 50,
    offset: 0
  });

  // ===== Fetch Customers =====

  const fetchCustomers = useCallback(
    async (filters: CustomerFilters = {}) => {
      if (!organizationId) return;

      setLoading(true);
      setError(null);

      try {
        const params = {
          ...currentFilters,
          ...filters
        };

        const response = await axios.get(
          `/api/organizations/${organizationId}/ascora/customers`,
          { params }
        );

        if (response.data.success) {
          setCustomers(response.data.data.customers);
          setTotal(response.data.data.total);
          setCurrentFilters(params);
        } else {
          throw new Error(response.data.message || 'Failed to fetch customers');
        }
      } catch (err: any) {
        console.error('[useAscoraCustomers] Fetch failed:', err);
        setError(err.response?.data?.message || 'Failed to fetch customers');
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    },
    [organizationId, currentFilters]
  );

  // ===== Get Single Customer =====

  const getCustomer = useCallback(
    async (customerId: string): Promise<AscoraCustomer | null> => {
      setError(null);

      try {
        const response = await axios.get(
          `/api/organizations/${organizationId}/ascora/customers/${customerId}`
        );

        if (response.data.success) {
          return response.data.data;
        } else {
          throw new Error(response.data.message || 'Customer not found');
        }
      } catch (err: any) {
        console.error('[useAscoraCustomers] Get customer failed:', err);
        setError(err.response?.data?.message || 'Failed to get customer');
        return null;
      }
    },
    [organizationId]
  );

  // ===== Create Customer =====

  const createCustomer = useCallback(
    async (customerData: CreateCustomerRequest): Promise<AscoraCustomer | null> => {
      setCreating(true);
      setError(null);

      try {
        const response = await axios.post(
          `/api/organizations/${organizationId}/ascora/customers`,
          customerData
        );

        if (response.data.success) {
          // Refresh customer list
          await fetchCustomers();
          return response.data.data;
        } else {
          throw new Error(response.data.message || 'Failed to create customer');
        }
      } catch (err: any) {
        console.error('[useAscoraCustomers] Create failed:', err);
        const errorMessage = err.response?.data?.message || 'Failed to create customer';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setCreating(false);
      }
    },
    [organizationId, fetchCustomers]
  );

  // ===== Update Customer =====

  const updateCustomer = useCallback(
    async (customerId: string, updates: UpdateCustomerRequest): Promise<void> => {
      setUpdating(true);
      setError(null);

      try {
        const response = await axios.put(
          `/api/organizations/${organizationId}/ascora/customers/${customerId}`,
          updates
        );

        if (response.data.success) {
          // Update local state
          setCustomers(prev =>
            prev.map(customer =>
              customer.ascoraCustomerId === customerId
                ? { ...customer, ...updates, updatedAt: new Date().toISOString() }
                : customer
            )
          );
        } else {
          throw new Error(response.data.message || 'Failed to update customer');
        }
      } catch (err: any) {
        console.error('[useAscoraCustomers] Update failed:', err);
        const errorMessage = err.response?.data?.message || 'Failed to update customer';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setUpdating(false);
      }
    },
    [organizationId]
  );

  // ===== Search Customers =====

  const searchCustomers = useCallback(
    async (query: string): Promise<void> => {
      await fetchCustomers({ search: query, offset: 0 });
    },
    [fetchCustomers]
  );

  // ===== Local Search (in-memory) =====

  const filterCustomersLocal = useCallback(
    (query: string): AscoraCustomer[] => {
      if (!query.trim()) return customers;

      const lowerQuery = query.toLowerCase();
      return customers.filter(
        customer =>
          customer.firstName?.toLowerCase().includes(lowerQuery) ||
          customer.lastName?.toLowerCase().includes(lowerQuery) ||
          customer.companyName?.toLowerCase().includes(lowerQuery) ||
          customer.email?.toLowerCase().includes(lowerQuery) ||
          customer.phone?.includes(query) ||
          customer.mobile?.includes(query)
      );
    },
    [customers]
  );

  // ===== Get Customer by Email =====

  const getCustomerByEmail = useCallback(
    (email: string): AscoraCustomer | null => {
      return customers.find(c => c.email === email) || null;
    },
    [customers]
  );

  // ===== Get Customer by Phone =====

  const getCustomerByPhone = useCallback(
    (phone: string): AscoraCustomer | null => {
      return customers.find(c => c.phone === phone || c.mobile === phone) || null;
    },
    [customers]
  );

  // ===== Get Customers by Type =====

  const getCustomersByType = useCallback(
    (type: string): AscoraCustomer[] => {
      return customers.filter(c => c.customerType === type);
    },
    [customers]
  );

  // ===== Get Customer Statistics =====

  const getStatistics = useCallback((): {
    total: number;
    withEmail: number;
    withPhone: number;
    byType: Record<string, number>;
    recentlyAdded: AscoraCustomer[];
  } => {
    const byType: Record<string, number> = {};
    let withEmail = 0;
    let withPhone = 0;

    customers.forEach(customer => {
      if (customer.email) withEmail++;
      if (customer.phone || customer.mobile) withPhone++;
      if (customer.customerType) {
        byType[customer.customerType] = (byType[customer.customerType] || 0) + 1;
      }
    });

    // Get recently added (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentlyAdded = customers
      .filter(c => new Date(c.createdAt) > thirtyDaysAgo)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    return {
      total: customers.length,
      withEmail,
      withPhone,
      byType,
      recentlyAdded
    };
  }, [customers]);

  // ===== Validate Customer Data =====

  const validateCustomerData = useCallback(
    (data: CreateCustomerRequest | UpdateCustomerRequest): {
      valid: boolean;
      errors: string[];
    } => {
      const errors: string[] = [];

      // Check if at least one name or company name is provided
      if (!data.firstName && !data.lastName && !data.companyName) {
        errors.push('At least one of first name, last name, or company name is required');
      }

      // Validate email format
      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.push('Invalid email format');
      }

      // Validate phone format (basic check)
      if (data.phone && data.phone.length < 8) {
        errors.push('Phone number must be at least 8 digits');
      }

      return {
        valid: errors.length === 0,
        errors
      };
    },
    []
  );

  // ===== Format Customer Name =====

  const formatCustomerName = useCallback((customer: AscoraCustomer): string => {
    if (customer.companyName) return customer.companyName;
    if (customer.firstName && customer.lastName) {
      return `${customer.firstName} ${customer.lastName}`;
    }
    if (customer.firstName) return customer.firstName;
    if (customer.lastName) return customer.lastName;
    return 'Unknown Customer';
  }, []);

  // ===== Format Customer Address =====

  const formatCustomerAddress = useCallback((customer: AscoraCustomer): string => {
    const parts = [
      customer.streetAddress,
      customer.suburb,
      customer.state,
      customer.postcode,
      customer.country
    ].filter(Boolean);

    return parts.join(', ') || 'No address';
  }, []);

  // ===== Pagination =====

  const loadMore = useCallback(async (): Promise<void> => {
    await fetchCustomers({
      ...currentFilters,
      offset: (currentFilters.offset || 0) + (currentFilters.limit || 50)
    });
  }, [fetchCustomers, currentFilters]);

  const hasMore = useCallback((): boolean => {
    return customers.length < total;
  }, [customers.length, total]);

  // ===== Refresh =====

  const refresh = useCallback(async (): Promise<void> => {
    await fetchCustomers(currentFilters);
  }, [fetchCustomers, currentFilters]);

  // ===== Clear Error =====

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ===== Initial Load =====

  useEffect(() => {
    fetchCustomers();
  }, [organizationId]); // Only run on mount/org change

  // ===== Return Hook Interface =====

  return {
    // State
    customers,
    loading,
    creating,
    updating,
    error,
    total,
    currentFilters,

    // Actions
    createCustomer,
    getCustomer,
    updateCustomer,
    searchCustomers,
    refresh,
    clearError,

    // Utilities
    filterCustomersLocal,
    getCustomerByEmail,
    getCustomerByPhone,
    getCustomersByType,
    getStatistics,
    validateCustomerData,
    formatCustomerName,
    formatCustomerAddress,

    // Pagination
    loadMore,
    hasMore: hasMore()
  };
}

export default useAscoraCustomers;
