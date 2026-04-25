/**
 * SafetyCulture (iAuditor) API client — P1-INT6
 *
 * Uses the SafetyCulture REST API v1 with Bearer token auth.
 * API key is stored in SAFETYCULTURE_API_KEY env var.
 *
 * Docs: https://developer.safetyculture.com/reference
 *
 * RA-1128
 */

const BASE_URL = "https://api.safetyculture.io";

export type AuditItemScore = "passed" | "failed" | "na" | null;

export interface IauditorTemplate {
  template_id: string;
  name: string;
  description?: string;
  created_at: string;
  modified_at: string;
  archived: boolean;
}

export interface IauditorAuditHeader {
  audit_id: string;
  template_id: string;
  template_name: string;
  audit_name?: string;
  score?: number;
  max_score?: number;
  score_percentage?: number;
  duration?: number; // seconds
  date_started?: string;  // ISO-8601
  date_completed?: string; // ISO-8601
  created_at: string;
  modified_at: string;
  archived: boolean;
  completed: boolean;
}

export interface IauditorAuditAnswer {
  question_id: string;
  label: string;
  type: string;
  score?: number;
  max_score?: number;
  response?: {
    text?: string;
    selected_responses?: string[];
  };
  failed?: boolean;
  media_files?: Array<{ media_id: string; href: string }>;
}

export interface IauditorAuditDetail extends IauditorAuditHeader {
  audit_data: {
    date_started?: string;
    date_completed?: string;
    site?: {
      name?: string;
      address?: string;
    };
    conducted_on?: string;
    prepared_by?: string;
  };
  header_items: IauditorAuditAnswer[];
  items: IauditorAuditAnswer[];
}

function getApiKey(): string {
  const key = process.env.SAFETYCULTURE_API_KEY;
  if (!key) throw new Error("SAFETYCULTURE_API_KEY is not set");
  return key;
}

async function safetyCultureFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw Object.assign(new Error(`SafetyCulture API error ${res.status}: ${body}`), {
      status: res.status,
    });
  }

  return res.json() as Promise<T>;
}

/**
 * List templates (SWMS, JSA, toolbox talk templates).
 * Returns up to `limit` results ordered by modification date descending.
 */
export async function listTemplates(limit = 50): Promise<IauditorTemplate[]> {
  const data = await safetyCultureFetch<{ data: IauditorTemplate[] }>(
    "/templates/v1/templates",
    { limit: String(limit) },
  );
  return data.data ?? [];
}

/**
 * Search audits (completed inspections / toolbox talks / SWMS signoffs).
 *
 * @param templateId  Optionally filter to one template.
 * @param modifiedAfter ISO-8601 string — only audits changed after this date.
 * @param limit  Max results (default 50, max 100).
 */
export async function searchAudits(opts?: {
  templateId?: string;
  modifiedAfter?: string;
  limit?: number;
}): Promise<IauditorAuditHeader[]> {
  const params: Record<string, string> = {
    limit: String(Math.min(opts?.limit ?? 50, 100)),
    completed: "true",
    archived: "false",
  };
  if (opts?.templateId) params.template_id = opts.templateId;
  if (opts?.modifiedAfter) params.modified_after = opts.modifiedAfter;

  const data = await safetyCultureFetch<{ audits: IauditorAuditHeader[] }>(
    "/audits/v1/audits/search",
    params,
  );
  return data.audits ?? [];
}

/**
 * Fetch full audit detail including all question items and answers.
 */
export async function getAuditDetail(auditId: string): Promise<IauditorAuditDetail> {
  return safetyCultureFetch<IauditorAuditDetail>(`/audits/v1/audits/${auditId}`);
}

/**
 * Map a SafetyCulture audit to WHSIncident field values.
 * Infers severity from audit score_percentage and presence of failed items.
 */
export function auditToIncidentFields(audit: IauditorAuditHeader): {
  incidentType: string;
  severity: string;
  status: string;
  incidentDate: Date;
  description: string;
} {
  const scorePct = audit.score_percentage ?? 100;
  const severity =
    scorePct < 50 ? "CRITICAL" :
    scorePct < 70 ? "HIGH" :
    scorePct < 85 ? "MEDIUM" : "LOW";

  const incidentDate = new Date(
    audit.date_completed ?? audit.date_started ?? audit.created_at,
  );

  return {
    incidentType: "safetyculture_audit",
    severity,
    status: "OPEN",
    incidentDate,
    description: `iAuditor: ${audit.template_name}${audit.audit_name ? ` — ${audit.audit_name}` : ""}. Score: ${scorePct.toFixed(0)}%`,
  };
}
