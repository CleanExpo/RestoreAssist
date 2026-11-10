/**
 * RA-8281 B1 round 13: the one way a route answers with a saved Report row.
 *
 * A Report row carries two cached figures: the daily rate saved on each
 * stored equipment line, and equipmentCostTotal. Both go stale the moment the
 * business changes or clears a price-list rate, so no response may echo them.
 * A route that answers with a whole row passes it through withCurrentEquipment,
 * which replaces both with the stored lines priced NOW from the report
 * business's own price list (a rate that is not set reads as not set, never
 * $0 and never the cached figure).
 *
 * Server only (it reads the price list); the pure reader lives in
 * stored-equipment-pricing.ts.
 */
import { prisma } from "@/lib/prisma";
import { resolveReportPricing } from "@/lib/pricing/report-pricing";
import {
  hasStoredEquipment,
  storedEquipmentResponse,
  type StoredEquipmentResponse,
  type StoredEquipmentSelections,
} from "@/lib/reports/stored-equipment-pricing";

export interface ReportEquipmentRow {
  /** The report's creator: the price list is their business's. */
  userId: string;
  createdAt: Date;
  equipmentSelection: StoredEquipmentSelections;
  estimatedDryingDuration: number | null;
}

/**
 * The row's stored equipment priced now. A business that cannot be confirmed
 * gets no price list, so every rate reads as not set. Nothing stored answers
 * null lines and a null total without reading a price list.
 */
export async function currentReportEquipment(
  report: ReportEquipmentRow,
): Promise<StoredEquipmentResponse> {
  let currentPricing: unknown = null;
  if (hasStoredEquipment(report.equipmentSelection)) {
    const creator = await prisma.user.findUnique({
      where: { id: report.userId },
      select: { pricingConfig: true },
    });
    const reportPricing = await resolveReportPricing(
      report.userId,
      creator?.pricingConfig ?? null,
      report.createdAt,
    );
    currentPricing = reportPricing.ok ? reportPricing.pricingConfig : null;
  }
  return storedEquipmentResponse(
    report.equipmentSelection,
    currentPricing,
    Number(report.estimatedDryingDuration) || 1,
  );
}

/** A saved row as a response returns it: cached equipment money replaced. */
export async function withCurrentEquipment<T extends ReportEquipmentRow>(
  report: T,
): Promise<Omit<T, keyof StoredEquipmentResponse> & StoredEquipmentResponse>;
export async function withCurrentEquipment<T extends ReportEquipmentRow>(
  report: T | null,
): Promise<
  (Omit<T, keyof StoredEquipmentResponse> & StoredEquipmentResponse) | null
>;
export async function withCurrentEquipment<T extends ReportEquipmentRow>(
  report: T | null,
) {
  if (report === null) return null;
  return { ...report, ...(await currentReportEquipment(report)) };
}
