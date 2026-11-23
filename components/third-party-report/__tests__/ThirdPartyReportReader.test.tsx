// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThirdPartyReportReader, { readErrorMessage } from "../ThirdPartyReportReader";

const proposal = {
  proposalToken: "signed.token-value-123456",
  fileName: "lab.pdf",
  sha256: "a".repeat(64),
  document: { title: "Lab", author: "Acme", reportDate: "2026-09-12" },
  facts: [
    { field: "labName", value: "Acme", pageRef: 1, quote: "Acme Lab", status: "agrees", jobValue: "Acme" },
    { field: "sporeCountPreRemediation", value: 5000, pageRef: 4, quote: "5000 spores/m3", status: "conflicts", jobValue: "4000" },
    { field: "sporeType", value: "Aspergillus", pageRef: 3, quote: "Aspergillus", status: "new", jobValue: null },
    { field: "sporeCountPreRemediation", value: 7000, pageRef: 5, quote: "7000 spores/m3", status: "conflicts", jobValue: "4000" },
  ],
  gaps: [{ code: "NO_OUTDOOR_BASELINE", message: "No outdoor baseline." }],
  rejectedCount: 2,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fetchMock = vi.fn();

async function upload() {
  const input = screen.getByLabelText("Laboratory report PDF") as HTMLInputElement;
  const file = new File(["%PDF-1.4"], "lab.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ThirdPartyReportReader", () => {
  it("shows each fact with its page, label and quote, plus gaps and withheld count", async () => {
    fetchMock.mockResolvedValueOnce(json({ proposal }));
    render(<ThirdPartyReportReader inspectionId="insp_1" />);
    await upload();
    await waitFor(() => expect(screen.getAllByTestId("third-party-report-fact")).toHaveLength(4));
    expect(screen.getByText("Page 4 of lab.pdf")).toBeInTheDocument();
    expect(screen.getByText("Agrees with the job")).toBeInTheDocument();
    expect(screen.getAllByText("Conflicts with the job")).toHaveLength(2);
    expect(screen.getByText("New to the job")).toBeInTheDocument();
    expect(screen.getAllByText(/The job currently has: 4000/)).toHaveLength(2);
    expect(screen.getByText(/No outdoor baseline/)).toBeInTheDocument();
    expect(screen.getByText(/2 item\(s\) in the read were withheld/)).toBeInTheDocument();
    // only the extract call so far; nothing saved
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toContain("/third-party-reports/extract");
  });

  it("cannot save until a fact is accepted", async () => {
    fetchMock.mockResolvedValueOnce(json({ proposal }));
    render(<ThirdPartyReportReader inspectionId="insp_1" />);
    await upload();
    const save = await screen.findByRole("button", { name: /Save 0 accepted/ });
    expect(save).toBeDisabled();
  });

  it("posts only accepted and edited facts, plus the dismissed one, and reports the applied values", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ proposal }))
      .mockResolvedValueOnce(json({ written: 2, dismissed: 1, applied: { labName: "Acme", sporeCountPreRemediation: 5200 }, lab: { labName: "Acme", sporeCountPreRemediation: 5200 } }));
    const onApplied = vi.fn();
    const onBusyChange = vi.fn();
    render(<ThirdPartyReportReader inspectionId="insp_1" onApplied={onApplied} onBusyChange={onBusyChange} />);
    await upload();
    const facts = await screen.findAllByTestId("third-party-report-fact");
    const btn = (i: number, name: string) =>
      facts[i]!.querySelector(`button[aria-pressed]`) && Array.from(facts[i]!.querySelectorAll("button")).find((b) => b.textContent === name)!;
    fireEvent.click(btn(0, "Accept") as HTMLElement);
    fireEvent.click(btn(1, "Edit") as HTMLElement);
    fireEvent.change(screen.getByLabelText("Edit Spore count (before remediation)"), { target: { value: "5200" } });
    fireEvent.click(btn(2, "Dismiss") as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: /Save 2 accepted/ }));

    await waitFor(() => expect(screen.getByTestId("third-party-report-done")).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toContain("/third-party-reports/confirm");
    const body = JSON.parse(init.body);
    // the screen sends the signed token and positions, never the facts or hash
    expect(body.proposalToken).toBe(proposal.proposalToken);
    expect(body.sha256).toBeUndefined();
    expect(body.decisions).toEqual([
      { index: 0, action: "accept" },
      { index: 1, action: "edit", value: "5200" },
      { index: 2, action: "dismiss" },
    ]);
    // the host gets the values the server wrote, typed as stored
    expect(onApplied).toHaveBeenCalledWith({ labName: "Acme", sporeCountPreRemediation: 5200 }, { labName: "Acme", sporeCountPreRemediation: 5200 });
    expect(onBusyChange.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });

  it("choosing a second sample for the same field clears the first choice", async () => {
    fetchMock.mockResolvedValueOnce(json({ proposal }));
    render(<ThirdPartyReportReader inspectionId="insp_1" />);
    await upload();
    const facts = await screen.findAllByTestId("third-party-report-fact");
    const accept = (i: number) =>
      fireEvent.click(Array.from(facts[i]!.querySelectorAll("button")).find((b) => b.textContent === "Accept")!);
    accept(1);
    expect(screen.getByRole("button", { name: /Save 1 accepted/ })).toBeEnabled();
    accept(3);
    expect(screen.getByRole("button", { name: /Save 1 accepted/ })).toBeEnabled();
    const pressed = (i: number) =>
      Array.from(facts[i]!.querySelectorAll("button")).find((b) => b.textContent === "Accept")!.getAttribute("aria-pressed");
    expect(pressed(1)).toBe("false");
    expect(pressed(3)).toBe("true");
  });

  it("an undecided fact is not sent at all", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ proposal }))
      .mockResolvedValueOnce(json({ written: 1, dismissed: 0, applied: { labName: "Acme" } }));
    render(<ThirdPartyReportReader inspectionId="insp_1" />);
    await upload();
    const facts = await screen.findAllByTestId("third-party-report-fact");
    fireEvent.click(Array.from(facts[0]!.querySelectorAll("button")).find((b) => b.textContent === "Accept")!);
    fireEvent.click(screen.getByRole("button", { name: /Save 1 accepted/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).decisions).toHaveLength(1);
  });

  it("Cancel saves nothing and makes no confirm call", async () => {
    fetchMock.mockResolvedValueOnce(json({ proposal }));
    render(<ThirdPartyReportReader inspectionId="insp_1" />);
    await upload();
    fireEvent.click(await screen.findByRole("button", { name: /Cancel, save nothing/ }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Laboratory report PDF")).toBeInTheDocument();
  });

  it.each([
    [504, /took too long/],
    [502, /could not be read reliably/],
    [503, /busy/],
    [402, /not available for this workspace/],
  ])("a failed read (%i) shows a plain message, says nothing was saved and allows a retry", async (status, text) => {
    fetchMock.mockResolvedValueOnce(json({ error: "X" }, status));
    render(<ThirdPartyReportReader inspectionId="insp_1" />);
    await upload();
    const alert = await screen.findByTestId("third-party-report-error");
    expect(alert).toHaveTextContent(text);
    expect(screen.getByLabelText("Laboratory report PDF")).toBeEnabled();
  });

  it("a network failure shows the generic message", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    render(<ThirdPartyReportReader inspectionId="insp_1" />);
    await upload();
    expect(await screen.findByTestId("third-party-report-error")).toHaveTextContent(/Nothing was saved/);
  });

  it("shows an empty state when the report holds no results", async () => {
    fetchMock.mockResolvedValueOnce(json({ proposal: { ...proposal, facts: [], rejectedCount: 0 } }));
    render(<ThirdPartyReportReader inspectionId="insp_1" />);
    await upload();
    expect(await screen.findByTestId("third-party-report-empty")).toBeInTheDocument();
  });

  it("keeps the review open with an error when saving fails", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ proposal }))
      .mockResolvedValueOnce(json({ error: { code: "VALIDATION", message: "Choose one value for Spore count (before remediation). The report gives more than one." } }, 400));
    render(<ThirdPartyReportReader inspectionId="insp_1" />);
    await upload();
    const facts = await screen.findAllByTestId("third-party-report-fact");
    fireEvent.click(Array.from(facts[0]!.querySelectorAll("button")).find((b) => b.textContent === "Accept")!);
    fireEvent.click(screen.getByRole("button", { name: /Save 1 accepted/ }));
    expect(await screen.findByTestId("third-party-report-error")).toHaveTextContent(/Choose one value.*Nothing was saved/);
    expect(screen.getAllByTestId("third-party-report-fact")).toHaveLength(4);
  });

  it("readErrorMessage never exposes server text", () => {
    expect(readErrorMessage(500)).not.toMatch(/stack|prisma|sql/i);
  });
});
