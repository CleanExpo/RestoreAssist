import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const GITHUB_REPOSITORY = "CleanExpo/RestoreAssist";
const GITHUB_REPOSITORY_URL =
  "https://github.com/CleanExpo/RestoreAssist";
const GITHUB_API_BASE =
  "https://api.github.com/repos/CleanExpo/RestoreAssist";
const GITHUB_CACHE_SECONDS = 15 * 60;
const GITHUB_REQUEST_TIMEOUT_MS = 5_000;

export type PilotGateStatus = "pass" | "warning" | "fail" | "unknown";
export type PilotDecision = "GO" | "CONDITIONAL" | "NO_GO";
export type PilotWorkflowId =
  | "pr-checks.yml"
  | "route-safety.yml"
  | "smoke-prod.yml"
  | "supabase-advisor-gate.yml"
  | "pilot-canary.yml"
  | "release-gate.yml";

export interface PilotWorkflowRun {
  id: number;
  workflowId: PilotWorkflowId;
  workflowName: string;
  status: string;
  conclusion: string | null;
  event: string;
  headBranch: string | null;
  headSha: string;
  updatedAt: string;
  url: string;
}

export interface PilotWorkflowJob {
  name: string;
  status: string;
  conclusion: string | null;
}

export interface PilotRlsCoverage {
  total: number;
  enabled: number;
}

export interface PilotDeploymentSource {
  environment: string;
  branch: string | null;
  commitSha: string | null;
  commitUrl: string | null;
  deploymentUrl: string | null;
}

export interface PilotReadinessGate {
  id: string;
  title: string;
  status: PilotGateStatus;
  blocking: boolean;
  summary: string;
  owner: string;
  nextAction: string;
  sourceLabel: string;
  sourceUrl: string;
  verifiedAt: string | null;
}

export interface PilotCommandCentreSnapshot {
  decision: PilotDecision;
  summary: string;
  generatedAt: string;
  deployment: PilotDeploymentSource;
  gates: PilotReadinessGate[];
  blockers: PilotReadinessGate[];
  counts: {
    verified: number;
    needsEvidence: number;
    blockers: number;
  };
}

interface BuildPilotCommandCentreInput {
  now: Date;
  deployment: PilotDeploymentSource;
  verifiedSourceShas?: string[];
  workflowRuns: Partial<Record<PilotWorkflowId, PilotWorkflowRun>>;
  pilotCanaryJobs: PilotWorkflowJob[] | null;
  rlsCoverage: PilotRlsCoverage | null;
}

interface WorkflowGateDefinition {
  id: string;
  title: string;
  workflowId: PilotWorkflowId;
  sourceLabel: string;
  owner: string;
  freshnessMinutes: number;
  successSummary: string;
  nextAction: string;
  mustMatchDeployment?: boolean;
}

interface GitHubWorkflowRunsResponse {
  workflow_runs?: Array<{
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    event: string;
    head_branch: string | null;
    head_sha: string;
    updated_at: string;
    html_url: string;
  }>;
}

interface GitHubJobsResponse {
  jobs?: Array<{
    name: string;
    status: string;
    conclusion: string | null;
  }>;
}

interface GitHubAssociatedPull {
  head?: { sha?: string };
}

const DAY_MINUTES = 24 * 60;

const TYPE_CHECK_GATE: WorkflowGateDefinition = {
  id: "type-check",
  title: "TypeScript check",
  workflowId: "pr-checks.yml",
  sourceLabel: "PR Quality Gates · TypeScript Check",
  owner: "Engineering",
  freshnessMinutes: 7 * DAY_MINUTES,
  successSummary: "The enforcing TypeScript check completed successfully.",
  nextAction: "Resolve the latest quality-run failure and rerun PR Quality Gates.",
  mustMatchDeployment: true,
};

const ROUTE_SAFETY_GATE: WorkflowGateDefinition = {
  id: "route-safety",
  title: "API route safety",
  workflowId: "route-safety.yml",
  sourceLabel: "Route Safety Guard",
  owner: "Security",
  freshnessMinutes: 7 * DAY_MINUTES,
  successSummary: "The route-safety scan completed without a blocking finding.",
  nextAction: "Review the route-safety findings, fix new auth or mutation risks, and rerun the guard.",
  mustMatchDeployment: true,
};

const AI_AUDIT_GATE: WorkflowGateDefinition = {
  id: "ai-audit",
  title: "AI guardrail audit",
  workflowId: "pr-checks.yml",
  sourceLabel: "PR Quality Gates · AI guardrail audit",
  owner: "AI Safety",
  freshnessMinutes: 7 * DAY_MINUTES,
  successSummary: "The enforcing AI guardrail audit completed successfully.",
  nextAction: "Classify or guard the flagged AI call site, then rerun PR Quality Gates.",
  mustMatchDeployment: true,
};

