/**
 * A3-no-sev1-sev2-open producer: counts open Urgent/High issues on the
 * RestoreAssist Linear team and emits the measurements a signed release
 * receipt carries.
 *
 * WHY THIS IS SHAPED THE WAY IT IS
 * -------------------------------
 * `docs/evidence/release-gate/1.0.0/A3-no-sev1-sev2-open.md` is an unusually
 * detailed post-mortem of how this criterion scored 5 points it had not
 * earned, and every control below answers one line of it.
 *
 *  1. **The recorded query could not be run at all.** It filtered on
 *     `project:"RestoreAssist Compliance Platform"`, a project that does not
 *     exist; Linear answered "Could not find project" and the criterion read
 *     the empty result as zero blockers. The file's own words: "not a passing
 *     measurement but the ABSENCE of one, in the way an unplugged smoke
 *     detector reports no smoke."
 *
 *     So this producer reports `populationCount` -- every open issue on the
 *     team, before any priority or project filter -- and the verifier requires
 *     it to be positive. A query that reached nothing can no longer look like
 *     a team with nothing wrong. Linear also reports query errors inside a 200
 *     response, so the status code alone is not checked.
 *
 *  2. **The old query only looked at `state = started`.** Issues sitting in
 *     triage, backlog or unstarted were invisible to it while being open by
 *     any reading. All four open state types are scanned, and the set is
 *     declared in the receipt so a narrowing cannot be silent.
 *
 *  3. **Project exclusions can drive any count to zero.** Pi-Dev-Ops and
 *     Margot are out of product scope per RA-2232, which is legitimate, but a
 *     producer free to exclude anything could always report success. The
 *     exclusion set is declared in the receipt and pinned by the verifier, so
 *     widening it takes a reviewed code change rather than a command-line flag.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * It does not judge severity. The evidence file is emphatic that priority is
 * not severity -- an epic, a spike or a growth ticket can carry Urgent without
 * being a customer-impacting defect, and that mismatch is why the criterion
 * drifted. Deciding which is which is a human call made in Linear by
 * downgrading the ticket. This producer measures exactly what the criterion
 * states, "0 open Urgent/High", and leaves the curation where it belongs.
 *
 * Usage:
 *   LINEAR_API_KEY=... npx tsx scripts/ci/producers/a3-open-blockers.ts
 *   LINEAR_API_KEY=... npx tsx scripts/ci/producers/a3-open-blockers.ts --json
 *
 * The JSON it prints is the `--measurements` argument for
 * scripts/ci/sign-release-receipt.ts. This script never signs: it has no
 * access to the signing key and must not.
 */

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

/** Urgent and High on Linear's scale. 0 is "no priority", not "most urgent". */
export const A3_PRIORITIES = [1, 2] as const;

/**
 * Every state type that is not resolved. Linear's completed/cancelled types are
 * the only closed ones; the rest are open however inactive they look.
 */
export const A3_OPEN_STATE_TYPES = [
  "backlog",
  "started",
  "triage",
  "unstarted",
] as const;

/** Out of product scope per RA-2232. Pinned by the verifier, not a flag. */
export const A3_EXCLUDED_PROJECTS = ["Margot", "Pi-Dev-Ops"] as const;

export const A3_TEAM_KEY = "RA";

/**
 * The Linear identity whose key may take this measurement.
 *
 * Linear personal API keys see only what their user sees, and can be narrowed
 * to particular teams. So `populationCount > 0` proves the query returned
 * SOMETHING, never that it returned everything: a key without access to a
 * private team reports a healthy population while omitting exactly the
 * blockers that live there. Raised by CodeRabbit reviewing #2109.
 *
 * Pinning the viewer closes it. A narrower key belongs to a different identity
 * and is rejected, whatever its counts say.
 *
 * Deliberately EMPTY until the owner creates a dedicated Linear service
 * identity with verified read access across team RA and records its id here.
 * While it is empty the criterion cannot pass -- which is the honest state,
 * because until then nothing establishes that the querying key can see every
 * issue the criterion is about.
 */
export const A3_EXPECTED_VIEWER_ID = "";

export interface A3Issue {
  identifier: string;
  priority: number;
  state: { type: string } | null;
  project: { name: string } | null;
}

/** The measurement bag this producer emits, all values receipt-safe scalars. */
export interface A3Measurements {
  source: string;
  teamKey: string;
  /** Linear `viewer.id` of the key that ran the query. */
  viewerId: string;
  prioritiesScanned: string;
  stateTypesScanned: string;
  excludedProjects: string;
  populationCount: number;
  openBlockerCount: number;
  blockers: string;
}

/**
 * Reduce the fetched issues to the receipt's measurements.
 *
 * Pure and separately tested: the counting rule is where a false pass would be
 * born, and it should not need a network round trip to exercise.
 *
 * @param issues Every OPEN issue on the team, any priority. Passing an
 *   already-filtered list would defeat the population control.
 */
