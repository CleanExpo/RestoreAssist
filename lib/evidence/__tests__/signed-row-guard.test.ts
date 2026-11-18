/**
 * RA-8388 AMENDMENT 05 - the one rule about rows a signature vouches for.
 *
 * These pin the rule itself. The routes that call it are tested beside each
 * route; what matters here is that the rule is narrow in exactly the two
 * directions it has to be: it catches every change to a signed value, and it
 * does not refuse a save that changes nothing.
 */
import { describe, expect, it } from "vitest";

import {
  SIGNED_ENVIRONMENTAL_FIELDS,
  SIGNED_MOISTURE_FIELDS,
  SignedRowError,
  changedSignedFields,
  evidenceBacksReadingRefusal,
  isSignedRow,
  signedRowRefusal,
  withoutSignedFields,
} from "../signed-row-guard";
import { METADATA_FIELDS } from "../metadata-fields";
import { deriveAuthoritativeRow } from "../authoritative-rows";

const STORED = {
  id: "mr_1",
  evidenceItemId: "ev_1",
  location: "Kitchen north wall",
  surfaceType: "Plasterboard",
  moistureLevel: 18.4,
  depth: "Surface",
};

describe("which rows are signed", () => {
  it("a row with an evidence link is signed", () => {
    expect(isSignedRow({ evidenceItemId: "ev_1" })).toBe(true);
  });

  it("a row with no link, a null link or an empty link is not", () => {
    expect(isSignedRow({})).toBe(false);
    expect(isSignedRow({ evidenceItemId: null })).toBe(false);
    expect(isSignedRow({ evidenceItemId: "" })).toBe(false);
  });
});

describe("the signed columns are the ones the signed payload produces", () => {
  // The list in the guard and the row the dual write derives must not drift:
  // a column the signature covers but the guard does not name is a column
  // another screen may silently rewrite.
  it("covers every value a signed moisture capture writes from the technician's entry", () => {
    const derived = deriveAuthoritativeRow(
      "MOISTURE_READING",
      {
        location: "Kitchen north wall",
        surfaceType: "Plasterboard",
        moistureLevel: 18.4,
        depth: "Surface",
      },
      { inspectionId: "ins_1", capturedAt: new Date(), notes: null },
    );
    if (!derived.ok || !derived.plan) throw new Error("fixture did not derive");
    const entered = METADATA_FIELDS.MOISTURE_READING.filter((f) => f.required).map(
      (f) => f.key,
    );
    for (const key of entered) {
      expect(key in derived.plan.data, `${key} is written to the row`).toBe(true);
      expect(SIGNED_MOISTURE_FIELDS as readonly string[]).toContain(key);
    }
  });

  it("covers every value a signed ambient capture writes from the technician's entry", () => {
    const entered = METADATA_FIELDS.AMBIENT_ENVIRONMENTAL.filter(
      (f) => f.required,
    ).map((f) => f.key);
    expect(entered.length).toBeGreaterThan(0);
    for (const key of entered) {
      expect(SIGNED_ENVIRONMENTAL_FIELDS as readonly string[]).toContain(key);
    }
  });
});

