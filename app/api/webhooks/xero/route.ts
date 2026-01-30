import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/webhooks/xero - Receive webhook events from Xero
 *
 * Xero sends webhook notifications for:
 * - INVOICES (invoice.created, invoice.updated, invoice.paid)
 * - PAYMENTS (payment.created, payment.updated)
 * - CONTACTS (contact.created, contact.updated)
 *
 * Documentation: https://developer.xero.com/documentation/guides/webhooks/overview/
 */
export async function POST(request: NextRequest) {
  try {
    // Get webhook signature from header
    const signature = request.headers.get('x-xero-signature')

    if (!signature) {
      console.error('[Xero Webhook] Missing signature header')
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      )
    }

    // Read raw body for signature verification
    const rawBody = await request.text()

    // Verify webhook signature
    const webhookKey = process.env.XERO_WEBHOOK_KEY
    if (!webhookKey) {
      console.error('[Xero Webhook] XERO_WEBHOOK_KEY not configured')
      return NextResponse.json(
        { error: 'Webhook key not configured' },
        { status: 500 }
      )
    }

    // Compute expected signature using HMAC-SHA256
    const expectedSignature = createHmac('sha256', webhookKey)
      .update(rawBody)
      .digest('base64')

    if (signature !== expectedSignature) {
      console.error('[Xero Webhook] Invalid signature')
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }

    // Parse webhook payload
    const payload = JSON.parse(rawBody)

    // Xero sends array of events
    const events = payload.events || []

    if (events.length === 0) {
      console.log('[Xero Webhook] No events in payload')
      return NextResponse.json({ success: true, processed: 0 })
    }

    console.log(`[Xero Webhook] Received ${events.length} events`)

    // Find integration by tenantId (Xero's organization ID)
    const firstEvent = events[0]
    const tenantId = firstEvent.tenantId

    if (!tenantId) {
      console.error('[Xero Webhook] Missing tenantId in event')
      return NextResponse.json(
        { error: 'Missing tenantId' },
        { status: 400 }
      )
    }

    // Find the integration for this tenant
    const integration = await prisma.integration.findFirst({
      where: {
        provider: 'XERO',
        tenantId: tenantId,
        status: 'CONNECTED'
      }
    })

    if (!integration) {
      console.warn(`[Xero Webhook] No active integration found for tenant ${tenantId}`)
      // Return 200 to prevent Xero from retrying
      return NextResponse.json({ success: true, processed: 0 })
    }

    // Queue webhook events for async processing
    const queuedEvents = []

    for (const event of events) {
      try {
        // Map Xero event types to our standard event types
        let eventType = event.eventType
        const resourceType = event.resourceType // INVOICE, CONTACT, PAYMENT

        // Normalize event types
        if (resourceType === 'INVOICE') {
          if (eventType === 'CREATE') {
            eventType = 'invoice.created'
          } else if (eventType === 'UPDATE') {
            eventType = 'invoice.updated'
          } else if (eventType === 'DELETE') {
            eventType = 'invoice.deleted'
          }
        } else if (resourceType === 'PAYMENT') {
          if (eventType === 'CREATE') {
            eventType = 'payment.created'
          } else if (eventType === 'UPDATE') {
            eventType = 'payment.updated'
          }
        } else if (resourceType === 'CONTACT') {
          if (eventType === 'CREATE') {
            eventType = 'contact.created'
          } else if (eventType === 'UPDATE') {
            eventType = 'contact.updated'
          }
        }

        // Check for duplicate events (Xero may send duplicates)
        const existingEvent = await prisma.webhookEvent.findFirst({
          where: {
            provider: 'XERO',
            integrationId: integration.id,
            payload: {
              equals: event
            },
            createdAt: {
              gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
            }
          }
        })

        if (existingEvent) {
          console.log(`[Xero Webhook] Duplicate event detected: ${eventType} for ${event.resourceId}`)
          continue
        }

        // Create webhook event record
        const webhookEvent = await prisma.webhookEvent.create({
          data: {
            provider: 'XERO',
            integrationId: integration.id,
            eventType,
            payload: event,
            signature,
            status: 'PENDING'
          }
        })

        queuedEvents.push(webhookEvent.id)
        console.log(`[Xero Webhook] Queued event ${webhookEvent.id}: ${eventType}`)
      } catch (error) {
        console.error(`[Xero Webhook] Failed to queue event:`, error)
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
    console.error('[Xero Webhook] Error processing webhook:', error)

    // Return 200 to prevent Xero from retrying on our errors
    // Log the error for manual investigation
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 200 }
    )
  }
}
