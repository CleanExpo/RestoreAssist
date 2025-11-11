/**
 * ReportComposer - Server-side component for generating professional HTML reports
 * Combines AI analysis, technician responses, and compliance clauses
 */

interface ReportComposerProps {
  report: any;
  analysis: any;
  responses: any[];
  scopeLines?: any[];
  estimate?: any;
}

export default function ReportComposer({
  report,
  analysis,
  responses,
  scopeLines,
  estimate
}: ReportComposerProps) {
  const keyFindings = analysis?.key_findings || {};
  const serviceType = analysis?.service_type || 'General';
  const reportGrade = keyFindings.report_grade || 2;
  const summary = keyFindings.summary || 'No summary available';
  const sections = keyFindings.sections || [];
  const hazards = keyFindings.hazards || [];
  const detectedStandards = analysis?.detected_standards || [];

  // Group responses by category
  const groupedResponses = responses.reduce((acc, r) => {
    const category = r.question_bank?.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(r);
    return acc;
  }, {} as { [category: string]: any[] });

  return (
    <html>
      <head>
        <meta charSet="UTF-8" />
        <title>Restoration Assessment Report - {report.file_name}</title>
        <style>{`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 12pt;
            line-height: 1.6;
            color: #333;
            background: white;
          }

          .container {
            max-width: 210mm;
            margin: 0 auto;
            padding: 20mm;
          }

          header {
            border-bottom: 3px solid #2563eb;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }

          h1 {
            font-size: 28pt;
            color: #1e40af;
            margin-bottom: 10px;
          }

          h2 {
            font-size: 18pt;
            color: #2563eb;
            margin-top: 30px;
            margin-bottom: 15px;
            padding-bottom: 5px;
            border-bottom: 2px solid #e5e7eb;
          }

          h3 {
            font-size: 14pt;
            color: #1e40af;
            margin-top: 20px;
            margin-bottom: 10px;
          }

          .metadata {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 20px;
            padding: 15px;
            background: #f3f4f6;
            border-radius: 5px;
          }

          .metadata-item {
            display: flex;
            gap: 5px;
          }

          .metadata-label {
            font-weight: bold;
            color: #4b5563;
          }

          .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 10pt;
            font-weight: 600;
            margin-right: 8px;
          }

          .badge-service {
            background: #dbeafe;
            color: #1e40af;
          }

          .badge-grade {
            background: #fef3c7;
            color: #92400e;
          }

          .badge-standard {
            background: #d1fae5;
            color: #065f46;
          }

          .section {
            margin-bottom: 25px;
            page-break-inside: avoid;
          }

          .summary {
            background: #eff6ff;
            padding: 15px;
            border-left: 4px solid #2563eb;
            margin-bottom: 20px;
          }

          .hazard-list {
            list-style: none;
            padding-left: 0;
          }

          .hazard-item {
            padding: 8px 12px;
            margin-bottom: 8px;
            background: #fef2f2;
            border-left: 4px solid #dc2626;
            border-radius: 4px;
          }

          .hazard-item::before {
            content: '⚠ ';
            color: #dc2626;
            font-weight: bold;
          }

          .question-category {
            margin-bottom: 20px;
          }

          .question-item {
            padding: 12px;
            margin-bottom: 10px;
            background: #f9fafb;
            border-left: 4px solid #6b7280;
            border-radius: 4px;
          }

          .question-item.verified {
            border-left-color: #10b981;
            background: #f0fdf4;
          }

          .question-text {
            font-weight: 600;
            margin-bottom: 5px;
          }

          .answer-text {
            margin-left: 15px;
            color: #4b5563;
          }

          .evidence-link {
            margin-left: 15px;
            font-size: 10pt;
            color: #2563eb;
          }

          .verification-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 9pt;
            font-weight: 600;
            margin-left: 10px;
          }

          .verification-badge.verified {
            background: #d1fae5;
            color: #065f46;
          }

          .verification-badge.unverified {
            background: #fee2e2;
            color: #991b1b;
          }

          .keywords {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            margin-top: 8px;
          }

          .keyword {
            padding: 2px 8px;
            background: #e5e7eb;
            border-radius: 3px;
            font-size: 9pt;
            color: #374151;
          }

          .scope-line {
            padding: 15px;
            margin-bottom: 15px;
            background: #f9fafb;
            border-left: 4px solid #3b82f6;
            border-radius: 4px;
          }

          .scope-line-header {
            font-weight: 600;
            font-size: 11pt;
            color: #1e40af;
            margin-bottom: 5px;
          }

          .scope-line-citation {
            font-size: 9pt;
            color: #6b7280;
            margin-bottom: 8px;
            font-style: italic;
          }

          .cost-breakdown {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-top: 8px;
            font-size: 10pt;
          }

          .cost-item {
            padding: 8px;
            background: white;
            border-radius: 3px;
          }

          .cost-label {
            font-size: 8pt;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .cost-value {
            font-weight: 600;
            color: #1f2937;
            font-size: 11pt;
          }

          .estimate-box {
            background: #eff6ff;
            border: 2px solid #3b82f6;
            border-radius: 8px;
            padding: 20px;
            margin-top: 20px;
          }

          .estimate-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #dbeafe;
          }

          .estimate-row.total {
            font-size: 14pt;
            font-weight: 700;
            color: #1e40af;
            border-bottom: none;
            border-top: 3px solid #3b82f6;
            padding-top: 15px;
            margin-top: 10px;
          }

          .estimate-label {
            color: #374151;
          }

          .estimate-value {
            font-weight: 600;
            color: #1f2937;
          }

          footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #e5e7eb;
            text-align: center;
            font-size: 10pt;
            color: #6b7280;
          }

          @media print {
            body {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
            .page-break {
              page-break-before: always;
            }
            .avoid-break {
              page-break-inside: avoid;
            }
          }
        `}</style>
      </head>
      <body>
        <div className="container">
          <header>
            <div className="logo-box">
              Insert Company Logo Here
            </div>
            <div className="header-info">
              <p>Report Framework Template</p>
              <p>Date: {new Date().toLocaleDateString()}</p>
              <p>Report ID: {report.id}</p>
            </div>
          </header>

          <h1>Restoration Assessment Report</h1>

          <div className="metadata">
              <div className="metadata-item">
                <span className="metadata-label">Report:</span>
                <span>{report.file_name}</span>
              </div>
              <div className="metadata-item">
                <span className="metadata-label">Uploaded:</span>
                <span>{new Date(report.created_at).toLocaleDateString()}</span>
              </div>
              <div className="metadata-item">
                <span className="metadata-label">Service Type:</span>
                <span className="badge badge-service">{serviceType}</span>
              </div>
              <div className="metadata-item">
                <span className="metadata-label">Complexity:</span>
                <span className="badge badge-grade">
                  Grade {reportGrade} - {reportGrade === 1 ? 'Basic' : reportGrade === 2 ? 'Intermediate' : 'Advanced'}
                </span>
              </div>
            </div>
            {detectedStandards.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <span className="metadata-label">Applicable Standards: </span>
                {detectedStandards.map((std: string, idx: number) => (
                  <span key={idx} className="badge badge-standard">{std}</span>
                ))}
              </div>
            )}
          </header>

          <section className="section">
            <h2>Executive Summary</h2>
            <div className="summary">
              <p>{summary}</p>
            </div>
          </section>

          {hazards.length > 0 && (
            <section className="section">
              <h2>Identified Hazards</h2>
              <ul className="hazard-list">
                {hazards.map((hazard: string, idx: number) => (
                  <li key={idx} className="hazard-item">{hazard}</li>
                ))}
              </ul>
            </section>
          )}

          {sections.length > 0 && (
            <section className="section page-break">
              <h2>Report Sections</h2>
              {sections.map((sec: any, idx: number) => (
                <div key={idx} className="section avoid-break">
                  <h3>{sec.title}</h3>
                  <p>{sec.summary}</p>
                  {sec.keywords && sec.keywords.length > 0 && (
                    <div className="keywords">
                      {sec.keywords.map((kw: string, kidx: number) => (
                        <span key={kidx} className="keyword">{kw}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}

          {responses.length > 0 && (
            <section className="section page-break">
              <h2>Technician Verification</h2>
              <p style={{ marginBottom: '15px', color: '#4b5563' }}>
                The following questions were answered by the technician to verify compliance and quality standards.
              </p>
              {Object.entries(groupedResponses).map(([category, categoryResponses]) => (
                <div key={category} className="question-category">
                  <h3>{category}</h3>
                  {categoryResponses.map((resp: any, idx: number) => (
                    <div
                      key={idx}
                      className={`question-item ${resp.verified ? 'verified' : ''}`}
                    >
                      <div className="question-text">
                        {resp.question_bank?.question || resp.question_text}
                        <span className={`verification-badge ${resp.verified ? 'verified' : 'unverified'}`}>
                          {resp.verified ? '✓ Verified' : '✗ Unverified'}
                        </span>
                      </div>
                      {resp.answer && (
                        <div className="answer-text">
                          <strong>Answer:</strong> {resp.answer}
                        </div>
                      )}
                      {resp.evidence_url && (
                        <div className="evidence-link">
                          <strong>Evidence:</strong> <a href={resp.evidence_url}>{resp.evidence_url}</a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </section>
          )}

          {/* Scope of Works Section */}
          {scopeLines && scopeLines.length > 0 && (
            <section>
              <h2>💰 Scope of Works</h2>
              <p style={{ marginBottom: '20px', color: '#6b7280' }}>
                Insurance-grade scope with traceable calculations and standards citations.
              </p>

              {scopeLines.map((line: any, index: number) => (
                <div key={line.id || index} className="scope-line">
                  <div className="scope-line-header">
                    {line.line_code} — {line.line_description}
                  </div>

                  {line.clause_citation && (
                    <div className="scope-line-citation">
                      📋 {line.clause_citation}
                    </div>
                  )}

                  <div className="cost-breakdown">
                    <div className="cost-item">
                      <div className="cost-label">Labour</div>
                      <div className="cost-value">
                        ${((line.labour_cost_cents || 0) / 100).toFixed(2)}
                      </div>
                      {line.calc_details?.labour_hours && (
                        <div style={{ fontSize: '8pt', color: '#9ca3af' }}>
                          {line.calc_details.labour_hours.toFixed(1)} hours
                        </div>
                      )}
                    </div>

                    <div className="cost-item">
                      <div className="cost-label">Equipment</div>
                      <div className="cost-value">
                        ${((line.equipment_cost_cents || 0) / 100).toFixed(2)}
                      </div>
                      {line.calc_details?.equipment_days && (
                        <div style={{ fontSize: '8pt', color: '#9ca3af' }}>
                          {line.calc_details.equipment_days.toFixed(1)} days
                        </div>
                      )}
                    </div>

                    <div className="cost-item">
                      <div className="cost-label">Materials</div>
                      <div className="cost-value">
                        ${((line.material_cost_cents || 0) / 100).toFixed(2)}
                      </div>
                      {line.calc_details?.materials && (
                        <div style={{ fontSize: '8pt', color: '#9ca3af' }}>
                          {line.calc_details.materials.length} items
                        </div>
                      )}
                    </div>
                  </div>

                  {line.calc_details && (
                    <div style={{ marginTop: '10px', fontSize: '8pt', color: '#9ca3af' }}>
                      <details>
                        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                          Calculation Details
                        </summary>
                        <pre style={{ marginTop: '5px', padding: '8px', background: '#f3f4f6', borderRadius: '3px', overflow: 'auto' }}>
                          {JSON.stringify(line.calc_details, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* Estimation Summary Section */}
          {estimate && (
            <section>
              <h2>📊 Estimation Summary</h2>
              <p style={{ marginBottom: '20px', color: '#6b7280' }}>
                Final cost estimate with overhead, profit, contingency, and GST.
              </p>

              <div className="estimate-box">
                <div className="estimate-row">
                  <span className="estimate-label">Subtotal (Labour + Equipment + Materials)</span>
                  <span className="estimate-value">
                    ${((estimate.subtotal_cents || 0) / 100).toFixed(2)}
                  </span>
                </div>

                <div className="estimate-row">
                  <span className="estimate-label">Overhead ({estimate.overhead_pct}%)</span>
                  <span className="estimate-value">
                    ${(((estimate.breakdown?.components?.overhead || 0) / 100).toFixed(2))}
                  </span>
                </div>

                <div className="estimate-row">
                  <span className="estimate-label">Profit ({estimate.profit_pct}%)</span>
                  <span className="estimate-value">
                    ${(((estimate.breakdown?.components?.profit || 0) / 100).toFixed(2))}
                  </span>
                </div>

                <div className="estimate-row">
                  <span className="estimate-label">Contingency ({estimate.contingency_pct}%)</span>
                  <span className="estimate-value">
                    ${(((estimate.breakdown?.components?.contingency || 0) / 100).toFixed(2))}
                  </span>
                </div>

                <div className="estimate-row">
                  <span className="estimate-label">GST ({estimate.gst_pct}%)</span>
                  <span className="estimate-value">
                    ${((estimate.gst_cents || 0) / 100).toFixed(2)}
                  </span>
                </div>

                <div className="estimate-row total">
                  <span className="estimate-label">Total (inc. GST)</span>
                  <span className="estimate-value">
                    ${((estimate.total_inc_gst_cents || 0) / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: '15px', padding: '12px', background: '#fef3c7', borderLeft: '4px solid #f59e0b', borderRadius: '4px' }}>
                <p style={{ fontSize: '9pt', color: '#92400e' }}>
                  <strong>Estimation Note:</strong> This is an indicative estimate based on the scope of works generated from the inspection report.
                  Final pricing may vary based on site conditions, access requirements, and material availability.
                  All costs are exclusive of any insurance deductibles or betterment considerations.
                </p>
              </div>
            </section>
          )}

          <footer>
            <p>Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>

            <div className="disclaimer">
              <strong>NOTICE:</strong> This report has been generated using the RestoreAssist Template Framework.
              It is provided for educational and demonstration purposes only.
              Users must review and adapt this template to their own operational requirements and
              verify compliance with relevant standards and regulations. This template does not constitute
              professional advice and should be customized by qualified restoration professionals before use
              in production environments.
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
