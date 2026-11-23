// @vitest-environment jsdom
/**
 * Mining pilot slice 6: the training register panel. A manager sees everyone's
 * records and the add, edit and remove controls; a technician sees their own
 * with no controls; an empty register and a no-organisation account read
 * plainly; a CARSI reference is never shown as verified.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainingRegisterPanel } from "@/app/dashboard/training/TrainingRegisterPanel";

const record = {
  id: "rec_1",
  staffUserId: "tech1",
  staffName: "Tech One",
  course: "Level 3 Mould Remediation",
  provider: "CARSI",
  completedOn: "2026-10-01",
  expiresOn: "2026-12-01",
  evidenceUrl: "https://drive.example/cert.pdf",
  carsiCompletionRef: "https://carsi.com.au/certificates/ABC-123",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

function mockRegister(data: Record<string, unknown>) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const base = { records: [], staff: [], canEdit: false, truncated: false, noOrganisation: false };

beforeEach(() => vi.restoreAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TrainingRegisterPanel", () => {
  it("a manager sees every record with its staff name and the add, edit and remove controls", async () => {
    mockRegister({ ...base, canEdit: true, records: [record], staff: [{ id: "tech1", name: "Tech One" }] });
    render(<TrainingRegisterPanel today="2026-11-23" />);
    expect(await screen.findByText("Level 3 Mould Remediation")).toBeInTheDocument();
    expect(screen.getByText(/Tech One/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add training record" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.getByText("Expires within 30 days")).toBeInTheDocument();
  });

  it("the add form opens with every field, and labels the CARSI field as not checked", async () => {
    mockRegister({ ...base, canEdit: true, staff: [{ id: "tech1", name: "Tech One" }] });
    render(<TrainingRegisterPanel today="2026-11-23" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add training record" }));
    for (const label of [
      "Course",
      "Provider",
      "Completion date",
      "Expiry date (if any)",
      "Evidence link (optional)",
      "CARSI completion link or certificate id (optional)",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(/does not check it with CARSI/)).toBeInTheDocument();
  });

  it("a technician sees their own records with no add, edit or remove control", async () => {
    mockRegister({ ...base, canEdit: false, records: [record] });
    render(<TrainingRegisterPanel today="2026-11-23" />);
    expect(await screen.findByText("Level 3 Mould Remediation")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add training record" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.getByText(/Ask your manager/)).toBeInTheDocument();
  });

  it("a CARSI reference reads as entered by the business, never as verified", async () => {
    mockRegister({ ...base, records: [record] });
    render(<TrainingRegisterPanel today="2026-11-23" />);
    expect(await screen.findByText(/entered by the business, not checked with CARSI/)).toBeInTheDocument();
    expect(screen.queryByText(/verified/i)).toBeNull();
    const link = screen.getByRole("link", { name: record.carsiCompletionRef });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("a stored script link is never rendered as a link", async () => {
    mockRegister({
      ...base,
      records: [{ ...record, evidenceUrl: "javascript:alert(1)", carsiCompletionRef: "CERT-1" }],
    });
    render(<TrainingRegisterPanel today="2026-11-23" />);
    await screen.findByText("Level 3 Mould Remediation");
    expect(screen.queryByRole("link", { name: "Open evidence" })).toBeNull();
    expect(screen.queryByRole("link", { name: "CERT-1" })).toBeNull();
    expect(screen.getByText(/CERT-1/)).toBeInTheDocument();
  });

  it("an empty register renders a plain empty state", async () => {
    mockRegister({ ...base, canEdit: true });
    render(<TrainingRegisterPanel today="2026-11-23" />);
    expect(await screen.findByText("No training recorded yet.")).toBeInTheDocument();
  });

  it("an account with no organisation is told why there is nothing to show", async () => {
    mockRegister({ ...base, noOrganisation: true });
    render(<TrainingRegisterPanel today="2026-11-23" />);
    expect(await screen.findByText(/belongs to an organisation/)).toBeInTheDocument();
  });

  it("a failed load says so instead of showing an empty register", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "Internal" } }), { status: 500 })),
    );
    render(<TrainingRegisterPanel today="2026-11-23" />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("No training recorded yet.")).toBeNull();
  });
});
