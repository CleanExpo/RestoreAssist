/**
 * generate-sketch-pdf.ts — RA2-050 / RA2-051 (RA-120, RA-121)
 *
 * Generates a standalone A4-landscape floor plan PDF from canvas PNG exports.
 * Each floor occupies one page with a header, sketch image, and room legend.
 *
 * Also exports embedSketchesInPdf() for adding sketches to an existing
 * pdf-lib PDFDocument (RA-120 integration into report PDF).
 */

import { PDFDocument, rgb, StandardFonts, type RGB } from "pdf-lib"

// ── Constants ─────────────────────────────────────────────

/** A4 landscape (842 × 595 pt) */
const PAGE_W = 842
const PAGE_H = 595

const MARGIN = 36
const HEADER_H = 56
const FOOTER_H = 28
const CONTENT_Y_TOP = PAGE_H - MARGIN - HEADER_H
const CONTENT_H = PAGE_H - MARGIN * 2 - HEADER_H - FOOTER_H
const CONTENT_W = PAGE_W - MARGIN * 2

/** Scale: 100 canvas pixels = 1 metre */
const PX_PER_METRE = 100

const BRAND_DARK = rgb(0.11, 0.18, 0.28) // #1C2E47
const BRAND_CYAN = rgb(0.0, 0.73, 0.83)  // #00BAD4 approx
const TEXT_MAIN = rgb(0.1, 0.1, 0.1)
const TEXT_MUTED = rgb(0.45, 0.45, 0.45)
const DIVIDER = rgb(0.87, 0.87, 0.87)

// ── Room area extraction from Fabric.js JSON ──────────────

interface FabricObject {
  type?: string
  points?: { x: number; y: number }[]
  width?: number
  height?: number
  scaleX?: number
  scaleY?: number
  fill?: string
  stroke?: string
  data?: { label?: string; roomType?: string }
}

/** Shoelace formula — returns area of a polygon given its vertices. */
function shoelaceArea(pts: { x: number; y: number }[]): number {
  let area = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(area) / 2
}

interface RoomInfo {
  label: string
  areaM2: number
  stroke: string
}

function extractRooms(fabricJson: Record<string, unknown> | null | undefined): RoomInfo[] {
  if (!fabricJson) return []
  const objects = (fabricJson.objects as FabricObject[] | undefined) ?? []
  const rooms: RoomInfo[] = []

  for (const obj of objects) {
    if (obj.type?.toLowerCase() !== "polygon") continue
    if (!obj.points?.length) continue

    const scaleX = obj.scaleX ?? 1
    const scaleY = obj.scaleY ?? 1
    const scaledPts = obj.points.map(p => ({
      x: p.x * scaleX,
      y: p.y * scaleY,
    }))
    const areaM2 = shoelaceArea(scaledPts) / (PX_PER_METRE * PX_PER_METRE)

    rooms.push({
      label: obj.data?.label ?? obj.data?.roomType ?? "Room",
      areaM2,
      stroke: obj.stroke ?? "#3b82f6",
    })
  }

  return rooms
}

// ── Data URL → Uint8Array ─────────────────────────────────

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ── PDF building blocks ───────────────────────────────────

