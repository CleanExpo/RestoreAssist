/**
 * Authority to Work planner (RA-8468, slice 1).
 *
 * A pure function: job facts in, an authority plan out. It answers, for every
 * scope line, whether access, work authority, payer, insurer terms, safety and
 * irreversible-action approval are each in place, and which draft forms should
 * go to which person to close the gaps.
 *
 * WHICH WAY THIS ERRS. Every unknown is a gap or a hold, never a pass:
 *   - a report of approval is not proof of approval;
 *   - a signer clears only the assets they control;
 *   - a party with no proven spend authority never clears the payer gate;
 *   - a funding rule that is unreviewed, expired or on a different currency or
 *     GST basis holds the line rather than being guessed at;
 *   - a signature never stands in for safety clearance.
 *
 * NOTHING HERE SENDS. Every draft carries `sendable: false`. Sending, saving and
 * payment are separate, later slices behind their own approvals.
 */
import { TEMPLATES, type TemplateCode } from "./catalogue";
import { exactAmount, formatMoney, sameBasis } from "./money";
import type {
  Approval,
  ApprovalKind,
  Asset,
  JobFacts,
  Jurisdiction,
  Money,
  Party,
  ScopeLine,
} from "./types";

/**
 * Jurisdictions the planner will PREVIEW. Previewing is not release: no pack is
 * release-enabled until practitioners sign it off, so `releaseEnabled` is false
 * for every plan this slice produces.
 */
export const PREVIEW_JURISDICTIONS: readonly Jurisdiction[] = [
  "AU-NSW",
  "AU-QLD",
  "NZ",
];

export type Gate =
  "ACCESS" | "WORK" | "PAYER" | "INSURER" | "SAFETY" | "DISPOSAL";
export type GateState = "CLEAR" | "MISSING" | "HOLD" | "NOT_APPLICABLE";

export interface GateResult {
  gate: Gate;
  state: GateState;
  reason: string;
}

export interface ScopePlan {
  scopeLineId: string;
  description: string;
  assetLabel: string;
  gates: GateResult[];
  canStart: boolean;
}

export interface PrefillField {
  key: string;
  value: string | null;
  /** The record the value came from. `null` when blank. */
  source: string | null;
  /** Why a blank is blank. Present exactly when `value` is null. */
  blankReason?: string;
}

export interface FormDraft {
  code: TemplateCode;
  name: string;
  recipientPartyId: string | null;
  scopeLineIds: string[];
  reason: string;
  /** What the customer reads above their signature panel. */
  customerPreview: string;
  fields: PrefillField[];
  sendable: false;
  notSendableBecause: string[];
}

export interface AuthorityPlan {
  jobId: string;
  jurisdiction: Jurisdiction;
  previewAllowed: boolean;
  releaseEnabled: false;
  holds: string[];
  scopes: ScopePlan[];
  forms: FormDraft[];
  deposit: { requested: boolean; enabled: false; reason: string };
  sendable: false;
}

const PREVIEW_ONLY = "Preview only: sending is not built in this slice.";

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

function indexById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

interface Ctx {
  job: JobFacts;
  parties: Map<string, Party>;
  assets: Map<string, Asset>;
}

function partyName(ctx: Ctx, id: string | null | undefined): string {
  if (!id) return "nobody identified";
  const p = ctx.parties.get(id);
  return p ? `${p.name} (${p.capacity})` : `unknown party ${id}`;
}

/** Control is established only for a verified owner who is a party on this job. */
function ownerEstablished(ctx: Ctx, asset: Asset): boolean {
  return (
    !!asset.ownerPartyId &&
    asset.ownershipEvidence === "verified" &&
    ctx.parties.has(asset.ownerPartyId)
  );
}

/** Does this party control this asset, directly or by proven delegation? */
function controls(
  ctx: Ctx,
  asset: Asset,
  partyId: string,
): { ok: boolean; why: string } {
  if (!ownerEstablished(ctx, asset)) {
    return {
      ok: false,
      why: `who controls "${asset.label}" is not established`,
    };
  }
  if (partyId === asset.ownerPartyId)
    return { ok: true, why: "controls the asset" };
  const p = ctx.parties.get(partyId);
  if (p?.actsForPartyId === asset.ownerPartyId) {
    if (p.delegationEvidence === "verified") {
      return {
        ok: true,
        why: `verified delegate of ${partyName(ctx, asset.ownerPartyId)}`,
      };
    }
    return {
      ok: false,
      why: `their delegation from ${partyName(ctx, asset.ownerPartyId)} is ${p.delegationEvidence ?? "unknown"}, not verified`,
    };
  }
  return { ok: false, why: `they do not control "${asset.label}"` };
}

