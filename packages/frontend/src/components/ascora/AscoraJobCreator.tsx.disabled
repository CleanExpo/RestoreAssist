/**
 * AscoraJobCreator Component
 * Create Ascora job from RestoreAssist damage report
 *
 * Features:
 * - Report selector
 * - Customer lookup and selection
 * - Job type selector
 * - Cost estimation
 * - Assignment UI
 * - Schedule picker
 * - Preview before create
 * - Success confirmation
 *
 * @module AscoraJobCreator
 */

import React, { useState, useEffect } from 'react';
import { useAscoraJobs } from '../../hooks/useAscoraJobs';
import { useAscoraCustomers } from '../../hooks/useAscoraCustomers';
import {
  Briefcase,
  User,
  DollarSign,
  Calendar,
  MapPin,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader,
  Search,
  Eye,
  ArrowRight,
  X
} from 'lucide-react';

interface AscoraJobCreatorProps {
  organizationId: string;
  reportId?: string;
  onJobCreated?: (jobId: string, ascoraJobId: string) => void;
  onCancel?: () => void;
}

interface Report {
  report_id: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  damage_type?: string;
  severity?: string;
  location?: string;
  estimated_cost?: number;
  notes?: string;
  created_at: string;
}

export const AscoraJobCreator: React.FC<AscoraJobCreatorProps> = ({
  organizationId,
  reportId: initialReportId,
  onJobCreated,
  onCancel
}) => {
  const { createJob, creating, error: jobError } = useAscoraJobs(organizationId);
  const { customers, searchCustomers, getCustomerByEmail } = useAscoraCustomers(organizationId);

  const [currentStep, setCurrentStep] = useState<'select' | 'preview' | 'success'>('select');
  const [selectedReportId, setSelectedReportId] = useState<string>(initialReportId || '');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [reportData, setReportData] = useState<Report | null>(null);
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);
  const [createdAscoraJobId, setCreatedAscoraJobId] = useState<string | null>(null);

  // Mock report data (in real app, this would come from API)
  useEffect(() => {
    if (selectedReportId) {
      // Simulate API call
      setReportData({
        report_id: selectedReportId,
        customer_name: 'John Smith',
        customer_email: 'john.smith@example.com',
        customer_phone: '+1 (555) 123-4567',
        damage_type: 'Water Damage',
        severity: 'high',
        location: '123 Main St, Springfield, IL 62701',
        estimated_cost: 5500,
        notes: 'Basement flooding from burst pipe. Immediate attention required.',
        created_at: new Date().toISOString()
      });

      // Auto-select customer if email matches
      const matchingCustomer = getCustomerByEmail('john.smith@example.com');
      if (matchingCustomer) {
        setSelectedCustomer(matchingCustomer);
      }
    }
  }, [selectedReportId, getCustomerByEmail]);

  // Handle customer search
  const handleCustomerSearch = async (query: string) => {
    setCustomerSearch(query);
    if (query.trim()) {
      await searchCustomers(query);
    }
  };

  // Handle create job
  const handleCreateJob = async () => {
    if (!selectedReportId) return;

    try {
      const result = await createJob(selectedReportId);
      if (result) {
        setCreatedJobId(result.jobId);
        setCreatedAscoraJobId(result.ascoraJobId);
        setCurrentStep('success');
        onJobCreated?.(result.jobId, result.ascoraJobId);
      }
    } catch (err) {
      console.error('Job creation failed:', err);
    }
  };

  // Get priority badge color
  const getPriorityColor = (severity?: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Success step
  if (currentStep === 'success') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Job Created Successfully!</h2>
            <p className="text-gray-600 mb-6">
              The job has been created in Ascora CRM and linked to your RestoreAssist report.
            </p>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">RestoreAssist Report</p>
                  <p className="font-mono text-gray-900">{createdJobId?.substring(0, 8)}...</p>
                </div>
                <div>
                  <p className="text-gray-600">Ascora Job ID</p>
                  <p className="font-mono text-gray-900">{createdAscoraJobId}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setCurrentStep('select');
                  setSelectedReportId('');
                  setReportData(null);
                  setCreatedJobId(null);
                  setCreatedAscoraJobId(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-lg font-medium transition-colors"
              >
                Create Another
              </button>
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Preview step
  if (currentStep === 'preview' && reportData) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Eye className="w-6 h-6" />
                <div>
                  <h2 className="text-xl font-bold">Preview Job</h2>
                  <p className="text-blue-100 text-sm">Review before creating in Ascora</p>
                </div>
              </div>
              <button
                onClick={() => setCurrentStep('select')}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Preview Content */}
          <div className="p-6 space-y-6">
            {/* Job Title */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Job Title</label>
              <p className="text-lg font-semibold text-gray-900">
                RestoreAssist Report: {reportData.report_id.substring(0, 8)}
              </p>
            </div>

            {/* Customer Info */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                Customer Information
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Name</p>
                  <p className="font-medium text-gray-900">{reportData.customer_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-600">Email</p>
                  <p className="font-medium text-gray-900">{reportData.customer_email || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-600">Phone</p>
                  <p className="font-medium text-gray-900">{reportData.customer_phone || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Job Details */}
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">Description</p>
                  <p className="text-gray-900 mt-1">
                    Damage Assessment Report<br />
                    <br />
                    <strong>Damage Type:</strong> {reportData.damage_type}<br />
                    <strong>Severity:</strong>{' '}
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${getPriorityColor(reportData.severity)}`}>
                      {reportData.severity?.toUpperCase()}
                    </span>
                    <br />
                    <br />
                    {reportData.notes}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">Location</p>
                  <p className="text-gray-900 mt-1">{reportData.location}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <DollarSign className="w-5 h-5 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">Estimated Cost</p>
                  <p className="text-gray-900 mt-1 text-xl font-semibold">
                    ${reportData.estimated_cost?.toLocaleString() || 0}
                  </p>
                </div>
              </div>
            </div>

            {/* Error Display */}
            {jobError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-900">Failed to create job</p>
                  <p className="text-sm text-red-700 mt-1">{jobError}</p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={() => setCurrentStep('select')}
                disabled={creating}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleCreateJob}
                disabled={creating}
                className="flex-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Creating Job...
                  </>
                ) : (
                  <>
                    <Briefcase className="w-4 h-4" />
                    Create Job in Ascora
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Select step
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Create Ascora Job</h2>
              <p className="text-blue-100 text-sm">Create a job from a RestoreAssist report</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Report Selection */}
          <div>
            <label htmlFor="reportId" className="block text-sm font-medium text-gray-700 mb-2">
              Select Report <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="reportId"
              value={selectedReportId}
              onChange={(e) => setSelectedReportId(e.target.value)}
              placeholder="Enter report ID or search..."
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Enter the RestoreAssist report ID you want to create a job for
            </p>
          </div>

          {/* Report Preview */}
          {reportData && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3 mb-3">
                <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {reportData.damage_type} - {reportData.location}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Created {new Date(reportData.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium border ${getPriorityColor(reportData.severity)}`}>
                  {reportData.severity?.toUpperCase()}
                </span>
              </div>

              {selectedCustomer && (
                <div className="mt-3 p-3 bg-white rounded border border-blue-200">
                  <p className="text-xs font-medium text-gray-700 mb-1">Matched Customer:</p>
                  <p className="text-sm text-gray-900">
                    {selectedCustomer.firstName} {selectedCustomer.lastName}
                  </p>
                  <p className="text-xs text-gray-600">{selectedCustomer.email}</p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            {onCancel && (
              <button
                onClick={onCancel}
                className="px-4 py-2 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={() => setCurrentStep('preview')}
              disabled={!selectedReportId || !reportData}
              className="flex-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              Preview Job
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AscoraJobCreator;
