// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MeterPhotoCapture } from "../MeterPhotoCapture";

const queueWrite = vi.fn();
const queueEvidenceUpload = vi.fn();
const retryQueuedEvidence = vi.fn();
const operationFetch = vi.fn();
vi.mock("@/lib/nir-sync-queue", () => ({ queueWrite: (...args: unknown[]) => queueWrite(...args) }));
vi.mock("@/lib/evidence-upload-queue", () => ({ queueEvidenceUpload: (...args: unknown[]) => queueEvidenceUpload(...args), retryQueuedEvidence: (...args: unknown[]) => retryQueuedEvidence(...args) }));
vi.mock("@/components/providers/CapacitorProvider", () => ({ useCapacitor: () => ({ hasNativeCamera: false }) }));
vi.mock("@/lib/capacitor", () => ({ fireHaptic: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  queueWrite.mockReset().mockResolvedValue("reading-key");
  queueEvidenceUpload.mockReset().mockRejectedValueOnce(new Error("Device photo storage full")).mockResolvedValue("photo-key");
  retryQueuedEvidence.mockReset().mockResolvedValue(1);
  operationFetch.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({ reading: {
    brand: "synthetic", readingValue: 18.5, readingUnit: "WME", displayText: "18.5", confidence: "high",
  } }) });
  vi.stubGlobal("fetch", operationFetch);
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

describe("meter photo after a locally queued reading", () => {
  it("keeps the photo after queue failure and queues it on reconnect without claiming the reading reached the server", async () => {
    render(<MeterPhotoCapture inspectionId="synthetic-job" mode="moisture" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([0xff, 0xd8, 0xff])], "meter.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(await screen.findByRole("button", { name: /Analyse meter photo with AI/ }));
    await screen.findByText(/Confirm Moisture Reading/);
    fireEvent.change(screen.getByPlaceholderText(/Master bedroom — east wall/), { target: { value: "Bedroom 4" } });
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    fireEvent.click(screen.getByRole("button", { name: "Save Reading" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Reading saved on this device; photo not saved/);
    expect(queueWrite).toHaveBeenCalledTimes(1);
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    fireEvent.click(screen.getByRole("button", { name: "Retry meter photo" }));
    await waitFor(() => expect(queueEvidenceUpload).toHaveBeenCalledTimes(2));
    expect(queueWrite).toHaveBeenCalledTimes(1);
    expect(operationFetch).toHaveBeenCalledTimes(1); // Vision only: no premature reading or photo server POST.
    expect(queueEvidenceUpload.mock.calls[0][0].directRetryKey).toBe(queueEvidenceUpload.mock.calls[1][0].directRetryKey);
    await waitFor(() => expect(retryQueuedEvidence).toHaveBeenCalledWith("photo-key", "synthetic-job"));
  });
});
