"use client"

import { AlertTriangle, CheckCircle, Clock, DollarSign, FileText, Printer, Users, Wrench } from "lucide-react"

interface VisualScopeOfWorksData {
  header: {
    reportTitle: string
    businessName: string | null
    businessAddress: string | null
    businessLogo: string | null
    businessABN: string | null
    businessPhone: string | null
    businessEmail: string | null
    reportNumber: string
    dateGenerated: string
    claimReference: string
    version: string
  }
  phases: Array<{
    name: string
    duration: string
    activities: string[]
    deliverable: string
  }>
  lineItems: Array<{
    code: string
    description: string
    quantity: number
    unit: string
    rate: number
    subtotal: number
    labourBreakdown?: any
    equipmentBreakdown?: any
  }>
  licensedTrades: Array<{
    trade: string
    triggerCondition: string
    scopeOfWork: string
    costStatus: string
    timeline: string
    notes?: string
  }>
  insuranceBreakdown: {
    buildingClaim: string[]
    contentsClaim: string[]
    additionalLivingExpenses: string[]
  }
  coordinationNotes: string[]
  totalCost?: number
  dryingDuration?: number
  affectedAreaSqm?: number
  waterCategory?: string
  hasClass4Drying?: boolean
}

interface VisualScopeOfWorksViewerProps {
  data: VisualScopeOfWorksData
}

