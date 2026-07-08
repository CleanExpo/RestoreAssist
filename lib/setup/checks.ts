import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/credential-vault";
import { routeBasic } from "@/lib/ai/model-router";
import { getValidXeroAccessToken } from "@/lib/services/xero/credentials";
import { getValidQuickBooksAccessToken } from "@/lib/services/quickbooks/credentials";
import { getValidMYOBAccessToken } from "@/lib/services/myob/credentials";
import {
  getWorkspaceForUser,
  listProviderConnections,
  validateProviderKey,
  type AiProvider,
} from "@/lib/workspace/provider-connections";
import { generateIICRCReportPDF } from "@/lib/generate-iicrc-report-pdf";

/**
 * New-client startup readiness checks.
 *
 * A new organisation cannot use the app until `Organization.setupCompletedAt`
 * is set, which `POST /api/setup/activate` does ONLY after `runAllChecks`
 * returns zero `red` results (server-side re-validation — the client cannot
 * skip steps). Status meaning:
 *
 *   red    = REQUIRED / blocking — activation is refused while any check is red.
 *   yellow = OPTIONAL — surfaced in the wizard but does not block activation
 *            (the client can complete it later in Settings).
 *   green  = satisfied.
 *
 * Required (RED-when-unmet) — must pass to start using the app:
 *   - business_profile       (legalName + state + ABN or PRE_TRADING)
 *   - branding               (logoUrl or primaryColor)
 *   - pricing                (master qualified hours + administration fee)
 *   - ai_generation          (AI inference reachable — system health)
 *   - sample_report_render   (IICRC PDF generation works — system health)
 *   - chain_of_custody       (hashing + UTC timestamps work — system health)
 *   - byok_keys              (≥1 ACTIVE Anthropic or OpenAI key that validates)
 *
 * Optional (YELLOW-when-unmet) — do not block activation:
 *   - cloud_storage, accounting, welcome_email
 */
export type CheckStatus = "green" | "yellow" | "red";

export interface CheckResult {
  capability: string;
  label: string;
  status: CheckStatus;
  note?: string;
}

type Check = (orgId: string) => Promise<CheckResult>;

const businessProfileCheck: Check = async (orgId) => {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { legalName: true, abn: true, state: true, tradingStatus: true },
  });
  if (!org) {
    return {
      capability: "business_profile",
      label: "Business profile complete",
      status: "red",
      note: "Organization not found",
    };
  }
  const missing =
    !org.legalName ||
    !org.state ||
    (!org.abn && org.tradingStatus !== "PRE_TRADING");
  return {
    capability: "business_profile",
    label: "Business profile complete",
    status: missing ? "red" : "green",
    note: missing
      ? "Add legal name, state, and ABN (or mark pre-trading)"
      : undefined,
  };
};

const brandingCheck: Check = async (orgId) => {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { logoUrl: true, primaryColor: true },
  });
  if (!org)
    return {
      capability: "branding",
      label: "Branding set",
      status: "red",
      note: "Organization not found",
    };
  if (!org.logoUrl && !org.primaryColor)
    return {
      capability: "branding",
      label: "Branding set",
      status: "red",
      note: "No logo or primary colour set",
    };
  if (!org.logoUrl || !org.primaryColor)
    return {
      capability: "branding",
      label: "Branding set",
      status: "yellow",
      note: "Logo or primary colour missing",
    };
  return { capability: "branding", label: "Branding set", status: "green" };
};

export const pricingCheck: Check = async (orgId) => {
  const p = await prisma.organizationPricingConfig.findUnique({
    where: { organizationId: orgId },
    select: { masterQualifiedNormalHours: true, administrationFee: true },
  });
  const ready = p != null && p.masterQualifiedNormalHours != null && p.administrationFee != null;
  return {
    capability: "pricing",
    label: "Pricing config",
    status: ready ? "green" : "red",
    note: ready ? undefined : "Set labour rates and admin fee",
  };
};

const aiGenerationCheck: Check = async () => {
  try {
    const result = await routeBasic('Reply with the word "ok".', {
      bypassCreditGate: true,
    });
    return {
      capability: "ai_generation",
      label: "System AI service (Gemma)",
      status: result ? "green" : "red",
    };
  } catch {
    return {
      capability: "ai_generation",
      label: "System AI service (Gemma)",
      status: "red",
      note: "Gemma endpoint unreachable",
    };
  }
};

