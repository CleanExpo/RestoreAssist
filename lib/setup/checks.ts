import { prisma } from "@/lib/prisma";
import { routeBasic } from "@/lib/ai/model-router";

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

const pricingCheck: Check = async (orgId) => {
  const p = await prisma.organizationPricingConfig.findUnique({
    where: { organizationId: orgId },
    select: { masterQualifiedNormalHours: true, administrationFee: true },
  });
  const ready = !!p?.masterQualifiedNormalHours && !!p?.administrationFee;
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
      label: "AI generation (Gemma)",
      status: result ? "green" : "red",
    };
  } catch {
    return {
      capability: "ai_generation",
      label: "AI generation (Gemma)",
      status: "red",
      note: "Gemma endpoint unreachable",
    };
  }
};

// TODO(setup-wizard Phase 5+): replace with in-memory PDF renderer using hydrated profile
const sampleReportRenderCheck: Check = async () => ({
  capability: "sample_report_render",
  label: "Sample report rendering",
  status: "yellow",
  note: "Not yet verified — placeholder. Will be wired in Phase 5+",
});

// TODO(setup-wizard Phase 5+): wire to C2PA manifest generator (CLAUDE.md rule #21)
const chainOfCustodyCheck: Check = async () => ({
  capability: "chain_of_custody",
  label: "Photo chain-of-custody",
  status: "yellow",
  note: "Not yet verified — placeholder. Will be wired in Phase 5+",
});

// TODO(setup-wizard Phase 5+): hit Google Drive / OneDrive token if user has connected
const cloudStorageCheck: Check = async () => ({
  capability: "cloud_storage",
  label: "Cloud storage",
  status: "yellow",
  note: "Not connected — optional",
});

// TODO(setup-wizard Phase 5+): hit Xero/MYOB/QB/ServiceM8/Ascora token if connected
const accountingCheck: Check = async () => ({
  capability: "accounting",
  label: "Accounting integration",
  status: "yellow",
  note: "Not connected — optional",
});

// TODO(setup-wizard Phase 5+): per-provider 1-token validate against ProviderConnection table
const byokKeysCheck: Check = async () => ({
  capability: "byok_keys",
  label: "BYOK AI keys",
  status: "yellow",
  note: "Using platform Gemma — add BYOK key for premium models",
});

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
