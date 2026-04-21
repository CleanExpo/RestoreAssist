// RA-1201 — shared Client type extracted from app/dashboard/clients/page.tsx
// so the extracted modal components can import without pulling the whole page.

export interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  company?: string;
  contactPerson?: string;
  notes?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  totalRevenue: number;
  lastJob: string;
  reportsCount: number;
  // RA-1204 — surfaced for the Client Name cell preview: relative "last
  // report" line + "N open" / "No open jobs" badge. Optional so older
  // rows (e.g. report-derived clients) degrade gracefully.
  lastReportAt?: string | null;
  openJobCount?: number;
}

export type ClientWithReportFlag = Client & { _isFromReport?: boolean };
