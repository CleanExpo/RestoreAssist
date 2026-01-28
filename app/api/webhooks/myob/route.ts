import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/webhooks/myob - Receive webhook events from MYOB
 *
 * MYOB sends webhook notifications for:
 * - Sale.Invoice (Created, Updated, Deleted)
 * - Sale.CustomerPayment (Created, Updated, Deleted)
 * - Contact.Customer (Created, Updated, Deleted)
 *
 * Documentation: https://developer.myob.com/api/accountright/v2/
 */
export async function POST(request: NextRequest) {
  try {
    // Get webhook signature from header
    const signature = request.headers.get('x-myob-signature')

    if (!signature) {
      console.error('[MYOB Webhook] Missing signature header')
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      )
    }

    // Read raw body for signature verification
    const rawBody = await request.text()

    // Verify webhook signature
    const webhookSecret = process.env.MYOB_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('[MYOB Webhook] MYOB_WEBHOOK_SECRET not configured')
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      )
    }

    // Compute expected signature using HMAC-SHA256
    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex')

    if (signature !== expectedSignature) {
      console.error('[MYOB Webhook] Invalid signature')
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }

    // Parse webhook payload
    const payload = JSON.parse(rawBody)

    // MYOB sends array of events
    const events = payload.Events || []

    if (events.length === 0) {
      console.log('[MYOB Webhook] No events in payload')
      return NextResponse.json({ success: true, processed: 0 })
    }

    console.log(`[MYOB Webhook] Received ${events.length} events`)

    // Find integration by company file ID
    const firstEvent = events[0]
    const companyFileId = firstEvent.CompanyFileId

    if (!companyFileId) {
      console.error('[MYOB Webhook] Missing CompanyFileId in event')
      return NextResponse.json(
        { error: 'Missing CompanyFileId' },
        { status: 400 }
      )
    }

    // Find the integration for this company file
    const integration = await prisma.integration.findFirst({
      where: {
        provider: 'MYOB',
        companyId: companyFileId,
        status: 'CONNECTED'
      }
    })

    if (!integration) {
      console.warn(`[MYOB Webhook] No active integration found for company ${companyFileId}`)
      // Return 200 to prevent MYOB from retrying
      return NextResponse.json({ success: true, processed: 0 })
    }

    // Queue webhook events for async processing
    const queuedEvents = []

    for (const event of events) {
      try {
        // MYOB event structure:
        // EventType: "Created" | "Updated" | "Deleted"
        // ResourceType: "Sale.Invoice" | "Sale.CustomerPayment" | "Contact.Customer"
        const eventType = event.EventType // Created, Updated, Deleted
        const resourceType = event.ResourceType // Sale.Invoice, Sale.CustomerPayment, etc.

        // Map MYOB resource types to our standard event types
        let standardEventType = ''

        if (resourceType === 'Sale.Invoice') {
          if (eventType === 'Created') {
            standardEventType = 'invoice.created'
          } else if (eventType === 'Updated') {
            standardEventType = 'invoice.updated'
          } else if (eventType === 'Deleted') {
            standardEventType = 'invoice.deleted'
          }
        } else if (resourceType === 'Sale.CustomerPayment') {
          if (eventType === 'Created') {
            standardEventType = 'payment.created'
          } else if (eventType === 'Updated') {
            standardEventType = 'payment.updated'
          } else if (eventType === 'Deleted') {
            standardEventType = 'payment.deleted'
          }
        } else if (resourceType === 'Contact.Customer') {
          if (eventType === 'Created') {
            standardEventType = 'customer.created'
          } else if (eventType === 'Updated') {
            standardEventType = 'customer.updated'
          } else if (eventType === 'Deleted') {
            standardEventType = 'customer.deleted'
          }
        } else {
          // Skip unsupported resource types
          continue
        }

        // Check for duplicate events (MYOB may send duplicates)
        const existingEvent = await prisma.webhookEvent.findFirst({
          where: {
            provider: 'MYOB',
            integrationId: integration.id,
            payload: {
              path: ['ResourceUID'],
              equals: event.ResourceUID
            },
            createdAt: {
              gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
            }
          }
        })

        if (existingEvent) {
          console.log(`[MYOB Webhook] Duplicate event detected: ${standardEventType} for ${event.ResourceUID}`)
          continue
        }

        // Create webhook event record
        const webhookEvent = await prisma.webhookEvent.create({
          data: {
            provider: 'MYOB',
            integrationId: integration.id,
            eventType: standardEventType,
            payload: event,
            signature,
            status: 'PENDING'
          }
        })

        queuedEvents.push(webhookEvent.id)
        console.log(`[MYOB Webhook] Queued event ${webhookEvent.id}: ${standardEventType}`)
      } catch (error) {
        console.error(`[MYOB Webhook] Failed to queue event:`, error)
        // Continue processing other events
      }
    }

    // Return 200 OK immediately (async processing will happen later)
    return NextResponse.json({
      success: true,
      processed: queuedEvents.length,
      eventIds: queuedEvents
    })

  } catch (error) {
    console.error('[MYOB Webhook] Error processing webhook:', error)

    // Return 200 to prevent MYOB from retrying on our errors
    // Log the error for manual investigation
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 200 }
    )
  }
}
