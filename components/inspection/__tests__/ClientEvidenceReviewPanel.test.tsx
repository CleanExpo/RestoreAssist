// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientEvidenceReviewPanel } from "../ClientEvidenceReviewPanel";

beforeEach(() => vi.restoreAllMocks());

const photo = {
  id: "ces_1",
  description: "Kitchen damp",
  fileName: "a.jpg",
  fileMimeType: "image/jpeg",
  fileSizeBytes: 10,
  submittedAt: "2026-06-10T00:00:00Z",
  viewUrl: "https://signed/view",
};

function fetchWith(submissions: unknown[], promoted = submissions.length) {
  return vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (url.includes("/client-submissions")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { submissions } }),
      });
    }
    if (url.includes("/promote-client") && opts?.method === "POST") {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { promoted } }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

describe("ClientEvidenceReviewPanel", () => {
  it("lists pending client submissions for the inspection", async () => {
    vi.stubGlobal("fetch", fetchWith([photo]));
    render(<ClientEvidenceReviewPanel inspectionId="i1" />);
    await waitFor(() =>
      expect(
        screen.getByText(/Client photos awaiting your review/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByAltText("Kitchen damp")).toBeInTheDocument();
  });

  it("accepts all via promote-client, then confirms", async () => {
    const f = fetchWith([photo], 1);
    vi.stubGlobal("fetch", f);
    render(<ClientEvidenceReviewPanel inspectionId="i1" />);
    await waitFor(() => screen.getByText(/awaiting your review/i));
    fireEvent.click(
      screen.getByRole("button", { name: /Add all client photos/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Added 1 item\(s\) to the report/i),
      ).toBeInTheDocument(),
    );
    const postCall = f.mock.calls.find(
      (c) =>
        String(c[0]).includes("/promote-client") &&
        (c[1] as RequestInit)?.method === "POST",
    );
    expect(postCall).toBeTruthy();
  });

  // RA-8388 (founder ruling 16/11/2026): client photos stay uncounted at
  // submit, and the screen says so before and after they are accepted.
  it("says client photos do not count toward the technician's required photos", async () => {
    vi.stubGlobal("fetch", fetchWith([photo], 1));
    render(<ClientEvidenceReviewPanel inspectionId="i1" />);
    await waitFor(() => screen.getByText(/awaiting your review/i));
    expect(
      screen.getByText(/do not count toward the photos your technician must capture/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Add all client photos/i }),
    );
    await waitFor(() => screen.getByText(/Added 1 item\(s\) to the report/i));
    expect(
      screen.getByText(/do not count toward the photos your technician must capture/i),
    ).toBeInTheDocument();
  });

  // RA-8388 bench (frontend seat). `getByText` passes as long as the words
  // are somewhere in the DOM. These three check that a person is told.
  it("the accept button is described by the notice, so a screen reader hears it before accepting", async () => {
    vi.stubGlobal("fetch", fetchWith([photo], 1));
    render(<ClientEvidenceReviewPanel inspectionId="i1" />);
    await waitFor(() => screen.getByText(/awaiting your review/i));
    expect(
      screen.getByRole("button", {
        name: /Add all client photos/i,
        description: /do not count toward the photos your technician must capture/i,
      }),
    ).toBeInTheDocument();
  });

  it("announces the confirmation in a status region that was already mounted", async () => {
    vi.stubGlobal("fetch", fetchWith([photo], 1));
    render(<ClientEvidenceReviewPanel inspectionId="i1" />);
    await waitFor(() => screen.getByText(/awaiting your review/i));
    // Mounted and empty before the accept: a region inserted with its text
    // already in it is often not announced.
    const before = screen.getByRole("status");
    expect(before).toBeEmptyDOMElement();

    fireEvent.click(
      screen.getByRole("button", { name: /Add all client photos/i }),
    );
    await waitFor(() => screen.getByText(/Added 1 item\(s\) to the report/i));
    const after = screen.getByRole("status");
    expect(after).toBe(before);
    expect(after).toHaveTextContent(/Added 1 item\(s\) to the report/i);
    expect(after).toHaveTextContent(/do not count toward the photos/i);
  });

  it("does not show the not-counted note when nothing was added", async () => {
    // Another staff member had already accepted the batch.
    vi.stubGlobal("fetch", fetchWith([photo], 0));
    render(<ClientEvidenceReviewPanel inspectionId="i1" />);
    await waitFor(() => screen.getByText(/awaiting your review/i));
    fireEvent.click(
      screen.getByRole("button", { name: /Add all client photos/i }),
    );
    await waitFor(() => screen.getByText(/Added 0 item\(s\) to the report/i));
    expect(
      screen.queryByText(/do not count toward the photos your technician must capture/i),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when there is nothing to review", async () => {
    vi.stubGlobal("fetch", fetchWith([]));
    const { container } = render(
      <ClientEvidenceReviewPanel inspectionId="i1" />,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
