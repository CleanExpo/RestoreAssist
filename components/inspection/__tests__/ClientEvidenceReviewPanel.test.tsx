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

  it("renders nothing when there is nothing to review", async () => {
    vi.stubGlobal("fetch", fetchWith([]));
    const { container } = render(
      <ClientEvidenceReviewPanel inspectionId="i1" />,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
