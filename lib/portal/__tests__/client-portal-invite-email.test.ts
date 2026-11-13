import { describe, expect, it } from "vitest";
import {
  buildClientPortalInviteEmailHtml,
  clientPortalInviteSubject,
} from "../client-portal-invite-email";

describe("client-portal-invite-email", () => {
  it("builds contractor-branded subject and escaped HTML", () => {
    expect(clientPortalInviteSubject("Acme Resto")).toBe(
      "Acme Resto — your secure claim portal",
    );
    const html = buildClientPortalInviteEmailHtml({
      url: "https://app.test/portal/abc<script>",
      contractorName: "Acme & Co",
      clientName: "Sam <test>",
      inspectionNumber: "RA-1",
      propertyAddress: "1 Main St",
    });
    expect(html).toContain("Acme &amp; Co");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Sam &lt;test&gt;");
    expect(html).toContain("https://app.test/portal/abc&lt;script&gt;");
  });
});
