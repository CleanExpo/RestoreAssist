import React, { useEffect, useState } from 'react';
import { getReports, deleteReport } from '../services/api';
import { GeneratedReport } from '../types';

export function GeneratedReports() {
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<GeneratedReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setError(null);
    try {
      // Development mode: Check if we should use mock data
      const isDevelopment = !import.meta.env.PROD && window.location.hostname.includes('localhost');
      const useMockMode = isDevelopment && localStorage.getItem('accessToken')?.startsWith('dev-access-token');

      if (useMockMode) {
        // Load mock reports from localStorage
        if (process.env.NODE_ENV === 'development') {
          console.log('🎭 DEV MODE: Loading mock reports from localStorage');
        }
        const mockReports = JSON.parse(localStorage.getItem('mock_reports') || '[]');
        setReports(mockReports);
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ DEV MODE: Loaded ${mockReports.length} mock reports`);
        }
      } else {
        // Production mode: Load from backend API
        const data = await getReports();
        setReports(data.reports || []);
      }
    } catch (error) {
      console.error('Failed to load reports:', error);
      setError(error instanceof Error ? error.message : 'Failed to load reports');
      setReports([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (reportId: string) => {
    if (!confirm('Are you sure you want to delete this report?')) return;

    try {
      setError(null);
      // Development mode: Check if we should use mock data
      const isDevelopment = !import.meta.env.PROD && window.location.hostname.includes('localhost');
      const useMockMode = isDevelopment && localStorage.getItem('accessToken')?.startsWith('dev-access-token');

      if (useMockMode) {
        // Delete from localStorage
        if (process.env.NODE_ENV === 'development') {
          console.log('🎭 DEV MODE: Deleting mock report from localStorage');
        }
        const mockReports = JSON.parse(localStorage.getItem('mock_reports') || '[]');
        const updatedReports = mockReports.filter((r: GeneratedReport) => r.reportId !== reportId);
        localStorage.setItem('mock_reports', JSON.stringify(updatedReports));
        setReports(updatedReports);
        if (process.env.NODE_ENV === 'development') {
          console.log('✅ DEV MODE: Mock report deleted successfully');
        }
      } else {
        // Production mode: Delete via backend API
        await deleteReport(reportId);
        setReports(reports.filter(r => r.reportId !== reportId));
      }

      if (selectedReport?.reportId === reportId) {
        setSelectedReport(null);
      }
    } catch (error) {
      console.error('Failed to delete report:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete report');
    }
  };

  if (loading) {
    return (
      <div className="bg-card text-card-foreground p-6 rounded-lg shadow-md border border-border">
        <div className="flex items-center justify-center gap-3">
          <svg className="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Loading reports...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card text-card-foreground p-6 rounded-lg shadow-md border border-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Generated Reports ({reports.length})</h2>
        {error && (
          <button
            onClick={loadReports}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Retry
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="font-medium">Error loading reports</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {reports.length === 0 && !error ? (
        <p className="text-muted-foreground">No reports generated yet.</p>
      ) : (
        <div className="space-y-4">
          {reports.map(report => (
            <div key={report.reportId} className="border border-border bg-card rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold">{report.propertyAddress}</h3>
                  <p className="text-sm text-muted-foreground">
                    {report.damageType.toUpperCase()} • {report.state} • ${report.totalCost.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(report.timestamp).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedReport(selectedReport?.reportId === report.reportId ? null : report)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    {selectedReport?.reportId === report.reportId ? 'Hide' : 'View'}
                  </button>
                  <button
                    onClick={() => handleDelete(report.reportId)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {selectedReport?.reportId === report.reportId && (
                <div className="mt-4 pt-4 border-t space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Summary</h4>
                    <p className="text-sm text-foreground">{report.summary}</p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Scope of Work</h4>
                    <ol className="list-decimal list-inside text-sm text-foreground space-y-1">
                      {report.scopeOfWork.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ol>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Itemized Estimate</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-2 py-1 text-left">Description</th>
                            <th className="px-2 py-1 text-right">Qty</th>
                            <th className="px-2 py-1 text-right">Unit Cost</th>
                            <th className="px-2 py-1 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.itemizedEstimate.map((item, idx) => (
                            <tr key={idx} className="border-t border-border">
                              <td className="px-2 py-1">{item.description}</td>
                              <td className="px-2 py-1 text-right">{item.quantity}</td>
                              <td className="px-2 py-1 text-right">${item.unitCost.toFixed(2)}</td>
                              <td className="px-2 py-1 text-right">${item.totalCost.toFixed(2)}</td>
                            </tr>
                          ))}
                          {report.subtotal !== undefined && report.gst !== undefined ? (
                            <>
                              <tr className="border-t border-border">
                                <td colSpan={3} className="px-2 py-1 text-right font-semibold">Subtotal (ex GST):</td>
                                <td className="px-2 py-1 text-right font-semibold">${report.subtotal.toFixed(2)}</td>
                              </tr>
                              <tr className="border-t border-border">
                                <td colSpan={3} className="px-2 py-1 text-right">GST (10%):</td>
                                <td className="px-2 py-1 text-right">${report.gst.toFixed(2)}</td>
                              </tr>
                              <tr className="border-t-2 border-border bg-muted">
                                <td colSpan={3} className="px-2 py-1 text-right font-bold">Total (inc GST):</td>
                                <td className="px-2 py-1 text-right font-bold">${report.totalCost.toFixed(2)}</td>
                              </tr>
                            </>
                          ) : (
                            <tr className="border-t border-border font-bold">
                              <td colSpan={3} className="px-2 py-1 text-right">Total:</td>
                              <td className="px-2 py-1 text-right">${report.totalCost.toFixed(2)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {report.paymentTerms && (
                    <div>
                      <h4 className="font-semibold mb-2">Payment Terms</h4>
                      <div className="bg-muted p-3 rounded-md text-sm space-y-3">
                        <div>
                          <p className="font-semibold text-foreground mb-2">Payment Schedule:</p>
                          <div className="space-y-1">
                            {report.paymentTerms.paymentSchedule.map((milestone, idx) => (
                              <div key={idx} className="flex justify-between text-muted-foreground">
                                <span>{milestone.milestone}</span>
                                <span className="font-medium">{milestone.percentage}% - ${milestone.amount.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="border-t border-border pt-2">
                          <p className="font-semibold text-foreground mb-1">Terms & Conditions:</p>
                          <ul className="list-disc list-inside text-muted-foreground space-y-0.5 text-xs">
                            {report.paymentTerms.terms.map((term, idx) => (
                              <li key={idx}>{term}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="font-semibold mb-2">Compliance Notes</h4>
                    <ul className="list-disc list-inside text-sm text-foreground space-y-1">
                      {report.complianceNotes.map((note, idx) => (
                        <li key={idx}>{note}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Authority to Proceed</h4>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{report.authorityToProceed}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
