// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * The walkthrough screen against the real fire actions, status and router,
 * run in memory behind a fake fetch. Only the browser's speech engines and
 * the network are faked. Synthetic job data only.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { FireWalkthrough, FIRE_TOGGLE_SIZE_PX } from "../_fire/FireWalkthrough";
import { runFireAction, nextStep, type FireActionDb } from "@/lib/voice/fire-smoke/actions";
import { loadFireWalkthrough } from "@/lib/voice/fire-smoke/server";
import { FIRE_SECTION_IDS, getFireSection } from "@/lib/voice/fire-smoke/checklist";
import { FIRE_COPY } from "@/lib/voice/fire-smoke/copy";
import { fireActionSchema, type FireWalkthroughResponse } from "@/lib/voice/fire-smoke/schema";

// ── in-memory server ──────────────────────────────────────────────────────
type Row = {
  id: string;
  sessionId: string;
  type: string;
  parsed: unknown;
  rawTranscript: string;
  createdAt: Date;
  session: { userId: string };
};
let rows: Row[] = [];
let clock = 0;
const db: FireActionDb = {
  voiceCopilotObservation: {
    findMany: (async () => [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) as never,
    create: async ({ data }: { data: Omit<Row, "createdAt" | "session"> }) => {
      clock += 1000;
      // Every session in this fake belongs to the signed-in technician.
      const row = { ...data, session: { userId: "tech-1" }, createdAt: new Date(Date.parse("2026-11-11T09:00:00Z") + clock) };
      rows.push(row);
      return row;
    },
  } as never,
  auditLog: { create: async (args: unknown) => args },
} as unknown as FireActionDb;

type Call = { action: string; body: Record<string, unknown>; key: string | null };
let calls: Call[] = [];
let failNextPost = false;
let refuseNextPost = false;

async function snapshot(): Promise<FireWalkthroughResponse> {
  const loaded = await loadFireWalkthrough("insp-1", db, "tech-1");
  return { applicable: true, status: loaded.status, ...nextStep(loaded.status) };
}

const fakeFetch = vi.fn(async (input: string, init?: RequestInit) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (input.endsWith("/voice/session")) return json({ session: { sessionId: "vs-1" } });
  if (init?.method !== "POST") return json(await snapshot());
  const body = JSON.parse(String(init.body));
  const key = new Headers(init.headers).get("Idempotency-Key");
  calls.push({ action: body.action, body, key });
  if (failNextPost) {
    failNextPost = false;
    throw new TypeError("Failed to fetch");
  }
  if (refuseNextPost) {
    refuseNextPost = false;
    return json({ error: "Save refused" }, 422);
  }
  const result = await runFireAction(db, { inspectionId: "insp-1", userId: "tech-1" }, fireActionSchema.parse(body));
  if (!result.ok) return json(result.body, result.httpStatus);
  const after = await snapshot();
  return json({ ...after, outcome: result.outcome });
});

// ── fake speech ───────────────────────────────────────────────────────────
class FakeUtterance {
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  lang = "";
  rate = 1;
  ended = false;
  constructor(public text: string) {}
  /** Margot finishes speaking: the engine stops, then fires onend. */
  end() {
    this.ended = true;
    this.onend?.();
  }
}
const spoken: FakeUtterance[] = [];
const fakeSynth = {
  speak: (u: FakeUtterance) => spoken.push(u),
  /** Like a browser: cancelling stops every queued utterance and fires its onerror. */
  cancel: () => {
    for (const u of spoken) {
      if (!u.ended) {
        u.ended = true;
        u.onerror?.();
      }
    }
  },
  get speaking() {
    return spoken.some((u) => !u.ended);
  },
  pending: false,
};

