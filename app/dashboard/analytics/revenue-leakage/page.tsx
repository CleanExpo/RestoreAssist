import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canSeeMoney } from "@/lib/auth/redact-money";
import RevenueLeakageReport from "./RevenueLeakageReport";

export const dynamic = "force-dynamic";

/**
 * RA-8598 — the RA-7026 "money left on the table" report.
 *
 * The whole page is money, so the RA-8494 gate runs here on the server, before
 * any client code is sent: a technician (or anyone `canSeeMoney` refuses) gets
 * a 404 and never learns the page exists. The data route keeps its own
 * `assertMoneyViewer` check; this does not replace it.
 */
export default async function RevenueLeakagePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (!(await canSeeMoney(session))) notFound();
  return <RevenueLeakageReport />;
}