describe("what counts as a change to a signed value", () => {
  it("an unchanged resubmission changes nothing", () => {
    expect(
      changedSignedFields("moistureReading", STORED, {
        location: "Kitchen north wall",
        surfaceType: "Plasterboard",
        moistureLevel: 18.4,
        depth: "Surface",
      }),
    ).toEqual([]);
  });

  it("names the reading when only the reading changed", () => {
    expect(
      changedSignedFields("moistureReading", STORED, {
        location: "Kitchen north wall",
        surfaceType: "Plasterboard",
        moistureLevel: 22,
        depth: "Surface",
      }),
    ).toEqual(["moistureLevel"]);
  });

  it("names every signed value that changed", () => {
    expect(
      changedSignedFields("moistureReading", STORED, {
        location: "Hall",
        surfaceType: "Timber",
        moistureLevel: 18.4,
        depth: "Subsurface",
      }),
    ).toEqual(["location", "surfaceType", "depth"]);
  });

  it("ignores columns the save does not mention, and columns no signature covers", () => {
    expect(
      changedSignedFields("moistureReading", STORED, {
        mapX: 0.5,
        mapY: 0.25,
        isBaseline: true,
      }),
    ).toEqual([]);
  });

  it("is unchanged when ANY candidate spelling matches what is stored", () => {
    // The form sends back exactly what it loaded; the route's sanitiser would
    // spell it differently. Refusing that save would refuse a save that
    // changes nothing.
    const stored = { ...STORED, location: "Bed 1 <ensuite>" };
    expect(
      changedSignedFields(
        "moistureReading",
        stored,
        { location: "Bed 1 <ensuite>" },
        { location: "Bed 1 ensuite" },
      ),
    ).toEqual([]);
    // But a value that matches under NO spelling is a change.
    expect(
      changedSignedFields(
        "moistureReading",
        stored,
        { location: "Bed 2" },
        { location: "Bed 2" },
      ),
    ).toEqual(["location"]);
  });

  it("catches a changed ambient temperature or humidity", () => {
    const stored = { ambientTemperature: 22.5, humidityLevel: 68, location: "Lounge" };
    expect(
      changedSignedFields("environmentalData", stored, {
        ambientTemperature: 22.5,
        humidityLevel: 72,
      }),
    ).toEqual(["humidityLevel"]);
    expect(
      changedSignedFields("environmentalData", stored, {
        ambientTemperature: 22.5,
        humidityLevel: 68,
      }),
    ).toEqual([]);
  });
});

describe("saving the rest of a signed row", () => {
  it("drops the signed columns and keeps everything else", () => {
    expect(
      withoutSignedFields("moistureReading", {
        location: "Hall",
        surfaceType: "Timber",
        moistureLevel: 30,
        depth: "Subsurface",
        mapX: 0.5,
        isBaseline: true,
      }),
    ).toEqual({ mapX: 0.5, isBaseline: true });
  });

  it("keeps dew point and weather on a signed ambient row", () => {
    expect(
      withoutSignedFields("environmentalData", {
        ambientTemperature: 30,
        humidityLevel: 90,
        dewPoint: 16.7,
        weatherConditions: "Fine",
      }),
    ).toEqual({ dewPoint: 16.7, weatherConditions: "Fine" });
  });
});

describe("the refusal is written for the technician", () => {
  it("says what cannot be done and what to do instead, in plain words", () => {
    const edit = signedRowRefusal("edit", "moistureReading");
    expect(edit).toContain("moisture reading");
    expect(edit).toContain("cannot be changed");
    const remove = signedRowRefusal("delete", "environmentalData");
    expect(remove).toContain("ambient reading");
    expect(remove).toContain("cannot be removed");
  });

  // A refusal that sends the technician to something the app does not offer
  // is a dead end with a signpost on it. Every claim below was checked against
  // the screens that exist: Guided Capture takes a new reading; the job page's
  // Moisture tab has a bin icon, shown to the job owner and to managers, that
  // retires a reading and keeps it for audit. Nothing lets anyone type a
  // reason for retiring a reading, and nothing retires an ambient reading.
  const everyRefusal = () => [
    signedRowRefusal("edit", "moistureReading"),
    signedRowRefusal("delete", "moistureReading"),
    signedRowRefusal("edit", "environmentalData"),
    signedRowRefusal("delete", "environmentalData"),
    evidenceBacksReadingRefusal("moistureReading"),
    evidenceBacksReadingRefusal("environmentalData"),
  ];

  it("every refusal says to capture the correct reading again in Guided Capture", () => {
    for (const message of everyRefusal()) {
      expect(message).toContain("Guided Capture");
    }
  });

  it("no refusal tells anyone to invalidate with a reason, which no screen offers", () => {
    for (const message of everyRefusal()) {
      expect(message.toLowerCase()).not.toContain("invalidate");
      expect(message.toLowerCase()).not.toContain("with a reason");
    }
  });

  it("a moisture refusal names the screen and the people who can retire the wrong reading", () => {
    for (const message of [
      signedRowRefusal("edit", "moistureReading"),
      signedRowRefusal("delete", "moistureReading"),
      evidenceBacksReadingRefusal("moistureReading"),
    ]) {
      expect(message).toContain("Moisture tab");
      expect(message).toContain("job owner or a manager");
    }
  });

  it("an ambient refusal promises no way to retire the wrong reading, because there is none", () => {
    for (const message of [
      signedRowRefusal("edit", "environmentalData"),
      signedRowRefusal("delete", "environmentalData"),
      evidenceBacksReadingRefusal("environmentalData"),
    ]) {
      expect(message).not.toContain("Moisture tab");
      expect(message).toContain("stays on the record");
    }
  });

  it("carries the row and the fields for the server log, not for the screen", () => {
    const error = new SignedRowError({
      action: "edit",
      table: "moistureReading",
      rowId: "mr_1",
      fields: ["moistureLevel"],
    });
    expect(error.rowId).toBe("mr_1");
    expect(error.fields).toEqual(["moistureLevel"]);
    expect(error.message).not.toContain("mr_1");
    expect(error.message).not.toContain("moistureLevel");
  });
});