class FakeRecognition {
  static live: FakeRecognition[] = [];
  /** Every start, including ones stopped again, so an early start is caught. */
  static starts = 0;
  continuous = true;
  interimResults = true;
  lang = "";
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  start() {
    FakeRecognition.starts += 1;
    FakeRecognition.live.push(this);
    this.onstart?.();
  }
  stop() {
    FakeRecognition.live = FakeRecognition.live.filter((r) => r !== this);
    this.onend?.();
  }
  hear(text: string) {
    const result = Object.assign([{ transcript: text }], { isFinal: true });
    this.onresult?.({ results: [result] });
  }
}

const lastUtterance = () => spoken[spoken.length - 1];
const fireCalls = () => calls.map((c) => c.action);

beforeEach(() => {
  rows = [];
  clock = 0;
  calls = [];
  failNextPost = false;
  refuseNextPost = false;
  spoken.length = 0;
  FakeRecognition.live = [];
  FakeRecognition.starts = 0;
  vi.stubGlobal("fetch", fakeFetch);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("speechSynthesis", fakeSynth);
  vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderScreen() {
  const initial = await snapshot();
  render(<FireWalkthrough inspectionId="insp-1" initial={initial} />);
  await waitFor(() => expect(screen.getByRole("button", { name: FIRE_COPY.noticeAccept })).toBeEnabled());
}

async function acknowledgeAndFinishSpeaking() {
  fireEvent.click(screen.getByRole("button", { name: FIRE_COPY.noticeAccept }));
  await waitFor(() => expect(fireCalls()).toContain("acknowledge_notice"));
  await waitFor(() => expect(lastUtterance()?.text).toBe(getFireSection("site_access")!.intro));
  act(() => lastUtterance().end());
  await waitFor(() => expect(FakeRecognition.live).toHaveLength(1));
}

async function typeAnswer(text: string) {
  const box = screen.getByRole("textbox", { name: FIRE_COPY.typedPlaceholder });
  fireEvent.change(box, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: FIRE_COPY.typedSubmit }));
}

describe("notice comes first", () => {
  it("shows the notice and the typing box, with no toggle and nothing recorded", async () => {
    await renderScreen();
    expect(screen.getByText(FIRE_COPY.notice)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: FIRE_COPY.typedPlaceholder })).toBeDisabled();
    expect(screen.queryByTestId("fire-listen-toggle")).toBeNull();
    expect(calls).toHaveLength(0);
    expect(FakeRecognition.starts).toBe(0);
  });

  it("records the notice before anything else, and listens only after Margot finishes speaking", async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole("button", { name: FIRE_COPY.noticeAccept }));
    await waitFor(() => expect(lastUtterance()?.text).toBe(getFireSection("site_access")!.intro));
    expect(fireCalls()).toEqual(["acknowledge_notice"]);
    expect(rows.map((r) => r.type)).toEqual(["fire_notice_acknowledged"]);
    await new Promise((r) => setTimeout(r, 400));
    expect(FakeRecognition.starts).toBe(0);

    act(() => lastUtterance().end());
    await waitFor(() => expect(FakeRecognition.live).toHaveLength(1));
    expect(screen.getByTestId("fire-listen-state")).toHaveTextContent(FIRE_COPY.listening);
    expect(screen.getByRole("textbox", { name: FIRE_COPY.typedPlaceholder })).toBeEnabled();
  });
});

describe("notice belongs to the technician", () => {
  it("shows the notice to a second technician even after another acknowledged it", async () => {
    rows.push({
      id: "obs-other",
      sessionId: "vs-other",
      type: "fire_notice_acknowledged",
      parsed: { checklistVersion: 1, noticeVersion: "fire-voice-notice-v1", spoken: true, recognitionMode: "cloud" },
      rawTranscript: "",
      createdAt: new Date("2026-11-11T08:00:00Z"),
      session: { userId: "tech-2" },
    });
    await renderScreen();
    expect(screen.getByText(FIRE_COPY.notice)).toBeInTheDocument();
    expect(screen.queryByTestId("fire-listen-toggle")).toBeNull();
    expect(FakeRecognition.starts).toBe(0);
  });
});

