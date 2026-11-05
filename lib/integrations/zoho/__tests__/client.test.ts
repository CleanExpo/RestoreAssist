/**
 * Zoho token refresh and CRM calls. The JSON fixtures follow Zoho's published
 * token and v6 record envelopes. They are not a live tenant capture.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ row: {} as Record<string, unknown> }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findUnique: vi.fn(async ({ select }: { select?: Record<string, boolean> }) =>
        select
          ? Object.fromEntries(Object.keys(select).map((key) => [key, state.row[key]]))
          : state.row,
      ),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(state.row, data)),
    },
  },
}));
vi.mock("@/lib/credential-vault", () => ({
  decrypt: (value: string) => value.replace(/^encrypted:/, ""),
  encrypt: (value: string) => `encrypted:${value}`,
}));
vi.mock("@/lib/integrations/dev-mode", () => ({
  isIntegrationDevMode: () => false,
  MOCK_CREDENTIALS: {},
}));

import { ZohoClient } from "../client";

const SECRET_REFRESH = "1000.secret-refresh";
const SECRET_ACCESS = "1000.secret-access";

function genuine() {
  return {
    id: "zoho-1",
    userId: "owner-1",
    provider: "ZOHO",
    name: "Zoho CRM",
    icon: "/integrations/zoho-logo.svg",
    config: null,
    status: "CONNECTED",
    tenantId: "https://www.zohoapis.com.au",
    realmId: null,
    companyId: "AU",
    tokenExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
    accessToken: `encrypted:${SECRET_ACCESS}`,
    refreshToken: `encrypted:${SECRET_REFRESH}`,
  };
}

beforeEach(() => {
  state.row = genuine();
  vi.stubEnv("ZOHO_CLIENT_ID", "synthetic-zoho-client");
  vi.stubEnv("ZOHO_CLIENT_SECRET", "synthetic-zoho-secret");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Zoho token refresh", () => {
  it("posts to the Australian accounts host and keeps the existing refresh token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            access_token: "1000.new-access",
            expires_in: 3600,
            api_domain: "https://www.zohoapis.com.au",
            token_type: "Bearer",
          }),
          { status: 200 },
        ),
      ),
    );
    await new ZohoClient("zoho-1").refreshAccessToken();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("https://accounts.zoho.com.au/oauth/v2/token");
    const body = String(init?.body);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain(encodeURIComponent(SECRET_REFRESH));
    expect(state.row.accessToken).toBe("encrypted:1000.new-access");
    expect(state.row.refreshToken).toBe(`encrypted:${SECRET_REFRESH}`);
    expect(state.row.status).toBe("CONNECTED");
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain(SECRET_REFRESH);
    expect(logged).not.toContain("1000.new-access");
  });

  it("disconnects on invalid_grant and does not log the refresh token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })),
    );
    await expect(new ZohoClient("zoho-1").refreshAccessToken()).rejects.toThrow(
      /token refresh was rejected/i,
    );
    expect(state.row.status).toBe("DISCONNECTED");
    expect(state.row.accessToken).toBeNull();
    expect(state.row.refreshToken).toBeNull();
    const logged = [
      ...vi.mocked(console.error).mock.calls,
      ...vi.mocked(console.log).mock.calls,
    ]
      .flat()
      .join(" ");
    expect(logged).not.toContain(SECRET_REFRESH);
    expect(logged).not.toContain(SECRET_ACCESS);
  });

  it("uses the European accounts host when the stored API domain is Europe", async () => {
    state.row = { ...genuine(), tenantId: "https://www.zohoapis.eu", companyId: "AU" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ access_token: "1000.eu-access", expires_in: 3600 }), { status: 200 }),
      ),
    );
    await new ZohoClient("zoho-1").refreshAccessToken();
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe("https://accounts.zoho.eu/oauth/v2/token");
  });
});

describe("Zoho CRM reads and upserts", () => {
  it("pulls contacts from the allowlisted API domain and keeps one row per id", async () => {
    const contact = {
      id: "554023000000527002",
      First_Name: "Pat",
      Last_Name: "Nguyen",
      Full_Name: "Pat Nguyen",
      Email: "pat@example.com",
      Phone: "0290000000",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/Contacts")) {
          return new Response(
            JSON.stringify({ data: [contact], info: { more_records: false, count: 1, page: 1, per_page: 200 } }),
            { status: 200 },
          );
        }
        return new Response(null, { status: 204 });
      }),
    );
    const client = new ZohoClient("zoho-1");
    const first = await client.fetchClients();
    const second = await client.fetchClients();
    const ids = new Set([...first, ...second].map((row) => row.externalId));
    expect(ids).toEqual(new Set(["contact:554023000000527002"]));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("https://www.zohoapis.com.au/crm/v6/Contacts?");
    expect(String(url)).toContain("fields=");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Zoho-oauthtoken ${SECRET_ACCESS}`);
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain(SECRET_ACCESS);
  });

  it("upserts a contact and returns the Zoho record id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{
              code: "SUCCESS",
              status: "success",
              message: "record updated",
              details: { id: "554023000000527002" },
            }],
          }),
          { status: 200 },
        ),
      ),
    );
    const id = await new ZohoClient("zoho-1").upsertRecord("Contacts", {
      data: [{ Last_Name: "Nguyen", Email: "pat@example.com" }],
      duplicate_check_fields: ["Email"],
    });
    expect(id).toBe("554023000000527002");
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("https://www.zohoapis.com.au/crm/v6/Contacts/upsert");
    const sent = JSON.parse(String(init?.body));
    expect(sent.duplicate_check_fields).toEqual(["Email"]);
    expect(sent.data[0].Email).toBe("pat@example.com");
    expect(JSON.stringify(sent)).not.toContain(SECRET_ACCESS);
  });

  it("refuses an api_domain that is not a Zoho host", async () => {
    state.row = { ...genuine(), tenantId: "https://evil.example" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    await new ZohoClient("zoho-1").fetchClients();
    for (const [url] of vi.mocked(fetch).mock.calls) {
      expect(String(url).startsWith("https://www.zohoapis.com.au/")).toBe(true);
    }
  });
});
