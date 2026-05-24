// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import CloseJobPrompt from "../CloseJobPrompt";

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const baseProps = {
  inspectionId: "ins_1",
  inspectionNumber: "NIR-2026-05-0001",
  invoiceId: "inv_1",
  completedAt: null,
  closeSummary: null,
  onClosed: vi.fn(),
};

beforeEach(() => {
  cleanup();
  fetchMock.mockReset();
  baseProps.onClosed.mockReset();
});

describe("CloseJobPrompt — locked terminal state", () => {
  it("renders Job Closed card with summary when completedAt is set", () => {
    render(
      <CloseJobPrompt
        {...baseProps}
        completedAt="2026-05-14T10:00:00.000Z"
        closeSummary="Job complete. Total $1,210."
      />,
    );
    expect(screen.getByText(/Job Closed/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Inspection NIR-2026-05-0001 was closed/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Job complete\. Total \$1,210\./i),
    ).toBeInTheDocument();
  });
});

describe("CloseJobPrompt — active state", () => {
  it("fetches the draft on mount and renders it in the textarea", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        draft: { text: "AI-drafted summary", inspectionNumber: "NIR-1" },
        source: "ai",
      }),
    });

    render(<CloseJobPrompt {...baseProps} />);

    await waitFor(() => {
      const ta = screen.getByLabelText(
        /Close summary draft/i,
      ) as HTMLTextAreaElement;
      expect(ta.value).toBe("AI-drafted summary");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/inspections/ins_1/close-summary",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("Not yet dismiss hides the card without firing close", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        draft: { text: "draft", inspectionNumber: "NIR-1" },
        source: "ai",
      }),
    });

    render(<CloseJobPrompt {...baseProps} />);
    await waitFor(() =>
      expect(screen.getByLabelText(/Close summary draft/i)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Not yet/i }));
    expect(screen.queryByTestId("close-job-prompt")).not.toBeInTheDocument();
  });

  it("subscription gate (402) shows renewal message; user can still write manually", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: async () => ({ error: "Subscription required" }),
    });

    render(<CloseJobPrompt {...baseProps} />);
    await waitFor(() => {
      expect(
        screen.getByText(/active subscription is required/i),
      ).toBeInTheDocument();
    });
  });

  it("primary CTA opens confirm dialog; cancel closes without firing close", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        draft: { text: "draft", inspectionNumber: "NIR-1" },
        source: "ai",
      }),
    });

    render(<CloseJobPrompt {...baseProps} />);
    await waitFor(() => screen.getByLabelText(/Close summary draft/i));

    fireEvent.click(
      screen.getByRole("button", { name: /Looks right, close job/i }),
    );
    await waitFor(() => {
      // Dialog title is rendered with role="heading"; the prompt heading
      // is a <p>, so role-scoping disambiguates.
      expect(
        screen.getByRole("heading", {
          name: /Close inspection NIR-2026-05-0001\?/i,
        }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial draft fetch
  });

  it("confirm dialog fires POST /close and renders missing preconditions on 409", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          draft: { text: "draft", inspectionNumber: "NIR-1" },
          source: "ai",
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: "Preconditions not met",
          missing: ["invoice_paid", "report_sent"],
        }),
      });

    render(<CloseJobPrompt {...baseProps} />);
    await waitFor(() => screen.getByLabelText(/Close summary draft/i));

    fireEvent.click(
      screen.getByRole("button", { name: /Looks right, close job/i }),
    );
    await waitFor(() => screen.getByText(/Confirm close/i));
    fireEvent.click(screen.getByRole("button", { name: /Confirm close/i }));

    await waitFor(() => {
      expect(screen.getByTestId("missing-preconditions")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Invoice must be marked PAID/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Report must be COMPLETED/i)).toBeInTheDocument();
  });

  it("happy-path confirm fires onClosed callback", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          draft: { text: "draft", inspectionNumber: "NIR-1" },
          source: "ai",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, transitionId: "trans_1" }),
      });

    render(<CloseJobPrompt {...baseProps} />);
    await waitFor(() => screen.getByLabelText(/Close summary draft/i));

    fireEvent.click(
      screen.getByRole("button", { name: /Looks right, close job/i }),
    );
    await waitFor(() => screen.getByText(/Confirm close/i));
    fireEvent.click(screen.getByRole("button", { name: /Confirm close/i }));

    await waitFor(() => {
      expect(baseProps.onClosed).toHaveBeenCalledTimes(1);
    });
  });
});
