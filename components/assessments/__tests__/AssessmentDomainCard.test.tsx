// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AssessmentDomainCard from "../AssessmentDomainCard";

describe("AssessmentDomainCard — mould labels (RA-8541)", () => {
  it("labels the mould condition as an assessor entry", () => {
    render(
      <AssessmentDomainCard
        inspectionId="insp_1"
        domain="MOULD"
        label="Mould"
        latest={null}
      />,
    );
    expect(
      screen.getByText(/^Condition \(assessor entry, S520\)/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Condition \(S520\)/)).not.toBeInTheDocument();
  });
});
