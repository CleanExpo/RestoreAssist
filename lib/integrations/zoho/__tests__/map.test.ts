/**
 * Zoho CRM mappers. Fixtures follow the published v6 `{ data, info }` envelope
 * and the upsert `{ data: [{ status, details.id }] }` envelope. They are not
 * a live tenant capture — the import stays unverified until a sandbox run.
 */
import { describe, expect, it } from "vitest";
import {
  accountUpsertBody,
  contactUpsertBody,
  dealUpsertBody,
  indexByExternalId,
  mapZohoAccount,
  mapZohoContact,
  mapZohoDeal,
  mapZohoLead,
  readZohoPage,
  zohoDealStage,
  zohoExternalId,
} from "../map";
import { allowApiDomain, resolveZohoRegion } from "../regions";
import { redactSecrets } from "../redact";

const CONTACT = {
  id: "554023000000527002",
  First_Name: "Pat",
  Last_Name: "Nguyen",
  Full_Name: "Pat Nguyen",
  Email: "pat@example.com",
  Phone: "0290000000",
  Account_Name: { name: "Nguyen Restorations", id: "554023000000527099" },
  Mailing_City: "Sydney",
  Mailing_State: "NSW",
  Mailing_Zip: "2000",
  Mailing_Country: "Australia",
};

describe("Zoho inbound mapping", () => {
  it("reads the published data envelope and ignores an unknown host", () => {
    const page = readZohoPage({
      data: [CONTACT],
      info: { per_page: 200, count: 1, page: 1, more_records: false },
    });
    expect(page.rows).toHaveLength(1);
    expect(page.more).toBe(false);
    expect(page.rows[0]).toHaveProperty("Email", "pat@example.com");
    expect(allowApiDomain("https://evil.example")).toBeNull();
    expect(allowApiDomain("https://www.zohoapis.com.au")).toBe("https://www.zohoapis.com.au");
    expect(resolveZohoRegion({ apiDomain: "https://www.zohoapis.eu", companyId: "AU" })).toBe("EU");
  });

  it("maps contacts, accounts, deals and leads onto stable external ids", () => {
    const contact = mapZohoContact(CONTACT);
    const account = mapZohoAccount({
      id: "554023000000527099",
      Account_Name: "Nguyen Restorations",
      Phone: "0291111111",
      Billing_City: "Sydney",
    });
    const deal = mapZohoDeal({
      id: "554023000000528000",
      Deal_Name: "Water loss — Surry Hills",
      Stage: "Proposal/Price Quote",
      Account_Name: { name: "Nguyen Restorations", id: "554023000000527099" },
    });
    const lead = mapZohoLead({
      id: "554023000000529000",
      Last_Name: "Lee",
      Company: "Lee Holdings",
      Email: "lee@example.com",
      Lead_Status: "New",
      City: "Auckland",
    });
    expect(contact).toMatchObject({
      externalId: "contact:554023000000527002",
      name: "Pat Nguyen",
      email: "pat@example.com",
      company: "Nguyen Restorations",
    });
    expect(account?.externalId).toBe("account:554023000000527099");
    expect(deal?.clientExternalId).toBe(zohoExternalId("Accounts", "554023000000527099"));
    expect(lead).toMatchObject({
      externalId: "lead:554023000000529000",
      title: "Lee Holdings",
      suburb: "Auckland",
    });
  });

  it("does not duplicate a contact when the same page is applied twice", () => {
    const first = [mapZohoContact(CONTACT)!];
    const second = [mapZohoContact({ ...CONTACT, Phone: "0400000000" })!];
    const indexed = indexByExternalId([...first, ...second]);
    expect(indexed.size).toBe(1);
    expect(indexed.get("contact:554023000000527002")?.phone).toBe("0400000000");
  });

  it("records key names when a 200 body is not a record list", () => {
    const page = readZohoPage({ code: "REQUIRED_PARAM_MISSING", status: "error" });
    expect(page.rows).toEqual([]);
    expect(page.errorCode).toBe("REQUIRED_PARAM_MISSING");
    expect(page.emptyShape).toEqual(expect.arrayContaining(["code", "status"]));
  });
});

describe("Zoho outbound mapping", () => {
  it("upserts a customer by email and a job by deal name and stage", () => {
    expect(contactUpsertBody({
      id: "client_1",
      name: "Pat Nguyen",
      email: "pat@example.com",
      phone: "0400000000",
      company: "Nguyen Restorations",
    })).toEqual({
      data: [{
        First_Name: "Pat",
        Last_Name: "Nguyen",
        Email: "pat@example.com",
        Phone: "0400000000",
        Account_Name: "Nguyen Restorations",
      }],
      duplicate_check_fields: ["Email"],
    });
    expect(accountUpsertBody({
      id: "client_1",
      name: "Pat Nguyen",
      email: "pat@example.com",
      company: "Nguyen Restorations",
      zohoAccountId: "account-1",
    })?.data[0]).toMatchObject({ id: "account-1", Account_Name: "Nguyen Restorations" });
    const deal = dealUpsertBody({
      id: "job_1",
      number: "NIR-2026-11-0001",
      address: "1 Harbour St, Sydney",
      status: "CLOSED",
      description: "Ceiling collapse",
      zohoDealId: "deal-1",
    });
    expect(deal.duplicate_check_fields).toEqual(["Deal_Name"]);
    expect(deal.data[0]).toMatchObject({
      id: "deal-1",
      Stage: "Closed Won",
      Deal_Name: "NIR-2026-11-0001 — 1 Harbour St, Sydney",
    });
    expect(String(deal.data[0].Description)).toContain("RestoreAssist job job_1");
    expect(zohoDealStage("SUBMITTED")).toBe("Proposal/Price Quote");
    expect(zohoDealStage("REJECTED")).toBe("Closed Lost");
  });
});

describe("Zoho secret redaction", () => {
  it("removes access and refresh tokens from a provider body", () => {
    const raw = '{"access_token":"1000.secret-access","refresh_token":"1000.secret-refresh","error":"invalid_grant"}';
    const safe = redactSecrets(raw);
    expect(safe).not.toContain("secret-access");
    expect(safe).not.toContain("secret-refresh");
    expect(safe).toContain("invalid_grant");
  });
});
