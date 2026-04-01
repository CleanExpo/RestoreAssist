import type { Inspection } from '@/shared/types';

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
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error((body as { error?: string }).error ?? `API error ${res.status}: ${path}`);
    (err as any).status = res.status;
    (err as any).body = body;
    throw err;
  }
  return res.json() as Promise<T>;
}

async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
    // No Content-Type header — browser/RN sets multipart boundary automatically
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error((body as { error?: string }).error ?? `Upload error ${res.status}: ${path}`);
    (err as any).status = res.status;
    (err as any).body = body;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const api = {
  inspections: {
    list: () =>
      apiFetch<{ inspections: Inspection[] }>('/api/inspections'),

    get: (id: string) =>
      apiFetch<{ inspection: Inspection }>(`/api/inspections/${id}`),

    create: (data: {
      propertyAddress: string;
      propertyPostcode: string;
      technicianName?: string;
    }) =>
      apiFetch<{ inspection: Inspection }>('/api/inspections', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    saveEnvironmental: (id: string, data: {
      ambientTemperature: number;
      humidityLevel: number;
      dewPoint?: number;
      airCirculation?: boolean;
      weatherConditions?: string;
      notes?: string;
    }) =>
      apiFetch<{ environmentalData: any }>(`/api/inspections/${id}/environmental`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    addMoistureReading: (id: string, data: {
      location: string;
      surfaceType: string;
      moistureLevel: number;
      depth: string;
      notes?: string;
    }) =>
      apiFetch<{ moistureReading: any }>(`/api/inspections/${id}/moisture`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    addAffectedArea: (id: string, data: {
      roomZoneId: string;
      affectedSquareFootage: number;
      waterSource: string;
      timeSinceLoss?: number;
    }) =>
      apiFetch<{ affectedArea: any }>(`/api/inspections/${id}/affected-areas`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    uploadPhoto: (id: string, formData: FormData) =>
      apiUpload<{ photo: any }>(`/api/inspections/${id}/photos`, formData),

    submit: (id: string) =>
      apiFetch<{
        message: string;
        inspectionId: string;
        status: string;
        missingSupplementary?: Array<{ field: string; label: string; clauseRef: string }>;
        warnings?: string[];
      }>(`/api/inspections/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
  },

  reports: {
    list: () =>
      apiFetch<{ reports: import('@/shared/types').Report[] }>('/api/reports'),

    get: (id: string) =>
      apiFetch<{ report: import('@/shared/types').Report }>(`/api/reports/${id}`),
  },
};
