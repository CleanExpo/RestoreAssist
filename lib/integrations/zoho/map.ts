/**
 * Zoho CRM v6 field mapping.
 *
 * The record envelope `{ data, info.more_records }` is the published Get
 * Records shape (https://www.zoho.com/crm/developer/docs/api/v6/get-records.html).
 * It has not been captured from a live Zoho tenant. Callers treat a missing
 * `data` array on a non-empty object as unverified and record the key names.
 */

export type ZohoModule = "Contacts" | "Accounts" | "Deals" | "Leads";

export interface ZohoExternalClient {
  externalId: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  company?: string;
  rawData: Record<string, unknown>;
}

export interface ZohoExternalJob {
  externalId: string;
  title: string;
  status?: string;
  clientExternalId?: string;
  address?: string;
  description?: string;
  customerName?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  rawData: Record<string, unknown>;
}

export interface InboundPage {
  rows: Record<string, unknown>[];
  more: boolean;
  /** Key names only, when the body was not a record list. */
  emptyShape?: string[];
  errorCode?: string;
}

export interface RaCustomerPush {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  company?: string | null;
  zohoContactId?: string | null;
  zohoAccountId?: string | null;
}

export interface RaJobPush {
  id: string;
  number?: string | null;
  address: string;
  status: string;
  description?: string | null;
  customerName?: string | null;
  zohoDealId?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function lookupId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return text(value.id);
}

function lookupName(value: unknown): string | undefined {
  if (typeof value === "string") return text(value);
  if (!isRecord(value)) return undefined;
  return text(value.name);
}

export function joinAddress(parts: Array<string | undefined>): string | undefined {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length > 0 ? kept.join(", ") : undefined;
}

/** Stable id so a second pull updates the same ExternalClient / ExternalJob row. */
export function zohoExternalId(module: ZohoModule, id: string): string {
  const prefix =
    module === "Contacts"
      ? "contact"
      : module === "Accounts"
        ? "account"
        : module === "Deals"
          ? "deal"
          : "lead";
  return `${prefix}:${id}`;
}

/** HistoricalJob is unique on (source, externalId) globally, so include the integration. */
export function zohoHistoricalExternalId(
  integrationId: string,
  module: "Deals" | "Leads",
  id: string,
): string {
  return `${integrationId}:${module === "Deals" ? "deal" : "lead"}:${id}`;
}

export function readZohoPage(body: unknown): InboundPage {
  if (body == null) return { rows: [], more: false };
  if (Array.isArray(body)) {
    return { rows: body.filter(isRecord), more: false };
  }
  if (!isRecord(body)) return { rows: [], more: false, emptyShape: ["non-object"] };
  if (body.status === "error") {
    return {
      rows: [],
      more: false,
      emptyShape: Object.keys(body),
      errorCode: text(body.code) ?? "error",
    };
  }
  const info = isRecord(body.info) ? body.info : {};
  const more = info.more_records === true;
  if (Array.isArray(body.data)) {
    return { rows: body.data.filter(isRecord), more };
  }
  return { rows: [], more: false, emptyShape: Object.keys(body) };
}

export function mapZohoContact(row: Record<string, unknown>): ZohoExternalClient | null {
  const id = text(row.id);
  if (!id) return null;
  const first = text(row.First_Name);
  const last = text(row.Last_Name);
  const full = text(row.Full_Name);
  const name = full || [first, last].filter(Boolean).join(" ") || "Unnamed contact";
  return {
    externalId: zohoExternalId("Contacts", id),
    name,
    email: text(row.Email),
    phone: text(row.Phone) || text(row.Mobile),
    company: lookupName(row.Account_Name),
    address: joinAddress([
      text(row.Mailing_Street),
      text(row.Mailing_City),
      text(row.Mailing_State),
      text(row.Mailing_Zip),
      text(row.Mailing_Country),
    ]),
    rawData: row,
  };
}

export function mapZohoAccount(row: Record<string, unknown>): ZohoExternalClient | null {
  const id = text(row.id);
  const name = text(row.Account_Name);
  if (!id || !name) return null;
  return {
    externalId: zohoExternalId("Accounts", id),
    name,
    phone: text(row.Phone),
    address: joinAddress([
      text(row.Billing_Street),
      text(row.Billing_City),
      text(row.Billing_State),
      text(row.Billing_Code),
      text(row.Billing_Country),
    ]),
    rawData: row,
  };
}

export function mapZohoDeal(row: Record<string, unknown>): ZohoExternalJob | null {
  const id = text(row.id);
  const title = text(row.Deal_Name);
  if (!id || !title) return null;
  const accountId = lookupId(row.Account_Name);
  const contactId = lookupId(row.Contact_Name);
  return {
    externalId: zohoExternalId("Deals", id),
    title,
    status: text(row.Stage),
    clientExternalId: accountId
      ? zohoExternalId("Accounts", accountId)
      : contactId
        ? zohoExternalId("Contacts", contactId)
        : undefined,
    customerName: lookupName(row.Account_Name) || lookupName(row.Contact_Name),
    description: text(row.Description),
    rawData: row,
  };
}

