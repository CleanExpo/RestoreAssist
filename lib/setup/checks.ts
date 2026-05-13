import { prisma } from "@/lib/prisma";
import { routeBasic } from "@/lib/ai/model-router";
import { getValidXeroToken } from "@/lib/integrations/xero/token-manager";
import {
  getWorkspaceForUser,
  listProviderConnections,
  validateProviderKey,
  type AiProvider,
} from "@/lib/workspace/provider-connections";

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

// ─── cloud_storage ──────────────────────────────────────────────────────────
//
// Google Drive tokens live on the next-auth `Account` row attached to the org
// owner (provider='google'). We only attempt a token probe when an account
// row with a non-null access_token exists; otherwise the workspace simply
// hasn't connected Drive yet (yellow). A single `files.list?pageSize=1` call
// confirms the access token is still live without listing real files.
const cloudStorageCheck: Check = async (orgId) => {
  const capability = "cloud_storage";
  const label = "Cloud storage";

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { ownerId: true },
  });
  if (!org) {
    return {
      capability,
      label,
      status: "yellow",
      note: "Not connected — optional",
    };
  }

  const account = await prisma.account.findFirst({
    where: {
      userId: org.ownerId,
      provider: "google",
      access_token: { not: null },
    },
    select: { access_token: true },
  });
  if (!account?.access_token) {
    return {
      capability,
      label,
      status: "yellow",
      note: "Not connected — optional",
    };
  }

  try {
    const res = await fetch(
      "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)",
      { headers: { Authorization: `Bearer ${account.access_token}` } },
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
// Accounting integrations (Xero, MYOB, QuickBooks, ServiceM8, Ascora) live on
// the `Integration` table keyed by userId. We probe Xero today — the other
// providers fall through to yellow ("not connected") until they get their own
// token-manager helper. The probe is `GET /connections`, the cheapest
// authenticated call Xero exposes; `getValidXeroToken` already refreshes the
// access token if it's near expiry.
const accountingCheck: Check = async (orgId) => {
  const capability = "accounting";
  const label = "Accounting integration";

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { ownerId: true },
  });
  if (!org) {
    return {
      capability,
      label,
      status: "yellow",
      note: "Not connected — optional",
    };
  }

  const integration = await prisma.integration.findFirst({
    where: {
      userId: org.ownerId,
      provider: "XERO",
      status: "CONNECTED",
    },
    select: { id: true },
  });
  if (!integration) {
    return {
      capability,
      label,
      status: "yellow",
      note: "Not connected — optional",
    };
  }

  let accessToken: string;
  try {
    accessToken = await getValidXeroToken(integration.id);
  } catch {
    return {
      capability,
      label,
      status: "red",
      note: "Xero token refresh failed — reconnect required",
    };
  }

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
// and call `validateProviderKey` for each. That helper makes the minimal
// 1-token-equivalent probe (`/v1/models` etc.) and persists the validation
// status. Green if at least one provider passes; red if all fail; yellow when
// no connections exist.
const byokKeysCheck: Check = async (orgId) => {
  const capability = "byok_keys";
  const label = "BYOK AI keys";

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { ownerId: true },
  });
  if (!org) {
    return {
      capability,
      label,
      status: "yellow",
      note: "Using platform Gemma — add BYOK key for premium models",
    };
  }

  const workspace = await getWorkspaceForUser(org.ownerId);
  if (!workspace) {
    return {
      capability,
      label,
      status: "yellow",
      note: "Using platform Gemma — add BYOK key for premium models",
    };
  }

  const connections = await listProviderConnections(workspace.id);
  const active = connections.filter((c) => c.status === "ACTIVE");
  if (active.length === 0) {
    return {
      capability,
      label,
      status: "yellow",
      note: "Using platform Gemma — add BYOK key for premium models",
    };
  }

  const results = await Promise.all(
    active.map(async (c) => ({
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
      note: `${valid.length}/${results.length} BYOK key(s) verified (${valid.map((v) => v.provider).join(", ")})`,
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