const SMOKE_GATE: WorkflowGateDefinition = {
  id: "production-smoke",
  title: "Production smoke",
  workflowId: "smoke-prod.yml",
  sourceLabel: "Smoke — Production",
  owner: "Operations",
  freshnessMinutes: 45,
  successSummary: "The production smoke suite completed successfully.",
  nextAction: "Open the smoke report, repair the failed journey, and rerun Smoke — Production.",
};

const ADVISOR_GATE: WorkflowGateDefinition = {
  id: "advisor-source",
  title: "Supabase advisor source",
  workflowId: "supabase-advisor-gate.yml",
  sourceLabel: "Supabase advisor gate",
  owner: "Security",
  freshnessMinutes: 8 * DAY_MINUTES,
  successSummary: "The Supabase security-advisor gate completed successfully.",
  nextAction: "Resolve ERROR-level advisor findings or RLS-disabled tables and rerun the advisor gate.",
};

const CANARY_GATE: WorkflowGateDefinition = {
  id: "pilot-canary",
  title: "Pilot canary",
  workflowId: "pilot-canary.yml",
  sourceLabel: "Pilot tester canary",
  owner: "Pilot Operations",
  freshnessMinutes: 36 * 60,
  successSummary: "The authenticated pilot swarm completed successfully.",
  nextAction: "Provision the pilot tester secrets if needed, then rerun the authenticated swarm.",
};

const RELEASE_GATE: WorkflowGateDefinition = {
  id: "release-gate",
  title: "Strict release gate",
  workflowId: "release-gate.yml",
  sourceLabel: "Release Gate (RA-4956)",
  owner: "Release Engineering",
  freshnessMinutes: 7 * DAY_MINUTES,
  successSummary: "The strict release-gate scorer completed successfully.",
  nextAction: "Run the strict release gate for the intended pilot source and clear every failed criterion.",
  mustMatchDeployment: true,
};

const ACTIVE_WORKFLOW_STATUSES = new Set([
  "queued",
  "requested",
  "waiting",
  "pending",
  "in_progress",
]);

const FAILED_CONCLUSIONS = new Set([
  "failure",
  "timed_out",
  "startup_failure",
  "action_required",
]);

function workflowUrl(workflowId: PilotWorkflowId): string {
  return `${GITHUB_REPOSITORY_URL}/actions/workflows/${workflowId}`;
}

function formatWorkflowState(value: string): string {
  return value.replaceAll("_", " ");
}

function evaluateWorkflowGate(
  definition: WorkflowGateDefinition,
  run: PilotWorkflowRun | undefined,
  now: Date,
  verifiedSourceShas: ReadonlySet<string> = new Set(),
): PilotReadinessGate {
  const base = {
    id: definition.id,
    title: definition.title,
    blocking: true,
    owner: definition.owner,
    nextAction: definition.nextAction,
    sourceLabel: definition.sourceLabel,
    sourceUrl: run?.url ?? workflowUrl(definition.workflowId),
    verifiedAt: run?.updatedAt ?? null,
  };

  if (!run) {
    return {
      ...base,
      status: "unknown",
      summary: `No ${definition.sourceLabel} evidence is available.`,
    };
  }

  if (
    definition.mustMatchDeployment &&
    (verifiedSourceShas.size === 0 || !verifiedSourceShas.has(run.headSha))
  ) {
    return {
      ...base,
      status: "unknown",
      summary:
        verifiedSourceShas.size === 0
          ? `${definition.sourceLabel} cannot be matched because the deployed commit is unavailable.`
          : `${definition.sourceLabel} does not match the deployed commit or its merged PR source.`,
    };
  }

  if (ACTIVE_WORKFLOW_STATUSES.has(run.status)) {
    return {
      ...base,
      status: "warning",
      summary: `${definition.sourceLabel} is ${formatWorkflowState(run.status)}.`,
    };
  }

  if (run.conclusion === "success") {
    const verifiedAt = new Date(run.updatedAt);
    const ageMinutes = Math.floor(
      (now.getTime() - verifiedAt.getTime()) / 60_000,
    );
    if (!Number.isFinite(ageMinutes) || ageMinutes < 0) {
      return {
        ...base,
        status: "unknown",
        summary: `${definition.sourceLabel} returned an invalid verification timestamp.`,
      };
    }
    if (ageMinutes > definition.freshnessMinutes) {
      return {
        ...base,
        status: "unknown",
        summary: `${definition.sourceLabel} last passed ${ageMinutes} minutes ago; the evidence is stale.`,
      };
    }
    return {
      ...base,
      status: "pass",
      summary: definition.successSummary,
      nextAction: "No action required.",
    };
  }

  if (run.conclusion && FAILED_CONCLUSIONS.has(run.conclusion)) {
    return {
      ...base,
      status: "fail",
      summary: `${definition.sourceLabel} failed with ${formatWorkflowState(run.conclusion)}.`,
    };
  }

  const conclusion = run.conclusion
    ? formatWorkflowState(run.conclusion)
    : formatWorkflowState(run.status);
  return {
    ...base,
    status: "unknown",
    summary: `${definition.sourceLabel} concluded ${conclusion}; no passing evidence is available.`,
  };
}

