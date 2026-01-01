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
  property?: {
    clientName?: string | null
    clientCompany?: string | null
    propertyAddress?: string | null
    propertyPostcode?: string | null
    propertyId?: string | null
    jobNumber?: string | null
  }
  incident?: {
    technicianName?: string | null
    technicianAttendanceDate?: string | null
    claimReferenceNumber?: string | null
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

  const { header, property, incident, phases = [], lineItems = [], licensedTrades = [], insuranceBreakdown, coordinationNotes = [] } = data

  // Calculate totals
  const totalLineItems = lineItems.reduce((sum, item) => sum + (item.subtotal || 0), 0)

  // Format date helper
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not provided'
    try {
      return new Date(dateString).toLocaleDateString('en-AU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      })
    } catch {
      return dateString
    }
  }

  return (
    <>
      {/* Print Styles */}
      <style dangerouslySetInnerHTML={{__html: `@media print {

  /* Force real A4 page */
  @page {
    size: A4 portrait;
    margin: 20mm;
    /* Disable browser headers and footers */
    marks: none;
  }

  /* Hide any browser-added URLs or page info */
  body::after,
  body::before,
  html::after,
  html::before {
    display: none !important;
    content: none !important;
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

  /* Cover page - exactly one page */
  .print-page {
    page-break-after: always !important;
    page-break-inside: avoid !important;
    min-height: 297mm !important;
    height: 297mm !important;
    display: flex !important;
    flex-direction: column !important;
  }

  /* Ensure cover page content doesn't overflow */
  .print-page:first-of-type {
    overflow: hidden !important;
  }

  /* Hide content after cover page until print */
  .print-page-break {
    page-break-before: always !important;
  }

  /* Remove shadows & UI fluff */
  * {
    box-shadow: none !important;
    background-image: none !important;
  }

}
      `}} />
      
      <div id="scope-of-works-content" className="bg-white text-slate-900 print-content">
        {/* PAGE 1: PROFESSIONAL COVER PAGE */}
        <div className="min-h-[297mm] print:min-h-[297mm] max-w-5xl mx-auto flex flex-col print-page" style={{ pageBreakAfter: 'always', pageBreakInside: 'avoid' }}>
          {/* Header with Logo/Branding */}
          <div className="mb-16 print:mb-6">
            {header?.businessLogo && (
              <div className="mb-4 print:mb-3">
                <img 
                  src={header.businessLogo} 
                  alt={header.businessName || "Business Logo"} 
                  className="h-16 print:h-12 w-auto object-contain"
                />
              </div>
            )}
            <div className="text-center print:text-left mb-2 print:mb-1">
              <p className="text-xs print:text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                {header?.businessName || 'SCOPE OF WORKS DOCUMENTS'}
              </p>
            </div>
          </div>

          {/* Main Title */}
          <div className="text-center mb-12 print:mb-8">
            <h1 className="text-4xl print:text-3xl font-bold text-slate-900 mb-3 print:mb-2">
              {header?.businessName || 'Professional Restoration'}
            </h1>
            <h2 className="text-2xl print:text-xl font-semibold text-slate-700 mb-4 print:mb-3">
              {header?.reportTitle || 'PRELIMINARY SCOPE OF WORKS — NOT FINAL ESTIMATE'}
            </h2>
          </div>

          {/* Prepared By Section */}
          <div className="mb-8 print:mb-6">
            <p className="text-base print:text-sm text-slate-900 font-semibold mb-2 print:mb-1">
              Prepared By:
            </p>
            <p className="text-base print:text-sm text-slate-700">
              {incident?.technicianName || header?.businessName || 'Not provided'}
            </p>
          </div>

          {/* Prepared For Section - Table Format */}
          <div className="mb-8 print:mb-6">
            <p className="text-base print:text-sm text-slate-900 font-semibold mb-3 print:mb-2">
              Prepared for:
            </p>
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="py-2 print:py-1.5 pr-4 print:pr-3 font-bold text-slate-900 w-1/3 text-sm print:text-xs border-b border-slate-200">CLIENT NAME:</td>
                  <td className="py-2 print:py-1.5 text-slate-700 text-sm print:text-xs border-b border-slate-200">
                    {property?.clientName || property?.clientCompany || 'Not provided'}
                  </td>
                </tr>
                {property?.propertyId && (
                  <tr>
                    <td className="py-2 print:py-1.5 pr-4 print:pr-3 font-bold text-slate-900 w-1/3 text-sm print:text-xs border-b border-slate-200">PROPERTY ID:</td>
                    <td className="py-2 print:py-1.5 text-slate-700 text-sm print:text-xs border-b border-slate-200">{property.propertyId}</td>
                  </tr>
                )}
                {property?.jobNumber && (
                  <tr>
                    <td className="py-2 print:py-1.5 pr-4 print:pr-3 font-bold text-slate-900 w-1/3 text-sm print:text-xs border-b border-slate-200">JOB NO:</td>
                    <td className="py-2 print:py-1.5 text-slate-700 text-sm print:text-xs border-b border-slate-200">{property.jobNumber}</td>
                  </tr>
                )}
                <tr>
                  <td className="py-2 print:py-1.5 pr-4 print:pr-3 font-bold text-slate-900 w-1/3 text-sm print:text-xs">SITE ADDRESS:</td>
                  <td className="py-2 print:py-1.5 text-slate-700 text-sm print:text-xs">
                    {property?.propertyAddress || 'Not provided'}
                    {property?.propertyPostcode && `, ${property.propertyPostcode}`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Inspection Date */}
          <div className="mb-8 print:mb-6">
            <p className="text-base print:text-sm text-slate-700">
              <span className="font-semibold">Date:</span> {formatDate(incident?.technicianAttendanceDate || header?.dateGenerated)}
            </p>
            {header?.claimReference && (
              <p className="text-base print:text-sm text-slate-700 mt-2 print:mt-1">
                <span className="font-semibold">Based on:</span> Inspection Report {header.claimReference}
              </p>
            )}
          </div>

          {/* Scope Summary Box */}
          <div className="mb-8 print:mb-6">
            <h3 className="text-base print:text-sm font-bold text-slate-900 mb-3 print:mb-2">
              Scope Summary:
            </h3>
            <div className="bg-white border-2 border-slate-300 rounded-lg p-6 print:p-4 min-h-[120px] print:min-h-[100px]">
              <p className="text-sm print:text-xs text-slate-700 leading-relaxed">
                This preliminary scope of works document outlines the restoration works required to address water damage at the property. The scope includes {phases.length} remediation phases, {lineItems.length} restoration work line items{licensedTrades.length > 0 ? `, and ${licensedTrades.length} licensed trade requirement${licensedTrades.length > 1 ? 's' : ''}` : ''}. All works will be conducted in accordance with IICRC S500 standards and relevant Australian regulations.
              </p>
            </div>
          </div>

          {/* Footer - Business Information */}
          <div className="mt-auto pt-8 print:pt-6 border-t-2 border-slate-300">
            <div className="text-center text-xs print:text-[10px] text-slate-600 space-y-1">
              {header?.businessName && (
                <p className="font-semibold text-slate-700">{header.businessName}</p>
              )}
              {header?.businessAddress && (
                <p>{header.businessAddress}</p>
              )}
              {header?.businessABN && (
                <p>ABN: {header.businessABN}</p>
              )}
              {header?.businessPhone && (
                <p>Phone: {header.businessPhone}</p>
              )}
              {header?.businessEmail && (
                <p>Email: {header.businessEmail}</p>
              )}
            </div>
          </div>
        </div>

        {/* PAGE 2+: SCOPE OF WORKS CONTENT */}
        <div className="print-page-break print-page flex flex-col">
          <div className="w-full p-0 px-4 space-y-8">

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
      </div>
    </>
  )
}