/** The confirmed payer for a line when that payer is a party on the job, else null. */
function payerOnJob(ctx: Ctx, line: ScopeLine): string | null {
  const id = line.payment.payerPartyId;
  if (!id || line.payment.basis === "UNCONFIRMED" || !ctx.parties.has(id))
    return null;
  return id;
}

/**
 * Rule 3 (founder ruling 20/11/2026, strict): a funding document (A04, A10, A11)
 * goes only to a confirmed payer on the job whose spend authority is proven
 * (canAuthoriseSpend === true), whatever the payment type. Otherwise null: the
 * real funder is still to be identified.
 */
function fundingRecipient(ctx: Ctx, line: ScopeLine): string | null {
  const id = payerOnJob(ctx, line);
  return id && ctx.parties.get(id)?.canAuthoriseSpend === true ? id : null;
}

/**
 * Rule 8 (founder ruling 20/11/2026, strict): an emergency line with no documented
 * emergency basis holds ACCESS and WORK, even when approvals are on file.
 */
function undocumentedEmergency(
  ctx: Ctx,
  line: ScopeLine,
  gate: "ACCESS" | "WORK",
): GateResult | null {
  if (!line.emergency || ctx.job.emergencyBasis?.documented) return null;
  return {
    gate,
    state: "HOLD",
    reason: "emergency work with no documented emergency basis",
  };
}

/** The person who should sign for an asset: a verified delegate, else the owner. */
function controllerOf(ctx: Ctx, asset: Asset): string | null {
  // Same rule as controls(): an owner who is not a party on the job is nobody to ask.
  if (!ownerEstablished(ctx, asset)) return null;
  const delegate = ctx.job.parties.find(
    (p) =>
      p.actsForPartyId === asset.ownerPartyId &&
      p.delegationEvidence === "verified",
  );
  return delegate?.id ?? asset.ownerPartyId;
}

