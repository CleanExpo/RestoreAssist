/**
 * POST /api/margot/social-relevance
 *
 * Pre-reply gate for Margot / Hermes social commenting.
 * Body: { text, hashtags?, authorBio?, platform?, draftReply? }
 * Returns relevance decision + optional style-sanitized draft.
 */

import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { apiError } from "@/lib/api-errors";
import { assessSocialRestorationRelevance } from "@/lib/margot/social-restoration-relevance";
import { prepareSocialReply } from "@/lib/margot/social-reply-style";

export const runtime = "nodejs";

const bodySchema = z.object({
  text: z.string(),
  hashtags: z.array(z.string()).optional(),
  authorBio: z.string().optional(),
  platform: z.string().optional(),
  draftReply: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError(request, {
      code: "VALIDATION",
      message: "Invalid JSON",
      status: 400,
    });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return apiError(request, {
      code: "VALIDATION",
      message: "Invalid body",
      status: 400,
      context: { issues: parsed.error.flatten() },
    });
  }

  const relevance = assessSocialRestorationRelevance(parsed.data);
  const reply = parsed.data.draftReply
    ? prepareSocialReply(parsed.data.draftReply)
    : null;

  const canPost = relevance.relevant && (reply ? reply.canPost : true);

  return Response.json({
    canPost,
    relevance,
    reply,
  });
}
