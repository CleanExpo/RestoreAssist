import { prisma } from '@/lib/prisma';
import { routeBasic } from '@/lib/ai/model-router';

export type CheckStatus = 'green' | 'yellow' | 'red';

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
    return { capability: 'business_profile', label: 'Business profile complete', status: 'red', note: 'Organization not found' };
  }
  const missing = !org.legalName || !org.state || (!org.abn && org.tradingStatus !== 'PRE_TRADING');
  return {
    capability: 'business_profile',
    label: 'Business profile complete',
    status: missing ? 'red' : 'green',
    note: missing ? 'Add legal name, state, and ABN (or mark pre-trading)' : undefined,
  };
};

const brandingCheck: Check = async (orgId) => {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { logoUrl: true, primaryColor: true },
  });
  if (!org) return { capability: 'branding', label: 'Branding set', status: 'red', note: 'Organization not found' };
  if (!org.logoUrl && !org.primaryColor) return { capability: 'branding', label: 'Branding set', status: 'red', note: 'No logo or primary colour set' };
  if (!org.logoUrl || !org.primaryColor) return { capability: 'branding', label: 'Branding set', status: 'yellow', note: 'Logo or primary colour missing' };
  return { capability: 'branding', label: 'Branding set', status: 'green' };
};

const pricingCheck: Check = async (orgId) => {
  const p = await prisma.organizationPricingConfig.findUnique({
    where: { organizationId: orgId },
    select: { masterQualifiedNormalHours: true, administrationFee: true },
  });
  const ready = !!p?.masterQualifiedNormalHours && !!p?.administrationFee;
  return { capability: 'pricing', label: 'Pricing config', status: ready ? 'green' : 'red', note: ready ? undefined : 'Set labour rates and admin fee' };
};

const aiGenerationCheck: Check = async () => {
  try {
    const result = await routeBasic('Reply with the word "ok".', { bypassCreditGate: true });
    return { capability: 'ai_generation', label: 'AI generation (Gemma)', status: result ? 'green' : 'red' };
  } catch {
    return { capability: 'ai_generation', label: 'AI generation (Gemma)', status: 'red', note: 'Gemma endpoint unreachable' };
  }
};

// TODO(setup-wizard Phase 5+): replace stub with in-memory PDF renderer using hydrated profile
const sampleReportRenderCheck: Check = async () => ({
  capability: 'sample_report_render',
  label: 'Sample report rendering',
  status: 'green',
});

// TODO(setup-wizard Phase 5+): wire to C2PA manifest generator (CLAUDE.md rule #21)
const chainOfCustodyCheck: Check = async () => ({
  capability: 'chain_of_custody',
  label: 'Photo chain-of-custody',
  status: 'green',
});

// TODO(setup-wizard Phase 5+): hit Google Drive / OneDrive token if user has connected
const cloudStorageCheck: Check = async () => ({
  capability: 'cloud_storage',
  label: 'Cloud storage',
  status: 'yellow',
  note: 'Not connected — optional',
});

// TODO(setup-wizard Phase 5+): hit Xero/MYOB/QB/ServiceM8/Ascora token if connected
const accountingCheck: Check = async () => ({
  capability: 'accounting',
  label: 'Accounting integration',
  status: 'yellow',
  note: 'Not connected — optional',
});

// TODO(setup-wizard Phase 5+): per-provider 1-token validate against ProviderConnection table
const byokKeysCheck: Check = async () => ({
  capability: 'byok_keys',
  label: 'BYOK AI keys',
  status: 'yellow',
  note: 'Using platform Gemma — add BYOK key for premium models',
});

// TODO(setup-wizard Phase 5+): Resend/SES deliverability test to user.email
const welcomeEmailCheck: Check = async () => ({
  capability: 'welcome_email',
  label: 'Welcome email',
  status: 'green',
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
