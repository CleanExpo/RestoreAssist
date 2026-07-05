import { describe, it, expect } from "vitest";
import {
  generateInvoiceSentEmail,
  generatePaymentReceivedEmail,
  generateOverdueReminderEmail,
  generateUpcomingPaymentReminderEmail,
} from "../email-templates";

/**
 * Regression guard for HTML injection via user-controlled invoice fields.
 * paymentMethod, reference, businessEmail and businessPhone flow from user
 * input into email HTML and MUST be escaped (CLAUDE.md rule 10). Prior to the
 * fix these were interpolated raw, so a "<script>" reference or a
 * "javascript:"/markup-bearing businessEmail rendered as live HTML.
 */

const XSS = `"><script>alert('xss')</script>`;
const ESCAPED_SCRIPT = "&lt;script&gt;";

function expectNoLiveScript(html: string) {
  // The raw payload must never appear verbatim; its "<" must be entity-encoded.
  expect(html).not.toContain("<script>alert('xss')</script>");
  expect(html).toContain(ESCAPED_SCRIPT);
}

describe("email-templates HTML escaping", () => {
  const baseInvoice = {
    invoiceNumber: "INV-0001",
    invoiceDate: new Date("2026-01-01"),
    dueDate: new Date("2026-01-15"),
    totalIncGST: 11000,
    amountDue: 11000,
    customerName: "Acme",
    publicToken: "tok123",
    businessName: "Biz",
    appUrl: "https://example.com",
  };

  it("escapes businessEmail and businessPhone in generateInvoiceSentEmail", () => {
    const html = generateInvoiceSentEmail({
      ...baseInvoice,
      businessEmail: XSS,
      businessPhone: XSS,
    });
    expectNoLiveScript(html);
  });

  it("escapes paymentMethod and reference in generatePaymentReceivedEmail", () => {
    const html = generatePaymentReceivedEmail({
      invoiceNumber: "INV-0001",
      paymentDate: new Date("2026-01-10"),
      amountPaid: 11000,
      paymentMethod: XSS,
      reference: XSS,
      customerName: "Acme",
      businessName: "Biz",
      remainingBalance: 0,
    });
    expectNoLiveScript(html);
    // Both injected fields are present and escaped.
    expect(html.match(new RegExp(ESCAPED_SCRIPT, "g"))?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("escapes businessEmail and businessPhone in generateOverdueReminderEmail", () => {
    const html = generateOverdueReminderEmail({
      invoiceNumber: "INV-0001",
      dueDate: new Date("2026-01-01"),
      daysOverdue: 10,
      amountDue: 11000,
      customerName: "Acme",
      publicToken: "tok123",
      businessName: "Biz",
      businessEmail: XSS,
      businessPhone: XSS,
      appUrl: "https://example.com",
    });
    expectNoLiveScript(html);
  });

  it("escapes businessEmail and businessPhone in generateUpcomingPaymentReminderEmail", () => {
    const html = generateUpcomingPaymentReminderEmail({
      invoiceNumber: "INV-0001",
      dueDate: new Date("2026-01-20"),
      daysUntilDue: 3,
      amountDue: 11000,
      customerName: "Acme",
      publicToken: "tok123",
      businessName: "Biz",
      businessEmail: XSS,
      businessPhone: XSS,
      appUrl: "https://example.com",
    });
    expectNoLiveScript(html);
  });

  // invoiceNumber flows from user-controlled invoice data into the <title>,
  // headers and detail rows of every template and MUST also be escaped.
  it("escapes invoiceNumber in generateInvoiceSentEmail (incl. <title>)", () => {
    const html = generateInvoiceSentEmail({ ...baseInvoice, invoiceNumber: XSS });
    expectNoLiveScript(html);
  });

  it("escapes invoiceNumber in generatePaymentReceivedEmail", () => {
    const html = generatePaymentReceivedEmail({
      invoiceNumber: XSS,
      paymentDate: new Date("2026-01-10"),
      amountPaid: 11000,
      paymentMethod: "Card",
      customerName: "Acme",
      businessName: "Biz",
      remainingBalance: 0,
    });
    expectNoLiveScript(html);
  });

  it("escapes invoiceNumber in generateOverdueReminderEmail", () => {
    const html = generateOverdueReminderEmail({
      invoiceNumber: XSS,
      dueDate: new Date("2026-01-01"),
      daysOverdue: 10,
      amountDue: 11000,
      customerName: "Acme",
      publicToken: "tok123",
      businessName: "Biz",
      appUrl: "https://example.com",
    });
    expectNoLiveScript(html);
  });

  it("escapes invoiceNumber in generateUpcomingPaymentReminderEmail", () => {
    const html = generateUpcomingPaymentReminderEmail({
      invoiceNumber: XSS,
      dueDate: new Date("2026-01-20"),
      daysUntilDue: 3,
      amountDue: 11000,
      customerName: "Acme",
      publicToken: "tok123",
      businessName: "Biz",
      appUrl: "https://example.com",
    });
    expectNoLiveScript(html);
  });
});
