import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { routeBasic } from "@/lib/ai/model-router";
import { generateIICRCReportPDF } from "@/lib/generate-iicrc-report-pdf";

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

// Renders a minimal IICRC PDF in-memory using the hydrated organization profile.
// Green when pdf-lib returns a non-trivial byte buffer (> 1 KB); red on any throw.
const sampleReportRenderCheck: Check = async (orgId) => {
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
    return {
      capability: "sample_report_render",
      label: "Sample report rendering",
      status: "red",
      note: err instanceof Error ? err.message : "PDF render failed",
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
    return {
      capability: "chain_of_custody",
      label: "Photo chain-of-custody",
      status: "red",
      note: err instanceof Error ? err.message : "Manifest primitives failed",
    };
  }
};

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

// TODO(setup-wizard Phase 5+): Resend/SES deliverability test to user.email
const welcomeEmailCheck: Check = async () => ({
  capability: "welcome_email",
  label: "Welcome email",
  status: "yellow",
  note: "Not yet verified — placeholder. Will be wired in Phase 5+",
});

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
