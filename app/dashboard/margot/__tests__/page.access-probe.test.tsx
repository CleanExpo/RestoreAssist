// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/margot/access answers 403 to anyone who is not platform staff.
// Nothing on the dashboard may reach Margot until that probe confirms access:
// a refusal, an unreachable probe and a still-pending probe all keep chat
// closed — textarea, starter prompts and ?q= deep links alike. The
// allowlisted operator is the positive control for every path.

const sendMessage = vi.fn();
let searchParams = new URLSearchParams();
let chatMessages: unknown[] = [];

// An assistant turn waiting on the operator to confirm a Linear write. Its
// Confirm / Cancel buttons are not disabled by the lock, so send()'s own
// access check is the only thing between them and Margot.
const PENDING_LINEAR_WRITE = [
  {
    id: "m1",
    role: "assistant",
    parts: [
      {
        type: "tool-linear_create_issue",
        toolCallId: "t1",
        state: "output-available",
        input: { title: "Probe issue" },
        output: {
          requiresConfirmation: true,
          action: "linear_create_issue",
          pending: { title: "Probe issue" },
        },
      },
    ],
  },
];

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: chatMessages,
    sendMessage,
    setMessages: vi.fn(),
    status: "ready",
    error: undefined,
  }),
}));
vi.mock("@/components/margot/SocialRelevanceTester", () => ({
  SocialRelevanceTester: () => <div data-testid="social-tester" />,
}));

import MargotDashboardPage from "../page";

const LOCKED = "Margot chat is locked for this account.";
const fetchMock = vi.fn();

function probeAnswers(response: Promise<Response>) {
  fetchMock.mockImplementation((url: string) =>
    url === "/api/margot/access"
      ? response
      : Promise.reject(new Error(`unexpected fetch ${url}`)),
  );
}

const refused = () =>
  Promise.resolve(
    new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  );
const operator = () =>
  Promise.resolve(
    new Response(
      JSON.stringify({ allowed: true, userId: "staff", role: "ADMIN" }),
      { status: 200 },
    ),
  );

function textarea() {
  return screen.getByPlaceholderText(/Message Margot/);
}

function socialTester() {
  return screen.queryByTestId("social-tester");
}

async function clickConfirmOnPendingLinearWrite() {
  fireEvent.click(screen.getByText("linear_create_issue"));
  fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
}

function briefingStarter() {
  return screen.getByRole("button", { name: /briefing/i });
}

async function settle() {
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  sendMessage.mockReset();
  searchParams = new URLSearchParams();
  chatMessages = [];
  vi.stubGlobal("fetch", fetchMock);
  // jsdom has no ResizeObserver; the conversation scroll container needs one.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Margot dashboard access probe", () => {
  it("locks chat when the probe refuses with 403", async () => {
    probeAnswers(refused());
    render(<MargotDashboardPage />);
    expect(await screen.findByText(LOCKED)).toBeInTheDocument();
    expect(textarea()).toBeDisabled();
    expect(socialTester()).not.toBeInTheDocument();
  });

  it("locks chat when the probe cannot be reached", async () => {
    probeAnswers(Promise.reject(new TypeError("network down")));
    render(<MargotDashboardPage />);
    expect(await screen.findByText(LOCKED)).toBeInTheDocument();
    expect(textarea()).toBeDisabled();
    expect(socialTester()).not.toBeInTheDocument();
  });

  it("keeps chat closed while the probe is still pending", async () => {
    probeAnswers(new Promise<Response>(() => {}));
    searchParams = new URLSearchParams("q=pending deep link");
    render(<MargotDashboardPage />);
    await settle();
    expect(textarea()).toBeDisabled();
    expect(briefingStarter()).toBeDisabled();
    expect(socialTester()).not.toBeInTheDocument();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("does not send a starter prompt after a 403", async () => {
    probeAnswers(refused());
    render(<MargotDashboardPage />);
    await screen.findByText(LOCKED);
    expect(briefingStarter()).toBeDisabled();
    fireEvent.click(briefingStarter());
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("does not send a ?q= deep link after a 403", async () => {
    probeAnswers(refused());
    searchParams = new URLSearchParams("q=denied deep link");
    render(<MargotDashboardPage />);
    await screen.findByText(LOCKED);
    await settle();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("leaves chat open for the allowlisted operator", async () => {
    probeAnswers(operator());
    render(<MargotDashboardPage />);
    await settle();
    expect(screen.queryByText(LOCKED)).not.toBeInTheDocument();
    expect(textarea()).not.toBeDisabled();
    expect(socialTester()).toBeInTheDocument();
    fireEvent.click(briefingStarter());
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("does not send a Linear confirmation after a 403", async () => {
    chatMessages = PENDING_LINEAR_WRITE;
    probeAnswers(refused());
    render(<MargotDashboardPage />);
    await screen.findByText(LOCKED);
    await clickConfirmOnPendingLinearWrite();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("sends the operator's Linear confirmation", async () => {
    chatMessages = PENDING_LINEAR_WRITE;
    probeAnswers(operator());
    render(<MargotDashboardPage />);
    await settle();
    await clickConfirmOnPendingLinearWrite();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("sends the operator's ?q= deep link once access is confirmed", async () => {
    probeAnswers(operator());
    searchParams = new URLSearchParams("q=operator deep link");
    render(<MargotDashboardPage />);
    await settle();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({ text: "operator deep link" });
  });
});