export function mapZohoLead(row: Record<string, unknown>): ZohoExternalJob | null {
  const id = text(row.id);
  if (!id) return null;
  const person = text(row.Full_Name) || [text(row.First_Name), text(row.Last_Name)].filter(Boolean).join(" ");
  const company = text(row.Company);
  const title = company || person || "Unnamed lead";
  return {
    externalId: zohoExternalId("Leads", id),
    title,
    status: text(row.Lead_Status) || "LEAD",
    customerName: person || company,
    description: text(row.Description),
    address: joinAddress([
      text(row.Street),
      text(row.City),
      text(row.State),
      text(row.Zip_Code),
      text(row.Country),
    ]),
    suburb: text(row.City),
    state: text(row.State),
    postcode: text(row.Zip_Code),
    rawData: row,
  };
}

export function indexByExternalId<T extends { externalId: string }>(rows: T[]): Map<string, T> {
  const indexed = new Map<string, T>();
  for (const row of rows) indexed.set(row.externalId, row);
  return indexed;
}

export function splitPersonName(name: string): { firstName?: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { lastName: "Customer" };
  if (parts.length === 1) return { lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/** Zoho's standard deal stages. Unknown org stages fail the upsert and dead-letter. */
export function zohoDealStage(status: string): string {
  switch (status) {
    case "CLOSED":
    case "COMPLETED":
    case "ARCHIVED":
      return "Closed Won";
    case "REJECTED":
      return "Closed Lost";
    case "IN_BILLING":
    case "ESTIMATED":
      return "Negotiation/Review";
    case "SCOPED":
    case "CLASSIFIED":
    case "SUBMITTED":
    case "PROCESSING":
      return "Proposal/Price Quote";
    default:
      return "Qualification";
  }
}

export function contactUpsertBody(customer: RaCustomerPush): {
  data: Record<string, unknown>[];
  duplicate_check_fields: string[];
} {
  const name = splitPersonName(customer.name);
  const record: Record<string, unknown> = {
    Last_Name: name.lastName,
    Email: customer.email,
  };
  if (name.firstName) record.First_Name = name.firstName;
  if (customer.phone) record.Phone = customer.phone;
  if (customer.address) record.Mailing_Street = customer.address;
  if (customer.zohoAccountId) record.Account_Name = { id: customer.zohoAccountId };
  else if (customer.company) record.Account_Name = customer.company;
  if (customer.zohoContactId) record.id = customer.zohoContactId;
  return {
    data: [record],
    duplicate_check_fields: ["Email"],
  };
}

export function accountUpsertBody(customer: RaCustomerPush): {
  data: Record<string, unknown>[];
  duplicate_check_fields: string[];
} | null {
  if (!customer.company?.trim()) return null;
  const record: Record<string, unknown> = { Account_Name: customer.company.trim() };
  if (customer.phone) record.Phone = customer.phone;
  if (customer.zohoAccountId) record.id = customer.zohoAccountId;
  return { data: [record], duplicate_check_fields: ["Account_Name"] };
}

export function dealUpsertBody(job: RaJobPush): {
  data: Record<string, unknown>[];
  duplicate_check_fields: string[];
} {
  const number = job.number?.trim();
  const dealName = `${number ? `${number} — ` : ""}${job.address}`.slice(0, 120);
  const description = [
    job.description?.trim(),
    `RestoreAssist job ${job.id}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 32000);
  const record: Record<string, unknown> = {
    Deal_Name: dealName || `RestoreAssist ${job.id}`.slice(0, 120),
    Stage: zohoDealStage(job.status),
    Description: description,
  };
  if (job.zohoDealId) record.id = job.zohoDealId;
  return { data: [record], duplicate_check_fields: ["Deal_Name"] };
}

export function zohoRecordId(body: unknown): string | null {
  const page = readZohoPage(body);
  const row = page.rows[0];
  if (!row || row.status !== "success" || !isRecord(row.details)) return null;
  return text(row.details.id) ?? null;
}

export const ZOHO_MODULE_FIELDS: Record<ZohoModule, string> = {
  Contacts:
    "id,First_Name,Last_Name,Full_Name,Email,Phone,Mobile,Account_Name,Mailing_Street,Mailing_City,Mailing_State,Mailing_Zip,Mailing_Country",
  Accounts:
    "id,Account_Name,Phone,Billing_Street,Billing_City,Billing_State,Billing_Code,Billing_Country",
  Deals: "id,Deal_Name,Stage,Description,Account_Name,Contact_Name",
  Leads:
    "id,First_Name,Last_Name,Full_Name,Company,Email,Phone,Lead_Status,Street,City,State,Zip_Code,Country,Description",
};
