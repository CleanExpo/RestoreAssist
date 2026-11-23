// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { Suspense } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RA-8619: corrections on the AI contents screen are saved to the server, a
// refused save is shown as not saved, and Regenerate asks before replacing.

// Stable like the real router: the page's load effect depends on it.
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));
vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const storedDraft = {
  inspectionId: "insp-1",
  generatedAt: "2026-11-01T00:00:00.000Z",
  model: "claude-sonnet-4-6",
  provider: "byok",
  imageCount: 2,
  items: [
    {
      id: "a",
      category: "furniture",
      description: "Sofa",
      count: 1,
      condition: "poor",
      restorableStatus: "replace",
      estimatedValue: 1200,
      confidence: 82,
      roomLocation: "Lounge",
      flagForReview: true,
    },
  ],
  lowConfidenceCount: 0,
  flaggedForReviewCount: 1,
  disclaimer: "AI-assisted",
};

type Call = { url: string; method: string; body?: string };
let calls: Call[];
let patchOk: boolean;

function json(status: number, body: unknown) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  calls = [];
  patchOk = true;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body as string | undefined });
      if (url === "/api/inspections/insp-1" && method === "GET") {
        return json(200, {
          inspection: {
            inspectionNumber: "INS-1",
            propertyAddress: "1 Test St",
            status: "DRAFT",
          },
        });
      }
      if (url === "/api/inspections/insp-1/contents-manifest" && method === "GET") {
        return json(200, { data: storedDraft });
      }
      if (url === "/api/inspections/insp-1/contents-manifest" && method === "PATCH") {
        if (!patchOk) {
          return json(500, { error: { code: "INTERNAL", message: "Database unavailable" } });
        }
        const items = JSON.parse(init!.body as string).items;
        return json(200, { data: { ...storedDraft, items } });
      }
      return json(500, {});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

import ContentsManifestPage from "../page";

async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <ContentsManifestPage params={Promise.resolve({ id: "insp-1" })} />
      </Suspense>,
    );
  });
  return screen.findByText("Sofa");
}

async function editValueAndSave(value: string) {
  fireEvent.click(screen.getByRole("button", { name: "Edit Sofa" }));
  fireEvent.change(screen.getByLabelText("Estimated value"), {
    target: { value },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  });
}

describe("AI contents screen (RA-8619)", () => {
  it("saves an edit through the shared PATCH route and shows the row as verified", async () => {
    await renderPage();
    await editValueAndSave("850");

    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toBe("/api/inspections/insp-1/contents-manifest");
    const sent = JSON.parse(patches[0].body!).items[0];
    expect(sent).toMatchObject({
      id: "a",
      estimatedValue: 850,
      technicianVerified: true,
      condition: "poor",
    });

    const row = screen.getByText("Sofa").closest("tr")!;
    await waitFor(() =>
      expect(within(row).getByLabelText("Saved and verified")).toBeInTheDocument(),
    );
    expect(within(row).queryByText(/Not saved/)).not.toBeInTheDocument();
  });

  it("keeps the edit on screen and says it is not saved when the server refuses", async () => {
    patchOk = false;
    await renderPage();
    await editValueAndSave("850");

    const row = screen.getByText("Sofa").closest("tr")!;
    expect(await within(row).findByText(/Not saved/)).toBeInTheDocument();
    expect(within(row).getAllByText(/850\.00/).length).toBeGreaterThan(0);
    expect(within(row).queryByLabelText("Saved and verified")).not.toBeInTheDocument();
  });

  it("asks before Regenerate replaces a saved list, and Cancel makes no AI call", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await renderPage();
    const before = calls.length;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Regenerate/ }));
    });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toMatch(/replace/i);
    expect(calls.slice(before)).toEqual([]);
  });
});
