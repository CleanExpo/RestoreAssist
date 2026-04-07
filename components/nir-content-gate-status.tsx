/**
 * NIR Content Gate Status Dashboard
 *
 * Server component — renders the current gate status for all content domains.
 * Reads directly from nir-content-gate.ts (no API fetch needed).
 *
 * Usage in the admin portal:
 *   import { NirContentGateDashboard } from '@/components/nir-content-gate-status'
 *
 *   // In an admin page (server component):
 *   <NirContentGateDashboard />
 *
 * Individual domain check (for a CMS editor preview):
 *   <NirDomainGateCard domain="water-damage" />
 */

import {
  getAllGateStatuses,
  checkContentGate,
  type ContentDomain,
  type GateCheckResult,
  type GateStatus,
} from "@/lib/nir-content-gate";

// ─── STYLE MAPS ───────────────────────────────────────────────────────────────

const GATE_STATUS_STYLES: Record<
  GateStatus,
  {
    pill: string;
    label: string;
    icon: string;
    border: string;
    headerBg: string;
  }
> = {
  open: {
    pill: "bg-green-100 text-green-800 border border-green-200",
    label: "Open",
    icon: "✓",
    border: "border-green-200",
    headerBg: "bg-green-50",
  },
  partial: {
    pill: "bg-amber-100 text-amber-800 border border-amber-200",
    label: "Partial",
    icon: "⚠",
    border: "border-amber-200",
    headerBg: "bg-amber-50",
  },
  blocked: {
    pill: "bg-red-100 text-red-800 border border-red-200",
    label: "Blocked",
    icon: "✗",
    border: "border-red-200",
    headerBg: "bg-red-50",
  },
};

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function GateStatusPill({ status }: { status: GateStatus }) {
  const styles = GATE_STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles.pill}`}
    >
      <span aria-hidden="true">{styles.icon}</span>
      {styles.label}
    </span>
  );
}

function CertificationRow({ result }: { result: GateCheckResult }) {
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-slate-700">
          Certification requirement
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            result.certificationMet
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {result.certificationMet ? "Obtained" : "Not yet obtained"}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
        {result.certificationRecord.requirement}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        Owner: {result.certificationRecord.gateOwner}
      </p>
    </div>
  );
}

function ClaimRow({
  claim,
  blocked,
}: {
  claim: {
    id: string;
    claim: string;
    status: string;
    source?: string;
    notes?: string;
  };
  blocked: boolean;
}) {
  return (
    <li
      className={`flex items-start gap-2 py-1.5 text-xs ${blocked ? "text-red-700" : "text-green-700"}`}
    >
      <span className="mt-0.5 shrink-0 font-mono font-bold">{claim.id}</span>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 font-medium uppercase tracking-wide text-[10px] ${
          blocked ? "bg-red-100" : "bg-green-100"
        }`}
      >
        {claim.status}
      </span>
      <span className="text-slate-700 leading-relaxed">{claim.claim}</span>
    </li>
  );
}

// ─── DOMAIN GATE CARD ─────────────────────────────────────────────────────────

interface NirDomainGateCardProps {
  domain: ContentDomain;
}

export function NirDomainGateCard({ domain }: NirDomainGateCardProps) {
  const result = checkContentGate(domain);
  const styles = GATE_STATUS_STYLES[result.gateStatus];

  return (
    <div
      className={`overflow-hidden rounded-lg border ${styles.border} bg-white shadow-sm`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 ${styles.headerBg}`}
      >
        <span className="text-sm font-semibold text-slate-800 capitalize">
          {domain.replace(/-/g, " ")}
        </span>
        <GateStatusPill status={result.gateStatus} />
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Certification */}
        <CertificationRow result={result} />

        {/* Allowed claims */}
        {result.allowedClaims.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
              Publishable claims ({result.allowedClaims.length})
            </p>
            <ul className="divide-y divide-slate-100">
              {result.allowedClaims.map((c) => (
                <ClaimRow key={c.id} claim={c} blocked={false} />
              ))}
            </ul>
          </div>
        )}

        {/* Blocked claims */}
        {result.blockedClaims.length > 0 && (
          <div>
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">
              Blocked claims ({result.blockedClaims.length}) — not publishable
            </p>
            <ul className="divide-y divide-red-50">
              {result.blockedClaims.map((c) => (
                <ClaimRow key={c.id} claim={c} blocked={true} />
              ))}
            </ul>
          </div>
        )}

        {/* Required actions */}
        {result.requiredActions.length > 0 && (
          <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-700 mb-2">
              Required to open gate
            </p>
            <ol className="space-y-1 list-decimal list-inside">
              {result.requiredActions.map((action, i) => (
                <li key={i} className="text-xs text-slate-600 leading-relaxed">
                  {action}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FULL DASHBOARD ───────────────────────────────────────────────────────────

export function NirContentGateDashboard() {
  const clearance = getAllGateStatuses();

  const domains: ContentDomain[] = [
    "water-damage",
    "mould-remediation",
    "fire-smoke",
    "cost-savings",
    "industry-standard",
  ];

  const openCount = clearance.approvedDomains.length;
  const totalCount = domains.length;

  return (
    <div className="space-y-6">
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            NIR Content Gate
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Evidence-based publication gate — all domains must be open before
            customer-facing content referencing NIR capabilities can be
            published.
          </p>
        </div>
        <div className="text-right">
          <div
            className={`text-2xl font-bold tabular-nums ${
              openCount === totalCount
                ? "text-green-600"
                : openCount > 0
                  ? "text-amber-600"
                  : "text-red-600"
            }`}
          >
            {openCount}/{totalCount}
          </div>
          <div className="text-xs text-slate-400">domains open</div>
        </div>
      </div>

      {/* Alert if nothing is open */}
      {openCount === 0 && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <strong>All content gates blocked.</strong> No customer-facing content
          referencing NIR capabilities, IICRC standards, or cost savings claims
          may be published. See{" "}
          <code className="rounded bg-red-100 px-1 py-0.5 text-xs">
            docs/CONTENT-GATE.md
          </code>{" "}
          for gate conditions and the Phase 2 pilot roadmap.
        </div>
      )}

      {/* Domain cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {domains.map((domain) => (
          <NirDomainGateCard key={domain} domain={domain} />
        ))}
      </div>

      <p className="text-xs text-slate-400 text-right">
        Gate status checked at: {clearance.checkedAt}
        {" · "}
        Source of truth:{" "}
        <code className="rounded bg-slate-100 px-1">
          lib/nir-content-gate.ts
        </code>
      </p>
    </div>
  );
}
