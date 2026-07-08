import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { POST } from '../route';
import { prisma } from '@/lib/prisma';

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
import { getServerSession } from 'next-auth';

vi.mock('@/lib/ai/model-router', () => ({ routeBasic: vi.fn() }));
import { routeBasic } from '@/lib/ai/model-router';

// Stub email so no real Resend calls are made during tests
vi.mock('@/lib/email', () => ({ sendWelcomeEmail: vi.fn().mockResolvedValue(null) }));

// byok_keys is now a REQUIRED operating-key check (Anthropic or OpenAI). The
// provider-connections module is used ONLY by byokKeysCheck, so mock it
// file-wide to a deterministically-valid Anthropic key — activation must be
// reachable in CI without a live provider call. (cloud_storage / accounting
// checks do not use this module, so they keep their real impls.) Return values
// are (re)set in beforeEach because vi.restoreAllMocks() wipes vi.fn() impls.
vi.mock('@/lib/workspace/provider-connections', () => ({
  getWorkspaceForUser: vi.fn(),
  listProviderConnections: vi.fn(),
  validateProviderKey: vi.fn(),
  OPERATING_PROVIDERS: ['ANTHROPIC', 'OPENAI', 'OPENROUTER'],
}));
import {
  getWorkspaceForUser,
  listProviderConnections,
  validateProviderKey,
} from '@/lib/workspace/provider-connections';

describe.skipIf(!process.env.DATABASE_URL)('POST /api/setup/activate', () => {
  let testUserId = '';
  let testOrgId = '';

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `activate-${Date.now()}@test.com` } });
    testUserId = u.id;
    const o = await prisma.organization.create({
      data: { name: 'Activate Test Co', ownerId: u.id },
    });
    testOrgId = o.id;
    await prisma.user.update({ where: { id: u.id }, data: { organizationId: o.id } });
  });

  afterAll(async () => {
    // Clean up in FK order
    await prisma.report.deleteMany({ where: { userId: testUserId } });
    await prisma.client.deleteMany({ where: { userId: testUserId } });
    await prisma.organizationPricingConfig.deleteMany({ where: { organizationId: testOrgId } });
    await prisma.organization.delete({ where: { id: testOrgId } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: testUserId, email: 't@t.com' },
    });
    (routeBasic as ReturnType<typeof vi.fn>).mockResolvedValue({ text: 'ok', confidence: 1 });
    // byok_keys → green: one ACTIVE, valid Anthropic key.
    (getWorkspaceForUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'ws-activate-test', name: 'WS' });
    (listProviderConnections as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'pc-anthropic',
        workspaceId: 'ws-activate-test',
        provider: 'ANTHROPIC',
        status: 'ACTIVE',
        maskedKey: 'sk-ant-..1234',
        lastValidatedAt: null,
        lastError: null,
        createdAt: '',
        updatedAt: '',
      },
    ]);
    (validateProviderKey as ReturnType<typeof vi.fn>).mockResolvedValue({ provider: 'ANTHROPIC', valid: true, latencyMs: 1 });
    // welcomeEmailCheck (inside runAllChecks) does a live Resend domain probe —
    // the only env-dependent check that goes red (Drive/Xero stay yellow when
    // unconnected and never reach fetch). Stub fetch + key so it resolves green,
    // making the gate deterministic. Re-spied after restoreAllMocks() above.
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'RestoreAssist <noreply@restoreassist.app>';
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                name: 'restoreassist.app',
                records: [
                  { record: 'SPF', status: 'verified' },
                  { record: 'DKIM', status: 'verified' },
                  { record: 'DMARC', status: 'verified' },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    // Reset Organization state between tests
    await prisma.organization.update({
      where: { id: testOrgId },
      data: {
        legalName: null,
        state: null,
        abn: null,
        logoUrl: null,
        primaryColor: null,
        setupCompletedAt: null,
        setupStartedAt: null,
      },
    });
    // Clean sample data + pricing between tests
    await prisma.report.deleteMany({ where: { userId: testUserId, isSample: true } });
    await prisma.client.deleteMany({ where: { userId: testUserId, isSample: true } });
    await prisma.organizationPricingConfig.deleteMany({ where: { organizationId: testOrgId } });
  });

  it('returns 401 when unauthenticated', async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns 400 when pre-flight checks have red items (missing business profile)', async () => {
    // Org has no legalName/state/abn → business_profile check is red
    const res = await POST();
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(Array.isArray(json.failedChecks)).toBe(true);
    expect(json.failedChecks.map((f: { capability: string }) => f.capability)).toContain(
      'business_profile',
    );
  });

  it('returns 200 + sets setupCompletedAt when all checks pass', async () => {
    // Seed everything required to pass all RED checks:
    // - business_profile: legalName, state, abn
    // - pricing: a pricing config with masterQualifiedNormalHours + administrationFee
    // - branding: at least one of logoUrl / primaryColor (yellow is OK; red only when both null)
    await prisma.organization.update({
      where: { id: testOrgId },
      data: {
        legalName: 'Activate Test Pty Ltd',
        state: 'NSW',
        abn: '53004085616',
        logoUrl: 'https://example.com/logo.png',
        primaryColor: '#1C2E47',
        setupStartedAt: new Date(Date.now() - 60_000),
      },
    });
    await prisma.organizationPricingConfig.create({
      data: {
        organizationId: testOrgId,
        masterQualifiedNormalHours: 165,
        masterQualifiedSaturday: 206,
        masterQualifiedSunday: 247,
        qualifiedTechnicianNormalHours: 140,
        qualifiedTechnicianSaturday: 175,
        qualifiedTechnicianSunday: 210,
        labourerNormalHours: 90,
        labourerSaturday: 113,
        labourerSunday: 135,
        airMoverAxialDailyRate: 50,
        airMoverCentrifugalDailyRate: 60,
        dehumidifierLGRDailyRate: 75,
        dehumidifierDesiccantDailyRate: 90,
        afdUnitLargeDailyRate: 100,
        extractionTruckMountedHourlyRate: 150,
        extractionElectricHourlyRate: 80,
        injectionDryingSystemDailyRate: 120,
        antimicrobialTreatmentRate: 12,
        mouldRemediationTreatmentRate: 18,
        biohazardTreatmentRate: 25,
        administrationFee: 165,
        callOutFee: 110,
        thermalCameraUseCostPerAssessment: 55,
      },
    });

    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.organizationId).toBe(testOrgId);
    expect(json.data.redirectTo).toBe('/dashboard?firstRun=1');

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: testOrgId } });
    expect(org.setupCompletedAt).not.toBeNull();
  });

  it('returns 409 if already activated', async () => {
    await prisma.organization.update({
      where: { id: testOrgId },
      data: {
        legalName: 'X',
        state: 'NSW',
        abn: '53004085616',
        logoUrl: 'https://example.com/logo.png',
        primaryColor: '#1C2E47',
        setupCompletedAt: new Date(),
      },
    });
    const res = await POST();
    expect(res.status).toBe(409);
  });
});
