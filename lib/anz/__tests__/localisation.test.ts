import { describe, expect, it } from "vitest";
import {
  AUNZ_ELECTRICAL_SPEC,
  US_ELECTRICAL_SPEC,
  celsiusToFahrenheit,
  crossReferenceStandard,
  cubicFtToCubicM,
  fahrenheitToCelsius,
  ftToM,
  gppToGramsPerKg,
  gramsPerKgToGpp,
  inHgToKPa,
  inchesToMm,
  lbToKg,
  litresPerDayToPintsPerDay,
  localiseElectricalText,
  localiseForAUNZ,
  localiseProductTerm,
  localiseProductText,
  localiseRegulatoryText,
  localiseSpelling,
  pintsPerDayToLitresPerDay,
  sqFtToSqM,
  toMetric,
} from "../localisation";

describe("unit converters — reference cases", () => {
  it("10 ft² ≈ 0.929 m²", () => {
    expect(sqFtToSqM(10)).toBeCloseTo(0.929, 3);
  });

  it("100°F = 37.78°C", () => {
    expect(fahrenheitToCelsius(100)).toBeCloseTo(37.78, 2);
  });

  it("32°F = 0°C and 212°F = 100°C (freezing/boiling reference points)", () => {
    expect(fahrenheitToCelsius(32)).toBeCloseTo(0, 6);
    expect(fahrenheitToCelsius(212)).toBeCloseTo(100, 6);
  });

  it("celsiusToFahrenheit is the exact inverse of fahrenheitToCelsius", () => {
    expect(celsiusToFahrenheit(fahrenheitToCelsius(98.6))).toBeCloseTo(98.6, 9);
  });

  it("1 ft³ = 0.028316846592 m³ exactly", () => {
    expect(cubicFtToCubicM(1)).toBeCloseTo(0.028316846592, 12);
  });

  it("1 ft = 0.3048 m exactly", () => {
    expect(ftToM(1)).toBe(0.3048);
  });

  it("1 inch = 25.4 mm exactly", () => {
    expect(inchesToMm(1)).toBe(25.4);
  });

  it("1 lb = 0.45359237 kg exactly", () => {
    expect(lbToKg(1)).toBe(0.45359237);
  });

  it("69 GPP (25°C/50%RH reference in psychrometric-calculations.ts) ≈ 9.86 g/kg", () => {
    expect(gppToGramsPerKg(69)).toBeCloseTo(9.857, 3);
  });

  it("GPP <-> g/kg round-trips exactly", () => {
    expect(gramsPerKgToGpp(gppToGramsPerKg(140))).toBeCloseTo(140, 9);
  });

  it("70 US pints/day ≈ 33.12 L/day (AHAM-style dehumidifier rating)", () => {
    expect(pintsPerDayToLitresPerDay(70)).toBeCloseTo(33.12, 2);
  });

  it("litresPerDayToPintsPerDay is the exact inverse", () => {
    expect(litresPerDayToPintsPerDay(pintsPerDayToLitresPerDay(50))).toBeCloseTo(50, 9);
  });

  it("29.9213 inHg (standard atmosphere) ≈ 101.325 kPa", () => {
    expect(inHgToKPa(29.9213)).toBeCloseTo(101.325, 2);
  });

  it("toMetric dispatches by unit code and rounds the label to 2dp", () => {
    const r = toMetric(10, "ft2");
    expect(r.unit).toBe("m²");
    expect(r.value).toBeCloseTo(0.9290304, 6);
    expect(r.label).toBe("0.93 m²");
  });

  it("toMetric handles Fahrenheit", () => {
    const r = toMetric(100, "f");
    expect(r.unit).toBe("°C");
    expect(r.label).toBe("37.78 °C");
  });
});

describe("electrical localisation", () => {
  it("US spec is 120V/60Hz/15A; AU/NZ target is 230V/50Hz/10A", () => {
    expect(US_ELECTRICAL_SPEC.voltage).toBe(120);
    expect(US_ELECTRICAL_SPEC.frequencyHz).toBe(60);
    expect(US_ELECTRICAL_SPEC.standardCircuitAmps).toBe(15);
    expect(AUNZ_ELECTRICAL_SPEC.voltage).toBe(230);
    expect(AUNZ_ELECTRICAL_SPEC.frequencyHz).toBe(50);
    expect(AUNZ_ELECTRICAL_SPEC.standardCircuitAmps).toBe(10);
    expect(AUNZ_ELECTRICAL_SPEC.protectionDevice).toContain("RCD");
  });

  it("localises voltage/frequency/amperage figures in prose", () => {
    const out = localiseElectricalText(
      "Equipment is rated for 120V, 60Hz, on a 15-amp circuit.",
    );
    expect(out).toContain("230V");
    expect(out).toContain("50Hz");
    expect(out).toContain("10-amp");
  });

  it("localises GFCI, outlet, and ground/grounding terminology", () => {
    const out = localiseElectricalText(
      "Test the GFCI outlet and confirm the ground wire is grounded.",
    );
    expect(out).toContain("RCD");
    expect(out).toContain("GPO");
    expect(out.toLowerCase()).toContain("earth");
    expect(out.toLowerCase()).not.toContain("ground");
  });
});

