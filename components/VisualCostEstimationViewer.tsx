"use client"

import { AlertTriangle, CheckCircle, DollarSign, FileText, Printer, TrendingUp, Calculator, Building2, Wrench, AlertCircle } from "lucide-react"

interface VisualCostEstimationData {
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
  categories: {
    [key: string]: {
      name: string
      lineItems: Array<{
        description: string
        hours?: number
        qty?: number
        days?: number
        sqm?: number
        rate?: number
        dailyRate?: number
        ratePerSqm?: number
        subtotal: number
      }>
      total: number
    }
  }
  totals: {
    totalLabour: number
    totalEquipment: number
    totalChemicals: number
    totalAdmin: number
    subtotal: number
    gst: number
    totalIncGST: number
  }
  industryComparison?: {
    average: { min: number; max: number }
    estimated: number
    analysis: string
  }
  costDrivers?: string[]
  flaggedItems?: Array<{
    flag: string
    reason: string
    action: string
  }>
  assumptions?: string[]
  exclusions?: string[]
  disclaimers?: string[]
}

interface VisualCostEstimationViewerProps {
  data: VisualCostEstimationData
}

export default function VisualCostEstimationViewer({ data }: VisualCostEstimationViewerProps) {
  const handlePrint = () => {
    window.print()
  }

  if (!data) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-600 mb-4">Error: No cost estimation data provided</div>
      </div>
    )
  }

  const { header, property, incident, categories, totals, industryComparison, costDrivers = [], flaggedItems = [], disclaimers = [], assumptions = [], exclusions = [] } = data

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

  // Organise categories into groups
  const labourCategories = Object.entries(categories || {})
    .filter(([_, cat]: [string, any]) => cat.name?.includes('Labour'))
    .map(([_, cat]: [string, any]) => cat)
  
  const equipmentCategories = Object.entries(categories || {})
    .filter(([_, cat]: [string, any]) => cat.name?.includes('Equipment'))
    .map(([_, cat]: [string, any]) => cat)
  
  const chemicalCategories = Object.entries(categories || {})
    .filter(([_, cat]: [string, any]) => cat.name?.includes('Chemical') || cat.name?.includes('Treatment'))
    .map(([_, cat]: [string, any]) => cat)
  
  const otherCategories = Object.entries(categories || {})
    .filter(([_, cat]: [string, any]) => 
      !cat.name?.includes('Labour') && 
      !cat.name?.includes('Equipment') && 
      !cat.name?.includes('Chemical') && 
      !cat.name?.includes('Treatment')
    )
    .map(([_, cat]: [string, any]) => cat)

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

  #cost-estimation-content,
  #cost-estimation-content * {
    visibility: visible !important;
  }

  /* Absolute positioning to top-left */
  #cost-estimation-content {
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
      
      <div id="cost-estimation-content" className="bg-white text-slate-900 print-content">
        {/* PAGE 1: PROFESSIONAL COVER PAGE */}
        <div className="min-h-[297mm] print:min-h-[297mm max-w-5xl mx-auto flex flex-col print-page" style={{ pageBreakAfter: 'always', pageBreakInside: 'avoid' }}>
          {/* Header with Logo/Branding */}
          <div className="my-16 print:mb-6">
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
                {header?.businessName || 'COST ESTIMATION DOCUMENTS'}
              </p>
            </div>
          </div>

          {/* Main Title */}
          <div className="text-center mb-12 print:mb-8">
            <h1 className="text-4xl print:text-3xl font-bold text-slate-900 mb-3 print:mb-2">
              {header?.businessName || 'Professional Restoration'}
            </h1>
            <h2 className="text-2xl print:text-xl font-semibold text-slate-700 mb-4 print:mb-3">
              {header?.reportTitle || 'COST ESTIMATION — PRELIMINARY'}
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

          {/* Date */}
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

          {/* Cost Summary Box */}
          <div className="mb-8 print:mb-6">
            <h3 className="text-base print:text-sm font-bold text-slate-900 mb-3 print:mb-2">
              Cost Summary:
            </h3>
            <div className="bg-white border-2 border-slate-300 rounded-lg p-6 print:p-4 min-h-[120px] print:min-h-[100px]">
              <p className="text-sm print:text-xs text-slate-700 leading-relaxed">
                This preliminary cost estimation document provides a detailed breakdown of restoration costs based on the scope of works. The estimate includes labour, equipment, chemicals, and other restoration services. Total estimated cost: <span className="font-bold text-green-700">${totals?.totalIncGST?.toFixed(2) || '0.00'}</span> (including GST). All costs are subject to final site assessment and may vary based on actual conditions.
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

        {/* PAGE 2+: COST ESTIMATION CONTENT */}
        <div className="print-page-break print-page flex flex-col">
          <div className="w-full p-0 px-4 space-y-8">

          {/* SECTION 1: COST BREAKDOWN BY CATEGORY */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-300 pb-2 flex items-center gap-2">
              <Calculator className="w-6 h-6" />
              SECTION 1: COST BREAKDOWN BY CATEGORY
            </h2>

            {/* Labour Categories */}
            {labourCategories.length > 0 && labourCategories.map((category, catIdx) => (
              <div key={catIdx} className="bg-blue-50 border border-blue-200 rounded-lg p-6 print:p-4">
                <h3 className="text-xl font-bold text-slate-900 mb-4 print:mb-3">{category.name}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-300 px-4 py-3 text-left font-semibold text-slate-900">Description</th>
                        <th className="border border-slate-300 px-4 py-3 text-center font-semibold text-slate-900">Hours</th>
                        <th className="border border-slate-300 px-4 py-3 text-right font-semibold text-slate-900">Rate</th>
                        <th className="border border-slate-300 px-4 py-3 text-right font-semibold text-slate-900">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {category.lineItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="border border-slate-300 px-4 py-3 text-slate-700">{item.description}</td>
                          <td className="border border-slate-300 px-4 py-3 text-center text-slate-700">{item.hours || item.qty || '-'}</td>
                          <td className="border border-slate-300 px-4 py-3 text-right text-slate-700">${(item.rate || 0).toFixed(2)}</td>
                          <td className="border border-slate-300 px-4 py-3 text-right font-semibold text-slate-900">${(item.subtotal || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="bg-blue-100 font-bold">
                        <td colSpan={3} className="border border-slate-300 px-4 py-3 text-right text-slate-900">Category Total</td>
                        <td className="border border-slate-300 px-4 py-3 text-right text-slate-900">${(category.total || 0).toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {/* Equipment Categories */}
            {equipmentCategories.length > 0 && equipmentCategories.map((category, catIdx) => (
              <div key={catIdx} className="bg-purple-50 border border-purple-200 rounded-lg p-6 print:p-4">
                <h3 className="text-xl font-bold text-slate-900 mb-4 print:mb-3">{category.name}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-300 px-4 py-3 text-left font-semibold text-slate-900">Description</th>
                        {category.lineItems.some((item: any) => item.qty) && (
                          <th className="border border-slate-300 px-4 py-3 text-center font-semibold text-slate-900">Qty</th>
                        )}
                        {category.lineItems.some((item: any) => item.days) && (
                          <th className="border border-slate-300 px-4 py-3 text-center font-semibold text-slate-900">Days</th>
                        )}
                        {category.lineItems.some((item: any) => item.hours) && (
                          <th className="border border-slate-300 px-4 py-3 text-center font-semibold text-slate-900">Hours</th>
                        )}
                        <th className="border border-slate-300 px-4 py-3 text-right font-semibold text-slate-900">
                          {category.lineItems.some((item: any) => item.dailyRate) ? 'Daily Rate' : 'Rate'}
                        </th>
                        <th className="border border-slate-300 px-4 py-3 text-right font-semibold text-slate-900">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {category.lineItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="border border-slate-300 px-4 py-3 text-slate-700">{item.description}</td>
                          {category.lineItems.some((i: any) => i.qty) && (
                            <td className="border border-slate-300 px-4 py-3 text-center text-slate-700">{item.qty || '-'}</td>
                          )}
                          {category.lineItems.some((i: any) => i.days) && (
                            <td className="border border-slate-300 px-4 py-3 text-center text-slate-700">{item.days || '-'}</td>
                          )}
                          {category.lineItems.some((i: any) => i.hours) && (
                            <td className="border border-slate-300 px-4 py-3 text-center text-slate-700">{item.hours || '-'}</td>
                          )}
                          <td className="border border-slate-300 px-4 py-3 text-right text-slate-700">
                            ${((item.dailyRate || item.rate || 0)).toFixed(2)}
                          </td>
                          <td className="border border-slate-300 px-4 py-3 text-right font-semibold text-slate-900">${(item.subtotal || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="bg-purple-100 font-bold">
                        <td colSpan={category.lineItems.some((i: any) => i.qty) ? 5 : 4} className="border border-slate-300 px-4 py-3 text-right text-slate-900">Category Total</td>
                        <td className="border border-slate-300 px-4 py-3 text-right text-slate-900">${(category.total || 0).toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {/* Chemical Categories */}
            {chemicalCategories.length > 0 && chemicalCategories.map((category, catIdx) => (
              <div key={catIdx} className="bg-amber-50 border border-amber-200 rounded-lg p-6 print:p-4">
                <h3 className="text-xl font-bold text-slate-900 mb-4 print:mb-3">{category.name}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-300 px-4 py-3 text-left font-semibold text-slate-900">Description</th>
                        {category.lineItems.some((item: any) => item.sqm) ? (
                          <>
                            <th className="border border-slate-300 px-4 py-3 text-center font-semibold text-slate-900">Sqm</th>
                            <th className="border border-slate-300 px-4 py-3 text-right font-semibold text-slate-900">Rate per Sqm</th>
                          </>
                        ) : (
                          <>
                            <th className="border border-slate-300 px-4 py-3 text-center font-semibold text-slate-900">Qty</th>
                            <th className="border border-slate-300 px-4 py-3 text-right font-semibold text-slate-900">Rate</th>
                          </>
                        )}
                        <th className="border border-slate-300 px-4 py-3 text-right font-semibold text-slate-900">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {category.lineItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="border border-slate-300 px-4 py-3 text-slate-700">{item.description}</td>
                          {category.lineItems.some((i: any) => i.sqm) ? (
                            <>
                              <td className="border border-slate-300 px-4 py-3 text-center text-slate-700">{item.sqm || '-'}</td>
                              <td className="border border-slate-300 px-4 py-3 text-right text-slate-700">${(item.ratePerSqm || 0).toFixed(2)}</td>
                            </>
                          ) : (
                            <>
                              <td className="border border-slate-300 px-4 py-3 text-center text-slate-700">{item.qty || '-'}</td>
                              <td className="border border-slate-300 px-4 py-3 text-right text-slate-700">${(item.rate || 0).toFixed(2)}</td>
                            </>
                          )}
                          <td className="border border-slate-300 px-4 py-3 text-right font-semibold text-slate-900">${(item.subtotal || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="bg-amber-100 font-bold">
                        <td colSpan={3} className="border border-slate-300 px-4 py-3 text-right text-slate-900">Category Total</td>
                        <td className="border border-slate-300 px-4 py-3 text-right text-slate-900">${(category.total || 0).toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {/* Other Categories */}
            {otherCategories.length > 0 && otherCategories.map((category, catIdx) => (
              <div key={catIdx} className="bg-slate-50 border border-slate-200 rounded-lg p-6 print:p-4">
                <h3 className="text-xl font-bold text-slate-900 mb-4 print:mb-3">{category.name}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-300 px-4 py-3 text-left font-semibold text-slate-900">Description</th>
                        {category.lineItems.some((item: any) => item.qty || item.hours) && (
                          <th className="border border-slate-300 px-4 py-3 text-center font-semibold text-slate-900">
                            {category.lineItems.some((item: any) => item.hours) ? 'Hours' : 'Qty'}
                          </th>
                        )}
                        <th className="border border-slate-300 px-4 py-3 text-right font-semibold text-slate-900">Rate</th>
                        <th className="border border-slate-300 px-4 py-3 text-right font-semibold text-slate-900">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {category.lineItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="border border-slate-300 px-4 py-3 text-slate-700">{item.description}</td>
                          {category.lineItems.some((i: any) => i.qty || i.hours) && (
                            <td className="border border-slate-300 px-4 py-3 text-center text-slate-700">{item.qty || item.hours || '-'}</td>
                          )}
                          <td className="border border-slate-300 px-4 py-3 text-right text-slate-700">${(item.rate || 0).toFixed(2)}</td>
                          <td className="border border-slate-300 px-4 py-3 text-right font-semibold text-slate-900">${(item.subtotal || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 font-bold">
                        <td colSpan={category.lineItems.some((i: any) => i.qty || i.hours) ? 3 : 2} className="border border-slate-300 px-4 py-3 text-right text-slate-900">Category Total</td>
                        <td className="border border-slate-300 px-4 py-3 text-right text-slate-900">${(category.total || 0).toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* SECTION 2: SUMMARY TOTALS */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-300 pb-2 flex items-center gap-2">
              <DollarSign className="w-6 h-6" />
              SECTION 2: SUMMARY TOTALS
            </h2>
            
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-300 rounded-lg p-6 print:p-4">
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-slate-300">
                  <span className="text-lg font-semibold text-slate-700">Subtotal (Ex GST)</span>
                  <span className="text-xl font-bold text-slate-900">${totals?.subtotal?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-300">
                  <span className="text-lg font-semibold text-slate-700">GST (10%)</span>
                  <span className="text-xl font-bold text-slate-900">${totals?.gst?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="flex justify-between items-center py-3 bg-slate-200 rounded-lg px-4 mt-4">
                  <span className="text-2xl font-bold text-slate-900">TOTAL (Inc GST)</span>
                  <span className="text-3xl font-bold text-green-700">${totals?.totalIncGST?.toFixed(2) || '0.00'}</span>
                </div>
                {totals?.totalAdmin && totals.totalAdmin > 0 && (
                  <div className="mt-2 text-sm text-slate-600">
                    <p>Note: Includes Administration, Call-Out, and Thermal Imaging fees</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 3: INDUSTRY COMPARISONS */}
          {industryComparison && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-300 pb-2 flex items-center gap-2">
                <TrendingUp className="w-6 h-6" />
                SECTION 3: INDUSTRY COMPARISONS
              </h2>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 print:p-4">
                <div className="space-y-3">
                  <div>
                    <span className="font-semibold text-slate-900">Average Market Range:</span>
                    <p className="text-slate-700 mt-1">${industryComparison.average?.min?.toFixed(2) || '0.00'} - ${industryComparison.average?.max?.toFixed(2) || '0.00'}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Estimated Cost:</span>
                    <p className="text-slate-700 mt-1">${industryComparison.estimated?.toFixed(2) || '0.00'}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Market Position:</span>
                    <p className="text-slate-700 mt-1">{industryComparison.analysis}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3.5: COST DRIVERS */}
          {costDrivers.length > 0 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-300 pb-2 flex items-center gap-2">
                <Building2 className="w-6 h-6" />
                SECTION 3.5: COST DRIVERS
              </h2>
              
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6 print:p-4">
                <ul className="list-disc list-inside space-y-2 text-slate-700">
                  {costDrivers.map((driver, idx) => (
                    <li key={idx}>{driver}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* SECTION 3.6: FLAGGED ITEMS */}
          {flaggedItems.length > 0 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-300 pb-2 flex items-center gap-2">
                <AlertCircle className="w-6 h-6" />
                SECTION 3.6: FLAGGED ITEMS
              </h2>
              
              <div className="space-y-4">
                {flaggedItems.map((item, idx) => (
                  <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-6 print:p-4">
                    <h3 className="text-lg font-bold text-red-900 mb-2">{item.flag}</h3>
                    <div className="space-y-2 text-slate-700">
                      <div>
                        <span className="font-semibold">Reason:</span>
                        <p className="mt-1">{item.reason}</p>
                      </div>
                      <div>
                        <span className="font-semibold">Action Required:</span>
                        <p className="mt-1">{item.action}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 4: ASSUMPTIONS */}
          {assumptions && assumptions.length > 0 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-300 pb-2 flex items-center gap-2">
                <FileText className="w-6 h-6" />
                SECTION 4: ASSUMPTIONS
              </h2>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 print:p-4">
                <ul className="list-disc list-inside space-y-2 text-slate-700">
                  {assumptions.map((assumption, idx) => (
                    <li key={idx}>{assumption}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* SECTION 5: EXCLUSIONS */}
          {exclusions && exclusions.length > 0 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-300 pb-2 flex items-center gap-2">
                <AlertCircle className="w-6 h-6" />
                SECTION 5: EXCLUSIONS
              </h2>
              
              <div className="bg-red-50 border border-red-200 rounded-lg p-6 print:p-4">
                <ul className="list-disc list-inside space-y-2 text-slate-700">
                  {exclusions.map((exclusion, idx) => (
                    <li key={idx}>{exclusion}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* SECTION 6: DISCLAIMERS */}
          {disclaimers && disclaimers.length > 0 && (
            <div className="space-y-6 border-t border-slate-300 pt-6">
              <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-300 pb-2 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6" />
                SECTION 6: DISCLAIMERS
              </h2>
              
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 print:p-4">
                <ul className="list-disc list-inside space-y-2 text-slate-700">
                  {disclaimers.map((disclaimer, idx) => (
                    <li key={idx}>{disclaimer}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </>
  )
}

