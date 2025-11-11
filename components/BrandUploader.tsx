"use client";

import { useState, useEffect } from "react";

interface BrandConfig {
  company_name: string;
  primary_color: string;
  accent_color: string;
  logo_url: string;
  footer_notice: string;
  updated_at?: string;
}

export default function BrandUploader() {
  const [form, setForm] = useState<BrandConfig>({
    company_name: "",
    primary_color: "#003B73",
    accent_color: "#005FA3",
    logo_url: "",
    footer_notice: ""
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load existing brand configuration on mount
  useEffect(() => {
    loadBrandConfig();
  }, []);

  const loadBrandConfig = async () => {
    try {
      const response = await fetch('/api/brand/update');
      const result = await response.json();

      if (response.ok && result.data) {
        setForm(result.data);
        setIsLoaded(true);
      }
    } catch (error) {
      console.error('Failed to load brand config:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/brand/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const result = await response.json();

      if (response.ok) {
        setMessage({
          type: 'success',
          text: 'Brand configuration updated successfully! Changes will apply to new reports.'
        });

        // Reload the config to get updated_at timestamp
        await loadBrandConfig();
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Failed to update brand configuration'
        });
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.message || 'Network error occurred'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (confirm('Reset to default branding? This will remove your custom configuration.')) {
      setForm({
        company_name: "Insert Company Name",
        primary_color: "#003B73",
        accent_color: "#005FA3",
        logo_url: "",
        footer_notice: "Generated using the RestoreAssist Template Framework. Replace this notice with your company disclaimer."
      });
    }
  };

  return (
    <div className="p-6 border rounded-lg space-y-4 max-w-2xl bg-white shadow-sm">
      <div className="border-b pb-3">
        <h2 className="text-2xl font-semibold text-gray-800">Brand Customization</h2>
        <p className="text-sm text-gray-600 mt-1">
          Configure your company branding for PDF reports. Changes apply to newly generated reports.
        </p>
        {isLoaded && form.updated_at && (
          <p className="text-xs text-gray-500 mt-2">
            Last updated: {new Date(form.updated_at).toLocaleString()}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Company Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className="border border-gray-300 rounded-md p-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., ACME Restoration Services"
            value={form.company_name}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            Your company name will appear in the report header
          </p>
        </div>

        {/* Color Pickers */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Primary Color <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                className="h-10 w-16 border border-gray-300 rounded-md cursor-pointer"
                value={form.primary_color}
                onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                required
              />
              <input
                type="text"
                className="border border-gray-300 rounded-md p-2 flex-1 font-mono text-sm"
                value={form.primary_color}
                onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                pattern="^#[A-Fa-f0-9]{6}$"
                placeholder="#003B73"
                required
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Used for headings and primary accents
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Accent Color
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                className="h-10 w-16 border border-gray-300 rounded-md cursor-pointer"
                value={form.accent_color}
                onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
              />
              <input
                type="text"
                className="border border-gray-300 rounded-md p-2 flex-1 font-mono text-sm"
                value={form.accent_color}
                onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                pattern="^#[A-Fa-f0-9]{6}$"
                placeholder="#005FA3"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Used for categories and secondary elements
            </p>
          </div>
        </div>

        {/* Logo URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Logo URL (Optional)
          </label>
          <input
            type="url"
            className="border border-gray-300 rounded-md p-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="https://example.com/logo.png"
            value={form.logo_url}
            onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">
            Direct URL to your company logo (PNG, JPG, or SVG recommended). If empty, company name will be displayed.
          </p>
        </div>

        {/* Footer Notice */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Footer Notice / Disclaimer
          </label>
          <textarea
            className="border border-gray-300 rounded-md p-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={4}
            placeholder="e.g., This report was prepared by [Company Name] and is confidential..."
            value={form.footer_notice}
            onChange={(e) => setForm({ ...form, footer_notice: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">
            Custom legal disclaimer or notice that appears at the bottom of reports
          </p>
        </div>

        {/* Color Preview */}
        <div className="border rounded-md p-4 bg-gray-50">
          <p className="text-sm font-medium text-gray-700 mb-2">Preview</p>
          <div className="flex gap-3 items-center">
            <div
              className="w-20 h-20 rounded-md border-2"
              style={{ backgroundColor: form.primary_color, borderColor: form.primary_color }}
              title="Primary Color"
            />
            <div
              className="w-20 h-20 rounded-md border-2"
              style={{ backgroundColor: form.accent_color, borderColor: form.accent_color }}
              title="Accent Color"
            />
            <div className="flex-1">
              <p className="text-sm text-gray-600">
                <span className="font-semibold" style={{ color: form.primary_color }}>
                  {form.company_name || "Your Company"}
                </span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                This is how your branding will appear in reports
              </p>
            </div>
          </div>
        </div>

        {/* Message Display */}
        {message && (
          <div
            className={`p-3 rounded-md ${
              message.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            <p className="text-sm">{message.text}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {loading ? 'Saving...' : 'Save Brand Settings'}
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="bg-gray-200 text-gray-700 px-6 py-2 rounded-md hover:bg-gray-300 transition-colors font-medium"
          >
            Reset to Default
          </button>
        </div>
      </form>

      {/* Information Notice */}
      <div className="border-t pt-4 mt-4">
        <p className="text-xs text-gray-500">
          <strong>Note:</strong> Brand settings are stored in <code className="bg-gray-100 px-1 rounded">public/config/brand.json</code>.
          Changes apply immediately to new reports but do not affect previously generated PDFs.
          For multi-tenant setups, consider implementing database-backed brand profiles.
        </p>
      </div>
    </div>
  );
}