// Renders a minimal IICRC PDF in-memory using the hydrated organization profile.
// Green when pdf-lib returns a non-trivial byte buffer (> 1 KB); red on any throw.
export const sampleReportRenderCheck: Check = async (orgId) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        legalName: true,
        tradingName: true,
        name: true,
        abn: true,
        address: true,
      },
    });
    const businessName = org?.legalName ?? org?.tradingName ?? org?.name ?? "—";
    const bytes = await generateIICRCReportPDF({
      id: orgId || "setup-health-probe",
      user: {
        businessName,
        businessAddress: org?.address ?? null,
        businessABN: org?.abn ?? null,
      },
    });
    if (bytes.byteLength <= 1024) {
      return {
        capability: "sample_report_render",
        label: "Sample report rendering",
        status: "red",
        note: `PDF too small (${bytes.byteLength} bytes)`,
      };
    }
    return {
      capability: "sample_report_render",
      label: "Sample report rendering",
      status: "green",
    };
  } catch (err) {
    console.error("[setup-check] sample_report_render failed:", err);
    return {
      capability: "sample_report_render",
      label: "Sample report rendering",
      status: "red",
      note: "Sample report rendering failed",
    };
  }
};

// Smoke-tests the C2PA-style manifest primitives (CLAUDE.md rule #21): hashes a
// 1-px PNG fixture with SHA-256 and stamps a UTC timestamp. Green when both
// primitives return well-formed values; red on any throw. The fuller manifest
// (GPS + device + user hash) is exercised at evidence-capture time — this check
// confirms the crypto + clock primitives are available in the runtime.
const ONE_PX_PNG_FIXTURE = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082",
  "hex",
);

const chainOfCustodyCheck: Check = async () => {
  try {
    const sha256 = crypto
      .createHash("sha256")
      .update(ONE_PX_PNG_FIXTURE)
      .digest("hex");
    const capturedAt = new Date().toISOString();
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      return {
        capability: "chain_of_custody",
        label: "Photo chain-of-custody",
        status: "red",
        note: "SHA-256 returned malformed digest",
      };
    }
    if (Number.isNaN(Date.parse(capturedAt))) {
      return {
        capability: "chain_of_custody",
        label: "Photo chain-of-custody",
        status: "red",
        note: "UTC timestamp not parseable",
      };
    }
    return {
      capability: "chain_of_custody",
      label: "Photo chain-of-custody",
      status: "green",
    };
  } catch (err) {
    console.error("[setup-check] chain_of_custody failed:", err);
    return {
      capability: "chain_of_custody",
      label: "Photo chain-of-custody",
      status: "red",
      note: "Chain-of-custody primitives failed",
    };
  }
};

// ─── cloud_storage ──────────────────────────────────────────────────────────
//
// The BYOK Google Drive integration stores tokens on the `Organization`
// storage-provider fields (RA-408 / SP-1), NOT the next-auth `Account` row —
// that is a separate sign-in credential the Drive mirror never reads. We only
// attempt a token probe when the org has selected GOOGLE_DRIVE and holds a
// non-null access token; otherwise the workspace simply hasn't connected Drive
// yet (yellow). A single `files.list?pageSize=1` call confirms the access
// token is still live without listing real files.
const cloudStorageCheck: Check = async (orgId) => {
  const capability = "cloud_storage";
  const label = "Cloud storage";

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      storageProvider: true,
      storageProviderAccessToken: true,
    },
  });
  if (
    !org ||
    org.storageProvider !== "GOOGLE_DRIVE" ||
    !org.storageProviderAccessToken
  ) {
    return {
      capability,
      label,
      status: "yellow",
      note: "Not connected — optional",
    };
  }

  // storageProviderAccessToken is encrypted at rest via lib/credential-vault —
  // decrypt before using it as a Bearer.
  const accessToken = decrypt(org.storageProviderAccessToken);

  try {
    const res = await fetch(
      "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.ok) {
      return {
        capability,
        label,
        status: "green",
        note: "Google Drive connected",
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        capability,
        label,
        status: "red",
        note: "Google Drive token rejected — reconnect required",
      };
    }
    return {
      capability,
      label,
      status: "red",
      note: `Google Drive API returned ${res.status}`,
    };
  } catch {
    return {
      capability,
      label,
      status: "red",
      note: "Google Drive API unreachable",
    };
  }
};

// ─── accounting ─────────────────────────────────────────────────────────────
//
// Accounting integrations live on the `Integration` table keyed by userId. A
// user connects ONE bookkeeping system, so we validate whichever of Xero,
// QuickBooks, or MYOB is CONNECTED (day-1 readiness — RA follow-up). For Xero we
// keep the `GET /connections` probe (the cheapest authenticated call it
// exposes). For QuickBooks/MYOB the token helper both refreshes a near-expiry
// token AND surfaces DISCONNECTED/RECONNECT_REQUIRED/REFRESH_FAILED, so its
// `ok` result is itself the readiness signal. ServiceM8/Ascora still fall
// through to yellow until they get their own token-manager helper.
const ACCOUNTING_PROVIDERS = ["XERO", "QUICKBOOKS", "MYOB"] as const;
type AccountingProvider = (typeof ACCOUNTING_PROVIDERS)[number];

