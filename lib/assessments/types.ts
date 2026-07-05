/**
 * Unified assessment-generation types — RA-1717.
 *
 * Stable shapes that domain plug-ins (lib/assessments/domains/*.ts)
 * conform to so the orchestrator (generate.ts) and the persistence
 * layer (Prisma `AssessmentGeneration`) treat every domain the same.
 *
 * Adding a new domain (mould, biohazard, fire/smoke, hvac, storm,
 * australian-compliance, …) is just a matter of writing a new
 * `DomainPlugin` and registering it in lib/assessments/registry.ts —
 * no schema or API changes required.
 */

// ─── Citations ────────────────────────────────────────────────────────────────

/**
 * IICRC / AS-NZS standard reference. Free-form so domain plug-ins can
 * reference S500 / S520 / S700 / AS-NZS 3012 / WHS Act §19 / GICOP §4.2 / etc.
 */
export interface StandardCitation {
  /** e.g. "IICRC S500:2021" or "AS/NZS 3012:2019". */
  standard: string;
  /** e.g. "§12.5" or "Annex B Table 2". */
  section: string;
  /** Optional one-line excerpt for the reader; never long-form. */
  note?: string;
}

// ─── Report ───────────────────────────────────────────────────────────────────

export interface ReportSection {
  /** e.g. "Executive summary", "Scope of works", "Equipment justification". */
  heading: string;
  /** Plain text or simple Markdown. Generators MAY embed inline citations. */
  body: string;
  /** Citations specific to this section. */
  citations?: StandardCitation[];
}

export interface AssessmentReport {
  sections: ReportSection[];
}

// ─── Scope ────────────────────────────────────────────────────────────────────

export type ScopeCategory =
  | "EQUIPMENT"
  | "LABOUR"
  | "MATERIALS"
  | "DISPOSAL"
  | "TESTING"
  | "PROTECTIVE"
  | "ADMIN";

export interface ScopeItem {
  /** Human-readable line. e.g. "LGR dehumidifier — 24h on standard". */
  description: string;
  category: ScopeCategory;
  quantity: number;
  unit: string; // e.g. "ea", "hr", "m²", "kg"
  /** IICRC or AS-NZS reference that justifies the item. Required for audit. */
  iicrcRef: string;
  /** Optional notes the technician adds verbatim (rare). */
  notes?: string;
}

// ─── Estimate ─────────────────────────────────────────────────────────────────

export interface EstimateLine {
  description: string;
  category: ScopeCategory;
  quantity: number;
  unit: string;
  /** Per-unit rate in workspace's billing currency (default AUD ex GST). */
  rate: number;
  /** quantity × rate, ex GST. */
  lineTotalExGst: number;
  /** GST (10% AU default) on lineTotalExGst. */
  gstAmount: number;
  /** lineTotalExGst + gstAmount. */
  lineTotalIncGst: number;
  /** CostItem.id when matched against the workspace's CostLibrary; null when free-typed. */
  costItemId?: string | null;
}

export interface EstimateTotals {
  subtotalExGst: number;
  gstTotal: number;
  totalIncGst: number;
  /** GST rate applied (0.10 in AU). */
  gstRate: number;
  /** ISO 4217 currency code. AUD by default. */
  currency: string;
}

export interface AssessmentEstimate {
  lines: EstimateLine[];
  totals: EstimateTotals;
}

// ─── Generation result ────────────────────────────────────────────────────────

export type AssessmentDomain =
  | "WATER"
  | "MOULD"
  | "BIOHAZARD"
  | "FIRE_SMOKE"
  | "HVAC"
  | "STORM"
  | "AUSTRALIAN_COMPLIANCE";

export interface GenerationMeta {
  domain: AssessmentDomain;
  /** When the artefact set was assembled. */
  generatedAt: Date;
  /** Model identifier when AI was used (e.g. "claude-sonnet-4-6"); null for rule-only. */
  modelUsed: string | null;
  /** Wall-clock duration of the full generation. */
  latencyMs: number;
  /** Best-effort USD cost estimate when AI was used. */
  costEstimateUsd: number | null;
  /** Workspace that paid for the generation; null when unscoped (legacy single-user). */
  workspaceId: string | null;
}

export interface AssessmentGenerationResult {
  report: AssessmentReport;
  scope: { items: ScopeItem[] };
  estimate: AssessmentEstimate;
  /** Aggregated citations across the whole artefact set. */
  citations: StandardCitation[];
  meta: GenerationMeta;
}

// ─── Domain plug-in contract ──────────────────────────────────────────────────

/**
 * Inputs passed into a domain plug-in. Generic shape — the plug-in narrows
 * via type assertions or domain-specific loaders.
 */
export interface DomainGenerateInput {
  inspectionId: string;
  /** Used for audit + budget guard. Null for legacy single-user setups. */
  workspaceId: string | null;
  /** User who triggered the generation. */
  userId: string;
  /**
   * Optional domain-specific payload threaded through from the API caller.
   * Example: MOULD plug-in reads `{ condition, ambientRelativeHumidity }`
   * from this. WATER plug-in ignores it (everything is auto-derived from
   * Inspection state). Plug-ins are responsible for their own narrowing
   * + validation; the orchestrator passes the raw value through.
   */
  options?: Record<string, unknown> | null;
}

/**
 * The contract every domain plug-in fulfils. Pure: no I/O beyond what
 * the domain itself needs (Prisma reads from inspection / cost library /
 * standards; optional Anthropic call).
 *
 * The plug-in MUST never throw across the orchestrator boundary —
 * unwrap to a typed error result that generate.ts can surface as 4xx/5xx.
 */
export interface DomainPlugin {
  domain: AssessmentDomain;

  /** Short human label for surfaces (UI, PDF headers). */
  label: string;

  /**
   * Concrete generation. Returns the result OR a typed error.
   */
  generate(input: DomainGenerateInput): Promise<DomainGenerateResult>;
}

export type DomainGenerateResult =
  | {
      ok: true;
      data: Omit<AssessmentGenerationResult, "meta"> & {
        meta: Omit<GenerationMeta, "domain" | "generatedAt">;
      };
    }
  | { ok: false; code: DomainErrorCode; message: string };

export type DomainErrorCode =
  | "NOT_FOUND"
  | "INSUFFICIENT_DATA"
  | "BUDGET_EXCEEDED"
  | "UPSTREAM_AI_ERROR"
  | "INTERNAL";
