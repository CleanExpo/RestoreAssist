import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { fromException } from "@/lib/api-errors";
import type { ChunkResult } from "@/lib/rag/retrieve";

export const runtime = "nodejs";

function sampleChunk(r: ChunkResult) {
  return {
    standard: r.standard,
    edition: r.edition,
    section: r.section,
    provenance: r.provenance,
    jurisdiction: r.jurisdiction,
    similarity: Math.round(r.similarity * 1000) / 1000,
    snippet: r.content.slice(0, 120),
  };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  const query = (request.nextUrl.searchParams.get("q") ?? "")
    .trim()
    .slice(0, 300);
  if (!query) {
    return NextResponse.json(
      { error: "Query parameter q is required" },
      { status: 400 },
    );
  }

  try {
    const { retrieveForCitation, retrieveForReasoning } = await import(
      "@/lib/rag/retrieve"
    );
    const [citation, reasoning] = await Promise.all([
      retrieveForCitation(query, { k: 3 }),
      retrieveForReasoning(query, { k: 3 }),
    ]);

    return NextResponse.json({
      query,
      citation: citation.map(sampleChunk),
      reasoning: reasoning.map(sampleChunk),
    });
  } catch (error) {
    return fromException(request, error, { stage: "admin-rag-probe" });
  }
}
