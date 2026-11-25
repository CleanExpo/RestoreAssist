/**
 * Mining pilot slice 6: what a training record accepts, and how its links,
 * dates and expiry status are read back.
 */
import { describe, expect, it } from "vitest";
import {
  carsiCompletionHref,
  createTrainingRecordSchema,
  evidenceHref,
  isCarsiCompletionRef,
  parseDateOnly,
  trainingStatus,
  updateTrainingRecordSchema,
} from "../record-input";

const base = {
  staffUserId: "tech1",
  course: "Level 3 Mould Remediation",
  provider: "CARSI",
  completedOn: "2026-10-01",
};

describe("parseDateOnly", () => {
  it("accepts a real calendar date as UTC midnight", () => {
    expect(parseDateOnly("2026-02-28")?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
  it("refuses impossible or badly formatted dates", () => {
    for (const v of ["2026-02-30", "2026-13-01", "01/10/2026", "2026-1-1", ""]) {
      expect(parseDateOnly(v)).toBeNull();
    }
  });
});

describe("CARSI reference", () => {
  it("accepts a carsi.com.au https link or a certificate id", () => {
    expect(isCarsiCompletionRef("https://carsi.com.au/certificates/ABC-123")).toBe(true);
    expect(isCarsiCompletionRef("https://www.carsi.com.au/c/1")).toBe(true);
    expect(isCarsiCompletionRef("CARSI-2026-00042")).toBe(true);
  });
  it("refuses another site, a look-alike host, plain http and script links", () => {
    for (const v of [
      "https://example.com/carsi",
      "https://carsi.com.au.evil.example/x",
      "https://notcarsi.com.au/x",
      "http://carsi.com.au/x",
      "javascript:alert(1)",
      "id with spaces",
    ]) {
      expect(isCarsiCompletionRef(v)).toBe(false);
    }
  });
  it("only a CARSI link becomes clickable; a certificate id stays text", () => {
    expect(carsiCompletionHref("https://carsi.com.au/c/1")).toBe("https://carsi.com.au/c/1");
    expect(carsiCompletionHref("CARSI-2026-00042")).toBeNull();
    expect(carsiCompletionHref(null)).toBeNull();
  });
});

describe("evidence link", () => {
  it("only http and https links are clickable", () => {
    expect(evidenceHref("https://drive.example/file")).toBe("https://drive.example/file");
    expect(evidenceHref("javascript:alert(1)")).toBeNull();
    expect(evidenceHref("data:text/html,hi")).toBeNull();
  });
});

describe("createTrainingRecordSchema", () => {
  it("accepts a record with no CARSI data at all", () => {
    const r = createTrainingRecordSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("treats empty optional fields as cleared", () => {
    const r = createTrainingRecordSchema.parse({
      ...base,
      expiresOn: "",
      evidenceUrl: " ",
      carsiCompletionRef: "",
    });
    expect(r.expiresOn).toBeNull();
    expect(r.evidenceUrl).toBeNull();
    expect(r.carsiCompletionRef).toBeNull();
  });

  it("refuses keys a caller must not choose (organisation, recorder, id)", () => {
    for (const extra of [
      { organizationId: "org_b" },
      { recordedByUserId: "x" },
      { id: "rec_1" },
    ]) {
      expect(createTrainingRecordSchema.safeParse({ ...base, ...extra }).success).toBe(false);
    }
  });

  it("refuses an expiry before completion", () => {
    const r = createTrainingRecordSchema.safeParse({ ...base, expiresOn: "2026-09-30" });
    expect(r.success).toBe(false);
  });

  it("refuses a script evidence link and a non-CARSI CARSI link", () => {
    expect(
      createTrainingRecordSchema.safeParse({ ...base, evidenceUrl: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(
      createTrainingRecordSchema.safeParse({ ...base, carsiCompletionRef: "https://example.com" }).success,
    ).toBe(false);
  });

  it("refuses an empty course or provider", () => {
    expect(createTrainingRecordSchema.safeParse({ ...base, course: "  " }).success).toBe(false);
    expect(createTrainingRecordSchema.safeParse({ ...base, provider: "" }).success).toBe(false);
  });
});

describe("updateTrainingRecordSchema", () => {
  it("cannot move a record to another staff member or organisation", () => {
    expect(updateTrainingRecordSchema.safeParse({ staffUserId: "other" }).success).toBe(false);
    expect(updateTrainingRecordSchema.safeParse({ organizationId: "org_b" }).success).toBe(false);
  });
  it("leaves unsent fields undefined", () => {
    const r = updateTrainingRecordSchema.parse({ course: "New name" });
    expect(r.expiresOn).toBeUndefined();
    expect(r.carsiCompletionRef).toBeUndefined();
  });
});

describe("trainingStatus", () => {
  const today = "2026-11-23";
  it("reads no expiry, expired, expiring within 30 days and current", () => {
    expect(trainingStatus(null, today)).toBe("no-expiry");
    expect(trainingStatus("2026-11-22", today)).toBe("expired");
    expect(trainingStatus("2026-11-23", today)).toBe("expiring");
    expect(trainingStatus("2026-12-23", today)).toBe("expiring");
    expect(trainingStatus("2026-12-24", today)).toBe("current");
  });
});
