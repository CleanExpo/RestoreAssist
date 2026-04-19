import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import { z } from "zod";
import { withIdempotency } from "@/lib/idempotency";

/**
 * POST /api/cost-libraries/promote
 *
 * Promotes a custom line item (added on the fly inside an estimate) into the
 * user's reusable CostLibrary so it appears on future jobs without re-typing.
 *
 * If the user has no libraries yet, creates a "My Library" default and
 * upserts the item into it. If an item with the same category+description
 * already exists in the target library, updates its rate/unit instead of
 * duplicating.
 */

const promoteSchema = z.object({
  category: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  rate: z.number().nonnegative(),
  unit: z.string().min(1).max(50),
  libraryId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // RA-1266: guard double-promote of the same line item.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }
      const parsed = promoteSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", issues: parsed.error.issues },
          { status: 422 },
        );
      }

      const category = sanitizeString(parsed.data.category);
      const description = sanitizeString(parsed.data.description);
      const unit = sanitizeString(parsed.data.unit);
      const { rate, libraryId } = parsed.data;

      // Resolve target library: explicit libraryId, else user's default, else create one
      let library = libraryId
        ? await prisma.costLibrary.findFirst({
            where: { id: libraryId, userId: userId },
            select: { id: true },
          })
        : await prisma.costLibrary.findFirst({
            where: { userId: userId, isDefault: true },
            select: { id: true },
          });

      if (!library) {
        library = await prisma.costLibrary.findFirst({
          where: { userId: userId },
          select: { id: true },
        });
      }

      if (!library) {
        library = await prisma.costLibrary.create({
          data: {
            userId: userId,
            name: "My Library",
            region: "AU",
            isDefault: true,
          },
          select: { id: true },
        });
      }

      // Dedupe on (libraryId, category, description) — update rate/unit if it already exists
      const existing = await prisma.costItem.findFirst({
        where: {
          libraryId: library.id,
          category,
          description,
        },
        select: { id: true },
      });

      const item = existing
        ? await prisma.costItem.update({
            where: { id: existing.id },
            data: { rate, unit },
            select: {
              id: true,
              category: true,
              description: true,
              rate: true,
              unit: true,
            },
          })
        : await prisma.costItem.create({
            data: { libraryId: library.id, category, description, rate, unit },
            select: {
              id: true,
              category: true,
              description: true,
              rate: true,
              unit: true,
            },
          });

      return NextResponse.json({
        item,
        libraryId: library.id,
        created: !existing,
      });
    } catch (error) {
      console.error("Error promoting line item to library:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}
