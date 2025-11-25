/**
 * File Extraction Utilities
 * 
 * Extracts text from various file formats (PDF, DOCX, TXT)
 */

import { createRequire } from 'module'

const require = createRequire(import.meta.url)

/**
 * Extract text from PDF buffer
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(buffer)
    return data.text || ''
  } catch (error: any) {
    throw new Error(`Failed to extract text from PDF: ${error.message}`)
  }
}

/**
 * Extract text from DOCX buffer
 */
export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const mammoth = require('mammoth')
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