function approvalsFor(
  ctx: Ctx,
  kind: ApprovalKind,
  line: ScopeLine,
): Approval[] {
  return ctx.job.approvals.filter(
    (a) =>
      a.kind === kind &&
      // Only ACCESS is granted per asset. Every other kind must name the line itself,
      // so an approval for one line never clears another line on the same asset.
      (a.scopeLineIds?.includes(line.id) ||
        (kind === "ACCESS" && a.assetIds?.includes(line.assetId))),
  );
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

function accessGate(ctx: Ctx, line: ScopeLine, asset: Asset): GateResult {
  const emergencyHold = undocumentedEmergency(ctx, line, "ACCESS");
  if (emergencyHold) return emergencyHold;
  const found = approvalsFor(ctx, "ACCESS", line);
  for (const a of found) {
    const p = ctx.parties.get(a.partyId);
    // A role alone grants nothing: the occupier must be proven to occupy this asset.
    const occupierAccess =
      (p?.capacity === "TENANT" ||
        p?.capacity === "OCCUPIER" ||
        p?.capacity === "SITE_MANAGER") &&
      p.occupancyEvidence === "verified" &&
      (p.occupiesAssetIds ?? []).includes(asset.id);
    if (
      a.evidence === "verified" &&
      (controls(ctx, asset, a.partyId).ok || occupierAccess)
    ) {
      return {
        gate: "ACCESS",
        state: "CLEAR",
        reason: `access given by ${partyName(ctx, a.partyId)}`,
      };
    }
  }
  // One rule for what an emergency basis covers: eligibleMakeSafe (no restricted action).
  if (eligibleMakeSafe(line)) {
    // Reached only with a documented basis (undocumentedEmergency returned above).
    return {
      gate: "ACCESS",
      state: "CLEAR",
      reason:
        "emergency basis documented; written access to follow as soon as practicable",
    };
  }
  const reported = found.find((a) => a.evidence !== "verified");
  return {
    gate: "ACCESS",
    state: "MISSING",
    reason: reported
      ? `access from ${partyName(ctx, reported.partyId)} is reported, not proven`
      : "no access permission recorded",
  };
}

function workGate(ctx: Ctx, line: ScopeLine, asset: Asset): GateResult {
  const emergencyHold = undocumentedEmergency(ctx, line, "WORK");
  if (emergencyHold) return emergencyHold;
  if (!ownerEstablished(ctx, asset)) {
    return {
      gate: "WORK",
      state: "HOLD",
      reason: `who controls "${asset.label}" is not established`,
    };
  }
  const found = approvalsFor(ctx, "WORK", line);
  const problems: string[] = [];
  for (const a of found) {
    const c = controls(ctx, asset, a.partyId);
    if (!c.ok) {
      problems.push(`${partyName(ctx, a.partyId)} signed, but ${c.why}`);
      continue;
    }
    if (a.evidence !== "verified") {
      problems.push(
        `approval from ${partyName(ctx, a.partyId)} is reported, not proven`,
      );
      continue;
    }
    return {
      gate: "WORK",
      state: "CLEAR",
      reason: `approved by ${partyName(ctx, a.partyId)} (${c.why})`,
    };
  }
  if (eligibleMakeSafe(line)) {
    // Reached only with a documented basis (undocumentedEmergency returned above).
    return {
      gate: "WORK",
      state: "CLEAR",
      reason:
        "make-safe only, under the documented emergency basis; written authority to follow",
    };
  }
  return {
    gate: "WORK",
    state: "MISSING",
    reason: problems.length
      ? problems.join("; ")
      : `needs approval from ${partyName(ctx, controllerOf(ctx, asset))}`,
  };
}

function payerGate(ctx: Ctx, line: ScopeLine): GateResult {
  const { basis, payerPartyId } = line.payment;
  if (basis === "UNCONFIRMED" || !payerPartyId) {
    return {
      gate: "PAYER",
      state: "MISSING",
      reason:
        "payer not confirmed. Do not tell the customer insurance will pay.",
    };
  }
  const payer = ctx.parties.get(payerPartyId);
  if (!payer) {
    return {
      gate: "PAYER",
      state: "HOLD",
      reason: `payer ${payerPartyId} is not a party on this job`,
    };
  }
  if (basis === "INSURER_WORK_ORDER" && payer.canAuthoriseSpend !== true) {
    return {
      gate: "PAYER",
      state: "HOLD",
      reason: `${partyName(ctx, payerPartyId)} has no proven authority to commit spend`,
    };
  }
  const kinds: ApprovalKind[] =
    basis === "OWNER_DIRECT" ? ["PAYMENT"] : ["PAYMENT", "WORK"];
  const ok = kinds
    .flatMap((k) => approvalsFor(ctx, k, line))
    .find((a) => a.partyId === payerPartyId && a.evidence === "verified");
  if (ok) {
    return {
      gate: "PAYER",
      state: "CLEAR",
      reason: `payment approved by ${partyName(ctx, payerPartyId)}`,
    };
  }
  return {
    gate: "PAYER",
    state: "MISSING",
    reason:
      basis === "OWNER_DIRECT"
        ? `needs a signed payment agreement from ${partyName(ctx, payerPartyId)}`
        : `written work order from ${partyName(ctx, payerPartyId)} not on file`,
  };
}

const FICTIONAL_TAG = " [fictional teaching fixture]";

/** Running totals per cap, so a later line sees what earlier lines committed. */
type CapLedger = Map<string, number>;

function insurerGate(
  ctx: Ctx,
  line: ScopeLine,
  ledger: CapLedger,
): { result: GateResult; overCap: boolean } {
  const na = {
    result: {
      gate: "INSURER" as const,
      state: "NOT_APPLICABLE" as const,
      reason: "not insurer-funded",
    },
    overCap: false,
  };
  if (line.payment.basis !== "INSURER_WORK_ORDER" || !line.payment.payerPartyId)
    return na;
  const funder = line.payment.payerPartyId;
  const caps = ctx.job.caps.filter((c) => c.funderPartyId === funder);
  if (caps.length === 0) {
    return {
      result: {
        gate: "INSURER",
        state: "HOLD",
        reason: `${partyName(ctx, funder)}'s terms are not on file; no limit or permission is assumed`,
      },
      overCap: false,
    };
  }
  const notes: string[] = [];
  let overCap = false;
  let hold = false;
  // Every reason drawn from a fictional rule says so, on the clear path too.
  const anyFictional = caps.some((c) => c.fictional);
  for (const cap of caps) {
    const tag = cap.fictional ? FICTIONAL_TAG : "";
    if (cap.status !== "REVIEWED") {
      notes.push(`rule ${cap.id} is unreviewed and is not applied${tag}`);
      hold = true;
      continue;
    }
    if (cap.expiresOn && ctx.job.asOf > cap.expiresOn) {
      notes.push(`rule ${cap.id} expired ${cap.expiresOn}${tag}`);
      hold = true;
      continue;
    }
    if (
      !sameBasis(cap.cap, line.amount) ||
      !sameBasis(cap.cap, cap.committed)
    ) {
      notes.push(
        `rule ${cap.id} is in ${cap.cap.currency} ${cap.cap.gst} but the amount is ${line.amount.currency} ${line.amount.gst}; not compared${tag}`,
      );
      // This line cannot be added to the total, so every later total for this
      // cap is unknown rather than silently lower.
      ledger.set(cap.id, Number.POSITIVE_INFINITY);
      hold = true;
      continue;
    }
    const before = ledger.get(cap.id) ?? cap.committed.minor;
    const after = before + line.amount.minor;
    if (![before, line.amount.minor, after, cap.cap.minor].every(Number.isSafeInteger)) {
      notes.push(
        Number.isFinite(before)
          ? `rule ${cap.id}: the running total is too large to add exactly; not compared${tag}`
          : `rule ${cap.id}: an earlier line for this funder could not be added, so the running total is unknown${tag}`,
      );
      ledger.set(cap.id, Number.POSITIVE_INFINITY);
      hold = true;
      continue;
    }
    ledger.set(cap.id, after);
    const m = (minor: number): string => formatMoney({ ...cap.cap, minor });
    if (after > cap.cap.minor) {
      notes.push(
        `${m(before)} committed + ${m(line.amount.minor)} proposed = ${m(after)}, over the ${m(cap.cap.minor)} limit in ${cap.sourceRef}; variation approval needed${tag}`,
      );
      hold = true;
      overCap = true;
    }
    if (
      line.restricted &&
      cap.restrictedNeedsSeparateApproval.includes(line.restricted)
    ) {
      const approved = approvalsFor(ctx, "RESTRICTED_ACTION", line).find(
        (a) => a.partyId === funder && a.evidence === "verified",
      );
      if (!approved) {
        notes.push(
          `${line.restricted.toLowerCase().replace("_", " ")} needs separate written approval from ${partyName(ctx, funder)}, whatever the amount${tag}`,
        );
        hold = true;
      }
    }
  }
  return {
    result: {
      gate: "INSURER",
      state: hold ? "HOLD" : "CLEAR",
      reason: hold
        ? notes.join("; ")
        : `within reviewed terms${anyFictional ? FICTIONAL_TAG : ""}`,
    },
    overCap,
  };
}

function safetyGate(ctx: Ctx, line: ScopeLine): GateResult {
  if (!line.hazardous)
    return {
      gate: "SAFETY",
      state: "NOT_APPLICABLE",
      reason: "no hazard recorded",
    };
  const c = ctx.job.safetyClearances.find(
    (s) => s.scopeLineId === line.id && s.evidence === "verified",
  );
  return c
    ? {
        gate: "SAFETY",
        state: "CLEAR",
        reason: `clearance on file (${c.evidenceRef ?? "reference not recorded"})`,
      }
    : {
        gate: "SAFETY",
        state: "HOLD",
        reason:
          "hazardous material: needs safety clearance. A customer signature is not clearance.",
      };
}

function disposalGate(ctx: Ctx, line: ScopeLine, asset: Asset): GateResult {
  if (!line.restricted)
    return {
      gate: "DISPOSAL",
      state: "NOT_APPLICABLE",
      reason: "nothing irreversible",
    };
  if (asset.evidenceHold) {
    return {
      gate: "DISPOSAL",
      state: "HOLD",
      reason: `"${asset.label}" is held as evidence for inspection`,
    };
  }
  if (line.emergency) {
    return {
      gate: "DISPOSAL",
      state: "HOLD",
      reason: "an emergency basis does not cover removal or disposal",
    };
  }
  const ok = approvalsFor(ctx, "IRREVERSIBLE", line).find(
    (a) => a.evidence === "verified" && controls(ctx, asset, a.partyId).ok,
  );
  return ok
    ? {
        gate: "DISPOSAL",
        state: "CLEAR",
        reason: `itemised approval from ${partyName(ctx, ok.partyId)}`,
      }
    : {
        gate: "DISPOSAL",
        state: "MISSING",
        reason: `needs an itemised approval from ${partyName(ctx, controllerOf(ctx, asset))}`,
      };
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

interface FormNeed {
  code: TemplateCode;
  recipientPartyId: string | null;
  lineId: string;
  reason: string;
}

function field(
  key: string,
  value: string | null | undefined,
  source: string,
  blankReason: string,
): PrefillField {
  return value
    ? { key, value, source }
    : { key, value: null, source: null, blankReason };
}

/** A draft total, or the reason there is none, so the blank names its real cause. */
type LineTotal = { total: Money } | { blankReason: string };

function sumLines(lines: ScopeLine[]): LineTotal {
  if (lines.length === 0) return { blankReason: "no scope lines" };
  const first = lines[0].amount;
  if (!lines.every((l) => sameBasis(l.amount, first)))
    return { blankReason: "lines are in different currencies or GST bases" };
  const minor = lines.reduce((s, l) => s + l.amount.minor, 0);
  // A total that cannot be held exactly is left blank, never rounded.
  return Number.isSafeInteger(minor)
    ? { total: { ...first, minor } }
    : { blankReason: "the total is too large to represent exactly" };
}

/** An emergency line the documented basis can cover: a listed make-safe task, nothing restricted. */
function eligibleMakeSafe(line: ScopeLine): boolean {
  return Boolean(line.emergency && line.makeSafe && !line.restricted);
}

function buildDraft(
  ctx: Ctx,
  code: TemplateCode,
  recipientPartyId: string | null,
  lines: ScopeLine[],
  reasons: string[],
  scopes: ScopePlan[],
  capNotes: string[],
): FormDraft {
  const t = TEMPLATES[code];
  const job = ctx.job;
  const r = recipientPartyId ? ctx.parties.get(recipientPartyId) : undefined;
  const contact = [job.business.phone, job.business.email]
    .filter(Boolean)
    .join(", ");
  const sum = sumLines(lines);
  // Only a confirmed payer who is a party on the job is named; anything else is blank.
  const payers = [...new Set(lines.map((l) => payerOnJob(ctx, l)))];
  // The emergency basis applies only when every line on the draft is make-safe it can cover.
  const emergencyNote =
    job.emergencyBasis?.documented && lines.length > 0 && lines.every(eligibleMakeSafe)
      ? (job.emergencyBasis.note ?? "documented")
      : null;
  const noStop = lines.filter((l) => !l.stopPoint).map((l) => l.id);

  const fields: PrefillField[] = [
    field(
      "supplierLegalName",
      job.business.legalName,
      "business.legalName",
      "not on the business profile",
    ),
    field(
      "supplierBusinessNumber",
      job.business.businessNumber,
      "business.businessNumber",
      "not on the business profile",
    ),
    field(
      "supplierGstStatus",
      job.business.gstRegistered === null
        ? null
        : job.business.gstRegistered
          ? "GST registered"
          : "Not GST registered",
      "business.gstRegistered",
      "GST registration not recorded",
    ),
    field(
      "supplierContact",
      contact || null,
      "business.phone/email",
      "no phone or email on the business profile",
    ),
    field(
      "siteAddress",
      job.siteAddress,
      "job.siteAddress",
      "place of work not recorded",
    ),
    field(
      "recipientName",
      r?.name,
      `party.${recipientPartyId}.name`,
      "recipient not identified",
    ),
    field(
      "recipientCapacity",
      r?.capacity,
      `party.${recipientPartyId}.capacity`,
      "recipient not identified",
    ),
  ];

  for (const key of t.requiredFields) {
    switch (key) {
      case "scopeLines":
        fields.push(
          field(
            key,
            lines
              .map((l) => `${l.description} (${formatMoney(l.amount)})`)
              .join("; "),
            "job.scope",
            "no scope lines",
          ),
        );
        break;
      case "amount":
        fields.push(
          field(
            key,
            "total" in sum ? formatMoney(sum.total) : null,
            "job.scope.amount",
            "blankReason" in sum ? sum.blankReason : "",
          ),
        );
        break;
      case "payer":
        fields.push(
          field(
            key,
            payers.includes(null)
              ? null
              : payers.map((p) => partyName(ctx, p)).join(", "),
            "job.scope.payment",
            "payer not confirmed as a party on this job",
          ),
        );
        break;
      case "workOrderRef":
        fields.push(
          field(
            key,
            job.workOrderRef,
            "job.workOrderRef",
            "work order reference not on file",
          ),
        );
        break;
      case "delegationRef":
        fields.push(
          field(
            key,
            r?.delegationEvidence === "verified"
              ? r.delegationRef
              : r && !r.actsForPartyId
                ? "signs in own right"
                : null,
            `party.${recipientPartyId}.delegationRef`,
            "delegation not verified",
          ),
        );
        break;
      case "areas":
        fields.push(
          field(
            key,
            [
              ...new Set(lines.map((l) => ctx.assets.get(l.assetId)?.label)),
            ].join(", "),
            "job.assets",
            "no areas",
          ),
        );
        break;
      case "accessBasis":
      case "emergencyBasis":
        fields.push(
          field(
            key,
            emergencyNote,
            "job.emergencyBasis",
            key === "accessBasis"
              ? "access basis to be confirmed with the recipient"
              : "no documented emergency basis covering these lines",
          ),
        );
        break;
      case "stopPoint":
        fields.push(
          field(
            key,
            noStop.length === 0
              ? lines.map((l) => l.stopPoint).join("; ")
              : null,
            "job.scope.stopPoint",
            `no stop point recorded for ${noStop.join(", ") || "these lines"}`,
          ),
        );
        break;
      case "cumulativeCommitment":
        fields.push(
          field(
            key,
            capNotes.join("; ") || null,
            "job.caps",
            "no cap calculation",
          ),
        );
        break;
      default:
        fields.push(field(key, null, "operator", "operator to enter"));
    }
  }

  const lineIds = lines.map((l) => l.id);
  const lineHolds = scopes
    .filter((s) => lineIds.includes(s.scopeLineId))
    .flatMap((s) =>
      s.gates
        .filter((g) => g.state === "HOLD")
        .map((g) => `${s.scopeLineId} ${g.gate}: ${g.reason}`),
    );

  return {
    code,
    name: t.name,
    recipientPartyId,
    scopeLineIds: lineIds,
    reason: [...new Set(reasons)].join("; "),
    customerPreview: `${t.name}. ${t.purpose} Work covered: ${lines.map((l) => l.description).join("; ")}. This form does not authorise ${t.doesNotAuthorise}.`,
    fields,
    sendable: false,
    notSendableBecause: [
      PREVIEW_ONLY,
      ...fields
        .filter((f) => f.value === null)
        .map((f) => `${f.key}: ${f.blankReason}`),
      ...lineHolds,
    ],
  };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

const CURRENCIES = new Set(["AUD", "NZD"]);
const GST_BASES = new Set(["INC", "EX", "NA"]);
const PAYMENT_BASES = new Set(["OWNER_DIRECT", "INSURER_WORK_ORDER", "UNCONFIRMED"]);
const MAKE_SAFE_TASKS = new Set(["WATER_EXTRACTION", "TEMPORARY_COVER", "ISOLATE_SERVICES", "SECURE_SITE", "DRYING"]);

function isIsoDate(v: unknown): boolean {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function moneyProblem(m: unknown, label: string): string[] {
  const v = m as { minor?: unknown; currency?: unknown; gst?: unknown } | null | undefined;
  if (!v || typeof v !== "object") return [`${label} is missing`];
  const out: string[] = [];
  if (!exactAmount(v as never)) out.push(`${label} is not a whole, non-negative number of cents that can be added exactly`);
  if (!CURRENCIES.has(v.currency as string)) out.push(`${label} has an unknown currency`);
  if (!GST_BASES.has(v.gst as string)) out.push(`${label} has an unknown GST basis`);
  return out;
}

function duplicates(kind: string, ids: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup].map((id) => `${kind} id "${id}" appears more than once`);
}

/**
 * The one entry check (discovery sweep, 20/11/2026): everything downstream may assume
 * the job is well formed. Any problem stops the whole plan with no scopes and no forms.
 */
function unusableJobData(job: JobFacts): string[] {
  const out: string[] = [];
  if (!isIsoDate(job.asOf)) out.push("the as-of date is not a valid YYYY-MM-DD date");
  for (const l of job.scope) {
    out.push(...moneyProblem(l.amount, `scope line ${l.id} amount`));
    const pay = l.payment as { basis?: unknown } | null | undefined;
    if (!pay || typeof pay !== "object") {
      out.push(`scope line ${l.id} has no payment record`);
    } else if (!PAYMENT_BASES.has(pay.basis as string)) {
      out.push(`scope line ${l.id} has an unknown payment basis`);
    }
    if (l.makeSafe !== undefined && !MAKE_SAFE_TASKS.has(l.makeSafe as string)) {
      out.push(`scope line ${l.id} names a make-safe task that is not on the list`);
    }
  }
  for (const c of job.caps) {
    out.push(...moneyProblem(c.cap, `limit ${c.id}`));
    out.push(...moneyProblem(c.committed, `amount already used under ${c.id}`));
    if (c.expiresOn != null && !isIsoDate(c.expiresOn)) out.push(`limit ${c.id} has an expiry that is not a valid YYYY-MM-DD date`);
  }
  out.push(...duplicates("party", job.parties.map((p) => p.id)));
  out.push(...duplicates("asset", job.assets.map((a) => a.id)));
  out.push(...duplicates("scope line", job.scope.map((l) => l.id)));
  out.push(...duplicates("limit", job.caps.map((c) => c.id)));
  out.push(...duplicates("approval", job.approvals.map((a) => a.id)));
  return out;
}

export function planAuthority(job: JobFacts): AuthorityPlan {
  const ctx: Ctx = {
    job,
    parties: indexById(job.parties),
    assets: indexById(job.assets),
  };
  const holds: string[] = [];
  const previewAllowed = PREVIEW_JURISDICTIONS.includes(job.jurisdiction);
  // Every money value is checked once, here, before any gate or form. One unusable
  // value stops the whole plan: nothing downstream ever sees it.
  const badMoney = unusableJobData(job);
  if (badMoney.length > 0) {
    return {
      jobId: job.id,
      jurisdiction: job.jurisdiction,
      previewAllowed,
      releaseEnabled: false,
      holds: [`This job data is not usable: ${badMoney.join("; ")}. Nothing is planned until it is corrected.`],
      scopes: [],
      forms: [],
      deposit: {
        requested: Boolean(job.depositRequested),
        enabled: false,
        reason: "Deposits stay off until each jurisdiction's rules are reviewed and approved.",
      },
      sendable: false,
    };
  }
  if (!previewAllowed) {
    holds.push(
      `No jurisdiction pack is available for ${job.jurisdiction}. Nothing is assumed from another jurisdiction.`,
    );
  }

  const ledger: CapLedger = new Map();
  const needs: FormNeed[] = [];
  const capNotes = new Map<string, string>();
  const scopes: ScopePlan[] = [];
  // Lines that passed the asset lookup; only these get drafts of any kind.
  const planned: ScopeLine[] = [];

  for (const line of job.scope) {
    if (!exactAmount(line.amount)) {
      holds.push(`scope line ${line.id} has an amount that is not a whole, non-negative number of cents that can be added exactly`);
      // Its share of any funding limit is unknown, so later lines on that funder hold too.
      for (const cap of job.caps) {
        if (line.payment.basis === "INSURER_WORK_ORDER" && cap.funderPartyId === line.payment.payerPartyId) {
          ledger.set(cap.id, Number.POSITIVE_INFINITY);
        }
      }
      continue;
    }
    const asset = ctx.assets.get(line.assetId);
    if (!asset) {
      holds.push(`scope line ${line.id} names an asset that is not on the job`);
      // Still count its amount toward the funder's running total, so a later line
      // cannot clear a limit this line's request has already used.
      insurerGate(ctx, line, ledger);
      continue;
    }
    planned.push(line);
    const insurer = insurerGate(ctx, line, ledger);
    const gates: GateResult[] = [
      accessGate(ctx, line, asset),
      workGate(ctx, line, asset),
      payerGate(ctx, line),
      insurer.result,
      safetyGate(ctx, line),
      disposalGate(ctx, line, asset),
    ];
    const canStart =
      previewAllowed &&
      gates.every((g) => g.state === "CLEAR" || g.state === "NOT_APPLICABLE");
    scopes.push({
      scopeLineId: line.id,
      description: line.description,
      assetLabel: asset.label,
      gates,
      canStart,
    });

    const controller = controllerOf(ctx, asset);
    const need = (
      code: TemplateCode,
      to: string | null,
      reason: string,
    ): void => {
      needs.push({ code, recipientPartyId: to, lineId: line.id, reason });
    };
    // A party with no proven spend authority is never the recipient of a
    // funding document: the real funder is still to be identified.
    const funder = fundingRecipient(ctx, line);
    if (gates[0].state !== "CLEAR")
      need("A01", controller, "access not yet in place");
    // A02 covers listed make-safe work only, never strip-out or other restricted action.
    if (eligibleMakeSafe(line)) need("A02", controller, "emergency make-safe work");
    if (line.payment.basis === "OWNER_DIRECT")
      need(
        "A03",
        payerOnJob(ctx, line),
        payerOnJob(ctx, line)
          ? "customer pays directly"
          : "customer pays directly; payer is not a party on this job",
      );
    if (line.payment.basis === "INSURER_WORK_ORDER") {
      need(
        "A04",
        funder,
        funder
          ? "insurer or principal funded"
          : `funding party not established: ${partyName(ctx, line.payment.payerPartyId)} has no proven spend authority`,
      );
    }
    if (
      job.tenure === "STRATA" &&
      (asset.assetClass === "COMMON_PROPERTY" ||
        asset.assetClass === "LOT_FIXTURES")
    ) {
      need(
        "A05",
        controller,
        `strata ${asset.assetClass === "COMMON_PROPERTY" ? "common property" : "lot"} work`,
      );
    }
    if (job.tenure === "RENTAL") need("A06", controller, "rental property");
    if (job.tenure === "COMMERCIAL")
      need("A07", controller, "commercial premises");
    if (line.packOut) need("A08", controller, "contents leave the site");
    if (line.restricted)
      need("A09", controller, "irreversible removal or disposal");
    if (insurer.overCap) {
      need("A10", funder, "over the funding limit");
      capNotes.set(line.id, insurer.result.reason);
    }
  }

  // Distinct confirmed payers who are parties on the job; a null or unknown id is not a payer.
  const confirmedPayers = new Set(
    job.scope
      .map((l) => payerOnJob(ctx, l))
      .filter((id): id is string => id !== null),
  );
  if (confirmedPayers.size > 1) {
    for (const l of planned) {
      if (l.payment.payerPartyId) {
        const to = fundingRecipient(ctx, l);
        needs.push({
          code: "A11",
          recipientPartyId: to,
          lineId: l.id,
          reason: to
            ? "more than one payer on this job"
            : "more than one payer on this job; this line's funder is not established",
        });
      }
    }
  }

  // One draft per template and recipient, covering all of that recipient's lines.
  const groups = new Map<string, FormNeed[]>();
  for (const n of needs) {
    const key = JSON.stringify([n.code, n.recipientPartyId]);
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  const lineById = indexById(job.scope);
  const forms = [...groups.values()]
    .map((g) =>
      buildDraft(
        ctx,
        g[0].code,
        g[0].recipientPartyId,
        [...new Set(g.map((n) => n.lineId))].map((id) => lineById.get(id)!),
        g.map((n) => n.reason),
        scopes,
        g
          .map((n) => capNotes.get(n.lineId))
          .filter((s): s is string => Boolean(s)),
      ),
    )
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    jobId: job.id,
    jurisdiction: job.jurisdiction,
    previewAllowed,
    releaseEnabled: false,
    holds,
    scopes,
    forms,
    deposit: {
      requested: Boolean(job.depositRequested),
      enabled: false,
      reason:
        "Deposits stay off until each jurisdiction's rules are reviewed and approved.",
    },
    sendable: false,
  };
}
