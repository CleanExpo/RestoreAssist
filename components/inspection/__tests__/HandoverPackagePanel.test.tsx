// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import HandoverPackagePanel from "@/components/inspection/HandoverPackagePanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HandoverPackagePanel", () => {
  it("renders nothing when job is not closed and handover not done", () => {
    const { container } = render(
      <HandoverPackagePanel
        inspectionId="ins_1"
        inspectionNumber="NIR-1"
        status="IN_BILLING"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows complete handover CTA for CLOSED jobs", () => {
    render(
      <HandoverPackagePanel
        inspectionId="ins_1"
        inspectionNumber="NIR-1"
        status="CLOSED"
      />,
    );
    expect(screen.getByText("Client handover package")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Complete handover/i }),
    ).toBeInTheDocument();
  });

  it("completes handover and shows download path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            packageUrl: "https://signed.example/handover.zip",
            handoverCompletedAt: "2026-07-16T00:00:00.000Z",
          },
        }),
      }),
    );

    const onHandedOver = vi.fn();
    render(
      <HandoverPackagePanel
        inspectionId="ins_1"
        inspectionNumber="NIR-1"
        status="CLOSED"
        onHandedOver={onHandedOver}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Complete handover/i }));

    await waitFor(() => {
      expect(screen.getByText("Handed over")).toBeInTheDocument();
    });
    expect(onHandedOver).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /Download package/i })).toHaveAttribute(
      "href",
      "https://signed.example/handover.zip",
    );
  });
});