export default function VisualScopeOfWorksViewer({ data }: VisualScopeOfWorksViewerProps) {
  const handlePrint = () => {
    window.print()
  }

  if (!data) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-600 mb-4">Error: No scope of works data provided</div>
      </div>
    )
  }

  const { header, phases = [], lineItems = [], licensedTrades = [], insuranceBreakdown, coordinationNotes = [] } = data

  // Calculate totals
  const totalLineItems = lineItems.reduce((sum, item) => sum + (item.subtotal || 0), 0)

  return (
    <>
      {/* Print Styles */}
      <style dangerouslySetInnerHTML={{__html: `
       @media print {

  /* Force real A4 page */
  @page {
    size: A4 portrait;
    margin: 20mm;
  }

  html, body {
    width: 210mm;
    height: auto;
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
  }

  /* Kill everything except report */
  body * {
    visibility: hidden !important;
  }

  #scope-of-works-content,
  #scope-of-works-content * {
    visibility: visible !important;
  }

  /* Absolute positioning to top-left */
  #scope-of-works-content {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 210mm !important;
    max-width: 210mm !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  /* Remove screen layout limits */
  .max-w-8xl,
  .mx-auto,
  .p-8,
  .print\\:p-0 {
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  /* Remove sticky headers */
  .sticky {
    position: static !important;
  }

  /* Clean typography */
  h1 {
    font-size: 24pt !important;
    line-height: 1.2 !important;
    margin-bottom: 10mm !important;
  }

  h2 {
    font-size: 16pt !important;
    margin-top: 8mm !important;
  }

  p, li, td {
    font-size: 10.5pt !important;
  }

  /* Tables behave professionally */
  table {
    width: 100% !important;
    border-collapse: collapse !important;
  }

  thead {
    display: table-header-group !important;
  }

  tr {
    page-break-inside: avoid !important;
  }

  /* Page control */
  .print-break {
    page-break-after: always !important;
  }

  /* Remove shadows & UI fluff */
  * {
    box-shadow: none !important;
    background-image: none !important;
  }

}

      `}} />
      
      <div id="scope-of-works-content" className="bg-white text-slate-900 print-content">
        {/* Print Button */}
        <div className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 p-4 print:hidden">
        <div className="flex justify-end">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </button>
        </div>
      </div>

      <div className="w-full p-0 px-4 space-y-8">
      {/* Header */}
        <div className="border-b-2 border-slate-300 pb-6 print:pb-4 print-avoid-break print:mb-4">
          <div className="flex items-start justify-between mb-4 print:mb-3 gap-4">
            <div className="flex-1 min-w-0">
              {header?.businessLogo && (
                <div className="mb-4 print:mb-3">
                  <img 
                    src={header.businessLogo} 
                    alt={header.businessName || 'Company Logo'}
                    className="h-16 print:h-12 object-contain"
                  />
                </div>
              )}
              <h1 className="text-4xl print:text-2xl print:leading-tight font-bold text-slate-900 mb-2 print:mb-2 break-words">
                {header?.reportTitle || 'PRELIMINARY SCOPE OF WORKS — NOT FINAL ESTIMATE'}
              </h1>
              <p className="text-lg print:text-base text-slate-600 print:mt-1">
                {header?.businessName || 'RestoreAssist'}
              </p>
              {header?.businessAddress && (
                <p className="text-sm print:text-xs text-slate-500 mt-1">
                  {header.businessAddress}
                </p>
              )}
              {(header?.businessABN || header?.businessPhone || header?.businessEmail) && (
                <div className="text-xs print:text-[10px] text-slate-500 mt-2 print:mt-1 space-y-0.5">
                  {header.businessABN && <p>ABN: {header.businessABN}</p>}
                  {header.businessPhone && <p>Phone: {header.businessPhone}</p>}
                  {header.businessEmail && <p>Email: {header.businessEmail}</p>}
                </div>
              )}
            </div>
            <div className="text-right text-sm print:text-xs text-slate-600 print:ml-4 flex-shrink-0">
              <p className="font-semibold text-slate-900 print:text-xs">Report Number</p>
              <p className="text-lg print:text-base font-bold break-all">{header?.reportNumber || header?.claimReference || 'N/A'}</p>
              <p className="mt-2 print:mt-1">
                {header?.dateGenerated || new Date().toLocaleDateString('en-AU')}
              </p>
              {header?.version && (
                <p className="mt-1 text-xs print:text-[10px]">
                  Version: {header.version}
                </p>
              )}
            </div>
          </div>
          {header?.claimReference && (
            <div className="mt-4 print:mt-3 pt-4 print:pt-3 border-t border-slate-200">
              <p className="text-sm print:text-xs text-slate-600">
                <span className="font-medium">Based on:</span> Inspection Report {header.claimReference}
              </p>
            </div>
          )}
        </div>

        {/* SECTION 1: REMEDIATION PHASES */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-300 pb-2 flex items-center gap-2">
            <Clock className="w-6 h-6" />
            SECTION 1: REMEDIATION PHASES
          </h2>
          
          <div className="space-y-4">
            {phases.map((phase, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-6">
                <div className="flex items-start gap-4 mb-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-cyan-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900 mb-2">{phase.name}</h3>
                    <div className="flex items-center gap-2 text-slate-600 mb-3">
                      <Clock className="w-4 h-4" />
                      <span className="font-medium">Duration: {phase.duration}</span>
                    </div>
                  </div>
                </div>
                
                <div className="ml-14 space-y-3">
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">Activities:</h4>
                    <ul className="list-disc list-inside space-y-1 text-slate-700">
                      {phase.activities?.map((activity, actIdx) => (
                        <li key={actIdx}>{activity}</li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="bg-green-50 border border-green-200 rounded p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-green-900">Deliverable:</span>
                        <span className="ml-2 text-green-800">{phase.deliverable}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 2: RESTORATION WORKS ONLY */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-300 pb-2 flex items-center gap-2">
            <Wrench className="w-6 h-6" />
            SECTION 2: RESTORATION WORKS ONLY
          </h2>
          
          {lineItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-4 py-3 text-left font-semibold text-slate-900">Code</th>
                    <th className="border border-slate-300 px-4 py-3 text-left font-semibold text-slate-900">Description</th>
                    <th className="border border-slate-300 px-4 py-3 text-center font-semibold text-slate-900">Quantity</th>
                    <th className="border border-slate-300 px-4 py-3 text-center font-semibold text-slate-900">Unit</th>
                    <th className="border border-slate-300 px-4 py-3 text-right font-semibold text-slate-900">Rate</th>
                    <th className="border border-slate-300 px-4 py-3 text-right font-semibold text-slate-900">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="border border-slate-300 px-4 py-3 font-mono text-sm text-slate-700">{item.code}</td>
                      <td className="border border-slate-300 px-4 py-3 text-slate-700">{item.description}</td>
                      <td className="border border-slate-300 px-4 py-3 text-center text-slate-700">{item.quantity}</td>
                      <td className="border border-slate-300 px-4 py-3 text-center text-slate-700">{item.unit}</td>
                      <td className="border border-slate-300 px-4 py-3 text-right text-slate-700">${item.rate.toFixed(2)}</td>
                      <td className="border border-slate-300 px-4 py-3 text-right font-semibold text-slate-900">${item.subtotal.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 font-bold">
                    <td colSpan={5} className="border border-slate-300 px-4 py-3 text-right text-slate-900">TOTAL</td>
                    <td className="border border-slate-300 px-4 py-3 text-right text-slate-900">${totalLineItems.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-amber-800">No restoration works line items available.</p>
            </div>
          )}
        </div>

        {/* SECTION 3: LICENSED TRADES REQUIRED */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-300 pb-2 flex items-center gap-2">
            <Users className="w-6 h-6" />
            SECTION 3: LICENSED TRADES REQUIRED
          </h2>
          
          {licensedTrades.length > 0 ? (
            <div className="space-y-4">
              {licensedTrades.map((trade, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-slate-900 mb-4">{trade.trade}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-semibold text-slate-700">Trigger Condition:</span>
                      <p className="text-slate-600 mt-1">{trade.triggerCondition}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">Cost Status:</span>
                      <p className="text-slate-600 mt-1">{trade.costStatus}</p>
                    </div>
                    <div className="md:col-span-2">
                      <span className="font-semibold text-slate-700">Scope of Work:</span>
                      <p className="text-slate-600 mt-1">{trade.scopeOfWork}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">Timeline:</span>
                      <p className="text-slate-600 mt-1">{trade.timeline}</p>
                    </div>
                    {trade.notes && (
                      <div className="md:col-span-2">
                        <span className="font-semibold text-slate-700">Notes:</span>
                        <p className="text-slate-600 mt-1">{trade.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800">No licensed trades required for this scope.</p>
            </div>
          )}
        </div>

        {/* SECTION 4: INSURANCE CLAIM BREAKDOWN */}
        {insuranceBreakdown && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-300 pb-2 flex items-center gap-2">
              <DollarSign className="w-6 h-6" />
              SECTION 4: INSURANCE CLAIM BREAKDOWN
            </h2>
            
            <div className="space-y-4">
              {insuranceBreakdown.buildingClaim && insuranceBreakdown.buildingClaim.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-slate-900 mb-3">BUILDING CLAIM (Structural & Systems)</h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-700">
                    {insuranceBreakdown.buildingClaim.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {insuranceBreakdown.contentsClaim && insuranceBreakdown.contentsClaim.length > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-slate-900 mb-3">CONTENTS CLAIM (Personal Property)</h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-700">
                    {insuranceBreakdown.contentsClaim.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {insuranceBreakdown.additionalLivingExpenses && insuranceBreakdown.additionalLivingExpenses.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-slate-900 mb-3">ADDITIONAL LIVING EXPENSES (if property uninhabitable)</h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-700">
                    {insuranceBreakdown.additionalLivingExpenses.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 5: COORDINATION AND SEQUENCING NOTES */}
        {coordinationNotes.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-300 pb-2 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6" />
              SECTION 5: COORDINATION AND SEQUENCING NOTES
            </h2>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <h3 className="font-semibold text-slate-900 mb-3">Critical sequencing information:</h3>
              <ul className="list-disc list-inside space-y-2 text-slate-700">
                {coordinationNotes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* SECTION 6: CLIENT EDIT FIELDS */}
        <div className="space-y-6 border-t border-slate-300 pt-6">
          <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-300 pb-2 flex items-center gap-2">
            <FileText className="w-6 h-6" />
            SECTION 6: CLIENT EDIT FIELDS
          </h2>
          
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
            <p className="text-slate-700">
              <strong>Note:</strong> All line items, quantities, rates, and calculations can be edited by the admin before finalising. 
              System maintains calculation formulas but allows manual override.
            </p>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}

