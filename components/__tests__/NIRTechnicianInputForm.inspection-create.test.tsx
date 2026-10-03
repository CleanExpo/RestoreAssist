// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const notification = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "synthetic-owner" } } }) }));
const photoUpload = vi.hoisted(() => ({ prepare: vi.fn(), upload: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: notification }));
vi.mock("@/lib/inspection-photo-upload", () => ({
  prepareInspectionPhoto: photoUpload.prepare,
  uploadInspectionPhoto: photoUpload.upload,
}));
vi.mock("@/components/inspection/MoistureMappingCanvas", () => ({ default: () => null }));
vi.mock("@/components/inspection/ClassificationSuggestion", () => ({ default: () => null }));
vi.mock("@/components/inspection/NIRClaimAssessmentPanel", () => ({ default: () => null }));
vi.mock("@/components/inspection/MakeSafeChecklist", () => ({ MakeSafeChecklist: () => null }));
vi.mock("@/components/inspection/ClaimTypePicker", () => ({
  default: ({ onChange, value, disabled }: {
    onChange: (value: string) => void; value?: string | null; disabled?: boolean;
  }) =>
    <button type="button" disabled={disabled} onClick={() => onChange("MOULD")}>{value ? `Claim ${value}` : "Choose mould"}</button>,
}));

import NIRTechnicianInputForm from "@/components/NIRTechnicianInputForm";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function readyForm(props: { reportId?: string; initialData?: Record<string, unknown> } = {}) {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<NIRTechnicianInputForm {...props} />); });
  fireEvent.click(screen.getByRole("button", { name: "Choose mould" }));
  fireEvent.change(screen.getByPlaceholderText("Full property address"), { target: { value: "1 Test Street" } });
  fireEvent.change(screen.getByPlaceholderText("0000"), { target: { value: "4000" } });
  return view;
}

function choosePhoto() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"][multiple]');
  if (!input) throw new Error("Missing NIR photo picker");
  fireEvent.change(input, { target: { files: [new File(["jpeg"], "kitchen.jpg", { type: "image/jpeg" })] } });
}

