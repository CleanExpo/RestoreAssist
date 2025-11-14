import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured' },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
    }

    // Convert PDF to base64
    const arrayBuffer = await file.arrayBuffer()
    const base64Data = Buffer.from(arrayBuffer).toString('base64')

    const anthropic = new Anthropic({ apiKey: anthropicApiKey })

    const systemPrompt = `You are a data extraction assistant. Extract structured information from the PDF document.

Extract the following fields if available:
- clientName: Full name of the client
- clientContactDetails: Phone number, email, etc.
- propertyAddress: Full property address
- propertyPostcode: Postcode (4 digits)
- claimReferenceNumber: Claim reference or job number
- incidentDate: Date of incident (format: YYYY-MM-DD)
- technicianAttendanceDate: Date technician attended (format: YYYY-MM-DD)
- technicianName: Name of technician/inspector
- fullText: All text content from the PDF

Return ONLY a valid JSON object. Use empty string "" for missing fields.

Example:
{
  "clientName": "John Doe",
  "clientContactDetails": "0412 345 678",
  "propertyAddress": "123 Main St, Sydney NSW",
  "propertyPostcode": "2000",
  "claimReferenceNumber": "CLM-12345",
  "incidentDate": "2024-01-15",
  "technicianAttendanceDate": "2024-01-16",
  "technicianName": "Jane Smith",
  "fullText": "entire document text..."
}`

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Data
                }
              },
              {
                type: 'text',
                text: 'Extract all the structured data from this PDF document and return it as JSON.'
              }
            ]
          }
        ]
      })

      if (!response.content || response.content.length === 0) {
        return NextResponse.json(
          { error: 'Claude returned empty response' },
          { status: 500 }
        )
      }

      const content = response.content[0]
      if (content.type !== 'text') {
        return NextResponse.json(
          { error: 'Unexpected response format from Claude' },
          { status: 500 }
        )
      }

      // Extract JSON from response
      let parsedData: any = {}
      try {
        // Remove markdown code blocks if present
        let jsonText = content.text.trim()
        jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '')
        
        // Try to find JSON object
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[0])
        } else {
          throw new Error('No JSON found in response')
        }
      } catch (parseError) {
        console.error('Failed to parse Claude response:', parseError)
        console.error('Raw response:', content.text)
        return NextResponse.json(
          { error: 'Failed to parse extracted data. Please try again.' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        extractedText: parsedData.fullText || '',
        parsedData: {
          clientName: parsedData.clientName || '',
          clientContactDetails: parsedData.clientContactDetails || '',
          propertyAddress: parsedData.propertyAddress || '',
          propertyPostcode: parsedData.propertyPostcode || '',
          claimReferenceNumber: parsedData.claimReferenceNumber || '',
          incidentDate: parsedData.incidentDate || '',
          technicianAttendanceDate: parsedData.technicianAttendanceDate || '',
          technicianName: parsedData.technicianName || '',
          technicianFieldReport: parsedData.fullText || ''
        },
        message: 'PDF parsed successfully. Please review and complete the form.'
      })

    } catch (claudeError: any) {
      console.error('Claude API error:', claudeError)
      return NextResponse.json(
        { error: `Claude API error: ${claudeError.message}` },
        { status: 500 }
      )
    }

  } catch (error: any) {
    console.error('Error in upload route:', error)
    return NextResponse.json(
      { error: `Failed to process PDF: ${error.message}` },
      { status: 500 }
    )
  }
}