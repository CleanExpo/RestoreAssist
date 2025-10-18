import { db } from './connection';
import { GeneratedReport, ReportItem } from '../types';

// Helper: Convert database row to GeneratedReport
function rowToReport(row: any): GeneratedReport {
  return {
    reportId: row.report_id,
    timestamp: row.timestamp || row.created_at, // Use timestamp field or fallback to created_at
    propertyAddress: row.property_address,
    damageType: row.damage_type,
    state: row.state,
    summary: row.summary,
    scopeOfWork: row.scope_of_work,
    itemizedEstimate: row.itemized_estimate,
    totalCost: parseFloat(row.total_cost),
    complianceNotes: row.compliance_notes,
    authorityToProceed: row.authority_to_proceed,
    metadata: {
      clientName: row.client_name,
      insuranceCompany: row.insurance_company,
      claimNumber: row.claim_number,
      generatedBy: row.generated_by,
      model: row.model,
    },
  };
}

// CREATE - Insert new report
export async function createReport(report: GeneratedReport): Promise<GeneratedReport> {
  const query = `
    INSERT INTO reports (
      report_id, timestamp, property_address, damage_type, damage_description,
      state, summary, recommendations, scope_of_work, itemized_estimate, total_cost,
      compliance_notes, authority_to_proceed, client_name, insurance_company,
      claim_number, generated_by, model, severity, urgent, timeline
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
    )
    RETURNING *
  `;

  const values = [
    report.reportId,
    report.timestamp,
    report.propertyAddress,
    report.damageType,
    '', // damage_description (will be derived from report)
    report.state,
    report.summary,
    JSON.stringify([]), // recommendations (empty array for now)
    JSON.stringify(report.scopeOfWork),
    JSON.stringify(report.itemizedEstimate),
    report.totalCost,
    JSON.stringify(report.complianceNotes),
    report.authorityToProceed,
    report.metadata.clientName || null,
    report.metadata.insuranceCompany || null,
    report.metadata.claimNumber || null,
    report.metadata.generatedBy,
    report.metadata.model,
    'Medium', // severity (default)
    false, // urgent (default)
    '2-4 weeks', // timeline (default)
  ];

  const row = await db.one(query, values);
  return rowToReport(row);
}

// READ - Find report by ID
export async function findReportById(reportId: string): Promise<GeneratedReport | null> {
  const query = `
    SELECT * FROM reports
    WHERE report_id = $1 AND deleted_at IS NULL
  `;

  const row = await db.oneOrNone(query, [reportId]);
  return row ? rowToReport(row) : null;
}

