import { describe, expect, it } from "vitest";
import {
  MAX_CUSTOM_SERVICES,
  SERVICE_CATALOGUE,
  draftNextServiceFollowUp,
  nextServicesFor,
  parseServicesOffered,
  serialiseServicesOffered,
  serviceLabels,
} from "../service-catalogue";

describe("servicesOffered storage", () => {
  it("round-trips through the v1 JSON", () => {
    const raw = serialiseServicesOffered({ services: ["carpet-cleaning", "water-damage"], custom: ["Pressure washing"] });
    expect(parseServicesOffered(raw)).toEqual({ services: ["water-damage", "carpet-cleaning"], custom: ["Pressure washing"] });
  });

  it("stores null when nothing is offered", () => {
    expect(serialiseServicesOffered({ services: [], custom: ["  "] })).toBeNull();
  });

  it("drops unknown ids, duplicates and non-strings", () => {
    const raw = serialiseServicesOffered({ services: ["nope", "carpet-cleaning", "carpet-cleaning", 7 as unknown as string] });
    expect(parseServicesOffered(raw).services).toEqual(["carpet-cleaning"]);
  });

  it("keeps legacy free text, matching catalogue labels case-insensitively", () => {
    expect(parseServicesOffered("Carpet cleaning, Pressure washing\nmould remediation")).toEqual({
      services: ["mould-remediation", "carpet-cleaning"],
      custom: ["Pressure washing"],
    });
  });

  it("reads a bare JSON array", () => {
    expect(parseServicesOffered('["upholstery-cleaning","Window cleaning"]')).toEqual({
      services: ["upholstery-cleaning"],
      custom: ["Window cleaning"],
    });
  });

  it("caps custom labels in number and length", () => {
    const many = Array.from({ length: 30 }, (_, i) => `Service ${i} ${"x".repeat(100)}`);
    const v = parseServicesOffered(serialiseServicesOffered({ custom: many }));
    expect(v.custom).toHaveLength(MAX_CUSTOM_SERVICES);
    expect(Math.max(...v.custom.map((c) => c.length))).toBeLessThanOrEqual(60);
  });

  it("tolerates null and empty", () => {
    expect(parseServicesOffered(null)).toEqual({ services: [], custom: [] });
    expect(parseServicesOffered("")).toEqual({ services: [], custom: [] });
  });

  it("labels catalogue services first, then custom", () => {
    expect(serviceLabels({ services: ["tile-grout-cleaning"], custom: ["Window cleaning"] })).toEqual([
      "Tile and grout cleaning",
      "Window cleaning",
    ]);
  });

  it("has unique catalogue ids", () => {
    expect(new Set(SERVICE_CATALOGUE.map((s) => s.id)).size).toBe(SERVICE_CATALOGUE.length);
  });
});

describe("next services after a claim", () => {
  const offered = { services: ["carpet-cleaning", "duct-cleaning", "upholstery-cleaning"], custom: [] };

  it("suggests only what the business offers, most relevant first", () => {
    expect(nextServicesFor("WATER", offered).map((s) => s.id)).toEqual(["carpet-cleaning", "upholstery-cleaning"]);
    expect(nextServicesFor("mould", offered).map((s) => s.id)).toEqual(["duct-cleaning", "carpet-cleaning", "upholstery-cleaning"]);
  });

  it("suggests nothing for an unknown claim type or a business offering nothing", () => {
    expect(nextServicesFor(null, offered)).toEqual([]);
    expect(nextServicesFor("WATER", { services: [], custom: [] })).toEqual([]);
  });

  it("drafts a follow-up naming at most three services and the card link", () => {
    const services = nextServicesFor("FIRE", { services: SERVICE_CATALOGUE.map((s) => s.id), custom: [] });
    const d = draftNextServiceFollowUp({
      clientName: "Jo Citizen",
      businessName: "Harbour Restorations",
      services,
      businessCardUrl: "https://restoreassist.app/contractors/harbour",
    })!;
    expect(d.body.startsWith("Hi Jo,")).toBe(true);
    expect(d.body.match(/^- /gm)).toHaveLength(3);
    expect(d.body).toContain("https://restoreassist.app/contractors/harbour");
    expect(d.subject).toContain("Harbour Restorations");
  });

  it("returns no draft when there is nothing to suggest", () => {
    expect(draftNextServiceFollowUp({ clientName: "Jo", businessName: "B", services: [] })).toBeNull();
  });
});
