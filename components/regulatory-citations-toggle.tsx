/**
 * Regulatory Citations Toggle Component
 *
 * Optional UI control for clients to choose whether to include
 * regulatory citations in their forensic reports.
 *
 * Usage:
 * <RegulatoryCitations
 *   enabled={report.includeRegulatoryCitations}
 *   onChange={handleToggle}
 *   featureFlagEnabled={process.env.ENABLE_REGULATORY_CITATIONS === 'true'}
 * />
 */

'use client'

import React, { useState } from 'react'
import { Check, ChevronDown, AlertCircle, Zap } from 'lucide-react'

interface RegulatoryCitationsToggleProps {
  enabled?: boolean
  onChange?: (enabled: boolean) => void
  featureFlagEnabled?: boolean
  onGenerateReport?: () => void
}

export function RegulatoryCitationsToggle({
  enabled = false,
  onChange,
  featureFlagEnabled = true,
  onGenerateReport,
}: RegulatoryCitationsToggleProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  // Disable if feature flag is off
  const isDisabled = !featureFlagEnabled

  const handleToggle = () => {
    if (!isDisabled) {
      onChange?.(!enabled)
    }
  }

  return (
    <div className="space-y-4">
      {/* Main Toggle Card */}
      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden hover:border-blue-300 transition-colors">
        <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="flex items-center gap-3 flex-1">
            {/* Checkbox */}
            <div
              className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                enabled
                  ? 'bg-blue-600 border-blue-600'
                  : 'border-gray-300 bg-white'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                handleToggle()
              }}
            >
              {enabled && <Check size={16} className="text-white" />}
            </div>

            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Zap size={18} className="text-blue-600" />
                Include Regulatory Citations
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Add Australian building codes, electrical standards, and compliance requirements
              </p>
            </div>
          </div>

          {/* Expand Arrow */}
          <ChevronDown
            size={20}
            className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-3">
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900">What's Included:</h4>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">•</span>
                  <span><strong>Building Codes:</strong> National Construction Code (NCC 2025) + state-specific requirements</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">•</span>
                  <span><strong>Electrical Standards:</strong> AS/NZS 3000 safety requirements for water/mould damage</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">•</span>
                  <span><strong>Consumer Protection:</strong> Australian Consumer Law compliance notes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">•</span>
                  <span><strong>Insurance Requirements:</strong> General Insurance Code of Practice</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">•</span>
                  <span><strong>State-Specific Notes:</strong> Climate-aware drying times and requirements</span>
                </li>
              </ul>
            </div>

            <div className="border-t border-gray-200 pt-3 space-y-2">
              <h4 className="font-medium text-gray-900">Benefits:</h4>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold mt-0.5">✓</span>
                  <span>Increases report credibility with regulatory references</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold mt-0.5">✓</span>
                  <span>Demonstrates compliance with Australian standards</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold mt-0.5">✓</span>
                  <span>Supports insurance claims with legal citations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold mt-0.5">✓</span>
                  <span>Professional "Regulatory Compliance Summary" section in PDF</span>
                </li>
              </ul>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded p-3 flex gap-2">
              <AlertCircle size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-medium">Optional Enhancement:</p>
                <p>Can be toggled on/off for each report. IICRC standards (S500, S520) always included.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Feature Flag Disabled Warning */}
      {isDisabled && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex gap-2">
          <AlertCircle size={18} className="text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-yellow-900">Regulatory citations are currently unavailable</p>
            <p className="text-yellow-700">This feature will be enabled in an upcoming update.</p>
          </div>
        </div>
      )}

      {/* Info Link */}
      {!showInfo && (
        <button
          onClick={() => setShowInfo(true)}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
        >
          <span>ℹ️</span> Learn more about regulatory citations
        </button>
      )}

      {/* Detailed Info Section */}
      {showInfo && (
        <div className="bg-blue-50 rounded-lg p-4 space-y-3 border border-blue-200">
          <div className="flex items-start justify-between">
            <h4 className="font-semibold text-gray-900">Regulatory Citations Explained</h4>
            <button
              onClick={() => setShowInfo(false)}
              className="text-gray-500 hover:text-gray-700 text-xl"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3 text-sm text-gray-700">
            <p>
              When enabled, your forensic report will include official references to Australian regulatory standards and building codes relevant to the damage type and location.
            </p>

            <div className="space-y-2">
              <p className="font-medium text-gray-900">Example citations that appear:</p>
              <ul className="space-y-1 ml-4">
                <li>• NCC 2025 Section 3.2.1 – Moisture management requirements</li>
                <li>• QDC 4.5 Section 3.2 – Queensland-specific drying standards (5-14 days)</li>
                <li>• AS/NZS 3000:2023 Section 2.4 – Electrical safety after water damage</li>
                <li>• Australian Consumer Law Schedule 2 – Consumer guarantees</li>
              </ul>
            </div>

            <p className="text-gray-600 italic">
              These citations are automatically selected based on the damage type, location, and materials involved. They help establish that your restoration work meets or exceeds regulatory requirements.
            </p>

            <div className="bg-white rounded p-3 border border-blue-200">
              <p className="font-medium text-gray-900 mb-2">Why Include Them?</p>
              <ul className="space-y-1 text-gray-700">
                <li>• Strengthens claim documentation for insurers</li>
                <li>• Demonstrates professional compliance standards</li>
                <li>• Adds authority and credibility to your report</li>
                <li>• Helps clients understand regulatory obligations</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Simplified toggle for quick access in report summary
 *
 * Usage: <RegulatoryQuickToggle checked={enabled} onChange={handleChange} />
 */
export function RegulatoryQuickToggle({
  checked = false,
  onChange,
  disabled = false,
}: {
  checked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
        Include regulatory citations
      </span>
      {disabled && (
        <span className="text-xs text-gray-500">(unavailable)</span>
      )}
    </label>
  )
}

/**
 * Toggle for use in report generation modal
 */
export function RegulatoryToggleInModal({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div>
        <p className="font-medium text-gray-900">Regulatory Citations</p>
        <p className="text-sm text-gray-600">
          {enabled
            ? 'Building codes & standards included'
            : 'IICRC standards only'}
        </p>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
