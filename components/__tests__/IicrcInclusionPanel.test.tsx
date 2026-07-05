// @vitest-environment jsdom
// RA-5040 PR1: non-blocking reviewer panel grouping missing IICRC inclusion
// prompts by severity (flag → "Required consideration", reminder →
// "Reminder"). Renders nothing when there is nothing to show.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import IicrcInclusionPanel from "../IicrcInclusionPanel";
import { runInclusionCheck } from "@/lib/iicrc-inclusion-check";

describe("IicrcInclusionPanel", () => {
  it("renders nothing when there are no missing prompts", () => {
    const { container } = render(
      <IicrcInclusionPanel claimType="WATER" missingPrompts={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("groups WATER's missing prompts into required-consideration and reminder", () => {
    const { missing } = runInclusionCheck("WATER", {});
    render(<IicrcInclusionPanel claimType="WATER" missingPrompts={missing} />);

    expect(screen.getByText("Required consideration")).toBeInTheDocument();
    expect(screen.getByText("Reminder")).toBeInTheDocument();
    expect(
      screen.getByText(/clearance moisture reading/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/antimicrobial or biocide application/i),
    ).toBeInTheDocument();
  });

  it("omits the reminder group entirely when every missing prompt is a flag", () => {
    const { missing } = runInclusionCheck("MOULD", {});
    render(<IicrcInclusionPanel claimType="MOULD" missingPrompts={missing} />);

    expect(screen.getByText("Required consideration")).toBeInTheDocument();
    expect(screen.queryByText("Reminder")).not.toBeInTheDocument();
  });
});
