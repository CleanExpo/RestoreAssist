// @vitest-environment jsdom
/**
 * MeterPhotoCapture — the inspection capture UI's meter-photo path.
 *
 * The acceptance this file exists to hold: a photo of a moisture meter taken
 * from the inspection capture UI produces a logged MoistureReading via the
 * existing BYOK vision route.
 *
 * Before the wiring change, "Read Meter Display" posted a multipart body to
 * /api/inspections/[id]/analyze-photo — a route that has never existed in this
 * repo — so the button 404'd and no reading could ever be logged. The first
 * test below fails if that regresses, because it asserts the exact URL and
 * JSON body the vision route accepts.
 */
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MeterPhotoCapture,
  meterReadingToExtraction,
  visionErrorMessage,
} from "../MeterPhotoCapture";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/providers/CapacitorProvider", () => ({
  useCapacitor: () => ({ hasNativeCamera: false }),
}));

vi.mock("@/lib/capacitor", () => ({ fireHaptic: vi.fn() }));

// The same fixture the route test uses: a real PNG of a meter LCD at 18.5% WME.
const FIXTURE_PATH = join(
  process.cwd(),
  "lib/vision/__tests__/fixtures/moisture-meter-18-5.png",
);
const FIXTURE_BYTES = readFileSync(FIXTURE_PATH);
const FIXTURE_BASE64 = FIXTURE_BYTES.toString("base64");

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const READING = {
  brand: "protimeter",
  readingValue: 18.5,
  readingUnit: "WME",
  displayText: "18.5% WME",
  confidence: "high" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Drop the fixture photo onto the hidden capture input, as the camera would. */
async function attachMeterPhoto() {
  const file = new File([FIXTURE_BYTES], "meter.png", { type: "image/png" });
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file] });
  fireEvent.change(input);
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: /Analyse meter photo with AI/i }),
    ).toBeInTheDocument();
  });
}

function clickRead() {
  fireEvent.click(
    screen.getByRole("button", { name: /Analyse meter photo with AI/i }),
  );
}

describe("MeterPhotoCapture — moisture photo to logged reading", () => {
  it("sends the photo to the BYOK vision route and logs a MoistureReading the tech confirms", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { reading: READING })) // vision
      .mockResolvedValueOnce(
        jsonResponse(201, { moistureReading: { id: "mr_1" } }),
      ) // moisture
      .mockResolvedValueOnce(jsonResponse(201, {})); // photo upload

    render(<MeterPhotoCapture inspectionId="insp_1" mode="moisture" />);
    await attachMeterPhoto();
    clickRead();

    // 1. The vision call — correct route, correct JSON contract, real bytes.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [visionUrl, visionInit] = fetchMock.mock.calls[0];
    expect(visionUrl).toBe("/api/vision/extract-reading");
    expect(visionInit.method).toBe("POST");
    const visionBody = JSON.parse(visionInit.body);
    expect(visionBody.mediaType).toBe("image/png");
    expect(visionBody.image).toBe(FIXTURE_BASE64);
    // Raw base64 only — a data: URL prefix would be rejected by the route's
    // base64 charset guard.
    expect(visionBody.image.startsWith("data:")).toBe(false);

    // 2. The extracted value is presented for confirmation, pre-filled.
    await waitFor(() => {
      expect(screen.getByText(/Confirm Moisture Reading/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/18\.5% WME/)).toBeInTheDocument();
    expect(screen.getByText(/High confidence/i)).toBeInTheDocument();
    const moistureInput = screen.getByDisplayValue("18.5");
    expect(moistureInput).toBeInTheDocument();

    // 3. Tech adds the location and surface, then saves.
    fireEvent.change(
      screen.getByPlaceholderText(/Master bedroom — east wall/i),
      { target: { value: "Living Room — timber flooring, centre" } },
    );
    fireEvent.change(screen.getByPlaceholderText(/concrete, timber/i), {
      target: { value: "timber" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Reading/i }));

    // 4. The MoistureReading is written through the existing moisture route,
    //    carrying the AI-extracted value and tagged as OCR-sourced.
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    const [moistureUrl, moistureInit] = fetchMock.mock.calls[1];
    expect(moistureUrl).toBe("/api/inspections/insp_1/moisture");
    expect(moistureInit.method).toBe("POST");
    const saved = JSON.parse(moistureInit.body);
    expect(saved).toMatchObject({
      location: "Living Room — timber flooring, centre",
      surfaceType: "timber",
      moistureLevel: 18.5,
      source: "ocr",
    });
    expect(saved.notes).toContain("18.5% WME");
  });

  it("never posts to the analyze-photo route that does not exist", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { reading: READING }));

    render(<MeterPhotoCapture inspectionId="insp_1" mode="moisture" />);
    await attachMeterPhoto();
    clickRead();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain("analyze-photo");
    }
  });

  it("tells the tech to add a workspace key when BYOK is unconfigured", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(402, { error: "KEY_MISSING" }));

    render(<MeterPhotoCapture inspectionId="insp_1" mode="moisture" />);
    await attachMeterPhoto();
    clickRead();

    await waitFor(() => {
      expect(screen.getByText(/No Anthropic API key/i)).toBeInTheDocument();
    });
    // The raw error code must never reach the tech.
    expect(screen.queryByText(/^KEY_MISSING$/)).not.toBeInTheDocument();
    // The existing Integrations deep-link renders off this message.
    expect(
      screen.getByRole("link", { name: /Integrations/i }),
    ).toBeInTheDocument();
  });

  it("says so plainly for modes that have no extraction endpoint", async () => {
    render(<MeterPhotoCapture inspectionId="insp_1" mode="environmental" />);
    await attachMeterPhoto();
    clickRead();

    await waitFor(() => {
      expect(
        screen.getByText(/available for moisture meters only/i),
      ).toBeInTheDocument();
    });
    // Critically: it must not fire a request at a route that does not exist.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("meterReadingToExtraction", () => {
  it("carries the reading, unit, display text and confidence across", () => {
    expect(meterReadingToExtraction(READING)).toEqual({
      type: "moisture",
      moisturePercent: 18.5,
      value: 18.5,
      unit: "WME",
      materialType: null,
      rawText: "18.5% WME",
      confidence: "high",
    });
  });

  it("keeps an unreadable display null rather than inventing a zero reading", () => {
    const extraction = meterReadingToExtraction({
      ...READING,
      readingValue: null,
      confidence: "low",
    });
    // moisturePercent drives the pre-filled input — it must stay empty so the
    // tech types the real number instead of silently saving 0%.
    expect(extraction.moisturePercent).toBeNull();
  });
});

describe("visionErrorMessage", () => {
  it("maps every route failure code to actionable copy, never the bare code", () => {
    for (const code of [
      "KEY_MISSING",
      "RATE_LIMITED",
      "MODEL_OVERLOADED",
      "NO_READING_DETECTED",
      "PARSE_FAILED",
    ]) {
      const message = visionErrorMessage(500, code);
      expect(message).not.toBe(code);
      expect(message.length).toBeGreaterThan(20);
    }
  });
});
