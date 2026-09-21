// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PortalAffectedAreas } from "../PortalAffectedAreas";

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
    expect(
      screen.getAllByText("Included in the restoration plan"),
    ).toHaveLength(2);
  });

  it("renders nothing when there are no areas", () => {
    const { container } = render(<PortalAffectedAreas areas={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByRole("heading", { name: /Affected Areas/ }),
    ).not.toBeInTheDocument();
  });
});
