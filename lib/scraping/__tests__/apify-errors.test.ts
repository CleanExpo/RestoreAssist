import { afterEach, describe, expect, it, vi } from "vitest";
import { describeApifyHttpError, fetchViaApify } from "../providers/apify";

describe("describeApifyHttpError", () => {
  it("maps permission-approval 403 separately from a bad token", () => {
    expect(
      describeApifyHttpError(403, {
        error: { type: "full-permission-actor-not-approved" },
      }).message,
    ).toMatch(/permission approval/i);
    expect(describeApifyHttpError(401, null).message).toMatch(/token/i);
    expect(describeApifyHttpError(402, null).message).toMatch(/credits/i);
  });
});

describe("fetchViaApify", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs the Domain actor and returns mapped HTML", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            address: "1 Example Street",
            seo_url:
              "https://www.domain.com.au/1-example-street-qld-4122-2020000001",
            bedroom_count: 3,
            media: [
              {
                type: "floor_plan",
                image_url: "https://rimh2.domain.com.au/plan.png",
              },
            ],
          },
        ]),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchViaApify(
      "https://www.domain.com.au/1-example-street-qld-4122-2020000001",
      "test-token",
    );

    expect(result.status).toBe(200);
    expect(result.html).toContain("__NEXT_DATA__");
    expect(result.html).toContain("floor_plan");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "dz_omar~domain-scraper",
    );
  });

  it("throws a clear error when the actor is not approved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              type: "full-permission-actor-not-approved",
              message: "approve first",
            },
          }),
          { status: 403 },
        ),
      ),
    );

    await expect(
      fetchViaApify("https://www.onthehouse.com.au/property/x", "test-token"),
    ).rejects.toThrow(/permission approval/i);
  });
});
