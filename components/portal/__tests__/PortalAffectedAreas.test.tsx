// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PortalAffectedAreas } from "../PortalAffectedAreas";
import { portalMustShowEveryAffectedArea } from "@/lib/portal/__tests__/portal-affected-areas-bar";

describe("PortalAffectedAreas (RA-7573)", () => {
  it("renders N named areas when the job has N", () => {
    render(
      <PortalAffectedAreas
        areas={[
          { id: "a1", label: "Kitchen" },
          { id: "a2", label: "Hallway" },
        ]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /Affected Areas/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
    expect(screen.getByText("Hallway")).toBeInTheDocument();
    expect(screen.getAllByTestId("portal-affected-area")).toHaveLength(2);
    portalMustShowEveryAffectedArea({
      dbCount: 2,
      renderedCount: screen.getAllByTestId("portal-affected-area").length,
      headingShown: true,
    });
  });

  it("still renders a row when the label is blank — no silent omit", () => {
    render(
      <PortalAffectedAreas areas={[{ id: "a1", label: "" }]} />,
    );

    expect(
      screen.getByRole("heading", { name: /Affected Areas/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("portal-affected-area")).toHaveLength(1);
    expect(
      screen.getByText("Included in the restoration plan"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Area 1|Kitchen|Room/i)).not.toBeInTheDocument();
    portalMustShowEveryAffectedArea({
      dbCount: 1,
      renderedCount: 1,
      headingShown: true,
    });
  });

  it("renders nothing when there are no areas", () => {
    const { container } = render(<PortalAffectedAreas areas={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByRole("heading", { name: /Affected Areas/ }),
    ).not.toBeInTheDocument();
    portalMustShowEveryAffectedArea({
      dbCount: 0,
      renderedCount: 0,
      headingShown: false,
    });
  });
});