describe("glove toggle", () => {
  it("is at least 120 px and shows what recognition reports", async () => {
    await renderScreen();
    await acknowledgeAndFinishSpeaking();
    const toggle = screen.getByTestId("fire-listen-toggle");
    expect(FIRE_TOGGLE_SIZE_PX).toBeGreaterThanOrEqual(120);
    expect(parseInt(toggle.style.width, 10)).toBeGreaterThanOrEqual(120);
    expect(parseInt(toggle.style.height, 10)).toBeGreaterThanOrEqual(120);

    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByTestId("fire-listen-state")).toHaveTextContent(FIRE_COPY.paused));
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(FakeRecognition.live).toHaveLength(0);
  });

  it("drops Margot's own prompt when the mic hears it", async () => {
    await renderScreen();
    await acknowledgeAndFinishSpeaking();
    act(() => FakeRecognition.live[0].hear(getFireSection("site_access")!.intro));
    await new Promise((r) => setTimeout(r, 50));
    expect(fireCalls()).toEqual(["acknowledge_notice"]);
  });
});

describe("filing answers", () => {
  it("files a clear spoken answer to its section", async () => {
    await renderScreen();
    await acknowledgeAndFinishSpeaking();
    act(() => FakeRecognition.live[0].hear("Power isolated at the switchboard and the gas meter is off"));
    await waitFor(() => expect(fireCalls()).toContain("capture"));
    await waitFor(() => expect(rows.some((r) => r.type === "fire_section_entry")).toBe(true));
    expect(rows.find((r) => r.type === "fire_section_entry")!.parsed).toMatchObject({ sectionId: "services" });
  });

  it("asks when unsure, and Yes files to the asked section", async () => {
    await renderScreen();
    await acknowledgeAndFinishSpeaking();
    await typeAnswer("All good here");
    await waitFor(() => expect(screen.getByRole("group", { name: "Margot's question" })).toBeInTheDocument());
    expect(screen.getByTestId("margot-says")).toHaveTextContent("Is this part of the arrival and site access?");
    expect(rows.filter((r) => r.type === "fire_section_entry")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(rows.filter((r) => r.type === "fire_section_entry")).toHaveLength(1));
    expect(calls.at(-1)!.body).toMatchObject({ action: "file", sectionId: "site_access", routedBy: "technician_confirmed", transcript: "All good here" });
  });

  it("No lets the technician choose the section", async () => {
    await renderScreen();
    await acknowledgeAndFinishSpeaking();
    await typeAnswer("All good here");
    await waitFor(() => screen.getByRole("button", { name: "No" }));
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    const picker = await screen.findByRole("group", { name: "Choose a section" });
    fireEvent.click(Array.from(picker.querySelectorAll("button")).find((b) => b.textContent === "Safety brief and PPE")!);
    await waitFor(() => expect(rows.filter((r) => r.type === "fire_section_entry")).toHaveLength(1));
    expect(calls.at(-1)!.body).toMatchObject({ action: "file", sectionId: "safety_brief", routedBy: "technician_chose" });
  });

  it("asks before a spoken N/A closes a section, and No keeps the words as an entry", async () => {
    await renderScreen();
    await acknowledgeAndFinishSpeaking();
    await typeAnswer("Not applicable, but the electrical wiring is live and damaged");
    await waitFor(() => expect(screen.getByRole("group", { name: "Margot's question" })).toBeInTheDocument());
    expect(screen.getByTestId("margot-says")).toHaveTextContent("as not applicable? Say yes or no.");
    expect(rows.filter((r) => r.type === "fire_section_na")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "No" }));
    await waitFor(() => expect(rows.filter((r) => r.type === "fire_section_entry")).toHaveLength(1));
    expect(rows.filter((r) => r.type === "fire_section_na")).toHaveLength(0);
    expect(calls.at(-1)!.body).toMatchObject({
      action: "file",
      sectionId: "site_access",
      routedBy: "technician_chose",
      transcript: "Not applicable, but the electrical wiring is live and damaged",
    });
  });

  it("Yes to the N/A question closes the section with the spoken reason", async () => {
    await renderScreen();
    await acknowledgeAndFinishSpeaking();
    await typeAnswer("Not applicable, nobody else is on site");
    await waitFor(() => screen.getByRole("button", { name: "Yes" }));
    expect(rows.filter((r) => r.type === "fire_section_na")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(rows.filter((r) => r.type === "fire_section_na")).toHaveLength(1));
    expect(calls.at(-1)!.body).toMatchObject({ action: "mark_na", sectionId: "site_access", reason: "Not applicable, nobody else is on site" });
  });

  it("a refused spoken save keeps the words in the typing box", async () => {
    await renderScreen();
    await acknowledgeAndFinishSpeaking();
    refuseNextPost = true;
    act(() => FakeRecognition.live[0].hear("Power isolated but the wiring is damaged"));
    await waitFor(() => expect(fireCalls()).toContain("capture"));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: FIRE_COPY.typedPlaceholder })).toHaveValue("Power isolated but the wiring is damaged"),
    );
    expect(rows.filter((r) => r.type === "fire_section_entry")).toHaveLength(0);
  });

  it("a failed save keeps the words, says so, and retries with the same key", async () => {
    await renderScreen();
    await acknowledgeAndFinishSpeaking();
    failNextPost = true;
    await typeAnswer("Gas meter is off and power isolated at the board");
    await waitFor(() => expect(screen.getByTestId("margot-says")).toHaveTextContent(FIRE_COPY.saveFailed));
    expect(FIRE_COPY.saveFailed).not.toBe(FIRE_COPY.notHeard);
    expect(screen.getByRole("textbox", { name: FIRE_COPY.typedPlaceholder })).toHaveValue("Gas meter is off and power isolated at the board");
    expect(rows.filter((r) => r.type === "fire_section_entry")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: FIRE_COPY.typedSubmit }));
    await waitFor(() => expect(rows.filter((r) => r.type === "fire_section_entry")).toHaveLength(1));
    const captures = calls.filter((c) => c.action === "capture");
    expect(captures).toHaveLength(2);
    expect(captures[0].key).toBeTruthy();
    expect(captures[1].key).toBe(captures[0].key);
  });
});

