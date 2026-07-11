// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PilotReadinessCommandCentre } from "../PilotReadinessCommandCentre";
import type {
  PilotCommandCentreSnapshot,
  PilotReadinessGate,
} from "@/lib/pilot-readiness-command-centre";

const SMOKE_GATE: PilotReadinessGate = {
  id: "production-smoke",
  title: "Production smoke",
  status: "unknown",
  blocking: true,
  summary: "Smoke — Production last passed 60 minutes ago; the evidence is stale.",
  owner: "Operations",
  nextAction: "Repair the failed journey and rerun Smoke — Production.",
  sourceLabel: "Smoke — Production",
  sourceUrl:
    "https://github.com/CleanExpo/RestoreAssist/actions/runs/123456",
  verifiedAt: "2026-07-11T23:30:00.000Z",
};

const TYPE_CHECK_GATE: PilotReadinessGate = {
  id: "type-check",
  title: "TypeScript check",
  status: "pass",
  blocking: true,
  summary: "The enforcing TypeScript check completed successfully.",
  owner: "Engineering",
  nextAction: "No action required.",
  sourceLabel: "PR Quality Gates · TypeScript Check",
  sourceUrl:
    "https://github.com/CleanExpo/RestoreAssist/actions/runs/123455",
  verifiedAt: "2026-07-11T22:30:00.000Z",
};

function snapshot(
  overrides: Partial<PilotCommandCentreSnapshot> = {},
): PilotCommandCentreSnapshot {
  return {
    decision: "NO_GO",
    summary: "1 blocker must be cleared before pilot.",
    generatedAt: "2026-07-12T00:00:00.000Z",
    deployment: {
      environment: "production",
      branch: "main",
      commitSha: "0123456789abcdef0123456789abcdef01234567",
      commitUrl:
        "https://github.com/CleanExpo/RestoreAssist/commit/0123456789abcdef0123456789abcdef01234567",
      deploymentUrl: "https://restoreassist.app",
    },
    gates: [TYPE_CHECK_GATE, SMOKE_GATE],
    blockers: [SMOKE_GATE],
    counts: { verified: 1, needsEvidence: 1, blockers: 1 },
    ...overrides,
  };
}

describe("PilotReadinessCommandCentre", () => {
  it("puts the decision, deployment, counts, and blockers in the scanning path", () => {
    render(
      <PilotReadinessCommandCentre
        snapshot={snapshot()}
        refreshing={false}
        lastFetched={new Date("2026-07-12T00:01:00.000Z")}
        onRefresh={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Pilot readiness" }),
    ).toBeInTheDocument();
    expect(screen.getByText("NO-GO")).toBeInTheDocument();
    expect(
      screen.getByText("1 blocker must be cleared before pilot."),
    ).toBeInTheDocument();
    expect(screen.getByText("production")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("01234567")).toBeInTheDocument();
    expect(screen.getAllByText("Verified").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Needs evidence").length).toBeGreaterThan(0);
    expect(screen.getByText("Blockers")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Pilot blockers" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Repair the failed journey and rerun Smoke — Production."),
    ).toBeInTheDocument();
  });

  it("shows named evidence, owner, verification time, and a safe source link", () => {
    render(
      <PilotReadinessCommandCentre
        snapshot={snapshot()}
        refreshing={false}
        lastFetched={null}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Production smoke")).toHaveLength(2);
    expect(screen.getByText("Needs evidence", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByText("12 July 2026, 9:30 am")).toBeInTheDocument();

    const source = screen.getByRole("link", {
      name: "Open Production smoke evidence",
    });
    expect(source).toHaveAttribute(
      "href",
      "https://github.com/CleanExpo/RestoreAssist/actions/runs/123456",
    );
    expect(source).toHaveAttribute("target", "_blank");
    expect(source).toHaveAttribute("rel", "noreferrer");
  });

  it("invokes refresh and exposes the refreshing state accessibly", () => {
    const onRefresh = vi.fn();
    const { rerender } = render(
      <PilotReadinessCommandCentre
        snapshot={snapshot()}
        refreshing={false}
        lastFetched={null}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh readiness" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender(
      <PilotReadinessCommandCentre
        snapshot={snapshot()}
        refreshing
        lastFetched={null}
        onRefresh={onRefresh}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Refreshing readiness evidence" }),
    ).toBeDisabled();
  });

  it("shows the all-clear state without a blocker section", () => {
    render(
      <PilotReadinessCommandCentre
        snapshot={snapshot({
          decision: "GO",
          summary: "All 1 blocking gates have fresh passing evidence.",
          gates: [TYPE_CHECK_GATE],
          blockers: [],
          counts: { verified: 1, needsEvidence: 0, blockers: 0 },
        })}
        refreshing={false}
        lastFetched={null}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("GO")).toBeInTheDocument();
    expect(
      screen.getByText("All 1 blocking gates have fresh passing evidence."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Pilot blockers" }),
    ).not.toBeInTheDocument();
  });
});