const ACCOUNTING_PROVIDER_LABEL: Record<AccountingProvider, string> = {
  XERO: "Xero",
  QUICKBOOKS: "QuickBooks",
  MYOB: "MYOB",
};

function reconnectNote(name: string, reason: string): string {
  if (reason === "DISCONNECTED") return `${name} not connected`;
  if (reason === "RECONNECT_REQUIRED")
    return `${name} reconnect required (refresh token unavailable)`;
  return `${name} token refresh failed — reconnect required`;
}

export const accountingCheck: Check = async (orgId) => {
  const capability = "accounting";
  const label = "Accounting integration";
  const notConnected = {
    capability,
    label,
    status: "yellow" as const,
    note: "Not connected — optional",
  };

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { ownerId: true },
  });
  if (!org) return notConnected;

  const integration = await prisma.integration.findFirst({
    where: {
      userId: org.ownerId,
      status: "CONNECTED",
      provider: { in: [...ACCOUNTING_PROVIDERS] },
    },
    select: { id: true, provider: true },
  });
  if (!integration) return notConnected;

  const provider = integration.provider as AccountingProvider;
  const name = ACCOUNTING_PROVIDER_LABEL[provider];

  // QuickBooks / MYOB: the token helper validates + refreshes; its ok is green.
  if (provider === "QUICKBOOKS" || provider === "MYOB") {
    const helper =
      provider === "QUICKBOOKS"
        ? getValidQuickBooksAccessToken
        : getValidMYOBAccessToken;
    const cred = await helper(integration.id);
    if (cred.ok) {
      return { capability, label, status: "green", note: `${name} connected` };
    }
    console.error(`[SetupChecks/${name}]`, {
      integrationId: integration.id,
      reason: cred.reason,
      detail: cred.detail,
    });
    return {
      capability,
      label,
      status: "red",
      note: reconnectNote(name, cred.reason),
    };
  }

  // Xero: refresh the token, then probe the cheapest authenticated endpoint.
  const credResult = await getValidXeroAccessToken(integration.id);
  if (!credResult.ok) {
    console.error("[SetupChecks/Xero]", {
      integrationId: integration.id,
      reason: credResult.reason,
      detail: credResult.detail,
    });
    return {
      capability,
      label,
      status: "red",
      note: reconnectNote(name, credResult.reason),
    };
  }
  const accessToken = credResult.data;

  try {
    const res = await fetch("https://api.xero.com/connections", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      return { capability, label, status: "green", note: "Xero connected" };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        capability,
        label,
        status: "red",
        note: "Xero token rejected — reconnect required",
      };
    }
    return {
      capability,
      label,
      status: "red",
      note: `Xero API returned ${res.status}`,
    };
  } catch {
    return {
      capability,
      label,
      status: "red",
      note: "Xero API unreachable",
    };
  }
};

// ─── byok_keys ──────────────────────────────────────────────────────────────
//
// BYOK provider keys live in `ProviderConnection`, keyed by workspaceId. We
// resolve the org owner's active workspace, list ACTIVE provider connections,
// filter to OPERATING providers only (ANTHROPIC or OPENAI — the ones that
// power client report generation), and call `validateProviderKey` for each.
// That helper makes the minimal 1-token-equivalent probe (`/v1/models` etc.)
// and persists the validation status.
//
// GREEN  = ≥1 ACTIVE ANTHROPIC or OPENAI connection passes validateProviderKey
// RED    = no operating provider available (no workspace, zero connections,
//          only GOOGLE/GEMMA present, or all operating keys fail validation)
//
// GOOGLE and GEMMA connections are ignored here — Google is for Drive storage,
// Gemma is the platform's own inference service checked by ai_generation.
export const byokKeysCheck: Check = async (orgId) => {
  const capability = "byok_keys";
  const label = "BYOK AI keys";
  const NO_KEY_NOTE =
    "Add your Anthropic or OpenAI API key to operate RestoreAssist.";

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { ownerId: true },
  });
  if (!org) {
    return {
      capability,
      label,
      status: "red",
      note: NO_KEY_NOTE,
    };
  }

  const workspace = await getWorkspaceForUser(org.ownerId);
  if (!workspace) {
    return {
      capability,
      label,
      status: "red",
      note: NO_KEY_NOTE,
    };
  }

  const connections = await listProviderConnections(workspace.id);

  // Only ANTHROPIC and OPENAI are operating providers for client report generation.
  const operatingActive = connections.filter(
    (c) =>
      c.status === "ACTIVE" &&
      (c.provider === "ANTHROPIC" || c.provider === "OPENAI"),
  );

  if (operatingActive.length === 0) {
    return {
      capability,
      label,
      status: "red",
      note: NO_KEY_NOTE,
    };
  }

  const results = await Promise.all(
    operatingActive.map(async (c) => ({
      provider: c.provider as AiProvider,
      result: await validateProviderKey(workspace.id, c.provider as AiProvider),
    })),
  );

  const valid = results.filter((r) => r.result.valid);
  if (valid.length > 0) {
    return {
      capability,
      label,
      status: "green",
      note: `${valid.length}/${results.length} key(s) verified (${valid.map((v) => v.provider).join(", ")})`,
    };
  }

  const failed = results.map((r) => r.provider);
  return {
    capability,
    label,
    status: "red",
    note: `BYOK key rejected: ${failed.join(", ")} — re-enter API key`,
  };
};

