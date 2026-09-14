import { describe, expect, it } from "vitest";
import {
  UPLOAD_PDF_TRIAL_BODY,
  UPLOAD_PDF_TRIAL_TITLE,
} from "@/lib/reports/upload-pdf-copy";

describe("upload-pdf trial copy", () => {
  it("explains why Upload PDF is disabled and what makes it available", () => {
    expect(UPLOAD_PDF_TRIAL_TITLE).toMatch(/paid plans/i);
    expect(UPLOAD_PDF_TRIAL_BODY).toMatch(/trial cannot extract/i);
    expect(UPLOAD_PDF_TRIAL_BODY).toMatch(/paid subscription/i);
    expect(UPLOAD_PDF_TRIAL_BODY).not.toMatch(/unlock/i);
  });
});
