import React, { useEffect, useState } from 'react';
import { getReports, deleteReport } from '../services/api';
import { GeneratedReport } from '../types';

export function GeneratedReports() {
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<GeneratedReport | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = () => {
    try {
      const data = getReports();
      setReports(data.reports);
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (reportId: string) => {
    if (!confirm('Are you sure you want to delete this report?')) return;

    try {
      deleteReport(reportId);
      setReports(reports.filter(r => r.reportId !== reportId));
      if (selectedReport?.reportId === reportId) {
        setSelectedReport(null);
      }
    } catch (error) {
      console.error('Failed to delete report:', error);
    }
  };

  if (loading) {
    return <div className="bg-white p-6 rounded-lg shadow-md">Loading reports...</div>;
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">Generated Reports ({reports.length})</h2>

      {reports.length === 0 ? (
        <p className="text-gray-500">No reports generated yet.</p>
      ) : (
        <div className="space-y-4">
          {reports.map(report => (
            <div key={report.reportId} className="border rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold">{report.propertyAddress}</h3>
                  <p className="text-sm text-gray-600">
                    {report.damageType.toUpperCase()} • {report.state} • ${report.totalCost.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">
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
                    <p className="text-sm text-gray-700">{report.summary}</p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Scope of Work</h4>
                    <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
                      {report.scopeOfWork.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ol>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Itemized Estimate</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-1 text-left">Description</th>
                            <th className="px-2 py-1 text-right">Qty</th>
                            <th className="px-2 py-1 text-right">Unit Cost</th>
                            <th className="px-2 py-1 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.itemizedEstimate.map((item, idx) => (
                            <tr key={idx} className="border-t">
                              <td className="px-2 py-1">{item.description}</td>
                              <td className="px-2 py-1 text-right">{item.quantity}</td>
                              <td className="px-2 py-1 text-right">${item.unitCost.toFixed(2)}</td>
                              <td className="px-2 py-1 text-right">${item.totalCost.toFixed(2)}</td>
                            </tr>
                          ))}
                          <tr className="border-t font-bold">
                            <td colSpan={3} className="px-2 py-1 text-right">Total:</td>
                            <td className="px-2 py-1 text-right">${report.totalCost.toFixed(2)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Compliance Notes</h4>
                    <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                      {report.complianceNotes.map((note, idx) => (
                        <li key={idx}>{note}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Authority to Proceed</h4>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{report.authorityToProceed}</p>
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
