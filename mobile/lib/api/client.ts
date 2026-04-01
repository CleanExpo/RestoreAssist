const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://restoreassist.com.au';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  inspections: {
    list: () => apiFetch<{ inspections: import('@/shared/types').Inspection[] }>('/api/inspections'),
    get: (id: string) => apiFetch<{ inspection: import('@/shared/types').Inspection }>(`/api/inspections/${id}`),
  },
  reports: {
    list: () => apiFetch<{ reports: import('@/shared/types').Report[] }>('/api/reports'),
    get: (id: string) => apiFetch<{ report: import('@/shared/types').Report }>(`/api/reports/${id}`),
  },
};