function buildRlsAdvisorGate(
  advisorRun: PilotWorkflowRun | undefined,
  coverage: PilotRlsCoverage | null,
  now: Date,
): PilotReadinessGate {
  const advisor = evaluateWorkflowGate(ADVISOR_GATE, advisorRun, now);
  const base = {
    id: "rls-advisors",
    title: "RLS and security advisors",
    blocking: true,
    owner: "Security",
    sourceLabel: "Live PostgreSQL RLS + Supabase advisor gate",
    sourceUrl: advisor.sourceUrl,
    verifiedAt: advisor.verifiedAt,
  };

  if (!coverage || coverage.total === 0) {
    return {
      ...base,
      status: "unknown",
      summary: `Live RLS coverage could not be verified. ${advisor.summary}`,
      nextAction:
        "Restore the database catalogue check, then rerun the Supabase advisor gate.",
    };
  }

  const disabled = coverage.total - coverage.enabled;
  if (disabled > 0) {
    return {
      ...base,
      status: "fail",
      summary: `${coverage.enabled}/${coverage.total} public tables have RLS enabled; ${disabled} remain disabled.`,
      nextAction:
        "Enable RLS on every remaining public table, validate tenant policies, and rerun the advisor gate.",
    };
  }

  if (advisor.status !== "pass") {
    return {
      ...base,
      status: advisor.status,
      summary: `${coverage.enabled}/${coverage.total} public tables have RLS enabled; ${advisor.summary}`,
      nextAction: advisor.nextAction,
    };
  }

  return {
    ...base,
    status: "pass",
    summary: `${coverage.enabled}/${coverage.total} public tables have RLS enabled and the latest Supabase advisor gate passed.`,
    nextAction: "No action required.",
  };
}

function buildCanaryGate(
  run: PilotWorkflowRun | undefined,
  jobs: PilotWorkflowJob[] | null,
  now: Date,
): PilotReadinessGate {
  const workflowGate = evaluateWorkflowGate(CANARY_GATE, run, now);
  if (workflowGate.status !== "pass") return workflowGate;

  const swarm = jobs?.find((job) => job.name.trim().toLowerCase() === "swarm");
  if (!swarm) {
    return {
      ...workflowGate,
      status: "unknown",
      summary:
        "The canary workflow passed, but authenticated swarm-job evidence is unavailable.",
      nextAction: CANARY_GATE.nextAction,
    };
  }

  if (ACTIVE_WORKFLOW_STATUSES.has(swarm.status)) {
    return {
      ...workflowGate,
      status: "warning",
      summary: `The authenticated pilot swarm is ${formatWorkflowState(swarm.status)}.`,
      nextAction: CANARY_GATE.nextAction,
    };
  }

  if (swarm.conclusion === "success") return workflowGate;

  if (swarm.conclusion && FAILED_CONCLUSIONS.has(swarm.conclusion)) {
    return {
      ...workflowGate,
      status: "fail",
      summary: `The authenticated pilot swarm failed with ${formatWorkflowState(swarm.conclusion)}.`,
      nextAction: CANARY_GATE.nextAction,
    };
  }

  return {
    ...workflowGate,
    status: "unknown",
    summary: `The authenticated pilot swarm concluded ${formatWorkflowState(swarm.conclusion ?? swarm.status)}; skipped work is not pilot evidence.`,
    nextAction: CANARY_GATE.nextAction,
  };
}