/**
 * welcome_email — verifies the configured From domain has DKIM / SPF / DMARC
 * aligned with Resend. Does NOT send an email; uses the Resend Domains API
 * (`GET https://api.resend.com/domains`) and inspects `records[]` for the
 * matching domain.
 *
 * - green  = DKIM + SPF + DMARC all `verified`
 * - yellow = DKIM `verified` but SPF or DMARC missing/unverified
 * - red    = DKIM not verified, no API key, domain not registered, or fetch error
 *
 * The `note` lists which DNS records are missing so the operator knows
 * exactly which records to add.
 */
type ResendDnsRecord = {
  record?: string;
  type?: string;
  name?: string;
  status?: string;
};
type ResendDomain = {
  id?: string;
  name?: string;
  status?: string;
  records?: ResendDnsRecord[];
};

function extractFromDomain(fromEmail: string | undefined): string | null {
  if (!fromEmail) return null;
  // Accepts "Name <addr@domain>" or "addr@domain".
  const angle = fromEmail.match(/<([^>]+)>/);
  const addr = (angle ? angle[1] : fromEmail).trim();
  const at = addr.lastIndexOf("@");
  if (at < 0) return null;
  return addr.slice(at + 1).toLowerCase();
}

const welcomeEmailCheck: Check = async () => {
  const capability = "welcome_email";
  const label = "Welcome email";

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      capability,
      label,
      status: "red",
      note: "RESEND_API_KEY not configured",
    };
  }

  const fromDomain =
    extractFromDomain(process.env.RESEND_FROM_EMAIL) ?? "restoreassist.app";

  let body: { data?: ResendDomain[] } | null = null;
  try {
    const res = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      return {
        capability,
        label,
        status: "red",
        note: `Resend API returned ${res.status}`,
      };
    }
    body = (await res.json()) as { data?: ResendDomain[] };
  } catch {
    return {
      capability,
      label,
      status: "red",
      note: "Resend API unreachable",
    };
  }

  const domains = body?.data ?? [];
  const domain = domains.find((d) => d.name?.toLowerCase() === fromDomain);
  if (!domain) {
    return {
      capability,
      label,
      status: "red",
      note: `From domain "${fromDomain}" not registered in Resend`,
    };
  }

  const records = domain.records ?? [];
  const isVerified = (kind: "SPF" | "DKIM" | "DMARC") =>
    records.some(
      (r) => r.record?.toUpperCase() === kind && r.status === "verified",
    );

  const dkim = isVerified("DKIM");
  const spf = isVerified("SPF");
  const dmarc = isVerified("DMARC");

  if (dkim && spf && dmarc) {
    return { capability, label, status: "green" };
  }

  const missing: string[] = [];
  if (!dkim) missing.push("DKIM");
  if (!spf) missing.push("SPF");
  if (!dmarc) missing.push("DMARC");

  if (dkim) {
    return {
      capability,
      label,
      status: "yellow",
      note: `${fromDomain}: DKIM aligned, missing ${missing.join(" + ")}`,
    };
  }

  return {
    capability,
    label,
    status: "red",
    note: `${fromDomain}: no DNS records aligned (missing ${missing.join(" + ")})`,
  };
};

export const CHECKS: Check[] = [
  businessProfileCheck,
  brandingCheck,
  pricingCheck,
  aiGenerationCheck,
  sampleReportRenderCheck,
  chainOfCustodyCheck,
  cloudStorageCheck,
  accountingCheck,
  byokKeysCheck,
  welcomeEmailCheck,
];

export async function runAllChecks(orgId: string): Promise<CheckResult[]> {
  return Promise.all(CHECKS.map((c) => c(orgId)));
}