// RA-8388 bench, contract seat: "This moisture reading ... cannot be changed"
// on a job with twelve readings leaves the technician guessing which one, and
// what it was. The refusal names the reading by where it was taken and the
// value on the record, and the answer carries the row for a client to act on.
describe("the refusal says which reading", () => {
  it("names a moisture reading by its location and the stored value", () => {
    const message = signedRowRefusal("edit", "moistureReading", STORED);
    expect(message).toContain("Kitchen north wall");
    expect(message).toContain("18.4%");
    expect(message).toContain("cannot be changed");
    expect(message).toContain("Guided Capture");
  });

  it("names an ambient reading by its stored temperature and humidity", () => {
    const message = signedRowRefusal("edit", "environmentalData", {
      ambientTemperature: 22.5,
      humidityLevel: 68,
      location: "Lounge",
    });
    expect(message).toContain("22.5");
    expect(message).toContain("68% humidity");
    expect(message).toContain("Lounge");
    expect(message).toContain("ambient reading");
  });

  it("a refused save says how to get the form saving again: set the value back, or reload to get the reading back", () => {
    const refused = (action: "edit" | "delete") =>
      new SignedRowError({
        action,
        table: "moistureReading",
        rowId: "mr_1",
        stored: STORED,
      }).message;
    expect(refused("edit")).toContain("set it back to what is recorded");
    expect(refused("delete")).toContain("Reload the job");
    // A screen that stopped the change before sending it has nothing to undo.
    expect(signedRowRefusal("edit", "moistureReading", STORED)).not.toContain(
      "set it back",
    );
    expect(
      signedRowRefusal("delete", "moistureReading", STORED),
    ).not.toContain("Reload the job");
  });

  it("still reads as a sentence when the stored row has no location or value", () => {
    const message = signedRowRefusal("delete", "moistureReading", {});
    expect(message).toContain("This moisture reading");
    expect(message).not.toContain("undefined");
    expect(message).not.toContain("null");
  });

  it("keeps a very long location short enough to read in a notice", () => {
    const message = signedRowRefusal("edit", "moistureReading", {
      location: "L".repeat(200),
      moistureLevel: 18.4,
    });
    expect(message).not.toContain("L".repeat(100));
    expect(message).toContain("18.4%");
  });

  it("the error names the reading on screen and still keeps the row id and column names out of the words", () => {
    const error = new SignedRowError({
      action: "edit",
      table: "moistureReading",
      rowId: "mr_1",
      fields: ["moistureLevel", "location"],
      stored: STORED,
    });
    expect(error.message).toContain("Kitchen north wall");
    expect(error.message).toContain("18.4%");
    expect(error.message).not.toContain("mr_1");
    expect(error.message).not.toContain("moistureLevel");
  });

  it("gives a client the row, the table, the action and the changed columns", () => {
    const edit = new SignedRowError({
      action: "edit",
      table: "moistureReading",
      rowId: "mr_1",
      fields: ["moistureLevel", "location"],
      stored: STORED,
    });
    expect(edit.refusalFields()).toEqual({
      rowId: "mr_1",
      table: "moistureReading",
      action: "edit",
      changedFields: "moistureLevel,location",
    });
    const removal = new SignedRowError({
      action: "delete",
      table: "environmentalData",
      rowId: "env_1",
    });
    expect(removal.refusalFields()).toEqual({
      rowId: "env_1",
      table: "environmentalData",
      action: "delete",
      changedFields: "",
    });
  });
});