export function buildPilotCommandCentre({
  now,
  deployment,
  verifiedSourceShas,
  workflowRuns,
  pilotCanaryJobs,
  rlsCoverage,
}: BuildPilotCommandCentreInput): PilotCommandCentreSnapshot {
  const sourceShas = new Set(
    verifiedSourceShas ??
      (deployment.commitSha ? [deployment.commitSha] : []),
  );
  const gates = [
    evaluateWorkflowGate(
      TYPE_CHECK_GATE,
      workflowRuns[TYPE_CHECK_GATE.workflowId],
      now,
      sourceShas,
    ),
    evaluateWorkflowGate(
      ROUTE_SAFETY_GATE,
      workflowRuns[ROUTE_SAFETY_GATE.workflowId],
      now,
      sourceShas,
    ),
    evaluateWorkflowGate(
      AI_AUDIT_GATE,
      workflowRuns[AI_AUDIT_GATE.workflowId],
      now,
      sourceShas,
    ),
    buildRlsAdvisorGate(
      workflowRuns[ADVISOR_GATE.workflowId],
      rlsCoverage,
      now,
    ),
    evaluateWorkflowGate(SMOKE_GATE, workflowRuns[SMOKE_GATE.workflowId], now),
    buildCanaryGate(
      workflowRuns[CANARY_GATE.workflowId],
      pilotCanaryJobs,
      now,
    ),
    evaluateWorkflowGate(
      RELEASE_GATE,
      workflowRuns[RELEASE_GATE.workflowId],
      now,
      sourceShas,
    ),
  ];

  const blockers = gates.filter(
    (gate) => gate.blocking && gate.status !== "pass",
  );
  const attention = gates.filter((gate) => gate.status !== "pass");
  const nonBlockingAttention = attention.filter((gate) => !gate.blocking);
  const decision: PilotDecision =
    blockers.length > 0
      ? "NO_GO"
      : nonBlockingAttention.length > 0
        ? "CONDITIONAL"
        : "GO";

  const summary =
    decision === "GO"
      ? `All ${gates.length} blocking gates have fresh passing evidence.`
      : decision === "CONDITIONAL"
        ? `${nonBlockingAttention.length} non-blocking item${nonBlockingAttention.length === 1 ? "" : "s"} need attention.`
        : `${blockers.length} blocker${blockers.length === 1 ? "" : "s"} must be cleared before pilot.`;

  return {
    decision,
    summary,
    generatedAt: now.toISOString(),
    deployment,
    gates,
    blockers,
    counts: {
      verified: gates.filter((gate) => gate.status === "pass").length,
      needsEvidence: attention.length,
      blockers: blockers.length,
    },
  };
}

export function buildPilotDeploymentSource(
  env: Record<string, string | undefined>,
): PilotDeploymentSource {
  const commitSha = env.VERCEL_GIT_COMMIT_SHA || null;
  const deploymentHost =
    env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL || null;

  return {
    environment: env.VERCEL_ENV || env.NODE_ENV || "unknown",
    branch: env.VERCEL_GIT_COMMIT_REF || null,
    commitSha,
    commitUrl: commitSha
      ? `${GITHUB_REPOSITORY_URL}/commit/${commitSha}`
      : null,
    deploymentUrl: deploymentHost
      ? deploymentHost.startsWith("http")
        ? deploymentHost
        : `https://${deploymentHost}`
      : null,
  };
}

const WORKFLOW_IDS: PilotWorkflowId[] = [
  "pr-checks.yml",
  "route-safety.yml",
  "smoke-prod.yml",
  "supabase-advisor-gate.yml",
  "pilot-canary.yml",
  "release-gate.yml",
];

const SOURCE_MATCHED_WORKFLOWS = new Set<PilotWorkflowId>([
  "pr-checks.yml",
  "route-safety.yml",
  "release-gate.yml",
]);

const MAIN_BRANCH_WORKFLOWS = new Set<PilotWorkflowId>([
  "smoke-prod.yml",
  "supabase-advisor-gate.yml",
  "pilot-canary.yml",
]);

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "RestoreAssist-Pilot-Readiness",
};

