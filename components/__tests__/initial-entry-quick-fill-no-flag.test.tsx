// @vitest-environment jsdom
/**
 * RA-7711 — the server no longer accepts a browser-sent sample flag (a
 * client-controlled flag could hide a real job), so the Initial Data Entry
 * form must not send one. Quick Fill only fills the form; an explicit submit
 * is the user's own job.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1", role: "ADMIN" } }, status: "authenticated" }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/capacitor", () => ({ isCapacitorIOS: () => false }));

import InitialDataEntryForm from "@/components/InitialDataEntryForm";
import toast from "react-hot-toast";

let entryBodies: Array<Record<string, unknown>> = [];
let entryResponse: Record<string, unknown>;
let entryKeys: string[] = [];
let entryHandler: ((body: string, key: string) => Promise<Response>) | null = null;
let recoveryHandler: ((key: string) => Promise<Response>) | null = null;
let recoveryKeys: string[] = [];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  entryBodies = [];
  entryKeys = [];
  entryHandler = null;
  recoveryHandler = null;
  recoveryKeys = [];
  entryResponse = { report: { id: "r1" } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/user/quick-fill-credits")) {
        return jsonResponse({ hasUnlimited: true, creditsRemaining: 0 });
      }
      if (url === "/api/reports/initial-entry" && init?.method === "POST") {
        const body = String(init?.body);
        const key = new Headers(init?.headers).get("Idempotency-Key") ?? "";
        entryBodies.push(JSON.parse(body));
        entryKeys.push(key);
        if (entryHandler) return entryHandler(body, key);
        return jsonResponse(entryResponse);
      }
      if (url.startsWith("/api/reports/initial-entry") && !init?.method) {
        const key = new Headers(init?.headers).get("Idempotency-Key") ?? "";
        recoveryKeys.push(key);
        return recoveryHandler ? recoveryHandler(key) : jsonResponse({ state: "missing" });
      }
      return jsonResponse({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function quickFillThenSubmit(edit?: () => Promise<void>, inspectionId?: string, onReportCreated?: (id: string) => void) {
  const { container } = render(<InitialDataEntryForm inspectionId={inspectionId} onReportCreated={onReportCreated} />);
  const button = await screen.findByRole("button", { name: /Quick Fill Test Data/ });
  // Disabled until the credits check resolves.
  await waitFor(() => expect(button).toBeEnabled());
  await act(async () => {
    fireEvent.click(button);
  });
  const useCase = await screen.findByText("Residential Water Damage");
  await act(async () => {
    fireEvent.click(useCase);
  });
  await screen.findByDisplayValue("ABC Co.");
  if (edit) await act(edit);
  const form = container.querySelector("form");
  expect(form).not.toBeNull();
  await act(async () => {
    fireEvent.submit(form!);
  });
  return form!;
}

describe("Initial Data Entry Quick Fill sends no sample flag (RA-7711)", () => {
  it("submits an unedited quick-filled form with no quickFillSample field", async () => {
    await quickFillThenSubmit();
    expect(entryBodies).toHaveLength(1);
    expect(entryBodies[0].clientName).toBe("ABC Co.");
    expect(entryBodies[0]).not.toHaveProperty("quickFillSample");
  });
  it("does not advance a requested inspection when the server cannot confirm its report link", async () => {
    entryResponse = { report: { id: "orphan-report" }, inspectionLinked: false };
    const onCreated = vi.fn();
    await quickFillThenSubmit(undefined, "synthetic-inspection", onCreated);
    expect(entryBodies).toHaveLength(1);
    expect(onCreated).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalledWith("Report saved");
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("not linked"));
  });
  it("reuses the same key and body after a committed response is lost", async () => {
    const cache = new Map<string, Response>();
    let creations = 0;
    entryHandler = async (_body, key) => {
      if (key && cache.has(key)) return cache.get(key)!.clone();
      creations++;
      const response = jsonResponse({ report: { id: "single-report" }, inspectionLinked: true });
      if (key) cache.set(key, response.clone());
      if (creations === 1) throw new Error("response lost after commit");
      return response;
    };
    const onCreated = vi.fn();
    const form = await quickFillThenSubmit(undefined, "synthetic-inspection", onCreated);
    await act(async () => fireEvent.submit(form));
    expect(entryKeys[0]).toMatch(/^report-initial-/);
    expect(entryKeys[1]).toBe(entryKeys[0]);
    expect(entryBodies[1]).toEqual(entryBodies[0]);
    expect(creations).toBe(1);
    expect(onCreated).toHaveBeenCalledExactlyOnceWith("single-report");
  });
  it("recovers one committed charge and report after a form remount", async () => {
    const cache = new Map<string, Response>();
    let creations = 0;
    let charges = 0;
    entryHandler = async (_body, key) => {
      if (key && cache.has(key)) return cache.get(key)!.clone();
      creations++;
      charges++;
      const response = jsonResponse({ report: { id: "one-report" }, inspectionLinked: false });
      if (key) cache.set(key, response.clone());
      if (creations === 1) throw new Error("response lost after commit");
      return response;
    };
    recoveryHandler = async (key) => cache.has(key)
      ? jsonResponse({ state: "complete", reportId: "one-report" })
      : jsonResponse({ state: "missing" });
    await quickFillThenSubmit();
    expect(creations).toBe(1);
    expect(charges).toBe(1);
    expect(sessionStorage.getItem("ra.initial-report-attempt:u1:standalone")).toBe(entryKeys[0]);
    cleanup();
    const recovered = vi.fn();
    await act(async () => render(<InitialDataEntryForm onReportCreated={recovered} initialData={{
      clientName: "Synthetic Client", propertyAddress: "1 Test Street", propertyPostcode: "4000",
      technicianFieldReport: "Synthetic attendance notes.",
    }} />));
    expect(recoveryKeys).toEqual([entryKeys[0]]);
    await waitFor(() => expect(recovered).toHaveBeenCalledExactlyOnceWith("one-report"));
    const recoveredForm = document.querySelector("form");
    expect(recoveredForm).not.toBeNull();
    await act(async () => fireEvent.submit(recoveredForm!));
    expect(creations).toBe(1);
    expect(charges).toBe(1);
    expect(entryBodies).toHaveLength(1);
  });
  it("blocks a new charged submit after remount when recovery cannot prove the result", async () => {
    let charges = 0;
    entryHandler = async () => { charges++; throw new Error("lost committed response"); };
    recoveryHandler = async () => jsonResponse({ state: "missing" });
    await quickFillThenSubmit();
    cleanup();
    const form = await quickFillThenSubmit();
    await act(async () => fireEvent.submit(form));
    expect(charges).toBe(1);
    expect(entryBodies).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(/unconfirmed/);
  });
  it("retries a freshly missing creation with its saved key after a request never reached the server", async () => {
    let committed = 0;
    entryHandler = async () => {
      if (entryKeys.length === 1) throw new Error("synthetic request never reached server");
      committed++;
      return jsonResponse({ report: { id: "one-report" }, inspectionLinked: false });
    };
    recoveryHandler = async () => jsonResponse({ state: "retryable_missing" });
    await quickFillThenSubmit();
    expect(committed).toBe(0);
    cleanup();
    await quickFillThenSubmit();
    expect(entryBodies).toHaveLength(2);
    expect(entryKeys[1]).toBe(entryKeys[0]);
    expect(committed).toBe(1);
    expect(sessionStorage.getItem("ra.initial-report-attempt:u1:standalone")).toBeNull();
  });
  it("blocks a once-retryable report attempt after its fresh recovery window has elapsed", async () => {
    entryHandler = async () => { throw new Error("synthetic request never reached server"); };
    recoveryHandler = async () => jsonResponse({ state: "retryable_missing" });
    await quickFillThenSubmit();
    cleanup();
    const { container } = render(<InitialDataEntryForm />);
    expect(await screen.findByText(/No saved request was found/)).toBeInTheDocument();
    const button = await screen.findByRole("button", { name: /Quick Fill Test Data/ });
    await waitFor(() => expect(button).toBeEnabled());
    await act(async () => fireEvent.click(button));
    await act(async () => fireEvent.click(await screen.findByText("Residential Water Damage")));
    await screen.findByDisplayValue("ABC Co.");
    const afterWindow = Date.now() + 21 * 60 * 60 * 1000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(afterWindow);
    try {
      await act(async () => fireEvent.submit(container.querySelector("form")!));
      expect(entryBodies).toHaveLength(1);
      expect(screen.getByRole("alert")).toHaveTextContent(/unconfirmed/);
    } finally {
      clock.mockRestore();
    }
  });
  it("blocks an in-page repeat POST once its idempotency cache window could have expired", async () => {
    entryHandler = async () => { throw new Error("synthetic committed response lost"); };
    const form = await quickFillThenSubmit();
    const afterWindow = Date.now() + 21 * 60 * 60 * 1000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(afterWindow);
    try {
      await act(async () => fireEvent.submit(form));
      expect(entryBodies).toHaveLength(1);
      expect(screen.getByRole("alert")).toHaveTextContent(/unconfirmed/);
    } finally {
      clock.mockRestore();
    }
  });
  it("blocks a changed body after a lost response until its original result is known", async () => {
    let charges = 0;
    entryHandler = async () => { charges++; throw new Error("uncertain response"); };
    const form = await quickFillThenSubmit();
    await act(async () => fireEvent.change(screen.getByPlaceholderText("Enter client's full name"), {
      target: { value: "Different Synthetic Client" },
    }));
    await act(async () => fireEvent.submit(form));
    expect(charges).toBe(1);
    expect(entryBodies).toHaveLength(1);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("unconfirmed"));
  });
  it("retains an uncertain key if authentication expires on retry", async () => {
    let calls = 0;
    entryHandler = async () => {
      if (++calls === 1) throw new Error("committed response lost");
      return jsonResponse({ error: "Unauthorized" }, 401);
    };
    const form = await quickFillThenSubmit();
    await act(async () => fireEvent.submit(form));
    expect(entryKeys).toHaveLength(2);
    expect(entryKeys[1]).toBe(entryKeys[0]);
    expect(sessionStorage.getItem("ra.initial-report-attempt:u1:standalone")).toBe(entryKeys[0]);
  });
  it("fails closed when the durable attempt key cannot be stored", async () => {
    const original = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage unavailable"); });
    try {
      await quickFillThenSubmit();
      expect(entryBodies).toHaveLength(0);
    } finally {
      write.mockRestore();
      Storage.prototype.setItem = original;
    }
  });
  it("fails closed when a stored attempt key cannot be read back", async () => {
    const originalSet = Storage.prototype.setItem;
    const originalGet = Storage.prototype.getItem;
    let wroteAttempt = false;
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (key, value) {
      originalSet.call(this, key, value);
      if (key.startsWith("ra.initial-report-attempt:")) wroteAttempt = true;
    });
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (key) {
      return wroteAttempt && key.startsWith("ra.initial-report-attempt:")
        ? null : originalGet.call(this, key);
    });
    try {
      await quickFillThenSubmit();
      expect(entryBodies).toHaveLength(0);
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });
  it("rotates the key after a definitive conflict and corrected report details", async () => {
    let calls = 0;
    entryHandler = async () => ++calls === 1
      ? jsonResponse({ error: "Inspection already linked" }, 409)
      : jsonResponse({ report: { id: "corrected-report" }, inspectionLinked: true });
    const onCreated = vi.fn();
    const form = await quickFillThenSubmit(undefined, "synthetic-inspection", onCreated);
    await act(async () => fireEvent.change(screen.getByPlaceholderText("Enter client's full name"), {
      target: { value: "Corrected Synthetic Client" },
    }));
    await act(async () => fireEvent.submit(form));
    expect(entryKeys[0]).toMatch(/^report-initial-/);
    expect(entryKeys[1]).toMatch(/^report-initial-/);
    expect(entryKeys[1]).not.toBe(entryKeys[0]);
    expect(entryBodies[1]).not.toEqual(entryBodies[0]);
    expect(onCreated).toHaveBeenCalledExactlyOnceWith("corrected-report");
  });
});
