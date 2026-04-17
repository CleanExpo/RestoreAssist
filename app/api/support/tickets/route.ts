import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Anthropic lazy singleton (same pattern as lib/stripe.ts)
// ---------------------------------------------------------------------------
import Anthropic from "@anthropic-ai/sdk";

let _anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (_anthropic) return _anthropic;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SupportCategory =
  | "general"
  | "billing"
  | "technical"
  | "feature_request"
  | "bug";
type SupportPriority = "low" | "normal" | "high" | "urgent";

interface ClaudeTicketAnalysis {
  category: SupportCategory;
  priority: SupportPriority;
  responseDraft: string;
}

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
// Claude analysis helper
// ---------------------------------------------------------------------------

async function analyseTicketWithClaude(
  subject: string,
  body: string,
): Promise<ClaudeTicketAnalysis | null> {
  try {
    const client = getAnthropicClient();

    const systemPrompt = `You are a customer support specialist for RestoreAssist — Australian water damage restoration software.

Given a support ticket, respond with JSON only (no markdown, no explanation):
{
  "category": "general|billing|technical|feature_request|bug",
  "priority": "low|normal|high|urgent",
  "responseDraft": "Professional response in Australian English, 150-250 words..."
}

Category rules:
- billing: mentions payment, invoice, subscription, price, refund, charge
- technical: software errors, crashes, API issues, integration problems
- feature_request: requests for new features or improvements
- bug: reports of incorrect behaviour
- general: everything else

Priority rules:
- urgent: production outage, data loss, cannot access account
- high: major feature broken, billing error
- normal: general questions, feature requests
- low: cosmetic issues, minor suggestions

Response draft must:
- Address the specific issue raised
- Reference IICRC S500:2025 if technically relevant
- End with next-steps and timeline (we respond within 24 hours)
- Be warm but professional
- Use Australian English spelling`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Subject: ${subject}\n\n${body}`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Strip any accidental markdown code fences
    const cleaned = text
      .replace(/^```(?:json)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as ClaudeTicketAnalysis;

    // Validate the fields Claude returned
    const validCategories: SupportCategory[] = [
      "general",
      "billing",
      "technical",
      "feature_request",
      "bug",
    ];
    const validPriorities: SupportPriority[] = [
      "low",
      "normal",
      "high",
      "urgent",
    ];

    return {
      category: validCategories.includes(parsed.category)
        ? parsed.category
        : "general",
      priority: validPriorities.includes(parsed.priority)
        ? parsed.priority
        : "normal",
      responseDraft:
        typeof parsed.responseDraft === "string" &&
        parsed.responseDraft.length > 0
          ? parsed.responseDraft
          : "",
    };
  } catch (err) {
    console.error("[support/tickets] Claude analysis failed (non-fatal):", err);
    return null;
  }
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
    console.error("[support/tickets GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/support/tickets — public (no auth required)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const parsed = createTicketSchema.safeParse(rawBody);

    if (!parsed.success) {
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
    const aiResult = await analyseTicketWithClaude(subject, body);

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
    console.error("[support/tickets POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
