import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { z } from "zod";
import { apiError, fromException } from "@/lib/api-errors";
import {
  analyseSupportTicket,
  type SupportTicketAnalysis,
} from "@/lib/services/ai/analyse-support-ticket";
import {
  resolveWorkspaceAiKey,
  NoWorkspaceKeyError,
} from "@/lib/ai/resolve-workspace-ai-key";

// ---------------------------------------------------------------------------
// Validation schema for POST
// ---------------------------------------------------------------------------

const createTicketSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required").max(200),
  subject: z.string().min(1, "Subject is required").max(500),
  body: z
    .string()
    .min(10, "Please provide more detail (minimum 10 characters)")
    .max(10000),
  category: z
    .enum(["general", "billing", "technical", "feature_request", "bug"])
    .optional(),
});

// ---------------------------------------------------------------------------
// Claude analysis helper — graceful degradation
//
// Public ticket submission must never fail because AI is down. This helper
// wraps the service-layer call and returns null on any failure (gateway,
// parse, or missing key) so the POST handler falls back to user-provided
// category + priority "normal".
// ---------------------------------------------------------------------------

async function analyseTicketWithClaude(
  userId: string | null,
  subject: string,
  body: string,
): Promise<SupportTicketAnalysis | null> {
  // RA-6921 (P0) — resolve the submitter's workspace BYOK key. Anonymous
  // submitters (no session) and workspaces without a configured key both
  // degrade gracefully to the caller-provided category + priority "normal" —
  // this best-effort triage must never spend the platform's ANTHROPIC_API_KEY.
  if (!userId) return null;
  let apiKey: string;
  try {
    apiKey = (await resolveWorkspaceAiKey(userId, "ANTHROPIC")).apiKey;
  } catch (err) {
    if (!(err instanceof NoWorkspaceKeyError)) throw err;
    console.error("[SupportTicketsAnalyse]", {
      reason: "KEY_MISSING",
      detail: "No workspace Anthropic key configured (non-fatal — degrading)",
    });
    return null;
  }

  const result = await analyseSupportTicket({
    apiKey,
    ticket: { subject, body },
  });

  if (!result.ok) {
    console.error("[SupportTicketsAnalyse]", {
      reason: result.reason,
      detail: result.detail,
    });
    return null;
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// GET /api/support/tickets — admin only
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status") ?? undefined;
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "20", 10),
      100,
    );
    const cursor = searchParams.get("cursor") ?? undefined;

    const where = statusFilter ? { status: statusFilter } : {};

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1, // fetch one extra to detect next page
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.supportTicket.count({ where }),
    ]);

    let nextCursor: string | undefined;
    if (tickets.length > limit) {
      const lastItem = tickets.pop();
      nextCursor = lastItem?.id;
    }

    return NextResponse.json({ tickets, nextCursor, total });
  } catch (error) {
    return fromException(request, error, { stage: "list" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/support/tickets — public (no auth required)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }
    const parsed = createTicketSchema.safeParse(rawBody);

    if (!parsed.success) {
      // RA-1548 — left raw: rich 422 with `issues` array sibling (zod details).
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 422 },
      );
    }

    const {
      email,
      name,
      subject,
      body,
      category: providedCategory,
    } = parsed.data;

    // Resolve the userId if the submitter is logged in
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id ?? null;

    // Run Claude analysis — gracefully degrade if unavailable
    const aiResult = await analyseTicketWithClaude(userId, subject, body);

    const ticket = await prisma.supportTicket.create({
      data: {
        email,
        name,
        subject,
        body,
        category: aiResult?.category ?? providedCategory ?? "general",
        priority: aiResult?.priority ?? "normal",
        responseDraft: aiResult?.responseDraft ?? null,
        ...(userId ? { userId } : {}),
      },
    });

    return NextResponse.json(
      {
        id: ticket.id,
        category: ticket.category,
        priority: ticket.priority,
        message: "Support ticket received. We'll respond within 24 hours.",
      },
      { status: 201 },
    );
  } catch (error) {
    return fromException(request, error, { stage: "create" });
  }
}
