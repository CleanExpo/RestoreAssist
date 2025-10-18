import { GeneratedReport } from '../types';

// In-memory storage for reports (client-side only)
const reports: GeneratedReport[] = [];

export function saveReport(report: GeneratedReport): void {
  reports.push(report);
  // Also save to localStorage for persistence
  localStorage.setItem('restoreassist_reports', JSON.stringify(reports));
}

export function getReports(): { reports: GeneratedReport[]; count: number } {
  // Try to load from localStorage first
  const stored = localStorage.getItem('restoreassist_reports');
  if (stored) {
    try {
      const parsedReports = JSON.parse(stored);
      reports.length = 0;
      reports.push(...parsedReports);
    } catch (e) {
      console.error('Failed to parse stored reports:', e);
    }
  }

  return {
    reports: [...reports],
    count: reports.length
  };
}

export function getReport(reportId: string): GeneratedReport | null {
  return reports.find(r => r.reportId === reportId) || null;
}

export function deleteReport(reportId: string): boolean {
  const index = reports.findIndex(r => r.reportId === reportId);
  if (index >= 0) {
    reports.splice(index, 1);
    localStorage.setItem('restoreassist_reports', JSON.stringify(reports));
    return true;
  }
  return false;
}
