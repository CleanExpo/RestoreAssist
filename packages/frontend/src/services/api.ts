import { GeneratedReport, GenerateReportRequest } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Auth token storage
let accessToken: string | null = localStorage.getItem('access_token');

export function setAuthTokens(access: string, refresh: string) {
  accessToken = access;
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
}

export function clearAuthTokens() {
  accessToken = null;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function isAuthenticated(): boolean {
  return accessToken !== null;
}

// Auth API
export async function login(email: string, password: string): Promise<{
  user: { userId: string; email: string; name: string; role: string };
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
}> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error('Login failed');
  }

  const data = await response.json();
  setAuthTokens(data.tokens.accessToken, data.tokens.refreshToken);
  return data;
}

export async function logout(): Promise<void> {
  if (!accessToken) return;

  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
  } finally {
    clearAuthTokens();
  }
}

// Reports API
export async function generateReport(request: GenerateReportRequest): Promise<GeneratedReport> {
  if (!accessToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to generate report');
  }

  return response.json();
}

export async function getReports(options?: {
  page?: number;
  limit?: number;
  sortBy?: 'timestamp' | 'totalCost';
  order?: 'asc' | 'desc';
}): Promise<{ reports: GeneratedReport[]; total: number; page: number; totalPages: number }> {
  if (!accessToken) throw new Error('Not authenticated');

  const params = new URLSearchParams();
  if (options?.page) params.set('page', options.page.toString());
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.sortBy) params.set('sortBy', options.sortBy);
  if (options?.order) params.set('order', options.order);

  const response = await fetch(`${API_BASE_URL}/reports?${params}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch reports');
  }

  return response.json();
}

export async function getReport(reportId: string): Promise<GeneratedReport> {
  if (!accessToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/reports/${reportId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch report');
  }

  return response.json();
}

export async function deleteReport(reportId: string): Promise<boolean> {
  if (!accessToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/reports/${reportId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return false;
  }

  return true;
}

export async function exportReport(reportId: string, format: 'pdf' | 'docx'): Promise<Blob> {
  if (!accessToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/reports/${reportId}/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ format }),
  });

  if (!response.ok) {
    throw new Error('Failed to export report');
  }

  return response.blob();
}

// Stats API
export async function getStats(): Promise<{
  totalReports: number;
  totalValue: number;
  averageValue: number;
  byDamageType: Record<string, number>;
  byState: Record<string, number>;
  recentReports: number;
}> {
  if (!accessToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/reports/stats`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch stats');
  }

  return response.json();
}
