// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/camera", () => ({
  Camera: { getPhoto: vi.fn() },
  CameraResultType: { DataUrl: "dataUrl" },
  CameraSource: { Camera: "CAMERA" },
}));
vi.mock("@/lib/capacitor", () => ({ getCurrentLocation: vi.fn(async () => null) }));

import { pickEvidencePhotoFile } from "../ios-capture";

afterEach(() => vi.useRealTimers());

describe("pickEvidencePhotoFile", () => {
  it("does not infer cancellation from focus, backgrounding, or a long native event delay", async () => {
    vi.useFakeTimers();
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      const input = this;
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      setTimeout(() => {
        Object.defineProperty(input, "files", { configurable: true, value: [new File(["photo"], "room.jpg", { type: "image/jpeg" })] });
        input.dispatchEvent(new Event("change"));
      }, 30_000);
    });
    try {
      const picked = pickEvidencePhotoFile();
      const assertion = expect(picked).resolves.toMatchObject({ name: "room.jpg" });
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    } finally {
      click.mockRestore();
    }
  });

  it("rejects a genuine cancel event", async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      this.dispatchEvent(new Event("cancel"));
    });
    try {
      await expect(pickEvidencePhotoFile()).rejects.toThrow("Capture cancelled");
    } finally {
      click.mockRestore();
    }
  });

  it("retains an already selected file when explicit abort arrives before change", async () => {
    const controller = new AbortController();
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      Object.defineProperty(this, "files", { configurable: true, value: [new File(["selected"], "room.jpg", { type: "image/jpeg" })] });
      controller.abort();
    });
    try {
      await expect(pickEvidencePhotoFile({ signal: controller.signal })).resolves.toMatchObject({ name: "room.jpg" });
    } finally {
      click.mockRestore();
    }
  });

  it("rejects a duplicate opening while preserving the first pending picker", async () => {
    let input: HTMLInputElement | null = null;
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      input = this;
    });
    try {
      const first = pickEvidencePhotoFile();
      await expect(pickEvidencePhotoFile()).rejects.toThrow(/already open/);
      Object.defineProperty(input!, "files", { configurable: true, value: [new File(["selected"], "first.jpg", { type: "image/jpeg" })] });
      input!.dispatchEvent(new Event("change"));
      await expect(first).resolves.toMatchObject({ name: "first.jpg" });
      expect(document.querySelector('input[type="file"]')).toBeNull();
    } finally {
      click.mockRestore();
    }
  });
});