describe("sign-off", () => {
  it("appears once every section is closed and needs the declaration and a name", async () => {
    await runFireAction(db, { inspectionId: "insp-1", userId: "tech-1" }, { action: "acknowledge_notice", sessionId: "vs-1", spoken: false, recognitionMode: "typed" });
    for (const sectionId of FIRE_SECTION_IDS) {
      await runFireAction(db, { inspectionId: "insp-1", userId: "tech-1" }, { action: "file", sessionId: "vs-1", sectionId, transcript: `Synthetic note for ${sectionId}`, routedBy: "technician_chose" });
    }
    const initial = await snapshot();
    render(<FireWalkthrough inspectionId="insp-1" initial={initial} />);
    const button = await screen.findByRole("button", { name: FIRE_COPY.signoffButton });
    // The technician can read every saved answer before signing.
    for (const sectionId of FIRE_SECTION_IDS) {
      expect(screen.getByText(`Synthetic note for ${sectionId}`)).toBeInTheDocument();
    }
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: FIRE_COPY.signoffNamePlaceholder }), { target: { value: "Sam Example" } });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(rows.some((r) => r.type === "fire_walkthrough_signoff")).toBe(true));
    expect(await screen.findByText(FIRE_COPY.signedOff, { selector: "section p" })).toBeInTheDocument();
  });

  it("is not offered while sections are open", async () => {
    await renderScreen();
    await acknowledgeAndFinishSpeaking();
    expect(screen.queryByRole("button", { name: FIRE_COPY.signoffButton })).toBeNull();
  });
});