async function fetchLatestWorkflowRun(
  workflowId: PilotWorkflowId,
  verifiedSourceShas: ReadonlySet<string>,
): Promise<PilotWorkflowRun | null> {
  const response = await fetch(
    `${GITHUB_API_BASE}/actions/workflows/${workflowId}/runs?per_page=50`,
    {
      headers: GITHUB_HEADERS,
      next: { revalidate: GITHUB_CACHE_SECONDS },
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub workflow request failed with ${response.status}`);
  }

  const body = (await response.json()) as GitHubWorkflowRunsResponse;
  let candidates = (body.workflow_runs ?? []).filter((run) => {
    if (workflowId === "pilot-canary.yml" && run.event === "pull_request") {
      return false;
    }
    return !MAIN_BRANCH_WORKFLOWS.has(workflowId) || run.head_branch === "main";
  });
  if (SOURCE_MATCHED_WORKFLOWS.has(workflowId)) {
    candidates = candidates.filter((run) =>
      verifiedSourceShas.has(run.head_sha),
    );
  }
  const latest = candidates.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )[0];
  if (!latest) return null;

  return {
    id: latest.id,
    workflowId,
    workflowName: latest.name,
    status: latest.status,
    conclusion: latest.conclusion,
    event: latest.event,
    headBranch: latest.head_branch,
    headSha: latest.head_sha,
    updatedAt: latest.updated_at,
    url: latest.html_url,
  };
}

async function fetchAssociatedPullHeadShas(
  commitSha: string,
): Promise<string[]> {
  const response = await fetch(
    `${GITHUB_API_BASE}/commits/${encodeURIComponent(commitSha)}/pulls`,
    {
      headers: GITHUB_HEADERS,
      next: { revalidate: GITHUB_CACHE_SECONDS },
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub associated-PR request failed with ${response.status}`);
  }

  const pulls = (await response.json()) as GitHubAssociatedPull[];
  return pulls.flatMap((pull) => (pull.head?.sha ? [pull.head.sha] : []));
}

async function fetchWorkflowJobs(
  runId: number,
): Promise<PilotWorkflowJob[]> {
  const response = await fetch(
    `${GITHUB_API_BASE}/actions/runs/${runId}/jobs?per_page=100`,
    {
      headers: GITHUB_HEADERS,
      next: { revalidate: GITHUB_CACHE_SECONDS },
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub jobs request failed with ${response.status}`);
  }

  const body = (await response.json()) as GitHubJobsResponse;
  return (body.jobs ?? []).map((job) => ({
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
  }));
}

async function queryRlsCoverage(): Promise<PilotRlsCoverage> {
  const rows = await prisma.$queryRaw<PilotRlsCoverage[]>(Prisma.sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE c.relrowsecurity)::int AS enabled
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  `);
  const row = rows[0];
  if (!row) throw new Error("PostgreSQL returned no RLS coverage row");
  return row;
}

function logUnavailableSource(source: string, reason: unknown): void {
  console.error(`[pilot-readiness] ${source} unavailable`, reason);
}

export async function getPilotCommandCentre(): Promise<PilotCommandCentreSnapshot> {
  const deployment = buildPilotDeploymentSource(process.env);
  const verifiedSourceShas = new Set<string>();
  if (deployment.commitSha) {
    verifiedSourceShas.add(deployment.commitSha);
    try {
      const pullHeadShas = await fetchAssociatedPullHeadShas(
        deployment.commitSha,
      );
      pullHeadShas.forEach((sha) => verifiedSourceShas.add(sha));
    } catch (reason) {
      logUnavailableSource("deployed commit PR source", reason);
    }
  }

  const workflowResults = await Promise.allSettled(
    WORKFLOW_IDS.map(async (workflowId) => ({
      workflowId,
      run: await fetchLatestWorkflowRun(workflowId, verifiedSourceShas),
    })),
  );

  const workflowRuns: Partial<Record<PilotWorkflowId, PilotWorkflowRun>> = {};
  for (const [index, result] of workflowResults.entries()) {
    const workflowId = WORKFLOW_IDS[index];
    if (result.status === "fulfilled") {
      if (result.value.run) workflowRuns[workflowId] = result.value.run;
    } else {
      logUnavailableSource(workflowId, result.reason);
    }
  }

  const canaryRun = workflowRuns["pilot-canary.yml"];
  const [canaryJobsResult, rlsResult] = await Promise.allSettled([
    canaryRun ? fetchWorkflowJobs(canaryRun.id) : Promise.resolve(null),
    queryRlsCoverage(),
  ]);

  const pilotCanaryJobs =
    canaryJobsResult.status === "fulfilled" ? canaryJobsResult.value : null;
  if (canaryJobsResult.status === "rejected") {
    logUnavailableSource("pilot-canary jobs", canaryJobsResult.reason);
  }

  const rlsCoverage =
    rlsResult.status === "fulfilled" ? rlsResult.value : null;
  if (rlsResult.status === "rejected") {
    logUnavailableSource("PostgreSQL RLS coverage", rlsResult.reason);
  }

  return buildPilotCommandCentre({
    now: new Date(),
    deployment,
    verifiedSourceShas: [...verifiedSourceShas],
    workflowRuns,
    pilotCanaryJobs,
    rlsCoverage,
  });
}

export { GITHUB_REPOSITORY };
