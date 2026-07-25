// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import {
  InspectionSidekick,
  checklistFromToolCalls,
  mergeChecklist,
} from "../InspectionSidekick";

function streamResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          read: async () =>
            i < frames.length
              ? { done: false, value: encoder.encode(frames[i++]) }
              : { done: true, value: undefined },
        };
      },
    },
  } as unknown as Response;
}

const sessionOk = {
  ok: true,
  status: 201,
  json: async () => ({ data: { sessionId: "s1" } }),
} as unknown as Response;

const GAPS_TOOL_FRAME = `data: ${JSON.stringify({
  type: "tool_call",
  id: "tc1",
  toolName: "check_report_gaps",
  ok: true,
  result: {
    gaps: [
      {
        field: "photos",
        severity: "warn",
        description: "No photos captured for this inspection",
        clauseRef: "S500:2021 §9.2.5",
      },
      {
        field: "iicrcClassification",
        severity: "block",
        description: "IICRC S500:2021 water category and class not yet determined",
        clauseRef: "S500:2021 §10.4.1",
      },
    ],
  },
})}\n\n`;

const EMPTY_GAPS_FRAME = `data: ${JSON.stringify({
  type: "tool_call",
  id: "tc2",
  toolName: "check_report_gaps",
  ok: true,
  result: { gaps: [] },
})}\n\n`;

const TOKEN_FRAME = `data: ${JSON.stringify({
  type: "token",
  content: "Two items are outstanding [S500:2021 §9.2.5].",
})}\n\n`;

const DONE_FRAME = `data: ${JSON.stringify({
  type: "done",
  utteranceId: "u1",
  clauseRefs: ["S500:2021 §9.2.5"],
  confidence: 0.9,
})}\n\n`;

function openSheet() {
  fireEvent.click(screen.getByTestId("sidekick-trigger"));
}

function ask(text: string) {
  fireEvent.change(screen.getByLabelText("Ask the Sidekick"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("InspectionSidekick", () => {
  it("opens as a sheet with quick prompts and no voice controls", () => {
    render(<InspectionSidekick inspectionId="insp1" />);
    openSheet();

    expect(screen.getByText("Inspection Sidekick")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "What's missing on this inspection?" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/voice note/iu)).not.toBeInTheDocument();
  });

  it("sends readOnlyTools: true and renders a cited, editable checklist", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sessionOk)
      .mockResolvedValueOnce(
        streamResponse([GAPS_TOOL_FRAME, TOKEN_FRAME, DONE_FRAME]),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<InspectionSidekick inspectionId="insp1" />);
    openSheet();
    fireEvent.click(
      screen.getByRole("button", { name: "What's missing on this inspection?" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Report gaps — edit before committing"),
      ).toBeInTheDocument(),
    );

    // The turn was sent in read-only tool mode — the editable-before-commit
    // guarantee depends on this flag.
    const turnCall = fetchMock.mock.calls.find(
      ([url]) => url === "/api/live-teacher/turn",
    );
    expect(turnCall).toBeTruthy();
    expect(JSON.parse((turnCall![1] as RequestInit).body as string)).toMatchObject(
      { readOnlyTools: true },
    );

    // Cited rows, editable text, blocking marker — scoped to the checklist
    // (the same citation also appears in the transcript bubble/badges).
    const checklist = screen.getByRole("region", {
      name: "Report gap checklist",
    });
    expect(within(checklist).getByText(/S500:2021 §9\.2\.5/u)).toBeInTheDocument();
    expect(
      within(checklist).getByText(/S500:2021 §10\.4\.1.*blocking/u),
    ).toBeInTheDocument();
    const photoRow = screen.getByLabelText("Edit photos") as HTMLInputElement;
    expect(photoRow.value).toMatch(/No photos captured/u);
    fireEvent.change(photoRow, { target: { value: "Capture 4 room photos" } });
    expect(
      (screen.getByLabelText("Edit photos") as HTMLInputElement).value,
    ).toBe("Capture 4 room photos");
  });

  it("copies only the included, edited rows", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sessionOk)
      .mockResolvedValueOnce(
        streamResponse([GAPS_TOOL_FRAME, TOKEN_FRAME, DONE_FRAME]),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<InspectionSidekick inspectionId="insp1" />);
    openSheet();
    fireEvent.click(
      screen.getByRole("button", { name: "What's missing on this inspection?" }),
    );
    await waitFor(() => screen.getByLabelText("Include photos"));

    fireEvent.click(screen.getByLabelText("Include photos")); // exclude photos row
    fireEvent.click(screen.getByRole("button", { name: "Copy checklist" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("water category and class");
    expect(copied).toContain("[S500:2021 §10.4.1]");
    expect(copied).not.toContain("No photos captured");
  });

  it("clears the checklist when a later run finds zero gaps, and preserves edits when rows persist", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sessionOk)
      .mockResolvedValueOnce(
        streamResponse([GAPS_TOOL_FRAME, TOKEN_FRAME, DONE_FRAME]),
      )
      // second turn: same gaps again (edits must survive)
      .mockResolvedValueOnce(
        streamResponse([GAPS_TOOL_FRAME, TOKEN_FRAME, DONE_FRAME]),
      )
      // third turn: zero gaps (checklist must clear)
      .mockResolvedValueOnce(
        streamResponse([EMPTY_GAPS_FRAME, TOKEN_FRAME, DONE_FRAME]),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<InspectionSidekick inspectionId="insp1" />);
    openSheet();
    fireEvent.click(
      screen.getByRole("button", { name: "What's missing on this inspection?" }),
    );
    await waitFor(() => screen.getByLabelText("Edit photos"));
    fireEvent.change(screen.getByLabelText("Edit photos"), {
      target: { value: "Capture 4 room photos" },
    });

    ask("check again");
    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3),
    );
    // Edited text survived the re-run (technician's edits are sacrosanct).
    expect(
      (screen.getByLabelText("Edit photos") as HTMLInputElement).value,
    ).toBe("Capture 4 room photos");

    ask("and now?");
    await waitFor(() =>
      expect(
        screen.queryByText("Report gaps — edit before committing"),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows the subscription gate on 402 upgradeRequired", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sessionOk)
      .mockResolvedValueOnce({
        ok: false,
        status: 402,
        json: async () => ({ upgradeRequired: true }),
      } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<InspectionSidekick inspectionId="insp1" />);
    openSheet();
    ask("What's missing?");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "View plans" })).toBeInTheDocument(),
    );
  });
});