describe("NIR inspection creation", () => {
  it("recovers a prior-build unscoped attempt through owner-scoped readback", async () => {
    const legacyKey = "nir-inspection-123e4567-e89b-42d3-a456-426614174000";
    sessionStorage.setItem("ra.nir-inspection-attempt:standalone:client-1", legacyKey);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("/api/inspections?creationStatus=1")) {
        return { ok: true, json: async () => ({ state: "complete", inspection: {
          id: "legacy-job", claimType: "MOULD", propertyAddress: "1 Verified Street",
          propertyPostcode: "4000", inspectionDate: null,
        } }) };
      }
      return { ok: true, json: async () => ({ creditsRemaining: 0 }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<NIRTechnicianInputForm initialData={{ clientId: "client-1" }} />); });
    await waitFor(() => expect(sessionStorage.getItem("ra.nir-inspection-attempt:standalone:client-1")).toBeNull());
    expect(sessionStorage.getItem("ra.nir-inspection-attempt:synthetic-owner:standalone:client-1")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("creationStatus=1"), {
      headers: { "Idempotency-Key": legacyKey },
    });
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/inspections")).toBe(false);
  });
  it("keeps another user's legacy pointer while offering an explicit new-draft path after owner readback is missing", async () => {
    const legacyKey = "nir-inspection-123e4567-e89b-42d3-a456-426614174000";
    sessionStorage.setItem("ra.nir-inspection-attempt:standalone:client-1", legacyKey);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => url.startsWith("/api/inspections?creationStatus=1")
      ? { ok: true, json: async () => ({ state: "missing" }) }
      : url === "/api/inspections" && init?.method === "POST"
        ? { ok: true, json: async () => ({ inspection: { id: "new-owner-job" } }) }
      : { ok: true, json: async () => ({ creditsRemaining: 0 }) });
    vi.stubGlobal("fetch", fetchMock);
    await readyForm({ initialData: { clientId: "client-1" } });
    expect(await screen.findByText(/An older inspection attempt could not be verified/)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/inspections")).toBe(false);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "I checked jobs; start fresh" })));
      expect(fetchMock.mock.calls.some(([url]) => url === "/api/inspections")).toBe(false);
      confirm.mockReturnValue(true);
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "I checked jobs; start fresh" })));
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
      const create = fetchMock.mock.calls.find(([url, init]) => url === "/api/inspections" && init?.method === "POST");
      expect(create).toBeDefined();
      expect((create?.[1]?.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^nir-inspection-\d{13}-/);
      expect((create?.[1]?.headers as Record<string, string>)["Idempotency-Key"]).not.toBe(legacyKey);
    } finally {
      confirm.mockRestore();
    }
    expect(sessionStorage.getItem("ra.nir-inspection-attempt:standalone:client-1")).toBe(legacyKey);
    expect(sessionStorage.getItem("ra.nir-inspection-attempt:synthetic-owner:standalone:client-1")).toBeNull();
    expect(sessionStorage.getItem("ra.nir-inspection-attempt:synthetic-owner:standalone:client-1:legacy-dismissed")).toBe(legacyKey);
  });
  it("recovers a client-only draft after a lost response and remount without a second POST", async () => {
    let createCalls = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/inspections" && init?.method === "POST") {
        createCalls++;
        throw new Error("synthetic response lost after commit");
      }
      if (url.startsWith("/api/inspections?creationStatus=1")) {
        return { ok: true, json: async () => ({ state: "complete", inspection: {
          id: "saved-job", claimType: "MOULD", propertyAddress: "2 Verified St",
          propertyPostcode: "4001", inspectionDate: null,
          lossDescription: "Recovered loss", technicianName: "Verified Technician",
        } }) };
      }
      return { ok: true, json: async () => ({ creditsRemaining: 0 }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const props = { initialData: { clientId: "client-1" } };
    const view = await readyForm(props);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    expect(createCalls).toBe(1);
    expect(sessionStorage.getItem("ra.nir-inspection-attempt:synthetic-owner:standalone:client-1"))
      .toMatch(/^nir-inspection-/);

    view.unmount();
    await act(async () => { render(<NIRTechnicianInputForm {...props} />); });
    await waitFor(() => expect(sessionStorage.getItem("ra.nir-inspection-attempt:synthetic-owner:standalone:client-1"))
      .toBeNull());
    expect(fetchMock.mock.calls.some(([url]) => url.startsWith("/api/inspections?creationStatus=1"))).toBe(true);
    expect(screen.getByRole("button", { name: "Claim MOULD" })).toBeDisabled();
    expect(screen.getByText("Claim-type evidence")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Full property address")).toHaveValue("2 Verified St");
    expect(screen.getByPlaceholderText("0000")).toHaveValue("4001");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    expect(createCalls).toBe(1);
    const snapshot = fetchMock.mock.calls.find(([url]) => url === "/api/inspections/saved-job/draft-snapshot");
    expect(snapshot).toBeDefined();
    expect(JSON.parse(String(snapshot?.[1]?.body))).toMatchObject({
      lossDescription: "Recovered loss", technicianName: "Verified Technician",
    });
    expect(sessionStorage.getItem("ra.nir-inspection-attempt:synthetic-owner:standalone:client-1")).toBeNull();
  });

  it("blocks a second client-only create after remount when status remains uncertain", async () => {
    let createCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/inspections" && init?.method === "POST") {
        createCalls++;
        throw new Error("synthetic response lost after commit");
      }
      if (url.startsWith("/api/inspections?creationStatus=1")) {
        return { ok: true, json: async () => ({ state: "pending" }) };
      }
      return { ok: true, json: async () => ({ creditsRemaining: 0 }) };
    }));
    const props = { initialData: { clientId: "client-1" } };
    const view = await readyForm(props);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    expect(createCalls).toBe(1);
    view.unmount();
    await readyForm(props);
    expect(await screen.findByText(/Inspection creation is unconfirmed\. Check its status/)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    expect(createCalls).toBe(1);
  });
  it("retries a freshly missing inspection with the saved key after a request never reached the server", async () => {
    let creates = 0;
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/inspections" && init?.method === "POST") {
        requests.push((init.headers as Record<string, string>)["Idempotency-Key"]);
        if (requests.length === 1) throw new Error("synthetic request never reached server");
        creates++;
        return { ok: true, json: async () => ({ inspection: { id: "one-job" } }) };
      }
      if (url.startsWith("/api/inspections?creationStatus=1")) {
        return { ok: true, json: async () => ({ state: "retryable_missing" }) };
      }
      return { ok: true, json: async () => ({ creditsRemaining: 0 }) };
    }));
    const props = { initialData: { clientId: "client-1" } };
    const view = await readyForm(props);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    expect(creates).toBe(0);
    view.unmount();
    await readyForm(props);
    expect(await screen.findByText(/No saved request was found/)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    expect(requests).toHaveLength(2);
    expect(requests[1]).toBe(requests[0]);
    expect(creates).toBe(1);
    expect(sessionStorage.getItem("ra.nir-inspection-attempt:synthetic-owner:standalone:client-1")).toBeNull();
  });
  it("blocks a once-retryable inspection after its fresh recovery window has elapsed", async () => {
    let createCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/inspections" && init?.method === "POST") {
        createCalls++;
        throw new Error("synthetic request never reached server");
      }
      if (url.startsWith("/api/inspections?creationStatus=1")) {
        return { ok: true, json: async () => ({ state: "retryable_missing" }) };
      }
      return { ok: true, json: async () => ({ creditsRemaining: 0 }) };
    }));
    const props = { initialData: { clientId: "client-1" } };
    const view = await readyForm(props);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    view.unmount();
    await readyForm(props);
    expect(await screen.findByText(/No saved request was found/)).toBeInTheDocument();
    const afterWindow = Date.now() + 21 * 60 * 60 * 1000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(afterWindow);
    try {
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
      expect(createCalls).toBe(1);
      expect(screen.getByRole("alert")).toHaveTextContent(/unconfirmed/);
    } finally {
      clock.mockRestore();
    }
  });
  it("blocks an in-page repeat POST once its idempotency cache window could have expired", async () => {
    let createCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/inspections" && init?.method === "POST") {
        createCalls++;
        throw new Error("synthetic committed response lost");
      }
      return { ok: true, json: async () => ({ creditsRemaining: 0 }) };
    }));
    await readyForm();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    const afterWindow = Date.now() + 21 * 60 * 60 * 1000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(afterWindow);
    try {
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
      expect(createCalls).toBe(1);
      expect(screen.getByRole("alert")).toHaveTextContent(/unconfirmed/);
    } finally {
      clock.mockRestore();
    }
  });
  it("retains an uncertain inspection key after a remount retry finds a fingerprint conflict", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/inspections" && init?.method === "POST") {
        requests.push((init.headers as Record<string, string>)["Idempotency-Key"]);
        if (requests.length === 1) throw new Error("synthetic response lost");
        return { ok: false, status: 409, json: async () => ({ error: "Idempotency-Key reused with a different request body. Use a new key for new requests." }) };
      }
      if (url.startsWith("/api/inspections?creationStatus=1")) {
        return { ok: true, json: async () => ({ state: "retryable_missing" }) };
      }
      return { ok: true, json: async () => ({ creditsRemaining: 0 }) };
    }));
    const props = { initialData: { clientId: "client-1" } };
    const view = await readyForm(props);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    view.unmount();
    await readyForm(props);
    expect(await screen.findByText(/No saved request was found/)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    expect(requests).toHaveLength(2);
    expect(requests[1]).toBe(requests[0]);
    expect(sessionStorage.getItem("ra.nir-inspection-attempt:synthetic-owner:standalone:client-1")).toBe(requests[0]);
    expect(screen.getByRole("alert")).toHaveTextContent(/unconfirmed/);
  });
  it("shares one in-flight create across photo upload and Save Draft before either action continues", async () => {
    let finishCreate: ((response: { ok: boolean; json: () => Promise<unknown> }) => void) | undefined;
    const creating = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => { finishCreate = resolve; });
    photoUpload.prepare.mockImplementation(async (file: File) => file);
    photoUpload.upload.mockResolvedValue({ id: "photo-1", url: "https://example.test/photo.jpg" });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/inspections" && init?.method === "POST") return creating;
      return { ok: true, json: async () => ({ creditsRemaining: 0 }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    await readyForm();

    choosePhoto();
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url, init]) =>
      url === "/api/inspections" && init?.method === "POST",
    )).toHaveLength(1));
    expect(screen.getByText("Uploading...")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    expect(fetchMock.mock.calls.filter(([url, init]) =>
      url === "/api/inspections" && init?.method === "POST",
    )).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/draft-snapshot"))).toBe(false);

    await act(async () => finishCreate?.({
      ok: true,
      json: async () => ({ inspection: { id: "synthetic-inspection" } }),
    }));
    await waitFor(() => expect(photoUpload.upload).toHaveBeenCalledWith(
      "synthetic-inspection", expect.any(File), expect.stringMatching(/^nir-photo-/),
    ));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      url === "/api/inspections/synthetic-inspection/draft-snapshot",
    )).toBe(true));
    const create = fetchMock.mock.calls.find(([url, init]) =>
      url === "/api/inspections" && init?.method === "POST",
    );
    expect((create?.[1]?.headers as Record<string, string>)["Idempotency-Key"])
      .toMatch(/^nir-inspection-/);
  });

  it.each(["lost response", "pending 409"] as const)(
    "retries a %s with the same key and frozen body",
    async (failure) => {
    let creates = 0;
    photoUpload.prepare.mockImplementation(async (file: File) => file);
    photoUpload.upload.mockResolvedValue({ id: "photo-1", url: "https://example.test/photo.jpg" });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/inspections" && init?.method === "POST") {
        creates++;
        return creates === 1
          ? failure === "pending 409"
            ? { ok: false, status: 409, json: async () => ({ error: "A request with this Idempotency-Key is already in progress. Retry shortly." }) }
            : { ok: true, json: async () => { throw new Error("Response lost after commit"); } }
          : { ok: true, json: async () => ({ inspection: { id: "synthetic-inspection" } }) };
      }
      return { ok: true, json: async () => ({ creditsRemaining: 0 }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    await readyForm();

    await act(async () => choosePhoto());
    expect(screen.getByRole("status")).toHaveTextContent("Inspection creation is unconfirmed");
    expect(photoUpload.upload).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Full property address"), { target: { value: "2 Changed Street" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry this photo" })));
    expect(creates).toBe(1);
    expect(notification.error).toHaveBeenCalledWith(expect.stringContaining("Restore the original claim type"));
    fireEvent.change(screen.getByPlaceholderText("Full property address"), { target: { value: "1 Test Street" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry this photo" })));
    expect(photoUpload.upload).toHaveBeenCalledWith(
      "synthetic-inspection", expect.any(File), expect.stringMatching(/^nir-photo-/),
    );
    const requests = fetchMock.mock.calls.filter(([url, init]) =>
      url === "/api/inspections" && init?.method === "POST",
    );
    expect(requests).toHaveLength(2);
    expect((requests[0][1]?.headers as Record<string, string>)["Idempotency-Key"])
      .toMatch(/^nir-inspection-/);
    expect((requests[1][1]?.headers as Record<string, string>)["Idempotency-Key"])
      .toBe((requests[0][1]?.headers as Record<string, string>)["Idempotency-Key"]);
    expect(requests[1][1]?.body).toBe(requests[0][1]?.body);
    expect(screen.getByAltText("Photo 1")).toBeInTheDocument();
    },
  );

  it("keeps a selected photo and its upload identity after an uncertain attachment", async () => {
    const selected = new File(["jpeg"], "kitchen.jpg", { type: "image/jpeg" });
    photoUpload.prepare.mockImplementation(async (file: File) => file);
    photoUpload.upload
      .mockRejectedValueOnce(new Error("Photo readback unavailable"))
      .mockResolvedValueOnce({ id: "verified-photo", url: "https://example.test/photo.jpg" });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) =>
      url === "/api/inspections" && init?.method === "POST"
        ? { ok: true, json: async () => ({ inspection: { id: "synthetic-inspection" } }) }
        : { ok: true, json: async () => ({ creditsRemaining: 0 }) },
    ));
    await readyForm();
    const input = document.querySelector<HTMLInputElement>('input[type="file"][multiple]');
    if (!input) throw new Error("Missing NIR photo picker");

    await act(async () => fireEvent.change(input, { target: { files: [selected] } }));
    expect(screen.getByRole("status")).toHaveTextContent("Photo readback unavailable");
    expect(screen.getByRole("button", { name: "Retry this photo" })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry this photo" })));

    expect(photoUpload.prepare).toHaveBeenCalledTimes(1);
    expect(photoUpload.upload).toHaveBeenCalledTimes(2);
    expect(photoUpload.upload.mock.calls[1][1]).toBe(selected);
    expect(photoUpload.upload.mock.calls[1][2]).toBe(photoUpload.upload.mock.calls[0][2]);
    expect(screen.getByAltText("Photo 1")).toHaveAttribute("src", "https://example.test/photo.jpg");
  });

  it("uses a fresh key after a definite validation rejection", async () => {
    const status = 400;
    const errorMessage = "Invalid address";
    let creates = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/inspections" && init?.method === "POST") {
        creates++;
        return creates === 1
          ? { ok: false, status, json: async () => ({ error: errorMessage }) }
          : { ok: true, json: async () => ({ inspection: { id: "synthetic-inspection" } }) };
      }
      return { ok: true, json: async () => ({ creditsRemaining: 0 }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    await readyForm();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    fireEvent.change(screen.getByPlaceholderText("Full property address"), { target: { value: "2 Corrected Street" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    const requests = fetchMock.mock.calls.filter(([url, init]) =>
      url === "/api/inspections" && init?.method === "POST",
    );
    expect(requests).toHaveLength(2);
    expect((requests[1][1]?.headers as Record<string, string>)["Idempotency-Key"])
      .not.toBe((requests[0][1]?.headers as Record<string, string>)["Idempotency-Key"]);
    expect(JSON.parse(String(requests[1][1]?.body)).propertyAddress).toBe("2 Corrected Street");
  });

  it("uses a new key after a linked report property conflict and retains the report, client and attendance", async () => {
    let creates = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/inspections" && init?.method === "POST") {
        creates++;
        return creates === 1
          ? { ok: false, status: 409, json: async () => ({ error: "Inspection property does not match the report" }) }
          : { ok: true, json: async () => ({ inspection: { id: "linked-inspection" } }) };
      }
      return { ok: true, json: async () => ({ creditsRemaining: 0 }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    await readyForm({
      reportId: "report-1",
      initialData: { clientId: "client-1", inspectionDate: "2026-10-01T14:15:00.000Z" },
    });

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    fireEvent.change(screen.getByPlaceholderText("Full property address"), { target: { value: "2 Corrected Street" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));

    const requests = fetchMock.mock.calls.filter(([url, init]) =>
      url === "/api/inspections" && init?.method === "POST",
    );
    expect(requests).toHaveLength(2);
    expect((requests[1][1]?.headers as Record<string, string>)["Idempotency-Key"])
      .not.toBe((requests[0][1]?.headers as Record<string, string>)["Idempotency-Key"]);
    expect(JSON.parse(String(requests[1][1]?.body))).toMatchObject({
      reportId: "report-1",
      clientId: "client-1",
      inspectionDate: "2026-10-01",
      propertyAddress: "2 Corrected Street",
    });
  });
});