async function addSketchPage(
  doc: PDFDocument,
  floor: {
    label: string
    pngDataUrl: string
    fabricJson?: Record<string, unknown> | null
  },
  shared: {
    helvetica: Awaited<ReturnType<PDFDocument["embedFont"]>>
    bold: Awaited<ReturnType<PDFDocument["embedFont"]>>
    propertyAddress: string
    reportNumber: string
    pageNum: number
    totalPages: number
  }
) {
  const page = doc.addPage([PAGE_W, PAGE_H])
  const { helvetica, bold } = shared

  // ── Header ──
  page.drawRectangle({
    x: 0,
    y: PAGE_H - MARGIN - HEADER_H,
    width: PAGE_W,
    height: HEADER_H,
    color: BRAND_DARK,
  })

  // Brand label
  page.drawText("RestoreAssist", {
    x: MARGIN,
    y: PAGE_H - MARGIN - 22,
    size: 14,
    font: bold,
    color: rgb(1, 1, 1),
  })
  page.drawText("Floor Plan", {
    x: MARGIN,
    y: PAGE_H - MARGIN - 40,
    size: 9,
    font: helvetica,
    color: BRAND_CYAN,
  })

  // Address (centred)
  if (shared.propertyAddress) {
    const addrW = helvetica.widthOfTextAtSize(shared.propertyAddress, 10)
    page.drawText(shared.propertyAddress, {
      x: (PAGE_W - addrW) / 2,
      y: PAGE_H - MARGIN - 30,
      size: 10,
      font: helvetica,
      color: rgb(1, 1, 1),
    })
  }

  // Floor label (right)
  const floorLabelX = PAGE_W - MARGIN - bold.widthOfTextAtSize(floor.label, 12)
  page.drawText(floor.label, {
    x: floorLabelX,
    y: PAGE_H - MARGIN - 26,
    size: 12,
    font: bold,
    color: rgb(1, 1, 1),
  })
  if (shared.reportNumber) {
    const refText = `Ref: ${shared.reportNumber}`
    const refX = PAGE_W - MARGIN - helvetica.widthOfTextAtSize(refText, 9)
    page.drawText(refText, {
      x: refX,
      y: PAGE_H - MARGIN - 42,
      size: 9,
      font: helvetica,
      color: BRAND_CYAN,
    })
  }

  // ── Room legend ──
  const rooms = extractRooms(floor.fabricJson)
  let legendW = 0

  if (rooms.length > 0) {
    legendW = 140
    const legendX = PAGE_W - MARGIN - legendW
    const legendTop = CONTENT_Y_TOP - 4

    // Legend box
    page.drawRectangle({
      x: legendX,
      y: legendTop - rooms.length * 16 - 28,
      width: legendW,
      height: rooms.length * 16 + 28,
      color: rgb(0.97, 0.97, 0.97),
      borderColor: DIVIDER,
      borderWidth: 0.5,
    })

    page.drawText("Room Legend", {
      x: legendX + 8,
      y: legendTop - 16,
      size: 8,
      font: bold,
      color: TEXT_MAIN,
    })

    let ly = legendTop - 30
    for (const room of rooms) {
      // Colour swatch
      const hex = room.stroke.replace("#", "")
      const r = parseInt(hex.slice(0, 2), 16) / 255
      const g = parseInt(hex.slice(2, 4), 16) / 255
      const b = parseInt(hex.slice(4, 6), 16) / 255
      page.drawRectangle({ x: legendX + 8, y: ly + 1, width: 8, height: 8, color: rgb(r, g, b) })

      const label = room.label.length > 14 ? room.label.slice(0, 13) + "…" : room.label
      page.drawText(label, {
        x: legendX + 20,
        y: ly + 2,
        size: 7.5,
        font: helvetica,
        color: TEXT_MAIN,
      })

      const areaText = `${room.areaM2.toFixed(1)} m²`
      const areaX = legendX + legendW - 8 - helvetica.widthOfTextAtSize(areaText, 7.5)
      page.drawText(areaText, {
        x: areaX,
        y: ly + 2,
        size: 7.5,
        font: helvetica,
        color: TEXT_MUTED,
      })

      ly -= 16
    }
  }

  // ── Sketch image ──
  const pngBytes = dataUrlToBytes(floor.pngDataUrl)
  const pngImg = await doc.embedPng(pngBytes)
  const { width: imgW, height: imgH } = pngImg.scale(1)

  const availW = CONTENT_W - legendW - (legendW > 0 ? 8 : 0)
  const scale = Math.min(availW / imgW, CONTENT_H / imgH, 1)
  const drawW = imgW * scale
  const drawH = imgH * scale
  const imgX = MARGIN + (availW - drawW) / 2
  const imgY = CONTENT_Y_TOP - CONTENT_H + (CONTENT_H - drawH) / 2

  // White background so transparent canvas shows as white
  page.drawRectangle({ x: imgX, y: imgY, width: drawW, height: drawH, color: rgb(1, 1, 1) })
  page.drawImage(pngImg, { x: imgX, y: imgY, width: drawW, height: drawH })

  // ── Footer ──
  const footerY = MARGIN
  page.drawLine({
    start: { x: MARGIN, y: footerY + FOOTER_H - 2 },
    end: { x: PAGE_W - MARGIN, y: footerY + FOOTER_H - 2 },
    thickness: 0.5,
    color: DIVIDER,
  })

  const pageText = `Page ${shared.pageNum} of ${shared.totalPages}`
  page.drawText(pageText, {
    x: PAGE_W - MARGIN - helvetica.widthOfTextAtSize(pageText, 8),
    y: footerY + 8,
    size: 8,
    font: helvetica,
    color: TEXT_MUTED,
  })

  page.drawText("Generated by RestoreAssist · Floor plan is indicative only", {
    x: MARGIN,
    y: footerY + 8,
    size: 8,
    font: helvetica,
    color: TEXT_MUTED,
  })
}

// ── Public API ─────────────────────────────────────────────

export interface SketchFloor {
  label: string
  /** canvas.toDataURL({ format: 'png', multiplier: 2 }) */
  pngDataUrl: string
  /** Fabric.js toJSON() output (for room area extraction) */
  fabricJson?: Record<string, unknown> | null
}

export interface SketchPdfOptions {
  floors: SketchFloor[]
  propertyAddress?: string
  reportNumber?: string
  inspectionDate?: string
}

/**
 * Generate a standalone A4-landscape floor plan PDF.
 * Returns the PDF as a Uint8Array (for streaming to the client).
 */
export async function generateSketchPdf(options: SketchPdfOptions): Promise<Uint8Array> {
  const { floors, propertyAddress = "", reportNumber = "" } = options

  if (!floors.length) throw new Error("At least one floor is required")

  const doc = await PDFDocument.create()
  const helvetica = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const shared = {
    helvetica,
    bold,
    propertyAddress,
    reportNumber,
    totalPages: floors.length,
    pageNum: 0,
  }

  for (const floor of floors) {
    shared.pageNum++
    await addSketchPage(doc, floor, shared)
  }

  // Metadata
  doc.setTitle(`Floor Plan — ${propertyAddress || "RestoreAssist"}`)
  doc.setAuthor("RestoreAssist")
  doc.setCreator("RestoreAssist Sketch Tool")
  doc.setCreationDate(new Date())

  return doc.save()
}

/**
 * Embed floor plan sketch images into an existing pdf-lib PDFDocument.
 * Call this from within an existing report PDF generator (RA-120).
 * Adds a new landscape page per floor at the end of the document.
 */
export async function embedSketchesInPdf(
  doc: PDFDocument,
  floors: SketchFloor[],
  options: { propertyAddress?: string; reportNumber?: string } = {}
): Promise<void> {
  if (!floors.length) return

  const helvetica = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const shared = {
    helvetica,
    bold,
    propertyAddress: options.propertyAddress ?? "",
    reportNumber: options.reportNumber ?? "",
    totalPages: floors.length,
    pageNum: 0,
  }

  for (const floor of floors) {
    shared.pageNum++
    await addSketchPage(doc, floor, shared)
  }
}
