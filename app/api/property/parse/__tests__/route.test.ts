import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_1" } });
});

const FIXTURE_HTML = `<!doctype html><html><head>
<script type="application/ld+json">
{"@type":"House","address":{"streetAddress":"12 Test St","addressLocality":"Brisbane","addressRegion":"QLD"},"numberOfBedrooms":4,"numberOfBathroomsTotal":2,"floorSize":180}
</script></head><body></body></html>`;

const post = (body: object) =>
  new NextRequest("http://localhost/api/property/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/property/parse", () => {
  it("parses supplied property HTML into structured enrichment", async () => {
    const res = await POST(
      post({
        html: FIXTURE_HTML,
        sourceUrl:
          "https://www.onthehouse.com.au/property/qld/brisbane/12-test-st",
      }),
    );
    expect(res.status).toBe(200);
    const { property } = await res.json();
    expect(property.beds).toBe(4);
    expect(property.baths).toBe(2);
    expect(property.address.toLowerCase()).toContain("brisbane");
    expect(property.source).toBe("operator-parse");
  });

  it("422 when html is missing", async () => {
    const res = await POST(post({ sourceUrl: "https://x/y" }));
    expect(res.status).toBe(422);
  });

  it("422 when sourceUrl is missing", async () => {
    const res = await POST(post({ html: FIXTURE_HTML }));
    expect(res.status).toBe(422);
  });

  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(
      post({ html: FIXTURE_HTML, sourceUrl: "https://x/y" }),
    );
    expect(res.status).toBe(401);
  });
});
