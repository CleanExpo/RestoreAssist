import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createRequire } from "module"

const require = createRequire(import.meta.url)

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const userId = (session.user as any).id

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    let text = ""
    try {
      const pdfParseModule = require("pdf-parse")
      let pdfData: any
      
      if (typeof pdfParseModule === 'function') {
        pdfData = await pdfParseModule(buffer)
      }
      else if (pdfParseModule.default && typeof pdfParseModule.default === 'function') {
        pdfData = await pdfParseModule.default(buffer)
      }
      else if (pdfParseModule.PDFParse) {
        const PDFParse = pdfParseModule.PDFParse
        const parser = new PDFParse(buffer, {})
        await parser.load()
        text = parser.getText()
      }
      else {
        const funcKey = Object.keys(pdfParseModule).find(key => {
          const val = (pdfParseModule as any)[key]
          return typeof val === 'function'
        })
        if (funcKey) {
          pdfData = await (pdfParseModule as any)[funcKey](buffer)
          text = pdfData?.text || ""
        } else {
          throw new Error("Could not find pdf-parse parsing function in module")
        }
      }
      
      if (pdfData && !text && pdfData.text) {
        text = pdfData.text
      }
      
      if (!text) {
        throw new Error("No text extracted from PDF")
      }
    } catch (error: any) {
      if (error.message?.includes('canvas') || error.message?.includes('napi-rs')) {
        return NextResponse.json(
          { error: "PDF parsing failed. The PDF may be image-based. Please try a text-based PDF or contact support." },
          { status: 500 }
        )
      }
      return NextResponse.json(
        { error: `Failed to parse PDF: ${error.message || "Unknown error"}` },
        { status: 500 }
      )
    }

    if (!text || text.trim().length < 10) {
      return NextResponse.json(
        { error: "Could not extract text from PDF. The PDF may be image-based or corrupted." },
        { status: 400 }
      )
    }

    const parsedData = parseReportFromText(text)
    const pdfBase64 = buffer.toString("base64")
    const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`

    return NextResponse.json({
      success: true,
      extractedText: text,
      parsedData: parsedData,
      originalPdf: pdfDataUrl,
      message: "PDF parsed successfully"
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

function parseReportFromText(text: string): any {
  const data: any = {}

  const extractField = (label: string, multiline: boolean = false): string => {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`${escapedLabel}:\\s*([^\\n]+)`, 'i')
    const match = text.match(pattern)
    
    if (match && match[1]) {
      let value = match[1].trim()
      value = value.replace(/\s+[A-Z][a-z]+\\s*[A-Z]?[^:]*:.*$/, '').trim()
      if (value && value.length > 0) {
        return value
      }
    }
    
    if (multiline) {
      const multilinePattern = new RegExp(`${escapedLabel}:\\s*([\\s\\S]+?)(?=\\n\\s*[A-Z][^:]*:|$)`, 'i')
      const multilineMatch = text.match(multilinePattern)
      if (multilineMatch && multilineMatch[1]) {
        let value = multilineMatch[1].trim()
        value = value.replace(/\n\s*\n/g, ' ').replace(/\n/g, ' ').trim()
        if (value && value.length > 0) {
          return value
        }
      }
    }
    
    return ''
  }

  data.clientName = extractField('Client Name') || extractField('Client') || ''
  data.propertyAddress = extractField('Property Address') || extractField('Address') || ''
  data.inspectionDate = extractField('Inspection Date') || extractField('Date') || ''
  data.waterCategory = extractField('Water Category') || extractField('Category') || ''
  data.waterClass = extractField('Water Class') || extractField('Class') || ''
  data.sourceOfWater = extractField('Source of Water') || extractField('Source') || ''
  data.affectedArea = parseFloat(extractField('Affected Area')) || 0
  data.safetyHazards = extractField('Safety Hazards', true) || ''
  data.structuralDamage = extractField('Structural Damage', true) || ''
  data.contentsDamage = extractField('Contents Damage', true) || ''
  data.electricalHazards = extractField('Electrical Hazards') || ''
  data.microbialGrowth = extractField('Microbial Growth') || ''
  data.hvacAffected = extractField('HVAC Affected')?.toLowerCase().includes('yes') || false
  data.estimatedDryingTime = parseInt(extractField('Estimated Drying Time')) || null

  return data
}


