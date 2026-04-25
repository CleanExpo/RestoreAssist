// GET /api/margot/corpus/status — RA-1658
// Returns Gemini file-search corpus stats for Margot's knowledge store.
// Degrades gracefully when GOOGLE_GENERATIVE_AI_API_KEY or MARGOT_FILE_SEARCH_STORE are absent.
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "";
const STORE_NAME = process.env.MARGOT_FILE_SEARCH_STORE ?? "";
const STALE_DAYS = 14;

export async function GET() {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  const fetchedAt = new Date().toISOString();

  if (!GEMINI_API_KEY || !STORE_NAME) {
    return Response.json({
      data: { fileCount: null, lastUploadAt: null, storeName: STORE_NAME || null, stale: true },
      fetchedAt,
      stale: true,
      reason: !GEMINI_API_KEY ? "GOOGLE_GENERATIVE_AI_API_KEY not configured" : "MARGOT_FILE_SEARCH_STORE not configured",
    });
  }

  try {
    // List files in the Gemini corpus — paginate once (first 100 files is enough for a count)
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/corpora/${STORE_NAME}/documents?pageSize=100`,
      {
        headers: { "x-goog-api-key": GEMINI_API_KEY },
        signal: AbortSignal.timeout(8_000),
      },
    );

    if (!res.ok) {
      return Response.json({
        data: { fileCount: null, lastUploadAt: null, storeName: STORE_NAME, stale: true },
        fetchedAt,
        stale: true,
        reason: `Gemini API ${res.status}`,
      });
    }

    const body = await res.json() as { documents?: Array<{ name: string; updateTime?: string }> };
    const docs = body.documents ?? [];
    const fileCount = docs.length;
    const dates = docs.map((d) => d.updateTime).filter(Boolean) as string[];
    const lastUploadAt = dates.length ? dates.sort().at(-1)! : null;

    const staleFlag = lastUploadAt
      ? (Date.now() - new Date(lastUploadAt).getTime()) > STALE_DAYS * 86_400_000
      : true;

    return Response.json({
      data: { fileCount, lastUploadAt, storeName: STORE_NAME, stale: staleFlag },
      fetchedAt,
      stale: false,
    });
  } catch {
    return Response.json({
      data: { fileCount: null, lastUploadAt: null, storeName: STORE_NAME, stale: true },
      fetchedAt,
      stale: true,
      reason: "Gemini corpus unreachable",
    });
  }
}