export function summariseA3(
  issues: A3Issue[],
  viewerId: string = "",
): A3Measurements {
  const excluded = new Set<string>(A3_EXCLUDED_PROJECTS);
  const priorities = new Set<number>(A3_PRIORITIES);
  const blockers = issues
    .filter(
      (issue) =>
        priorities.has(issue.priority) &&
        !excluded.has(issue.project?.name ?? ""),
    )
    .map((issue) => issue.identifier)
    .sort();

  return {
    source: "linear",
    teamKey: A3_TEAM_KEY,
    viewerId,
    prioritiesScanned: [...A3_PRIORITIES].join(","),
    stateTypesScanned: [...A3_OPEN_STATE_TYPES].join(","),
    excludedProjects: [...A3_EXCLUDED_PROJECTS].join(","),
    populationCount: issues.length,
    openBlockerCount: blockers.length,
    blockers: blockers.join(","),
  };
}

/** The GraphQL filter: this team, every open state type, any priority. */
export function buildA3Filter(teamKey: string = A3_TEAM_KEY) {
  return {
    team: { key: { eq: teamKey } },
    state: { type: { in: [...A3_OPEN_STATE_TYPES] } },
  };
}

const ISSUES_QUERY = `query A3OpenIssues($first: Int!, $after: String, $filter: IssueFilter) {
  issues(first: $first, after: $after, filter: $filter) {
    nodes { identifier priority state { type } project { name } }
    pageInfo { hasNextPage endCursor }
  }
}`;

export interface IssuePage {
  nodes: A3Issue[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

/**
 * Walk every page of the filtered issue list.
 *
 * Pagination is not an optimisation here. A single page that silently truncated
 * would UNDER-count blockers, and an under-count is the one error that turns
 * into a false pass -- the same shape of failure as the query that could not
 * run. `fetchPage` is injected so this loop is testable without a network.
 */
export async function fetchAllOpenIssues(
  fetchPage: (after: string | null) => Promise<IssuePage>,
  maxPages = 100,
): Promise<A3Issue[]> {
  const issues: A3Issue[] = [];
  let after: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const result: IssuePage = await fetchPage(after);
    issues.push(...result.nodes);
    if (!result.pageInfo.hasNextPage) return issues;
    after = result.pageInfo.endCursor;
    if (!after) {
      throw new Error(
        "Linear reported another page but returned no cursor; refusing to " +
          "report a possibly truncated count",
      );
    }
  }
  throw new Error(
    `Stopped after ${maxPages} pages; refusing to report a truncated count`,
  );
}

/** One page of issues from Linear, with GraphQL-level errors surfaced. */
async function fetchPageFromLinear(
  apiKey: string,
  teamKey: string,
  after: string | null,
): Promise<IssuePage> {
  const res = await fetch(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: ISSUES_QUERY,
      variables: { first: 100, after, filter: buildA3Filter(teamKey) },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Linear API returned ${res.status} ${res.statusText}: ${(
        await res.text()
      ).slice(0, 400)}`,
    );
  }
  // Linear reports query errors inside a 200 response. Trusting the status code
  // is precisely how "Could not find project" became a passing measurement.
  const json = (await res.json()) as {
    data?: { issues?: IssuePage };
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(
      `Linear GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }
  const issues = json.data?.issues;
  if (!issues) throw new Error("Linear returned no issues payload");
  return issues;
}

/**
 * Take the measurement. Exported so `sign-release-receipt.ts` can invoke it
 * directly rather than accepting numbers on the command line.
 *
 * That indirection is the whole point. While the signer took a
 * `--measurements` argument, a key holder could certify `openBlockerCount: 0`
 * without any Linear query happening at all, and every guard in the verifier
 * would pass. The producer is now the only thing that can produce a
 * measurement, and it is in the repository where it can be reviewed.
 */
export async function produceA3Measurements(
  apiKey: string,
): Promise<A3Measurements> {
  const [viewerId, issues] = await Promise.all([
    fetchViewerId(apiKey),
    fetchAllOpenIssues((after) => fetchPageFromLinear(apiKey, A3_TEAM_KEY, after)),
  ]);
  return summariseA3(issues, viewerId);
}

/** The identity behind the key, so the verifier can pin its scope. */
async function fetchViewerId(apiKey: string): Promise<string> {
  const res = await fetch(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "query { viewer { id } }" }),
  });
  if (!res.ok) throw new Error(`Linear viewer query returned ${res.status}`);
  const json = (await res.json()) as {
    data?: { viewer?: { id?: string } };
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(
      `Linear viewer query errors: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }
  const id = json.data?.viewer?.id;
  if (!id) throw new Error("Linear returned no viewer id");
  return id;
}

async function main(): Promise<void> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    console.error(
      "LINEAR_API_KEY is not set. This producer reads Linear directly so the " +
        "measurement is reproducible in CI rather than transcribed by hand.",
    );
    process.exit(2);
  }
  const measurements = await produceA3Measurements(apiKey);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(measurements));
    return;
  }
  console.log(
    `Team ${measurements.teamKey}: ${measurements.populationCount} open issues, ` +
      `${measurements.openBlockerCount} of them Urgent/High and in scope.`,
  );
  if (measurements.openBlockerCount > 0) {
    console.log(`Blocking: ${measurements.blockers}`);
    console.log(
      "A3 cannot pass while these are open. Close them, or downgrade the ones " +
        "that are not Sev1/Sev2 defects -- priority is not severity, and that " +
        "call is a human one made in Linear.",
    );
  }
}

// Only run when invoked directly, so the pure exports stay importable.
if (process.argv[1]?.endsWith("a3-open-blockers.ts")) {
  main().catch((error) => {
    console.error(String(error));
    process.exit(1);
  });
}
