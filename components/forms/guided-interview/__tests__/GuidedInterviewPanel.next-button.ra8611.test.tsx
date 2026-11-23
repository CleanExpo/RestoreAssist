// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  render,
  fireEvent,
  cleanup,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { GuidedInterviewPanel } from "@/components/forms/guided-interview/GuidedInterviewPanel";

const QUESTIONS = [
  { id: "q1", text: "Where did the water come from?", type: "text", tier: 1 },
  { id: "q2", text: "Which rooms are affected?", type: "text", tier: 1 },
];

function stubInterviewApi() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/forms/interview/start") {
      return new Response(
        JSON.stringify({
          sessionId: "s-ra8611",
          questions: QUESTIONS,
          tieredQuestions: { tier1: QUESTIONS, tier2: [], tier3: [], tier4: [] },
          totalQuestions: QUESTIONS.length,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * RA-8611. The fixed bottom bar drew a large enabled "Next" button wired to
 * `onNext={() => {}}`, so clicking it did nothing; only the card's "Continue"
 * button moved the interview on. This renders the real panel path and fails if
 * any enabled "Next" button is on screen whose click neither submits an answer
 * nor changes the question.
 */
describe("GuidedInterviewPanel bottom Next button (RA-8611)", () => {
  it("shows no enabled Next button that does nothing", async () => {
    const fetchMock = stubInterviewApi();
    render(<GuidedInterviewPanel formTemplateId="tpl-1" />);

    // Positive control: the interview really started and a question is shown.
    expect(
      await screen.findByText("Where did the water come from?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();

    const nextButtons = screen
      .queryAllByRole("button", { name: /^next$/i })
      .filter((b) => !(b as HTMLButtonElement).disabled);

    for (const button of nextButtons) {
      const callsBefore = fetchMock.mock.calls.length;
      fireEvent.click(button);
      // Give any async submit a chance to start.
      await new Promise((r) => setTimeout(r, 50));
      const submitted = fetchMock.mock.calls
        .slice(callsBefore)
        .some(([url]) => url === "/api/forms/interview/answer");
      const moved =
        screen.queryByText("Where did the water come from?") === null;
      expect(
        submitted || moved,
        "an enabled Next button was clicked and nothing happened",
      ).toBe(true);
    }
  });

  it("still advances through the card's Continue button", async () => {
    const fetchMock = stubInterviewApi();
    render(<GuidedInterviewPanel formTemplateId="tpl-1" />);
    await screen.findByText("Where did the water come from?");

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Burst supply line" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) => url === "/api/forms/interview/answer",
        ),
      ).toBe(true),
    );
    expect(
      await screen.findByText("Which rooms are affected?"),
    ).toBeInTheDocument();
  });
});
