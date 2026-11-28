/**
 * RA-8501 (DRC S8) — the contents inventory workbook.
 *
 * The money test plants a figure no other cell could hold by chance
 * (98765.43) and reads every cell of every sheet back from the written bytes,
 * so a leak in any column or sheet fails, not only a leak under a known header.
 */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  buildContentsInventoryWorkbook,
  MONEY_HEADERS,
  type InventoryClaimDetails,
  type InventoryItemRow,
} from "@/lib/contents/inventory-workbook";

const PLANTED = 98765.43;

const claim: InventoryClaimDetails = {
  jobNumber: "DRC-00042",
  inspectionNumber: "NIR-2026-11-0042",
  propertyAddress: "1 Example Street, Exampleton NSW",
  propertyPostcode: "2000",
  claimNumber: "CLM-1",
  policyNumber: "POL-9",
  insurerName: "Example Insurer",
  clientType: "LOSS_ADJUSTER",
  insuredName: "Sam Example",
  claimType: "WATER",
  inspectionDate: new Date("2026-11-20T00:00:00Z"),
  technicianName: "Alex Tech",
};

const items: InventoryItemRow[] = [
  {
    itemDescription: "Front-load washing machine",
    make: "Example",
    model: "WM-100",
    serialNumber: "SN-123",
    roomName: "Laundry",
    packOutDecision: "TOTAL_LOSS",
    packOutTag: "T-1",
    conditionPreLoss: "GOOD",
    conditionPostLoss: "POOR",
    beforePhotoUrl: "https://files.example/before.jpg",
    afterPhotoUrl: null,
    replacementValueAud: PLANTED,
    restorationCostEstimate: "12345.67",
  },
  {
    itemDescription: "=HYPERLINK(\"https://evil.example\",\"click\")",
    make: null,
    model: null,
    serialNumber: null,
    roomName: null,
    packOutDecision: "CLEAN_ONSITE",
    packOutTag: null,
    conditionPreLoss: null,
    conditionPostLoss: null,
    beforePhotoUrl: null,
    afterPhotoUrl: null,
    replacementValueAud: null,
    restorationCostEstimate: null,
  },
];

async function read(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

function allCells(wb: ExcelJS.Workbook): ExcelJS.Cell[] {
  const cells: ExcelJS.Cell[] = [];
  wb.eachSheet((ws) =>
    ws.eachRow({ includeEmpty: false }, (row) =>
      row.eachCell({ includeEmpty: false }, (cell) => cells.push(cell)),
    ),
  );
  return cells;
}

function headers(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  ws.getRow(1).eachCell((cell) => out.push(String(cell.value)));
  return out;
}

describe("buildContentsInventoryWorkbook", () => {
  it("writes a Claim details sheet and an Inventory sheet with room, model, serial and disposition", async () => {
    const wb = await read(
      await buildContentsInventoryWorkbook({ claim, items, includeMoney: false }),
    );
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([
      "Claim details",
      "Inventory",
    ]);

    const details = wb.getWorksheet("Claim details")!;
    const fields = new Map<string, string>();
    details.eachRow((row, n) => {
      if (n > 1) fields.set(String(row.getCell(1).value), String(row.getCell(2).value ?? ""));
    });
    expect(fields.get("Job number")).toBe("DRC-00042");
    expect(fields.get("Claim number")).toBe("CLM-1");
    expect(fields.get("Policy number")).toBe("POL-9");
    expect(fields.get("Insurer")).toBe("Example Insurer");
    expect(fields.get("Insured name")).toBe("Sam Example");
    expect(fields.get("Inspection date")).toBe("2026-11-20");
    expect(fields.get("Items")).toBe("2");

    const inv = wb.getWorksheet("Inventory")!;
    const h = headers(inv);
    for (const name of ["Item", "Model", "Serial number", "Room", "Disposition", "Restorable"]) {
      expect(h).toContain(name);
    }
    const col = (name: string) => h.indexOf(name) + 1;
    const first = inv.getRow(2);
    expect(first.getCell(col("Model")).value).toBe("WM-100");
    expect(first.getCell(col("Serial number")).value).toBe("SN-123");
    expect(first.getCell(col("Room")).value).toBe("Laundry");
    expect(first.getCell(col("Disposition")).value).toBe("Non-restorable");
    expect(first.getCell(col("Restorable")).value).toBe("Non-restorable");
    expect(inv.getRow(3).getCell(col("Restorable")).value).toBe("Restorable");
    // A photo is reported as on file, never as its (unopenable) stored URL.
    expect(first.getCell(col("Before photo")).value).toBe("On file");
    expect(first.getCell(col("After photo")).value ?? "").toBe("");
    for (const cell of allCells(wb)) {
      expect(String(cell.value)).not.toContain("files.example");
    }
  });

  it("carries no money anywhere when includeMoney is false", async () => {
    const wb = await read(
      await buildContentsInventoryWorkbook({ claim, items, includeMoney: false }),
    );
    for (const cell of allCells(wb)) {
      const v = cell.value;
      expect(v).not.toBe(PLANTED);
      expect(String(v)).not.toContain("98765");
      expect(String(v)).not.toContain("12345.67");
    }
    for (const ws of wb.worksheets) {
      for (const money of MONEY_HEADERS) expect(headers(ws)).not.toContain(money);
    }
  });

  it("adds the money columns when includeMoney is true", async () => {
    const wb = await read(
      await buildContentsInventoryWorkbook({ claim, items, includeMoney: true }),
    );
    const inv = wb.getWorksheet("Inventory")!;
    const h = headers(inv);
    expect(h).toEqual(expect.arrayContaining([...MONEY_HEADERS]));
    expect(inv.getRow(2).getCell(h.indexOf(MONEY_HEADERS[0]) + 1).value).toBe(PLANTED);
    expect(inv.getRow(2).getCell(h.indexOf(MONEY_HEADERS[1]) + 1).value).toBe(12345.67);
  });

  it("keeps a formula-looking description as text", async () => {
    const wb = await read(
      await buildContentsInventoryWorkbook({ claim, items, includeMoney: false }),
    );
    const cell = wb.getWorksheet("Inventory")!.getRow(3).getCell(1);
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.formula).toBeUndefined();
  });
});
