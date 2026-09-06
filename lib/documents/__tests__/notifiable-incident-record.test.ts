import { describe, expect, it } from "vitest";
import {
  authorityTemplate,
  citesAnything,
  templateProse,
  formContentFor,
} from "../authority-catalogue";
import { buildProvenanceBlock } from "../provenance";
import { suggestAuthorityForms } from "../../authority-forms-suggestions";

/**
 * The eighth and last spec 9.3 document, and the only one with a statutory
 * clock attached. Serving the wrong country's rule here is the worst outcome
 * the provenance block exists to prevent.
 */

const record = () => authorityTemplate("NOTIFIABLE_INCIDENT_RECORD");

describe("the record cites the duty that governs THIS job", () => {
  it("gives an Australian job the model WHS Act duties", () => {
    const ids = buildProvenanceBlock(record(), "AU").entries.map((e) => e.id);
    expect(ids).toEqual([
      "whs.notifiable-incident-duty.au",
      "whs.incident-site-preservation.au",
    ]);
  });

  it("gives a New Zealand job the HSWA duties, and no Australian entry", () => {
    const block = buildProvenanceBlock(record(), "NZ");
    const ids = block.entries.map((e) => e.id);
    expect(ids).toEqual([
      "whs.notifiable-incident-duty.nz",
      "whs.incident-site-preservation.nz",
    ]);
    expect(block.entries.every((e) => !e.foreignToJob)).toBe(true);
    expect(block.unresolved).toEqual([]);
  });

  it("gives an Australian state the model Act rather than nothing", () => {
    for (const state of ["NSW", "QLD", "VIC", "WA"] as const) {
      const ids = buildProvenanceBlock(record(), state).entries.map((e) => e.id);
      expect(ids).toContain("whs.notifiable-incident-duty.au");
    }
  });

  it("selects nothing, and says so, when the country was never recorded", () => {
    // Guessing here would print one country's statutory duty on the other
    // country's incident.
    const block = buildProvenanceBlock(record(), null);
    expect(block.entries).toEqual([]);
    expect(block.unresolved).toEqual([
      "whs.notifiable-incident-duty",
      "whs.incident-site-preservation",
    ]);
    expect(block.notices.join(" ")).toMatch(/could not select the requirements/i);
  });
});

describe("the record's own prose asserts nothing", () => {
  it("states no hour, no year and no deadline", () => {
    // Every timing claim must arrive from the registry at render time. A "24
    // hours" typed here is precisely the defect that blocked this document.
    const prose = templateProse(record());
    expect(prose).not.toMatch(/\b\d+\s*(hours?|hrs?)\b/i);
    expect(prose).not.toMatch(/\b(19|20)\d{2}\b/);
  });

  it("asks for the moment the business became aware", () => {
    // The field the whole duty hangs on: both countries run the clock from
    // here, and it is routinely later than the incident itself.
    const prose = templateProse(record());
    expect(prose).toMatch(/became aware/i);
    expect(prose).toMatch(/the duty to notify starts running/i);
    expect(prose).toMatch(/often later than the incident itself/i);
  });

  it("asks what was disturbed as well as what was preserved", () => {
    // A permitted disturbance is only defensible if it was written down.
    expect(templateProse(record())).toMatch(/what was disturbed/i);
  });

  it("records rather than authorises: no client signatory", () => {
    // Nobody authorises an incident. Adding CLIENT here would misrepresent
    // what the document is.
    const spec = record();
    expect(spec.defaultSignatories).toEqual(["MANAGER", "CONTRACTOR"]);
    expect(spec.defaultSignatories).not.toContain("CLIENT");
  });

  it("cites by family only, and would be caught if it stopped citing", () => {
    const spec = record();
    expect(spec.citesRegulations).toEqual([]);
    expect(spec.citesRegulationFamilies).toHaveLength(2);
    expect(citesAnything(spec)).toBe(true);
    expect(JSON.parse(formContentFor(spec)).citesRegulationFamilies).toHaveLength(2);
  });
});

describe("it is offered the moment an incident exists", () => {
  it("is required when the inspection carries any WHS incident", () => {
    const s = suggestAuthorityForms({ whsIncidentCount: 1 });
    const found = s.find((x) => x.templateCode === "NOTIFIABLE_INCIDENT_RECORD");
    expect(found?.priority).toBe("required");
    expect(found?.reason).toMatch(/became aware/i);
  });

  it("is not offered when there are none", () => {
    const codes = suggestAuthorityForms({
      whsIncidentCount: 0,
      equipmentDeployed: true,
    }).map((x) => x.templateCode);
    expect(codes).not.toContain("NOTIFIABLE_INCIDENT_RECORD");
  });

  it("does not wait for anyone to classify the incident first", () => {
    // Whether an incident is legally notifiable is a judgement about facts.
    // Withholding the document until someone decides would withhold it exactly
    // when the clock is running.
    const s = suggestAuthorityForms({ whsIncidentCount: 3 });
    expect(s.some((x) => x.templateCode === "NOTIFIABLE_INCIDENT_RECORD")).toBe(true);
  });
});
