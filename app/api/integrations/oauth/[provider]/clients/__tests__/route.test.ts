import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const checkIntegrationAccess = vi.fn();
const integrationFindFirst = vi.fn();
const externalClientFindMany = vi.fn();
const clientFindFirst = vi.fn();
const clientUpsert = vi.fn();
const externalClientUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/integrations/subscription-guard", () => ({
  checkIntegrationAccess: (...args: unknown[]) =>
    checkIntegrationAccess(...args),
  createSubscriptionRequiredResponse: (result: unknown) => ({
    error: "Subscription required",
    result,
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findFirst: (...args: unknown[]) => integrationFindFirst(...args),
    },
    externalClient: {
      findMany: (...args: unknown[]) => externalClientFindMany(...args),
      update: (...args: unknown[]) => externalClientUpdate(...args),
    },
    client: {
      findFirst: (...args: unknown[]) => clientFindFirst(...args),
      upsert: (...args: unknown[]) => clientUpsert(...args),
    },
  },
}));

import { POST } from "../route";

function postRequest(body: unknown) {
  return new NextRequest(
    "http://localhost/api/integrations/oauth/xero/clients",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

function routeContext() {
  return { params: Promise.resolve({ provider: "xero" }) };
}

beforeEach(() => {
  getServerSession.mockReset();
  checkIntegrationAccess.mockReset();
  integrationFindFirst.mockReset();
  externalClientFindMany.mockReset();
  clientFindFirst.mockReset();
  clientUpsert.mockReset();
  externalClientUpdate.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  checkIntegrationAccess.mockResolvedValue({ isAllowed: true });
  integrationFindFirst.mockResolvedValue({ id: "integration_1" });
});

describe("POST /api/integrations/oauth/[provider]/clients", () => {
  it("creates exactly one Client per external client and links contactId", async () => {
    externalClientFindMany.mockResolvedValue([
      {
        id: "ext_1",
        externalId: "xero-1",
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "0400000000",
        address: "1 Test St",
        contactId: null,
      },
    ]);
    clientUpsert.mockResolvedValue({ id: "client_1" });
    externalClientUpdate.mockResolvedValue({});

    const response = await POST(postRequest({ clientIds: ["xero-1"] }), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.imported).toBe(1);
    expect(body.errors).toEqual([]);

    // Find-or-create by (userId, email) — never a bare create.
    expect(clientUpsert).toHaveBeenCalledTimes(1);
    expect(clientUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_email: { userId: "user_1", email: "jane@example.com" } },
      }),
    );

    // Link is written back onto ExternalClient.contactId (no `as any` needed).
    expect(externalClientUpdate).toHaveBeenCalledWith({
      where: { id: "ext_1" },
      data: { contactId: "client_1" },
    });
  });

  it("is idempotent on re-import — does not create a second Client for an already-linked external", async () => {
    externalClientFindMany.mockResolvedValue([
      {
        id: "ext_1",
        externalId: "xero-1",
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "0400000000",
        address: "1 Test St",
        contactId: "client_1", // already imported previously
      },
    ]);
    clientFindFirst.mockResolvedValue({ id: "client_1" }); // link still valid

    const response = await POST(postRequest({ clientIds: ["xero-1"] }), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.imported).toBe(1);
    expect(clientUpsert).not.toHaveBeenCalled();
    expect(externalClientUpdate).not.toHaveBeenCalled();
  });

  it("gives an email-less external client a stable placeholder email instead of colliding on empty string", async () => {
    externalClientFindMany.mockResolvedValue([
      {
        id: "ext_2",
        externalId: "xero-2",
        name: "No Email Co",
        email: null,
        phone: null,
        address: null,
        contactId: null,
      },
    ]);
    clientUpsert.mockResolvedValue({ id: "client_2" });
    externalClientUpdate.mockResolvedValue({});

    const response = await POST(postRequest({ clientIds: ["xero-2"] }), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.imported).toBe(1);
    expect(clientUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_email: {
            userId: "user_1",
            email: "ext-integration_1-xero-2@client.local",
          },
        },
      }),
    );
  });

  it("re-links an external client whose Client was deleted instead of leaving it orphaned", async () => {
    externalClientFindMany.mockResolvedValue([
      {
        id: "ext_1",
        externalId: "xero-1",
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "0400000000",
        address: "1 Test St",
        contactId: "client_deleted",
      },
    ]);
    clientFindFirst.mockResolvedValue(null); // stale link — Client no longer exists
    clientUpsert.mockResolvedValue({ id: "client_new" });
    externalClientUpdate.mockResolvedValue({});

    const response = await POST(postRequest({ clientIds: ["xero-1"] }), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.imported).toBe(1);
    expect(clientUpsert).toHaveBeenCalledTimes(1);
    expect(externalClientUpdate).toHaveBeenCalledWith({
      where: { id: "ext_1" },
      data: { contactId: "client_new" },
    });
  });

  it("does not NULL a user's curated phone/address when the imported external lacks them", async () => {
    // Adopting a pre-existing same-email Client the user created: the provider
    // record has no phone/address. The update payload must send `undefined`
    // (Prisma: "leave unchanged"), never null, so curated data is preserved.
    externalClientFindMany.mockResolvedValue([
      {
        id: "ext_3",
        externalId: "xero-3",
        name: "Jane Doe",
        email: "jane@example.com",
        phone: null,
        address: null,
        contactId: null,
      },
    ]);
    clientUpsert.mockResolvedValue({ id: "client_existing" });
    externalClientUpdate.mockResolvedValue({});

    const response = await POST(postRequest({ clientIds: ["xero-3"] }), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.imported).toBe(1);

    const upsertArg = clientUpsert.mock.calls[0][0];
    expect(upsertArg.update).toEqual({
      name: "Jane Doe",
      phone: undefined,
      address: undefined,
    });
    // Explicit guard against the regression: null would overwrite the field.
    expect(upsertArg.update.phone).not.toBeNull();
    expect(upsertArg.update.address).not.toBeNull();
  });

  it("still refreshes phone/address in the update branch when the external supplies them", async () => {
    externalClientFindMany.mockResolvedValue([
      {
        id: "ext_4",
        externalId: "xero-4",
        name: "Acme Restorations",
        email: "acme@example.com",
        phone: "0411111111",
        address: "9 New Rd",
        contactId: null,
      },
    ]);
    clientUpsert.mockResolvedValue({ id: "client_acme" });
    externalClientUpdate.mockResolvedValue({});

    const response = await POST(postRequest({ clientIds: ["xero-4"] }), routeContext());
    await response.json();

    const upsertArg = clientUpsert.mock.calls[0][0];
    expect(upsertArg.update).toEqual({
      name: "Acme Restorations",
      phone: "0411111111",
      address: "9 New Rd",
    });
  });
});