// READ - Find all reports with pagination
export async function findAllReports(options: {
  page: number;
  limit: number;
  sortBy: 'timestamp' | 'totalCost';
  order: 'asc' | 'desc';
}): Promise<{ reports: GeneratedReport[]; total: number; page: number; totalPages: number }> {
  const { page, limit, sortBy, order } = options;
  const offset = (page - 1) * limit;

  // Map sortBy to database columns
  const sortColumn = sortBy === 'timestamp' ? 'created_at' : 'total_cost';
  const sortOrder = order.toUpperCase();

  // Get total count
  const countQuery = `SELECT COUNT(*) as count FROM reports WHERE deleted_at IS NULL`;
  const { count } = await db.one(countQuery);
  const total = parseInt(count);

  // Get paginated results
  const dataQuery = `
    SELECT * FROM reports
    WHERE deleted_at IS NULL
    ORDER BY ${sortColumn} ${sortOrder}
    LIMIT $1 OFFSET $2
  `;

  const rows = await db.manyOrNone(dataQuery, [limit, offset]);
  const reports = rows.map(rowToReport);

  return {
    reports,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// UPDATE - Update report
export async function updateReport(
  reportId: string,
  updates: Partial<GeneratedReport>
): Promise<GeneratedReport | null> {
  // Build dynamic update query
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (updates.summary !== undefined) {
    setClauses.push(`summary = $${paramCount++}`);
    values.push(updates.summary);
  }

  if (updates.scopeOfWork !== undefined) {
    setClauses.push(`scope_of_work = $${paramCount++}`);
    values.push(JSON.stringify(updates.scopeOfWork));
  }

  if (updates.itemizedEstimate !== undefined) {
    setClauses.push(`itemized_estimate = $${paramCount++}`);
    values.push(JSON.stringify(updates.itemizedEstimate));
  }

  if (updates.totalCost !== undefined) {
    setClauses.push(`total_cost = $${paramCount++}`);
    values.push(updates.totalCost);
  }

  if (updates.complianceNotes !== undefined) {
    setClauses.push(`compliance_notes = $${paramCount++}`);
    values.push(JSON.stringify(updates.complianceNotes));
  }

  if (updates.authorityToProceed !== undefined) {
    setClauses.push(`authority_to_proceed = $${paramCount++}`);
    values.push(updates.authorityToProceed);
  }

  if (updates.metadata?.clientName !== undefined) {
    setClauses.push(`client_name = $${paramCount++}`);
    values.push(updates.metadata.clientName);
  }

  if (updates.metadata?.insuranceCompany !== undefined) {
    setClauses.push(`insurance_company = $${paramCount++}`);
    values.push(updates.metadata.insuranceCompany);
  }

  if (updates.metadata?.claimNumber !== undefined) {
    setClauses.push(`claim_number = $${paramCount++}`);
    values.push(updates.metadata.claimNumber);
  }

  if (setClauses.length === 0) {
    // No updates to apply
    return findReportById(reportId);
  }

  values.push(reportId);

  const query = `
    UPDATE reports
    SET ${setClauses.join(', ')}
    WHERE report_id = $${paramCount} AND deleted_at IS NULL
    RETURNING *
  `;

  const row = await db.oneOrNone(query, values);
  return row ? rowToReport(row) : null;
}

// DELETE - Soft delete report
export async function deleteReport(reportId: string): Promise<boolean> {
  const query = `
    UPDATE reports
    SET deleted_at = NOW()
    WHERE report_id = $1 AND deleted_at IS NULL
    RETURNING report_id
  `;

  const result = await db.oneOrNone(query, [reportId]);
  return result !== null;
}

// DELETE - Hard delete report (permanent)
export async function hardDeleteReport(reportId: string): Promise<boolean> {
  const query = `DELETE FROM reports WHERE report_id = $1 RETURNING report_id`;
  const result = await db.oneOrNone(query, [reportId]);
  return result !== null;
}

// DELETE - Delete reports older than X days
export async function deleteOlderThan(days: number): Promise<number> {
  const query = `
    UPDATE reports
    SET deleted_at = NOW()
    WHERE created_at < NOW() - INTERVAL '${days} days'
      AND deleted_at IS NULL
    RETURNING report_id
  `;

  const results = await db.manyOrNone(query);
  return results.length;
}

// STATS - Get report statistics
export async function getStats(): Promise<{
  totalReports: number;
  totalValue: number;
  averageValue: number;
  byDamageType: Record<string, number>;
  byState: Record<string, number>;
  recentReports: number;
}> {
  // Total reports and value
  const totalsQuery = `
    SELECT
      COUNT(*) as total_reports,
      COALESCE(SUM(total_cost), 0) as total_value,
      COALESCE(AVG(total_cost), 0) as average_value
    FROM reports
    WHERE deleted_at IS NULL
  `;
  const totals = await db.one(totalsQuery);

  // By damage type
  const damageTypeQuery = `
    SELECT damage_type, COUNT(*) as count
    FROM reports
    WHERE deleted_at IS NULL
    GROUP BY damage_type
  `;
  const damageTypeRows = await db.manyOrNone(damageTypeQuery);
  const byDamageType: Record<string, number> = {};
  damageTypeRows.forEach((row) => {
    byDamageType[row.damage_type] = parseInt(row.count);
  });

  // By state
  const stateQuery = `
    SELECT state, COUNT(*) as count
    FROM reports
    WHERE deleted_at IS NULL
    GROUP BY state
  `;
  const stateRows = await db.manyOrNone(stateQuery);
  const byState: Record<string, number> = {};
  stateRows.forEach((row) => {
    byState[row.state] = parseInt(row.count);
  });

  // Recent reports (last 24 hours)
  const recentQuery = `
    SELECT COUNT(*) as count
    FROM reports
    WHERE created_at > NOW() - INTERVAL '24 hours'
      AND deleted_at IS NULL
  `;
  const { count: recentCount } = await db.one(recentQuery);

  return {
    totalReports: parseInt(totals.total_reports),
    totalValue: parseFloat(totals.total_value),
    averageValue: parseFloat(totals.average_value),
    byDamageType,
    byState,
    recentReports: parseInt(recentCount),
  };
}

// ADMIN - Get admin statistics
export async function getAdminStats(): Promise<{
  totalReports: number;
  databaseSize: number;
  oldestReport: string | null;
  newestReport: string | null;
}> {
  const query = `
    SELECT
      COUNT(*) as total_reports,
      MIN(created_at) as oldest_report,
      MAX(created_at) as newest_report
    FROM reports
    WHERE deleted_at IS NULL
  `;

  const stats = await db.one(query);

  return {
    totalReports: parseInt(stats.total_reports),
    databaseSize: parseInt(stats.total_reports),
    oldestReport: stats.oldest_report ? stats.oldest_report.toISOString() : null,
    newestReport: stats.newest_report ? stats.newest_report.toISOString() : null,
  };
}

// ADMIN - Clear all reports (hard delete)
export async function clearAllReports(): Promise<number> {
  const query = `DELETE FROM reports RETURNING report_id`;
  const results = await db.manyOrNone(query);
  return results.length;
}

// UTILITY - Count reports
export async function countReports(): Promise<number> {
  const query = `SELECT COUNT(*) as count FROM reports WHERE deleted_at IS NULL`;
  const { count } = await db.one(query);
  return parseInt(count);
}
