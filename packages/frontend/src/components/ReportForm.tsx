import React, { useState } from 'react';
import { saveReport } from '../services/api';
import { ClaudeService } from '../services/claudeService';
import { getStoredApiKey } from './ApiKeyManager';
import { DamageType, AustralianState, GenerateReportRequest } from '../types';

interface Props {
  onReportGenerated: () => void;
}

export function ReportForm({ onReportGenerated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<GenerateReportRequest>({
    propertyAddress: '',
    damageType: 'water',
    damageDescription: '',
    state: 'NSW',
    clientName: '',
    insuranceCompany: '',
    claimNumber: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Get API key from localStorage
      const apiKey = getStoredApiKey();
      if (!apiKey) {
        throw new Error('Please set your Anthropic API key first');
      }

      // Generate report using Claude API directly
      const claudeService = new ClaudeService(apiKey);
      const report = await claudeService.generateReport(formData);

      // Save report to localStorage
      saveReport(report);
      onReportGenerated();

      // Reset form
      setFormData({
        propertyAddress: '',
        damageType: 'water',
        damageDescription: '',
        state: 'NSW',
        clientName: '',
        insuranceCompany: '',
        claimNumber: ''
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">Generate Damage Report</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Property Address *</label>
          <input
            type="text"
            required
            value={formData.propertyAddress}
            onChange={(e) => setFormData({ ...formData, propertyAddress: e.target.value })}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="123 Main St, Sydney NSW 2000"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Damage Type *</label>
            <select
              required
              value={formData.damageType}
              onChange={(e) => setFormData({ ...formData, damageType: e.target.value as DamageType })}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="water">Water Damage</option>
              <option value="fire">Fire Damage</option>
              <option value="storm">Storm Damage</option>
              <option value="flood">Flood Damage</option>
              <option value="mold">Mold Damage</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">State *</label>
            <select
              required
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value as AustralianState })}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="NSW">NSW</option>
              <option value="VIC">VIC</option>
              <option value="QLD">QLD</option>
              <option value="WA">WA</option>
              <option value="SA">SA</option>
              <option value="TAS">TAS</option>
              <option value="ACT">ACT</option>
              <option value="NT">NT</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Damage Description *</label>
          <textarea
            required
            value={formData.damageDescription}
            onChange={(e) => setFormData({ ...formData, damageDescription: e.target.value })}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            rows={4}
            placeholder="Describe the damage in detail..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Client Name (Optional)</label>
          <input
            type="text"
            value={formData.clientName}
            onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Insurance Company</label>
            <input
              type="text"
              value={formData.insuranceCompany}
              onChange={(e) => setFormData({ ...formData, insuranceCompany: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Claim Number</label>
            <input
              type="text"
              value={formData.claimNumber}
              onChange={(e) => setFormData({ ...formData, claimNumber: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Generating Report...' : 'Generate Report'}
        </button>
      </form>
    </div>
  );
}
