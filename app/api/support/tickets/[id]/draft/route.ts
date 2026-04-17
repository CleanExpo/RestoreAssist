import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import Anthropic from "@anthropic-ai/sdk";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Anthropic lazy singleton
// ---------------------------------------------------------------------------

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
// POST /api/support/tickets/[id]/draft — admin only
// Regenerates a Claude response draft for the given ticket.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const { id } = await context.params;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      select: {
        id: true,
        subject: true,
        body: true,
        category: true,
        priority: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const client = getAnthropicClient();

    const systemPrompt = `You are a customer support specialist for RestoreAssist — Australian water damage restoration software.

Generate a professional customer support response in Australian English (150-250 words).

The response must:
- Address the specific issue raised in the ticket
- Reference IICRC S500:2025 if technically relevant
- End with next-steps and a timeline (we respond within 24 hours)
- Be warm but professional
- Use Australian English spelling

Respond with only the response text — no JSON, no preamble.`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Category: ${ticket.category}\nPriority: ${ticket.priority}\nSubject: ${ticket.subject}\n\n${ticket.body}`,
        },
      ],
    });

    const responseDraft =
      response.content[0].type === "text"
        ? response.content[0].text.trim()
        : "";

    await prisma.supportTicket.update({
      where: { id },
      data: { responseDraft },
    });

    return NextResponse.json({ responseDraft });
  } catch (error) {
    console.error("[support/tickets/[id]/draft POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
