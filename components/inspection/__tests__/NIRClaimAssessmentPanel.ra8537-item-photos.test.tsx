// @vitest-environment jsdom
/**
 * RA-8537 — photo capture on contents pack-out items.
 *
 * The Contents panel lets the owner or a manager attach a before photo while
 * adding an item, and a before or after photo to an item already on the job.
 * Every photo goes up through the job's one photo path (POST
 * /api/inspections/[id]/photos with an Idempotency-Key, then read back) and
 * only the verified photo URL is sent to the pack-out routes. A refused
 * PATCH leaves the item without the photo.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import NIRClaimAssessmentPanel from "../NIRClaimAssessmentPanel";

const VERIFIED =
  "https://res.cloudinary.com/demo/image/upload/v1/inspections/insp_1/sofa.jpg";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

type Call = { url: string; init?: RequestInit };

let calls: Call[];
let patchStatus: number;
let existing: Record<string, unknown>[];

beforeEach(() => {
  calls = [];
  patchStatus = 200;
  existing = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const method = init?.method ?? "GET";
      const json = (status: number, body: unknown) => ({
        ok: status < 400,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
      });
      if (url.endsWith("/contents-pack-out") && method === "GET") {
        return json(200, { items: existing, summary: {} });
      }
      if (url.endsWith("/photos") && method === "POST") {
        return json(201, { photo: { id: "photo-1", url: VERIFIED } });
      }
      if (url.endsWith("/photos") && method === "GET") {
        return json(200, { photos: [{ id: "photo-1", url: VERIFIED }] });
      }
      if (url.endsWith("/contents-pack-out") && method === "POST") {
        const body = JSON.parse(init!.body as string);
        return json(201, { id: "item-new", ...body });
      }
      if (url.includes("/contents-pack-out/") && method === "PATCH") {
        if (patchStatus !== 200) return json(patchStatus, { error: "no" });
        const body = JSON.parse(init!.body as string);
        return json(200, { ...existing[0], ...body });
      }
      return json(404, {});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPanel() {
  render(
    <NIRClaimAssessmentPanel
      inspectionId="insp_1"
      lockedClaimType="CONTENTS"
    />,
  );
}

function pickPhoto(input: HTMLElement) {
  const file = new File([JPEG], "sofa.jpg", { type: "image/jpeg" });
  fireEvent.change(input, { target: { files: [file] } });
}

const photoUploads = () =>
  calls.filter((c) => c.url.endsWith("/photos") && c.init?.method === "POST");

describe("Contents item photos (RA-8537)", () => {
  it("uploads a before photo through the job's photo path and sends its verified URL with the new item", async () => {
    renderPanel();
    const heading = await screen.findByText(/Add Pack-Out Item/i);
    const form = heading.parentElement as HTMLElement;
    pickPhoto(within(form).getByLabelText(/choose before photo/i));

    expect(await within(form).findByAltText(/before photo/i)).toHaveAttribute(
      "src",
      VERIFIED,
    );
    const [upload] = photoUploads();
    expect(upload.url).toBe("/api/inspections/insp_1/photos");
    expect(
      (upload.init?.headers as Record<string, string>)["Idempotency-Key"],
    ).toMatch(/^contents-photo-/);
    expect((upload.init?.body as FormData).get("photoStage")).toBe("PRE_WORK");

    const [description] = within(form).getAllByRole("textbox");
    fireEvent.change(description, { target: { value: "Three-seat sofa" } });
    const [, , disposition] = within(form).getAllByRole("combobox");
    fireEvent.change(disposition, { target: { value: "PACK_OUT" } });
    fireEvent.click(within(form).getByRole("button", { name: /add item/i }));

    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.url.endsWith("/contents-pack-out") && c.init?.method === "POST",
        ),
      ).toBe(true),
    );
    const created = calls.find(
      (c) => c.url.endsWith("/contents-pack-out") && c.init?.method === "POST",
    )!;
    expect(JSON.parse(created.init!.body as string)).toMatchObject({
      itemDescription: "Three-seat sofa",
      beforePhotoUrl: VERIFIED,
    });
  });

  it("adds an after photo to an item already on the job with a photos-only PATCH", async () => {
    existing = [
      {
        id: "item-1",
        itemDescription: "Three-seat sofa",
        packOutDecision: "PACK_OUT",
        beforePhotoUrl: null,
        afterPhotoUrl: null,
      },
    ];
    renderPanel();
    await screen.findByText("Three-seat sofa");
    const slots = screen.getAllByTestId("contents-photo-after");
    // The new-item form has no after slot; the only one is on the item.
    expect(slots).toHaveLength(1);
    pickPhoto(within(slots[0]).getByLabelText(/choose after photo/i));

    expect(
      await within(slots[0]).findByAltText(/after photo/i),
    ).toHaveAttribute("src", VERIFIED);
    const sent = calls.find((c) => c.init?.method === "PATCH")!;
    expect(sent.url).toBe("/api/inspections/insp_1/contents-pack-out/item-1");
    expect(JSON.parse(sent.init!.body as string)).toEqual({
      afterPhotoUrl: VERIFIED,
    });
    expect(photoUploads()).toHaveLength(1);
  });

  it("keeps the item without the photo, and offers a retry, when the PATCH is refused", async () => {
    existing = [
      {
        id: "item-1",
        itemDescription: "Television",
        beforePhotoUrl: null,
        afterPhotoUrl: null,
      },
    ];
    patchStatus = 403;
    renderPanel();
    await screen.findByText("Television");
    const [slot] = screen.getAllByTestId("contents-photo-after");
    pickPhoto(within(slot).getByLabelText(/choose after photo/i));

    expect(await within(slot).findByRole("alert")).toHaveTextContent(
      /could not be linked/i,
    );
    expect(within(slot).queryByRole("img")).toBeNull();
    expect(
      within(slot).getByRole("button", { name: /retry after photo/i }),
    ).toBeInTheDocument();
  });
});
