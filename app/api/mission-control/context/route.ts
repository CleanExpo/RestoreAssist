/**
 * GET /api/mission-control/context — Tier 2
 * Voice, ICP, memory summary, wiki excerpt for Mission Control / Margot UI.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { loadNexusContextBundle } from "@/lib/nexus-hub-context";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  const bundle = await loadNexusContextBundle();
  return Response.json({
    data: bundle,
    fetchedAt: bundle.fetchedAt,
  });
}
