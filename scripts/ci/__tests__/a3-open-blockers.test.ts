import { describe, expect, it } from "vitest";

import {
  A3_EXCLUDED_PROJECTS,
  A3_OPEN_STATE_TYPES,
  A3_PRIORITIES,
  buildA3Filter,
  fetchAllOpenIssues,
  summariseA3,
  type A3Issue,
  type IssuePage,
} from "../producers/a3-open-blockers";

/**
 * Controls for the A3 producer.
 *
 * `docs/evidence/release-gate/1.0.0/A3-no-sev1-sev2-open.md` records how this
 * criterion scored 5 points it had not earned: a query naming a project that
 * did not exist returned nothing, and nothing read as zero blockers. Its own
 * phrase for it is "the ABSENCE of a measurement, in the way an unplugged
 * smoke detector reports no smoke."
 *
 * So the tests that matter here are the ones asserting the FAILING direction:
 * a truncated page, an under-count, an empty population. A producer that can
 * only be observed reporting zero has not been shown to detect anything.
 */

function issue(
  identifier: string,
  priority: number,
  project: string | null = "RestoreAssist",
): A3Issue {
  return {
    identifier,
    priority,
    state: { type: "started" },
    project: project === null ? null : { name: project },
  };
}

function page(nodes: A3Issue[], hasNextPage = false, endCursor = "c1"): IssuePage {
  return { nodes, pageInfo: { hasNextPage, endCursor } };
}

describe("summariseA3", () => {
  it("counts Urgent and High as blockers", () => {
    const m = summariseA3([
      issue("RA-1", 1),
      issue("RA-2", 2),
      issue("RA-3", 3),
      issue("RA-4", 0),
    ]);
    expect(m.openBlockerCount).toBe(2);
    expect(m.blockers).toBe("RA-1,RA-2");
    // Population is every open issue, not just the blockers: that is what
    // makes it a control on whether the query reached anything.
    expect(m.populationCount).toBe(4);
  });

  it("does not count Medium, Low or No-priority issues", () => {
    // Priority 0 is "no priority", NOT "most urgent" -- reading the scale
    // backwards would make every unprioritised ticket a release blocker.
    const m = summariseA3([issue("RA-1", 0), issue("RA-2", 3), issue("RA-3", 4)]);
    expect(m.openBlockerCount).toBe(0);
    expect(m.populationCount).toBe(3);
  });

  it("excludes the out-of-scope projects, and only those", () => {
    const m = summariseA3([
      issue("RA-1", 1, "Margot"),
      issue("RA-2", 1, "Pi-Dev-Ops"),
      issue("RA-3", 1, "RestoreAssist V2"),
      issue("RA-4", 1, null),
    ]);
    // The two in-scope ones still block; a null project is in scope, since
    // "no project" is not a scope exemption.
    expect(m.blockers).toBe("RA-3,RA-4");
    // Excluded issues stay in the population: they prove the query ran.
    expect(m.populationCount).toBe(4);
  });

  it("declares its own scope in the receipt", () => {
    // These strings are what the verifier pins, so a narrowed query cannot be
    // passed off as a full one.
    const m = summariseA3([issue("RA-1", 3)]);
    expect(m.prioritiesScanned).toBe("1,2");
    expect(m.stateTypesScanned).toBe("backlog,started,triage,unstarted");
    expect(m.excludedProjects).toBe("Margot,Pi-Dev-Ops");
    expect(m.source).toBe("linear");
    expect(m.teamKey).toBe("RA");
  });

  it("reports a zero population rather than hiding it", () => {
    // The producer does not throw here; it reports honestly and the VERIFIER
    // rejects it. Keeping the two separate means the failure is visible in the
    // receipt rather than as an absent file.
    const m = summariseA3([]);
    expect(m.populationCount).toBe(0);
    expect(m.openBlockerCount).toBe(0);
  });
});

describe("scope constants match the criterion", () => {
  it("scans every open state type", () => {
    // The prior query used `state = started` alone, so triage, backlog and
    // unstarted blockers were invisible.
    expect([...A3_OPEN_STATE_TYPES].sort()).toEqual([
      "backlog",
      "started",
      "triage",
      "unstarted",
    ]);
  });

  it("treats Urgent and High as the blocking priorities", () => {
    expect([...A3_PRIORITIES]).toEqual([1, 2]);
  });

  it("keeps the exclusion list to the two RA-2232 named projects", () => {
    // Exact on purpose: adding one here silently shrinks what the criterion
    // measures, so it must be a deliberate, reviewed edit.
    expect([...A3_EXCLUDED_PROJECTS]).toEqual(["Margot", "Pi-Dev-Ops"]);
  });

  it("filters on the team and every open state, not on a project name", () => {
    // The query that could not run named a project that did not exist. This
    // one names no project at all, so there is nothing to mistype.
    const filter = buildA3Filter();
    expect(filter.team.key.eq).toBe("RA");
    expect(filter.state.type.in).toEqual([...A3_OPEN_STATE_TYPES]);
    expect(JSON.stringify(filter)).not.toContain("project");
  });
});

describe("fetchAllOpenIssues — an under-count is the dangerous failure", () => {
  it("walks every page", () => {
    const pages = [
      page([issue("RA-1", 3)], true, "cursor-1"),
      page([issue("RA-2", 1)], true, "cursor-2"),
      page([issue("RA-3", 2)]),
    ];
    let seen: Array<string | null> = [];
    return fetchAllOpenIssues(async (after) => {
      seen.push(after);
      return pages[seen.length - 1];
    }).then((issues) => {
      expect(issues.map((i) => i.identifier)).toEqual(["RA-1", "RA-2", "RA-3"]);
      // The cursor is threaded through, not ignored -- passing null every time
      // would loop on page one forever or silently re-read it.
      expect(seen).toEqual([null, "cursor-1", "cursor-2"]);
      // And the blockers on later pages are really counted.
      expect(summariseA3(issues).openBlockerCount).toBe(2);
    });
  });

  it("refuses to report a count when Linear promises a page but sends no cursor", async () => {
    // Returning what it had would under-count, and an under-count is the one
    // error that becomes a false PASS.
    await expect(
      fetchAllOpenIssues(async () => page([issue("RA-1", 1)], true, null as never)),
    ).rejects.toThrow(/truncated/);
  });

  it("refuses to report a count when the pages never end", async () => {
    await expect(
      fetchAllOpenIssues(async () => page([issue("RA-1", 1)], true, "always"), 3),
    ).rejects.toThrow(/Stopped after 3 pages/);
  });

  it("returns a single page without asking for another", async () => {
    let calls = 0;
    const issues = await fetchAllOpenIssues(async () => {
      calls++;
      return page([issue("RA-1", 3)]);
    });
    expect(calls).toBe(1);
    expect(issues).toHaveLength(1);
  });
});
