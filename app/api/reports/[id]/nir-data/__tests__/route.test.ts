import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const reportFindUnique = vi.fn();
const reportUpdate = vi.fn();
const uploadToCloudinary = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      findUnique: (...args: unknown[]) => reportFindUnique(...args),
      update: (...args: unknown[]) => reportUpdate(...args),
    },
  },
}));
vi.mock("@/lib/cloudinary", () => ({
  uploadToCloudinary: (...args: unknown[]) => uploadToCloudinary(...args),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  reportFindUnique.mockReset();
  reportUpdate.mockReset();
  uploadToCloudinary.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  reportFindUnique.mockResolvedValue({
    id: "report_1",
    userId: "user_1",
    moistureReadings: null,
  });
  reportUpdate.mockResolvedValue({ id: "report_1" });
  uploadToCloudinary.mockResolvedValue({
    url: "https://images.example/photo.png",
    thumbnailUrl: "https://images.example/photo-thumb.png",
  });
});

function postRequest(formData: FormData) {
  return new NextRequest("http://localhost/api/reports/report_1/nir-data", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/reports/[id]/nir-data", () => {
  it("does not expose JSON parser details", async () => {
    const formData = new FormData();
    formData.set("moistureReadings", '{"secret":');

    const response = await POST(postRequest(formData), {
      params: Promise.resolve({ id: "report_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.message).toBe("Invalid JSON in form data");
    // Still no JSON.parse internals (e.g. "...at position 9") leaked.
    expect(body.error.message).not.toContain("position");
  });

  it("accepts a valid image and stores the NIR update", async () => {
    const formData = new FormData();
    formData.set("moistureReadings", "[]");
    formData.append(
      "photos",
      new File(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
        "room.png",
        { type: "image/png" },
      ),
    );

    const response = await POST(postRequest(formData), {
      params: Promise.resolve({ id: "report_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.nirData.photos).toBe(1);
    expect(uploadToCloudinary).toHaveBeenCalledTimes(1);
    expect(reportUpdate).toHaveBeenCalledTimes(1);
  });

  it("rejects a spoofed image before storage or report mutation", async () => {
    const formData = new FormData();
    formData.append(
      "photos",
      new File(["%PDF-1.7"], "spoofed.jpg", { type: "image/jpeg" }),
    );

    const response = await POST(postRequest(formData), {
      params: Promise.resolve({ id: "report_1" }),
    });

    expect(response.status).toBe(400);
    expect(uploadToCloudinary).not.toHaveBeenCalled();
    expect(reportUpdate).not.toHaveBeenCalled();
  });

  it("rejects a truncated image before storage or report mutation", async () => {
    const formData = new FormData();
    formData.append(
      "photos",
      new File([new Uint8Array([0x89, 0x50, 0x4e])], "short.png", {
        type: "image/png",
      }),
    );

    const response = await POST(postRequest(formData), {
      params: Promise.resolve({ id: "report_1" }),
    });

    expect(response.status).toBe(400);
    expect(uploadToCloudinary).not.toHaveBeenCalled();
    expect(reportUpdate).not.toHaveBeenCalled();
  });

  it("rejects declared oversize photos before buffering", async () => {
    const photo = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47])],
      "large.png",
      { type: "image/png" },
    );
    Object.defineProperty(photo, "size", { value: 10 * 1024 * 1024 + 1 });
    const arrayBuffer = vi.spyOn(photo, "arrayBuffer");
    const formData = new FormData();
    formData.append("photos", photo);
    const request = postRequest(new FormData());
    vi.spyOn(request, "formData").mockResolvedValue(formData);

    const response = await POST(request, {
      params: Promise.resolve({ id: "report_1" }),
    });

    expect(response.status).toBe(413);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(uploadToCloudinary).not.toHaveBeenCalled();
    expect(reportUpdate).not.toHaveBeenCalled();
  });

  it("rejects excess photos before buffering or storage", async () => {
    const formData = new FormData();
    const firstPhoto = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47])],
      "room-0.png",
      { type: "image/png" },
    );
    const firstArrayBuffer = vi.spyOn(firstPhoto, "arrayBuffer");
    formData.append("photos", firstPhoto);
    for (let index = 1; index <= 20; index += 1) {
      formData.append(
        "photos",
        new File(
          [new Uint8Array([0x89, 0x50, 0x4e, 0x47])],
          `room-${index}.png`,
          { type: "image/png" },
        ),
      );
    }
    const request = postRequest(new FormData());
    vi.spyOn(request, "formData").mockResolvedValue(formData);

    const response = await POST(request, {
      params: Promise.resolve({ id: "report_1" }),
    });

    expect(response.status).toBe(400);
    expect(firstArrayBuffer).not.toHaveBeenCalled();
    expect(uploadToCloudinary).not.toHaveBeenCalled();
    expect(reportUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/reports/[id]/nir-data partial posts", () => {
  const existing = {
    moistureReadings: [{ location: "Kitchen wall", value: 32 }],
    affectedAreas: [{ room: "Kitchen", category: "2" }],
    scopeItems: [{ code: "REMOVE_CARPET", quantity: 12 }],
    photos: [{ url: "https://images.example/earlier.png" }],
  };

  function pngFile(name: string) {
    return new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      name,
      { type: "image/png" },
    );
  }

  function storedNirData() {
    expect(reportUpdate).toHaveBeenCalledTimes(1);
    return JSON.parse(reportUpdate.mock.calls[0][0].data.moistureReadings);
  }

  it("keeps saved readings, areas and scope items when only photos are posted (as Tier3Questions does)", async () => {
    reportFindUnique.mockResolvedValue({
      id: "report_1",
      userId: "user_1",
      moistureReadings: JSON.stringify(existing),
    });
    const formData = new FormData();
    formData.append("photos", pngFile("room.png"));
    formData.append("photoCategory_room.png", "damage");
    formData.append(
      "photoCategories",
      JSON.stringify({ damage: [{ fileName: "room.png", description: "" }] }),
    );

    const response = await POST(postRequest(formData), {
      params: Promise.resolve({ id: "report_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    const stored = storedNirData();
    expect(stored.moistureReadings).toEqual(existing.moistureReadings);
    expect(stored.affectedAreas).toEqual(existing.affectedAreas);
    expect(stored.scopeItems).toEqual(existing.scopeItems);
    expect(stored.photos.map((p: { url: string }) => p.url)).toEqual([
      "https://images.example/earlier.png",
      "https://images.example/photo.png",
    ]);
    expect(body.nirData.moistureReadings).toBe(1);
    expect(body.nirData.affectedAreas).toBe(1);
    expect(body.nirData.scopeItems).toBe(1);
    expect(body.nirData.photos).toBe(2);
  });

  it("replaces only the fields the body sends", async () => {
    reportFindUnique.mockResolvedValue({
      id: "report_1",
      userId: "user_1",
      moistureReadings: JSON.stringify(existing),
    });
    const formData = new FormData();
    formData.set("scopeItems", "[]");

    const response = await POST(postRequest(formData), {
      params: Promise.resolve({ id: "report_1" }),
    });

    expect(response.status).toBe(200);
    const stored = storedNirData();
    expect(stored.scopeItems).toEqual([]);
    expect(stored.moistureReadings).toEqual(existing.moistureReadings);
    expect(stored.affectedAreas).toEqual(existing.affectedAreas);
    expect(stored.photos).toEqual(existing.photos);
  });

  it("keeps an older bare array of readings as moistureReadings", async () => {
    reportFindUnique.mockResolvedValue({
      id: "report_1",
      userId: "user_1",
      moistureReadings: JSON.stringify(existing.moistureReadings),
    });
    const formData = new FormData();
    formData.append("photos", pngFile("room.png"));

    const response = await POST(postRequest(formData), {
      params: Promise.resolve({ id: "report_1" }),
    });

    expect(response.status).toBe(200);
    const stored = storedNirData();
    expect(stored.moistureReadings).toEqual(existing.moistureReadings);
    expect(stored.photos).toHaveLength(1);
  });
});
