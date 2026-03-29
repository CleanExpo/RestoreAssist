/**
 * POST /api/properties/scrape — RA2-021 / RA2-022 (RA-103, RA-104)
 *
 * Scrapes OnTheHouse.com.au for property data given an address.
 * Results are cached in the PropertyLookup table (90-day TTL).
 *
 * Body: { address: string, postcode?: string, inspectionId?: string, url?: string }
 * Returns: { data: ScrapedPropertyData, cached: boolean }
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  parseOnTheHouseHTML,
  parseOnTheHouseSearchResults,
  type ScrapedPropertyData,
} from "@/lib/property-data-parser"

const OTH_BASE = "https://www.onthehouse.com.au"
const TIMEOUT_MS = 15_000

const SCRAPE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-AU,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
}

async function fetchHtml(url: string): Promise<{ html: string; status: number }> {
  try {
    const res = await fetch(url, {
      headers: SCRAPE_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const html = await res.text()
    return { html, status: res.status }
  } catch (err) {
    console.error("fetchHtml failed:", url, err)
    return { html: "", status: 0 }
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { address, postcode, inspectionId, url: directUrl } = body

  if (!address && !directUrl) {
    return NextResponse.json({ error: "address or url is required" }, { status: 400 })
  }

  const normAddress = address?.toUpperCase().trim()
  const normPostcode = postcode?.trim()

  // ── Check cache ─────────────────────────────────────────
  if (normAddress && normPostcode) {
    try {
      const cached = await prisma.propertyLookup.findFirst({
        where: {
          propertyAddress: { equals: normAddress, mode: "insensitive" },
          propertyPostcode: normPostcode,
          dataSource: "onthehouse",
          expiresAt: { gt: new Date() },
        },
      })
      if (cached?.propertyData) {
        return NextResponse.json({ data: cached.propertyData, cached: true })
      }
    } catch {
      // Cache miss — continue to scrape
    }
  }

  // ── Resolve property URL ────────────────────────────────
  let propertyUrl = directUrl as string | undefined

  if (!propertyUrl) {
    const searchQuery = [address, postcode].filter(Boolean).join(" ")
    const searchUrl = `${OTH_BASE}/search?q=${encodeURIComponent(searchQuery)}`
    const { html: searchHtml, status: searchStatus } = await fetchHtml(searchUrl)

    if (searchStatus === 0) {
      return NextResponse.json(
        { error: "Could not connect to OnTheHouse. Please try again." },
        { status: 503 }
      )
    }
    if (searchStatus !== 200) {
      return NextResponse.json(
        { error: `OnTheHouse search returned status ${searchStatus}` },
        { status: 503 }
      )
    }

    const urls = parseOnTheHouseSearchResults(searchHtml, OTH_BASE)
    if (urls.length === 0) {
      return NextResponse.json(
        { error: "No property found on OnTheHouse for this address.", data: null },
        { status: 404 }
      )
    }
    propertyUrl = urls[0]
  }

  // ── Fetch and parse property page ───────────────────────
  const { html: propertyHtml, status: propertyStatus } = await fetchHtml(propertyUrl)

  if (propertyStatus === 0) {
    return NextResponse.json(
      { error: "Could not fetch property page from OnTheHouse." },
      { status: 503 }
    )
  }

  const data = parseOnTheHouseHTML(propertyHtml, propertyUrl)

  // ── Cache the result ────────────────────────────────────
  if (normAddress && normPostcode) {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) // 90 days

    try {
      await prisma.propertyLookup.upsert({
        where: {
          address_postcode_unique: {
            propertyAddress: normAddress,
            propertyPostcode: normPostcode,
          },
        },
        create: {
          propertyAddress: normAddress,
          propertyPostcode: normPostcode,
          lookupDate: now,
          expiresAt,
          apiResponseStatus: propertyStatus,
          dataSource: "onthehouse",
          lookupCost: 0,
          confidence: data.confidence,
          propertyData: data as unknown as Record<string, unknown>,
          ...(inspectionId ? { inspectionId } : {}),
        },
        update: {
          lookupDate: now,
          expiresAt,
          apiResponseStatus: propertyStatus,
          confidence: data.confidence,
          propertyData: data as unknown as Record<string, unknown>,
        },
      })
    } catch (err) {
      // Non-fatal — return the data even if caching fails
      console.error("PropertyLookup cache write failed:", err)
    }
  }

  return NextResponse.json({ data, cached: false })
}
