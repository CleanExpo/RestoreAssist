/**
 * POST /api/inspections/[id]/generate-scope
 *
 * Streaming Claude API scope narrative generator.
 * Produces an IICRC-cited scope of works from inspection data.
 *
 * Response: text/event-stream
 *   data: { type: "delta", text: "..." }
 *   data: { type: "done", scopeItemIds: string[], usage: { inputTokens, outputTokens } }
 *   data: { type: "error", error: "..." }
 *
 * Body: {
 *   model?: "claude-opus-4-6" | "claude-sonnet-4-6"   // default: sonnet (cost)
 *   stream?: boolean                                     // default: true
 *   affectedAreaM2: number                              // required for scope completeness
 *   affectedRooms?: string[]
 *   lossSourceDescription?: string
 *   claimType?: "water_damage" | "fire_smoke" | "storm" | "mould" | "contents"  // default: water_damage (single)
 *             | "biohazard" | "odour" | "carpet" | "hvac" | "asbestos"          // RA-278 new claim types
 *   claimTypes?: string[]   // multi-loss: ["water_damage","fire_smoke"]. Overrides claimType when provided.
 * }
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Anthropic from "@anthropic-ai/sdk"
import {
  buildScopeUserMessage,
  type MoistureReadingInput,
  type EquipmentItemInput,
} from "@/lib/scope-narrative-prompts"
import { getDryStandard, getMoistureStatus } from "@/lib/iicrc-dry-standards"
import { safeRetrieveSimilarJobs } from "@/lib/ai/rag-context"
import {
  getClaimTypePrompt,
  getMultiClaimPrompt,
  type ClaimType,
} from "@/lib/ai/claim-type-prompts"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: inspectionId } = await context.params
    const body = await request.json()
    const {
      model = "claude-sonnet-4-6",
      affectedAreaM2,
      affectedRooms,
      lossSourceDescription,
      claimType = "water_damage",
      claimTypes: claimTypesRaw,
    } = body as {
      model?: string
      affectedAreaM2: number
      affectedRooms?: string[]
      lossSourceDescription?: string
      claimType?: ClaimType
      claimTypes?: string[]
    }

    // Resolve effective claim type(s): claimTypes[] overrides single claimType
    const effectiveClaimTypes: string[] =
      Array.isArray(claimTypesRaw) && claimTypesRaw.length > 0
        ? claimTypesRaw
        : [claimType]
    const isMultiClaim = effectiveClaimTypes.length > 1

    if (!affectedAreaM2 || affectedAreaM2 <= 0) {
      return NextResponse.json({ error: "affectedAreaM2 is required" }, { status: 400 })
    }

    // Load full inspection with all related data
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId: session.user.id },
      include: {
        moistureReadings: {
          orderBy: { createdAt: "desc" },
        },
        environmentalData: true,
        classifications: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        scopeItems: {
          where: { autoDetermined: true },
          orderBy: { createdAt: "asc" },
        },
      },
    })

    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
    }

    const classification = inspection.classifications[0]
    if (!classification) {
      return NextResponse.json(
        { error: "No classification found. Run equipment calculator first." },
        { status: 400 }
      )
    }

    // Build moisture readings input
    const moistureInputs: MoistureReadingInput[] = inspection.moistureReadings.map((r) => {
      const std = getDryStandard(r.surfaceType)
      const status = getMoistureStatus(r.moistureLevel, r.surfaceType)
      return {
        location: r.location,
        surfaceType: r.surfaceType,
        moistureLevel: r.moistureLevel,
        target: std.dryThreshold,
        status: status.toUpperCase() as "DRY" | "DRYING" | "WET",
      }
    })

    // Build equipment input from ScopeItems
    const equipmentInputs: EquipmentItemInput[] = inspection.scopeItems
      .filter((s) => s.autoDetermined && s.quantity)
      .map((s) => ({
        label: s.description.split(" — ")[0],
        quantity: s.quantity ?? 1,
        iicrcReference: s.justification?.match(/IICRC S500:2021 §[\d.]+/)?.[0] ?? "IICRC S500:2021",
        justification: s.justification ?? s.description,
        estimatedAmpsTotal: parseFloat(
          s.specification?.match(/(\d+\.?\d*)A total/)?.[1] ?? "0"
        ),
      }))

    const totalAmps = equipmentInputs.reduce((sum, e) => sum + e.estimatedAmpsTotal, 0)

    // Construct user message
    const userMessage = buildScopeUserMessage({
      propertyAddress: inspection.propertyAddress,
      inspectionDate: inspection.inspectionDate.toISOString(),
      damageCategory: `CAT_${classification.category}`,
      damageClass: `CLASS_${classification.class}`,
      lossSourceIdentified: lossSourceDescription !== undefined,
      lossSourceDescription,
      affectedAreaM2,
      affectedRooms,
      moistureReadings: moistureInputs,
      environmentalData: inspection.environmentalData
        ? {
            temperature: inspection.environmentalData.ambientTemperature,
            humidity: inspection.environmentalData.humidityLevel,
            dewPoint: inspection.environmentalData.dewPoint ?? undefined,
          }
        : undefined,
      equipment: equipmentInputs,
      totalEstimatedAmps: parseFloat(totalAmps.toFixed(2)),
    })

    // ============================================================
    // RAG: retrieve similar historical jobs for context
    // ============================================================
    const ragResult = await safeRetrieveSimilarJobs({
      tenantId: session.user.id,
      claimType: `CAT_${classification.category}`,
      waterCategory: parseInt(classification.category, 10) || undefined,
      waterClass: parseInt(classification.class, 10) || undefined,
      description: lossSourceDescription ?? inspection.propertyAddress,
      suburb: inspection.propertyAddress.split(",").slice(-2, -1)[0]?.trim(),
    })
    console.log('[RAG] Injected', ragResult.jobCount, 'similar historical jobs')

    // Build claim-type-aware system prompt, injecting RAG context when available
    const promptOptions = {
      damageCategory: parseInt(classification.category, 10) || undefined,
      damageClass: parseInt(classification.class, 10) || undefined,
      ragContext: ragResult.jobCount > 0 ? ragResult.contextPrompt : undefined,
    }
    const effectiveSystemPrompt = isMultiClaim
      ? getMultiClaimPrompt(effectiveClaimTypes, promptOptions)
      : getClaimTypePrompt(claimType as ClaimType, promptOptions)

    // ============================================================
    // Streaming response
    // ============================================================
    const encoder = new TextEncoder()
    let accumulatedText = ""
    let usageData: { inputTokens: number; outputTokens: number } | undefined

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const anthropicStream = await anthropic.messages.stream({
            model,
            max_tokens: 2000,
            system: [
              {
                type: "text",
                text: effectiveSystemPrompt,
                // Enable prompt caching — system prompt rarely changes
                cache_control: { type: "ephemeral" },
              },
            ],
            messages: [{ role: "user", content: userMessage }],
          })

          for await (const event of anthropicStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              const text = event.delta.text
              accumulatedText += text
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "delta", text })}\n\n`)
              )
            }
            if (event.type === "message_delta" && event.usage) {
              usageData = {
                inputTokens: usageData?.inputTokens ?? 0, // preserve from message_start
                outputTokens: event.usage.output_tokens,
              }
            }
            if (event.type === "message_start" && event.message.usage) {
              usageData = {
                inputTokens: event.message.usage.input_tokens,
                outputTokens: usageData?.outputTokens ?? 0, // preserve from message_delta if already set
              }
            }
          }

          // Log usage event for billing metering
          if (usageData) {
            // Per-model USD pricing (Anthropic listed rates, as of 2025)
            const isOpus = model.includes("opus")
            const inputUnitCost  = isOpus ? 0.000005 : 0.000003  // $5 or $3 per M input tokens
            const outputUnitCost = isOpus ? 0.000025 : 0.000015  // $25 or $15 per M output tokens
            const inputCost  = usageData.inputTokens  * inputUnitCost
            const outputCost = usageData.outputTokens * outputUnitCost
            const totalCost  = inputCost + outputCost
            await prisma.usageEvent.create({
              data: {
                userId: session.user.id,
                inspectionId,
                eventType: "AI_ASSISTANT_QUERY",
                eventData: JSON.stringify({
                  feature: "scope_generation",
                  model,
                  inputTokens: usageData.inputTokens,
                  outputTokens: usageData.outputTokens,
                }),
                unitCost: outputUnitCost, // per output token (dominant cost)
                units: usageData.outputTokens,
                totalCost,
                currency: "USD",
              },
            }).catch((e) => console.warn("[generate-scope] Usage log failed:", e))
          }

          // Parse generated scope into ScopeItem records (atomic swap)
          const savedScopeItemIds: string[] = []
          try {
            // Extract numbered sections from the generated markdown
            const sectionMatches = accumulatedText.matchAll(/^#{1,3}\s*\d+[\.\)]\s+(.+)$/gm)
            const sectionTitles = Array.from(sectionMatches).map((m) => m[1].trim())

            if (sectionTitles.length > 0) {
              // Build replacement payloads in memory first (no side-effects yet)
              const iicrcPattern = /IICRC S\d+:\d{4} §[\d.]+/
              const newItems = sectionTitles.map((title) => {
                // Use a static pattern to avoid RegExp-from-variable ReDoS risk
                const titleFragment = title.slice(0, 20)
                const contextStart = accumulatedText.indexOf(titleFragment)
                const contextSlice = contextStart >= 0
                  ? accumulatedText.slice(contextStart, contextStart + 300)
                  : ""
                const iicrcRef = contextSlice.match(iicrcPattern)?.[0]
                return {
                  inspectionId,
                  itemType: title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 50),
                  description: title,
                  autoDetermined: false,
                  justification: iicrcRef ?? "AI-generated per IICRC S500:2021",
                  isRequired: true,
                  isSelected: true,
                }
              })

              // Pre-generate IDs so createMany returns deterministic IDs without N+1 queries
              const { randomUUID } = await import("crypto")
              const newItemsWithIds = newItems.map((item) => ({ id: randomUUID(), ...item }))

              // Atomic: delete stale items and bulk-insert new ones in one transaction
              await prisma.$transaction(async (tx) => {
                await tx.scopeItem.deleteMany({ where: { inspectionId, autoDetermined: false } })
                await tx.scopeItem.createMany({ data: newItemsWithIds })
              })
              savedScopeItemIds.push(...newItemsWithIds.map((i) => i.id))
            }
          } catch (parseErr) {
            console.warn("[generate-scope] ScopeItem parse failed:", parseErr)
            throw parseErr // surface so the SSE error event fires and DB stays consistent
          }

          // Persist generated narrative so the page can restore it on reload
          if (accumulatedText) {
            await prisma.inspection.update({
              where: { id: inspectionId },
              data: { generatedNarrative: accumulatedText },
            }).catch((e) => console.warn("[generate-scope] Narrative persist failed:", e))
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "done",
                scopeItemIds: savedScopeItemIds,
                usage: usageData,
              })}\n\n`
            )
          )
          controller.close()
        } catch (streamErr) {
          const message = streamErr instanceof Error ? streamErr.message : "Stream failed"
          console.error("[generate-scope stream]", streamErr)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", error: message })}\n\n`)
          )
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("[generate-scope POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
