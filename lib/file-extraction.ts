/**
 * File Extraction Utilities
 * 
 * Extracts text from various file formats (PDF, DOCX, TXT)
 */

/**
 * Extract text from PDF buffer
 * Uses the exact same approach as the working parse-pdf route
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // Use createRequire for CommonJS compatibility (same as parse-pdf route)
    const { createRequire } = await import('module')
    const require = createRequire(import.meta.url)
    const pdfParseModule = require("pdf-parse")
    
    let text = ""
    let pdfData: any
    
    // Handle different pdf-parse module formats (exact same logic as parse-pdf route)
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
      // Try to find the function in the module
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
    
    // Extract text from pdfData if we got it
    if (pdfData && !text && pdfData.text) {
      text = pdfData.text
    }
    
    if (!text || text.trim().length < 10) {
      throw new Error("No text extracted from PDF or text too short. The PDF may be image-based or corrupted.")
    }
    
    return text
  } catch (error: any) {
    // Handle specific error cases
    if (error.message?.includes('canvas') || error.message?.includes('napi-rs') || error.message?.includes('Object.defineProperty')) {
      throw new Error("PDF parsing failed. The PDF may be image-based or have compatibility issues. Please try a text-based PDF.")
    }
    throw new Error(`Failed to extract text from PDF: ${error.message || 'Unknown error'}`)
  }
}

/**
 * Extract text from DOCX buffer
 */
export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    // Use dynamic import for Next.js compatibility
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value || ''
  } catch (error: any) {
    throw new Error(`Failed to extract text from DOCX: ${error.message}`)
  }
}

/**
 * Extract text from TXT buffer
 */
export async function extractTextFromTXT(buffer: Buffer): Promise<string> {
  try {
    return buffer.toString('utf-8')
  } catch (error: any) {
    throw new Error(`Failed to extract text from TXT: ${error.message}`)
  }
}

