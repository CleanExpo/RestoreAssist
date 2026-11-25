// @vitest-environment jsdom
/**
 * RA-7877 round 5 — the offline form belongs to the account it was opened for.
 *  - what one account typed is never shown to, or saved under, another account
 *  - nothing is rendered before the page has hydrated, so there is no native
 *    (no-script) submit to lose or leak a claim
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { installFakeIndexedDB } from "@/lib/__tests__/helpers/fake-indexeddb";

const A = { userId: "user-a", organizationId: "org-a", workspaceId: "ws-a", workspaceOwnerId: "user-a" };
const B = { userId: "user-b", organizationId: "org-b", workspaceId: "ws-b", workspaceOwnerId: "user-b" };

let uninstall: () => void;
let serverOwner: typeof A | null;
const fetchMock = vi.fn();
type Boundary = typeof import("@/lib/offline/account-boundary");
type Queue = typeof import("@/lib/offline/claim-capture-queue");
let boundary: Boundary;
let queue: Queue;

beforeEach(async () => {
  vi.resetModules();
  vi.doMock("@/lib/evidence-upload-queue", () => ({ queueEvidenceUpload: vi.fn(), getQueuedEvidenceForInspection: async () => [] }));
  uninstall = installFakeIndexedDB();
  serverOwner = A;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/auth/offline-context") {
      return new Response(JSON.stringify({ owner: serverOwner }), { status: serverOwner ? 200 : 401 });
    }
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: vi.fn(async (_n, _o, work) => work()) },
  });
  boundary = await import("@/lib/offline/account-boundary");
  queue = await import("@/lib/offline/claim-capture-queue");
});

afterEach(() => {
  cleanup();
  uninstall();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function signIn(owner: typeof A) {
  serverOwner = owner;
  boundary.setOfflineSession(owner.userId);
  expect(await boundary.refreshOfflineOwner()).toEqual(owner);
  await new Promise((r) => setTimeout(r, 0));
}

async function openForm() {
  const { OfflineCapture } = await import("@/app/offline/OfflineCapture");
  render(<OfflineCapture />);
  return screen.findByTestId("offline-capture");
}

describe("the offline capture form", () => {
  it("renders no form on the server, so a native submit before hydration cannot exist", async () => {
    const { OfflineCapture } = await import("@/app/offline/OfflineCapture");
    const html = renderToString(<OfflineCapture />);
    expect(html).not.toContain("<form");
  });

  it("clears what one account typed when another account becomes the signed-in account", async () => {
    await signIn(A);
    await openForm();
    const address = screen.getByLabelText(/property address/i) as HTMLInputElement;
    fireEvent.change(address, { target: { value: "1 A Street, A's private address" } });
    expect(address.value).toContain("A's private");

    await act(async () => {
      boundary.endOfflineSession();
      serverOwner = B;
      boundary.setOfflineSession(B.userId);
      await boundary.refreshOfflineOwner();
    });

    await waitFor(() => {
      const now = screen.getByLabelText(/property address/i) as HTMLInputElement;
      expect(now.value).toBe("");
    });
    expect(document.body.textContent).not.toContain("A's private");
  });

  it("saves nothing under B from a form A typed into", async () => {
    await signIn(A);
    await openForm();
    fireEvent.change(screen.getByLabelText(/property address/i), { target: { value: "1 A Street" } });
    fireEvent.change(screen.getByLabelText(/postcode/i), { target: { value: "4000" } });

    await act(async () => {
      boundary.endOfflineSession();
      serverOwner = B;
      boundary.setOfflineSession(B.userId);
      await boundary.refreshOfflineOwner();
    });
    await waitFor(() => expect((screen.getByLabelText(/property address/i) as HTMLInputElement).value).toBe(""));
    expect(await queue.listQueuedClaims()).toEqual([]);
  });

  it("keeps what was typed when the same account is simply re-checked", async () => {
    await signIn(A);
    await openForm();
    const address = screen.getByLabelText(/property address/i) as HTMLInputElement;
    fireEvent.change(address, { target: { value: "1 A Street" } });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await new Promise((r) => setTimeout(r, 20));
    });
    await waitFor(() => expect((screen.getByLabelText(/property address/i) as HTMLInputElement).value).toBe("1 A Street"));
  });
});