describe("standards/regulatory cross-reference", () => {
  it("maps OSHA to WHS/Safe Work Australia (AU) and HSWA (NZ)", () => {
    const entry = crossReferenceStandard(
      "OSHA (Occupational Safety and Health Administration)",
    );
    expect(entry?.hasDirectEquivalent).toBe(true);
    expect(entry?.auEquivalent).toMatch(/WHS|Safe Work Australia/);
    expect(entry?.nzEquivalent).toMatch(/HSWA/);
  });

  it("flags NIOSH as having no direct AU/NZ equivalent rather than inventing one", () => {
    const entry = crossReferenceStandard(
      "NIOSH (National Institute for Occupational Safety and Health)",
    );
    expect(entry?.hasDirectEquivalent).toBe(false);
  });

  it("cites a real AS/NZS number for mould air sampling", () => {
    const entry = crossReferenceStandard("ANSI/IICRC mould air sampling guidance");
    expect(entry?.auEquivalent).toContain("AS/NZS 4849.1");
  });

  it("cites a real AS/NZS number for electrical test-and-tag", () => {
    const entry = crossReferenceStandard(
      "NFPA 70E / OSHA electrical test-and-tag / GFCI testing",
    );
    expect(entry?.auEquivalent).toContain("AS/NZS 3760");
  });

  it("cites real AS/NZS numbers for RPE", () => {
    const entry = crossReferenceStandard("ANSI Z88.2 (respiratory protective equipment)");
    expect(entry?.auEquivalent).toContain("AS/NZS 1715");
  });

  it("localiseRegulatoryText replaces OSHA and flags NIOSH", () => {
    const { text, flags } = localiseRegulatoryText(
      "OSHA and NIOSH guidance both apply.",
      "AU",
    );
    expect(text).toContain("Safe Work Australia");
    expect(text).toContain("NIOSH"); // left unmapped in the text itself
    expect(flags.some((f) => f.term.includes("NIOSH"))).toBe(true);
  });

  it("localiseRegulatoryText uses the NZ equivalent when region is NZ", () => {
    const { text } = localiseRegulatoryText("OSHA requires this.", "NZ");
    expect(text).toContain("HSWA");
  });
});

describe("product/terminology localisation", () => {
  it("resolves drywall/sheetrock to Gyprock via the existing materials.ts helper", () => {
    expect(localiseProductTerm("drywall")).toBe("Gyprock (plasterboard)");
    expect(localiseProductTerm("sheetrock")).toBe("Gyprock (plasterboard)");
  });

  it("localises general trade terms not covered by materials.ts", () => {
    expect(localiseProductText("Check the baseboard and the crawl space.")).toBe(
      "Check the skirting board and the subfloor space.",
    );
    expect(localiseProductText("Bring a flashlight to the attic.")).toBe(
      "Bring a torch to the roof cavity.",
    );
  });
});

describe("AU English spelling normalisation", () => {
  it("normalises common US -> AU spelling pairs, preserving case", () => {
    expect(localiseSpelling("The color of the mold is gray.")).toBe(
      "The colour of the mould is grey.",
    );
    expect(localiseSpelling("Color and Mold at sentence start.")).toBe(
      "Colour and Mould at sentence start.",
    );
  });

  it("does NOT convert ambiguous words like meter/program/practice/license", () => {
    const text = "Use the moisture meter per the drying program and practice.";
    expect(localiseSpelling(text)).toBe(text);
  });
});

describe("localiseForAUNZ top-level composer", () => {
  it("applies electrical, standards, product, and spelling layers together", () => {
    const { text, flags } = localiseForAUNZ(
      "OSHA requires a GFCI-protected 120V outlet. The drywall shows mold and gray color; check with a moisture meter.",
    );
    expect(text).toContain("Safe Work Australia");
    expect(text).toContain("RCD");
    expect(text).toContain("230V");
    expect(text).toContain("GPO");
    expect(text).toContain("mould");
    expect(text).toContain("grey");
    expect(text).toContain("colour");
    expect(text).toContain("moisture meter"); // deliberately not converted to "metre"
    expect(flags).toEqual([]);
  });

  it("flags NIOSH when applying the full pipeline", () => {
    const { flags } = localiseForAUNZ("Follow NIOSH respirator guidance.");
    expect(flags.some((f) => f.term.includes("NIOSH"))).toBe(true);
  });

  it("respects individual apply* opt-outs", () => {
    const { text } = localiseForAUNZ("120V GFCI outlet, mold color.", {
      applyElectrical: false,
    });
    expect(text).toContain("120V");
    expect(text).toContain("GFCI");
    expect(text).toContain("mould"); // spelling still applied
  });
});
