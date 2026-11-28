/**
 * RA-8501 (DRC S8) — contents inventory as an Excel workbook.
 *
 * Two sheets, as DRC asked: "Claim details" (one row per field) and
 * "Inventory" (one row per item). Pure: the route reads the rows and decides
 * whether the caller may see money; this file only lays them out.
 *
 * Money (replacement value, restoration estimate) is added ONLY when
 * `includeMoney` is true. With it false the columns are never created, so no
 * header, cell or total can carry a figure. The insured's phone and email are
 * left out on purpose: the inventory does not need them.
 *
 * Every text value is written as a plain string cell. ExcelJS only writes a
 * formula for a `{ formula }` value, so an item described as "=HYPERLINK(...)"
 * stays text when the file opens.
 */
import ExcelJS from "exceljs";
import { dispositionGroup, dispositionLabel } from "@/lib/contents/disposition";

export interface InventoryClaimDetails {
  jobNumber: string | null;
  inspectionNumber: string;
  propertyAddress: string;
  propertyPostcode: string | null;
  claimNumber: string | null;
  policyNumber: string | null;
  insurerName: string | null;
  clientType: string | null;
  insuredName: string | null;
  claimType: string | null;
  inspectionDate: Date | null;
  technicianName: string | null;
}

export interface InventoryItemRow {
  itemDescription: string;
  make: string | null;
  model: string | null;
  serialNumber: string | null;
  roomName: string | null;
  packOutDecision: string | null;
  packOutTag: string | null;
  conditionPreLoss: string | null;
  conditionPostLoss: string | null;
  beforePhotoUrl: string | null;
  afterPhotoUrl: string | null;
  /** Read only when the workbook is built with `includeMoney`. */
  replacementValueAud?: number | string | { toString(): string } | null;
  /** Read only when the workbook is built with `includeMoney`. */
  restorationCostEstimate?: number | string | { toString(): string } | null;
}

export const MONEY_HEADERS = [
  "Replacement value (AUD)",
  "Restoration estimate (AUD)",
] as const;

/**
 * The photo columns say whether a photo is on file, not where. An item's stored
 * photo URL is not a link a reader can open (private bucket, RA-8537: the app
 * signs it for an hour at display time), so writing it into a file that
 * outlives the hour would hand the reader a dead link. The photos are on the job.
 */
const PHOTO_ON_FILE = "On file";

function text(value: string | null | undefined): string {
  return value == null ? "" : String(value);
}

function amount(value: InventoryItemRow["replacementValueAud"]): number | null {
  if (value == null) return null;
  const n = Number(String(value));
  return Number.isFinite(n) ? n : null;
}

function claimRows(claim: InventoryClaimDetails): [string, string][] {
  return [
    ["Job number", text(claim.jobNumber)],
    ["Inspection number", claim.inspectionNumber],
    ["Property address", claim.propertyAddress],
    ["Postcode", text(claim.propertyPostcode)],
    ["Claim number", text(claim.claimNumber)],
    ["Policy number", text(claim.policyNumber)],
    ["Insurer", text(claim.insurerName)],
    ["Client type", text(claim.clientType)],
    ["Insured name", text(claim.insuredName)],
    ["Claim type", text(claim.claimType)],
    [
      "Inspection date",
      claim.inspectionDate ? claim.inspectionDate.toISOString().slice(0, 10) : "",
    ],
    ["Technician", text(claim.technicianName)],
  ];
}

export async function buildContentsInventoryWorkbook(input: {
  claim: InventoryClaimDetails;
  items: InventoryItemRow[];
  includeMoney: boolean;
}): Promise<Buffer> {
  const { claim, items, includeMoney } = input;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RestoreAssist";

  const details = workbook.addWorksheet("Claim details");
  details.columns = [
    { header: "Field", key: "field", width: 22 },
    { header: "Value", key: "value", width: 60 },
  ];
  for (const [field, value] of claimRows(claim)) {
    details.addRow({ field, value });
  }
  details.addRow({ field: "Items", value: String(items.length) });

  const sheet = workbook.addWorksheet("Inventory");
  const columns: Partial<ExcelJS.Column>[] = [
    { header: "Item", key: "item", width: 36 },
    { header: "Make", key: "make", width: 16 },
    { header: "Model", key: "model", width: 18 },
    { header: "Serial number", key: "serial", width: 20 },
    { header: "Room", key: "room", width: 18 },
    { header: "Disposition", key: "disposition", width: 28 },
    { header: "Restorable", key: "group", width: 16 },
    { header: "Tag", key: "tag", width: 12 },
    { header: "Condition before loss", key: "pre", width: 20 },
    { header: "Condition after loss", key: "post", width: 20 },
    { header: "Before photo", key: "before", width: 14 },
    { header: "After photo", key: "after", width: 14 },
  ];
  if (includeMoney) {
    columns.push(
      { header: MONEY_HEADERS[0], key: "replacement", width: 22 },
      { header: MONEY_HEADERS[1], key: "restoration", width: 24 },
    );
  }
  sheet.columns = columns;

  for (const item of items) {
    const row: Record<string, string | number | null> = {
      item: text(item.itemDescription),
      make: text(item.make),
      model: text(item.model),
      serial: text(item.serialNumber),
      room: text(item.roomName),
      disposition: dispositionLabel(item.packOutDecision),
      group: dispositionGroup(item.packOutDecision),
      tag: text(item.packOutTag),
      pre: text(item.conditionPreLoss),
      post: text(item.conditionPostLoss),
      before: item.beforePhotoUrl ? PHOTO_ON_FILE : "",
      after: item.afterPhotoUrl ? PHOTO_ON_FILE : "",
    };
    if (includeMoney) {
      row.replacement = amount(item.replacementValueAud);
      row.restoration = amount(item.restorationCostEstimate);
    }
    sheet.addRow(row);
  }

  for (const ws of [details, sheet]) ws.getRow(1).font = { bold: true };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
