/**
 * RA-8001 slice 1d-i — real rows for the workflow create/execute route tests
 * (test:db Postgres). Tenancy and the subscription gate read these rows for
 * real, so a scope clause that is wrong is evaluated, not mocked away.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const S = `ra8001-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const DAY = 24 * 60 * 60 * 1000;

export interface SeededTenancy {
  ownerA: string;
  techA: string;
  ownerB: string;
  expiredTrial: string;
  fundedTrial: string;
  orgA: string;
  orgB: string;
  inspOwnerA: string;
  inspTechA: string;
  inspOwnerB: string;
  reportOwnerA: string;
  reportTechA: string;
  reportOwnerB: string;
}

async function user(
  suffix: string,
  data: {
    role?: "ADMIN" | "MANAGER" | "USER";
    subscriptionStatus?: "TRIAL" | "ACTIVE" | "EXPIRED" | null;
    trialEndsAt?: Date | null;
    organizationId?: string | null;
  },
): Promise<string> {
  const row = await prisma.user.create({
    data: { email: `${S}-${suffix}@test.local`, ...data },
  });
  return row.id;
}

/**
 * Org A: an ACTIVE owner (ADMIN) and an invited technician (USER, no shared
 * workspace). Org B: another tenant. Plus a solo expired trial and a solo
 * funded (in-date) trial.
 */
export async function seedTenancy(): Promise<SeededTenancy> {
  const ownerA = await user("owner-a", { role: "ADMIN", subscriptionStatus: "ACTIVE" });
  const orgA = (await prisma.organization.create({ data: { name: `${S}-org-a`, ownerId: ownerA } })).id;
  await prisma.user.update({ where: { id: ownerA }, data: { organizationId: orgA } });
  const techA = await user("tech-a", { role: "USER", subscriptionStatus: null, organizationId: orgA });

  const ownerB = await user("owner-b", { role: "ADMIN", subscriptionStatus: "ACTIVE" });
  const orgB = (await prisma.organization.create({ data: { name: `${S}-org-b`, ownerId: ownerB } })).id;
  await prisma.user.update({ where: { id: ownerB }, data: { organizationId: orgB } });

  const expiredTrial = await user("expired", {
    role: "ADMIN",
    subscriptionStatus: "TRIAL",
    trialEndsAt: new Date(Date.now() - 2 * DAY),
  });
  const fundedTrial = await user("funded", {
    role: "ADMIN",
    subscriptionStatus: "TRIAL",
    trialEndsAt: new Date(Date.now() + 10 * DAY),
  });

  const inspection = async (suffix: string, userId: string) =>
    (
      await prisma.inspection.create({
        data: {
          inspectionNumber: `${S}-${suffix}`,
          propertyAddress: "1 Test St",
          propertyPostcode: "4000",
          userId,
        },
      })
    ).id;
  const report = async (suffix: string, userId: string) =>
    (
      await prisma.report.create({
        data: {
          title: `${S}-${suffix}`,
          clientName: "Client",
          propertyAddress: "1 Test St",
          hazardType: "Water",
          insuranceType: "Building",
          userId,
        },
      })
    ).id;

  return {
    ownerA,
    techA,
    ownerB,
    expiredTrial,
    fundedTrial,
    orgA,
    orgB,
    inspOwnerA: await inspection("insp-owner-a", ownerA),
    inspTechA: await inspection("insp-tech-a", techA),
    inspOwnerB: await inspection("insp-owner-b", ownerB),
    reportOwnerA: await report("rep-owner-a", ownerA),
    reportTechA: await report("rep-tech-a", techA),
    reportOwnerB: await report("rep-owner-b", ownerB),
  };
}

export async function cleanupTenancy(seed: SeededTenancy | undefined): Promise<void> {
  if (!seed) return;
  const users = [seed.ownerA, seed.techA, seed.ownerB, seed.expiredTrial, seed.fundedTrial];
  const swallow = (p: Promise<unknown>) => p.catch(() => {});
  await swallow(prisma.agentWorkflow.deleteMany({ where: { userId: { in: users } } }));
  await swallow(prisma.inspection.deleteMany({ where: { inspectionNumber: { startsWith: S } } }));
  await swallow(prisma.report.deleteMany({ where: { title: { startsWith: S } } }));
  await swallow(prisma.user.updateMany({ where: { id: { in: users } }, data: { organizationId: null } }));
  await swallow(prisma.organization.deleteMany({ where: { name: { startsWith: S } } }));
  await swallow(prisma.user.deleteMany({ where: { id: { in: users } } }));
}

/**
 * A quick-assessment workflow as createWorkflow leaves it before its first
 * execute (PENDING, report-analysis READY), with dependencies wired to the
 * real task ids.
 */
export async function seedQuickAssessment(
  userId: string,
  status: "PENDING" | "RUNNING" | "COMPLETED" = "PENDING",
): Promise<{ workflowId: string; analysisTaskId: string }> {
  const wf = await prisma.agentWorkflow.create({
    data: {
      name: `${S} workflow`,
      userId,
      taskGraph: "{}",
      status,
      totalTasks: 3,
      lastActivityAt: new Date(),
    },
  });
  const input = (data: Record<string, unknown>) => JSON.stringify({ userId, data });
  const a = await prisma.agentTask.create({
    data: {
      workflowId: wf.id,
      agentSlug: "report-analysis",
      taskType: "analyze",
      displayName: "analyze",
      sequenceOrder: 0,
      dependsOnTaskIds: [],
      input: input({ technicianNotes: "Burst pipe under the kitchen sink", propertyAddress: "1 Test St" }),
      status: "READY",
      maxRetries: 3,
    },
  });
  const b = await prisma.agentTask.create({
    data: {
      workflowId: wf.id,
      agentSlug: "classification",
      taskType: "classify",
      displayName: "classify",
      sequenceOrder: 1,
      parallelGroup: 1,
      dependsOnTaskIds: [a.id],
      input: input({ waterSource: "Burst pipe", affectedSquareFootage: 100 }),
      status: "PENDING",
      maxRetries: 3,
    },
  });
  await prisma.agentTask.create({
    data: {
      workflowId: wf.id,
      agentSlug: "scope-generation",
      taskType: "generate",
      displayName: "generate",
      sequenceOrder: 2,
      parallelGroup: 2,
      dependsOnTaskIds: [b.id],
      input: input({ affectedAreas: ["Kitchen"] }),
      status: "PENDING",
      maxRetries: 3,
    },
  });
  return { workflowId: wf.id, analysisTaskId: a.id };
}

export function workflowCount(userId: string): Promise<number> {
  return prisma.agentWorkflow.count({ where: { userId } });
}

export function jsonRequest(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