describe("checklistFromToolCalls", () => {
  it("returns null when there is no successful gaps call", () => {
    expect(checklistFromToolCalls([])).toBeNull();
    expect(
      checklistFromToolCalls([
        { id: "1", toolName: "check_report_gaps", ok: false },
      ]),
    ).toBeNull();
  });

  it("returns [] (not null) for a successful zero-gap call so stale lists clear", () => {
    expect(
      checklistFromToolCalls([
        { id: "1", toolName: "check_report_gaps", ok: true, result: { gaps: [] } },
      ]),
    ).toEqual([]);
  });

  it("maps gaps to included, editable rows", () => {
    const rows = checklistFromToolCalls([
      {
        id: "1",
        toolName: "check_report_gaps",
        ok: true,
        result: {
          gaps: [
            {
              field: "photos",
              severity: "warn",
              description: "No photos",
              clauseRef: "S500:2021 §9.2.5",
            },
          ],
        },
      },
    ]);
    expect(rows).toEqual([
      {
        key: "photos",
        included: true,
        text: "No photos",
        clauseRef: "S500:2021 §9.2.5",
        severity: "warn",
      },
    ]);
  });
});

describe("mergeChecklist", () => {
  const fresh: Parameters<typeof mergeChecklist>[1] = [
    {
      key: "photos",
      included: true,
      text: "No photos",
      clauseRef: "S500:2021 §9.2.5",
      severity: "warn",
    },
  ];

  it("keeps the technician's edits and tick state for persisting keys", () => {
    const prev = [
      { ...fresh[0], included: false, text: "Capture 4 room photos" },
      {
        key: "gone",
        included: true,
        text: "Old row",
        clauseRef: null,
        severity: "warn" as const,
      },
    ];
    expect(mergeChecklist(prev, fresh)).toEqual([
      { ...fresh[0], included: false, text: "Capture 4 room photos" },
    ]);
  });

  it("clears to null on an empty fresh list", () => {
    expect(mergeChecklist([fresh[0]], [])).toBeNull();
  });
});
