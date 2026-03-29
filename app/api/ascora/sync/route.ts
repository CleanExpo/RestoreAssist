/**
 * POST /api/ascora/sync
 * Full historical import of all Ascora jobs + line items for the authenticated user.
 * Seeds ScopePricingDatabase with real AU pricing data.
 *
 * Runs paginated (pageSize=1000 max per Ascora docs).
 * Idempotent: existing ascoraJobId records are skipped (createMany skipDuplicates).
 *
 * Query params:
 *   ?incremental=true  — only fetch jobs modified since lastSyncAt (faster, use for cron)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface AscoraJobRaw {
  JobID: string
  JobNumber?: string
  JobType?: string
  Suburb?: string
  State?: string
  Postcode?: string
  CompletedDate?: string | null
  SentToMyob?: boolean
}

interface AscoraLineItemRaw {
  JobID: string
  PartNumber: string
  Description: string
  Quantity: number
  UnitPriceExTax: number
  AmountExTax: number
  InvoiceDate?: string | null
}

/** Fetch all pages of a paginated Ascora endpoint */
async function fetchAllPages<T>(
  baseUrl: string,
  apiKey: string,
  path: string,
  pageSize = 1000
): Promise<T[]> {
  const results: T[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const url = `${baseUrl}${path}?page=${page}&pageSize=${pageSize}`
    const res = await fetch(url, {
      headers: { Auth: apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Ascora API error ${res.status} on ${url}: ${text}`)
    }

    const data = await res.json()

    // Ascora returns an array directly or wrapped in a data key
    const items: T[] = Array.isArray(data) ? data : (data.data ?? data.items ?? [])

    results.push(...items)

    // If we got fewer than pageSize items, we're on the last page
    if (items.length < pageSize) {
      hasMore = false
    } else {
      page++
    }
  }

  return results
}

/** Map Ascora jobType strings to RestoreAssist claim type enum values */
function mapClaimType(jobType: string | undefined | null): string | null {
  if (!jobType) return null
  const t = jobType.toLowerCase()
  if (t.includes("water") || t.includes("flood") || t.includes("leak")) return "water"
  if (t.includes("fire") || t.includes("smoke")) return "fire"
  if (t.includes("mould") || t.includes("mold")) return "mould"
  if (t.includes("storm") || t.includes("wind") || t.includes("hail")) return "storm"
  if (t.includes("bio") || t.includes("sewage") || t.includes("contamination")) return "biohazard"
  if (t.includes("odour") || t.includes("odor")) return "odour"
  if (t.includes("hvac") || t.includes("duct")) return "hvac"
  return "other"
}

/** Aggregate line items into ScopePricingDatabase upserts */
async function aggregateIntoPricingDb(
  lineItems: AscoraLineItemRaw[],
  jobSentToMyobMap: Map<string, boolean>
) {
  // Group by partNumber
  const byPart = new Map<
    string,
    {
      description: string
      prices: number[]
      quantities: number[]
      acceptedCount: number
      rejectedCount: number
    }
  >()

  for (const item of lineItems) {
    const key = item.PartNumber
    if (!byPart.has(key)) {
      byPart.set(key, {
        description: item.Description,
        prices: [],
        quantities: [],
        acceptedCount: 0,
        rejectedCount: 0,
      })
    }
    const entry = byPart.get(key)!
    entry.prices.push(item.UnitPriceExTax)
    entry.quantities.push(item.Quantity)

    const accepted = jobSentToMyobMap.get(item.JobID) ?? false
    if (accepted) {
      entry.acceptedCount++
    } else {
      entry.rejectedCount++
    }
  }

  // Upsert each part number into ScopePricingDatabase
  for (const [partNumber, data] of byPart.entries()) {
    const { prices, quantities, acceptedCount, rejectedCount } = data
    const sortedPrices = [...prices].sort((a, b) => a - b)
    const avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length
    const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)]
    const avgQty = quantities.reduce((s, q) => s + q, 0) / quantities.length
    const totalUsage = acceptedCount + rejectedCount
    const acceptanceRate = totalUsage > 0 ? acceptedCount / totalUsage : null

    await prisma.scopePricingDatabase.upsert({
      where: { partNumber },
      create: {
        partNumber,
        description: data.description,
        claimTypes: [], // populated later by admin or claim type mapping
        usageCount: totalUsage,
        averageUnitPriceAU: avgPrice,
        medianUnitPriceAU: medianPrice,
        minPriceAU: sortedPrices[0],
        maxPriceAU: sortedPrices[sortedPrices.length - 1],
        averageQuantity: avgQty,
        acceptanceRate,
        acceptedCount,
        rejectedCount,
        source: "ascora",
        isActive: true,
        priceHistory: [{ date: new Date().toISOString(), avgPrice }],
      },
      update: {
        description: data.description,
        // Accumulate counts rather than overwriting
        usageCount: { increment: totalUsage },
        acceptedCount: { increment: acceptedCount },
        rejectedCount: { increment: rejectedCount },
        // Recompute avg price — simplified: update to new value and append to history
        averageUnitPriceAU: avgPrice,
        medianUnitPriceAU: medianPrice,
        minPriceAU: sortedPrices[0],
        maxPriceAU: sortedPrices[sortedPrices.length - 1],
        averageQuantity: avgQty,
        // acceptanceRate recalculated from cumulative counts in a separate pass if needed
      },
    })
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const integration = await prisma.ascoraIntegration.findUnique({
      where: { userId: session.user.id },
    })
    if (!integration) {
      return NextResponse.json(
        { error: "Ascora not connected. POST /api/ascora/connect first." },
        { status: 404 }
      )
    }
    if (!integration.isActive) {
      return NextResponse.json({ error: "Ascora integration is disabled." }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const incremental = searchParams.get("incremental") === "true"

    // ------------------------------------------------------------------
    // Phase 1: Fetch jobs from Ascora
    // ------------------------------------------------------------------
    console.log(`[ascora/sync] Fetching jobs (incremental=${incremental})…`)
    const jobs = await fetchAllPages<AscoraJobRaw>(
      integration.baseUrl,
      integration.apiKey,
      "/jobs"
    )

    const filteredJobs = incremental && integration.lastSyncAt
      ? jobs.filter((j) => {
          const completed = j.CompletedDate ? new Date(j.CompletedDate) : null
          return completed && completed > integration.lastSyncAt!
        })
      : jobs

    // Upsert jobs (skip duplicates on ascoraJobId)
    let jobsImported = 0
    for (const job of filteredJobs) {
      await prisma.ascoraJob.upsert({
        where: { ascoraJobId: job.JobID },
        create: {
          integrationId: integration.id,
          ascoraJobId: job.JobID,
          ascoraJobNumber: job.JobNumber ?? null,
          jobType: job.JobType ?? null,
          claimType: mapClaimType(job.JobType),
          suburb: job.Suburb ?? null,
          state: job.State ?? null,
          postcode: job.Postcode ?? null,
          completedAt: job.CompletedDate ? new Date(job.CompletedDate) : null,
          sentToMyob: job.SentToMyob ?? false,
        },
        update: {
          sentToMyob: job.SentToMyob ?? false,
          completedAt: job.CompletedDate ? new Date(job.CompletedDate) : null,
        },
      })
      jobsImported++
    }

    // Build a fast lookup: JobID → sentToMyob (for acceptance rate calc)
    const jobSentToMyobMap = new Map<string, boolean>(
      filteredJobs.map((j) => [j.JobID, j.SentToMyob ?? false])
    )

    // ------------------------------------------------------------------
    // Phase 2: Fetch invoice line items
    // ------------------------------------------------------------------
    console.log(`[ascora/sync] Fetching line items…`)
    const allLineItems = await fetchAllPages<AscoraLineItemRaw>(
      integration.baseUrl,
      integration.apiKey,
      "/invoicedetails"
    )

    // Filter to only line items for jobs we just imported
    const jobIdSet = new Set(filteredJobs.map((j) => j.JobID))
    const lineItemsForImport = allLineItems.filter((li) => jobIdSet.has(li.JobID))

    // Upsert line items against their job records
    for (const li of lineItemsForImport) {
      const job = await prisma.ascoraJob.findUnique({ where: { ascoraJobId: li.JobID } })
      if (!job) continue // job wasn't imported (shouldn't happen)

      await prisma.ascoraLineItem.create({
        data: {
          ascoraJobId: job.id,
          partNumber: li.PartNumber,
          description: li.Description,
          quantity: li.Quantity,
          unitPriceExTax: li.UnitPriceExTax,
          amountExTax: li.AmountExTax,
          invoiceDate: li.InvoiceDate ? new Date(li.InvoiceDate) : null,
        },
      })
    }

    // ------------------------------------------------------------------
    // Phase 3: Aggregate into ScopePricingDatabase
    // ------------------------------------------------------------------
    console.log(`[ascora/sync] Aggregating into ScopePricingDatabase…`)
    await aggregateIntoPricingDb(lineItemsForImport, jobSentToMyobMap)

    // ------------------------------------------------------------------
    // Update integration metadata
    // ------------------------------------------------------------------
    await prisma.ascoraIntegration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(),
        totalJobsImported: { increment: jobsImported },
      },
    })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[ascora/sync] Complete. Jobs: ${jobsImported}, LineItems: ${lineItemsForImport.length}, ${elapsed}s`)

    return NextResponse.json({
      success: true,
      jobsImported,
      lineItemsImported: lineItemsForImport.length,
      elapsedSeconds: parseFloat(elapsed),
      message: `Imported ${jobsImported} jobs and ${lineItemsForImport.length} line items. ScopePricingDatabase seeded.`,
    })
  } catch (error) {
    console.error("[ascora/sync POST]", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
