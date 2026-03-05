import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/webhooks/quickbooks - Receive webhook events from QuickBooks
 *
 * QuickBooks sends webhook notifications for:
 * - Invoice (Create, Update, Delete, Void)
 * - Payment (Create, Update, Delete, Void)
 * - Customer (Create, Update, Delete, Merge)
 *
 * Documentation: https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks
 */
export async function POST(request: NextRequest) {
  try {
    // Get signature from header
    const signature = request.headers.get('intuit-signature')

    if (!signature) {
      console.error('[QuickBooks Webhook] Missing signature header')
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      )
    }

    // Read raw body for signature verification
    const rawBody = await request.text()

    // Verify webhook signature
    const webhookToken = process.env.QUICKBOOKS_WEBHOOK_TOKEN
    if (!webhookToken) {
      console.error('[QuickBooks Webhook] QUICKBOOKS_WEBHOOK_TOKEN not configured')
      return NextResponse.json(
        { error: 'Webhook token not configured' },
        { status: 500 }
      )
    }

    // Compute expected signature using HMAC-SHA256
    const expectedSignature = createHmac('sha256', webhookToken)
      .update(rawBody)
      .digest('base64')

    if (signature !== expectedSignature) {
      console.error('[QuickBooks Webhook] Invalid signature')
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }

    // Parse webhook payload
    const payload = JSON.parse(rawBody)

    // QuickBooks sends array of eventNotifications
    const eventNotifications = payload.eventNotifications || []

    if (eventNotifications.length === 0) {
      console.log('[QuickBooks Webhook] No events in payload')
      return NextResponse.json({ success: true, processed: 0 })
    }

    console.log(`[QuickBooks Webhook] Received ${eventNotifications.length} notification groups`)

    const queuedEvents = []

    // Process each notification group
    for (const notification of eventNotifications) {
      const realmId = notification.realmId

      if (!realmId) {
        console.error('[QuickBooks Webhook] Missing realmId in notification')
        continue
      }

      // Find the integration for this realm
      const integration = await prisma.integration.findFirst({
        where: {
          provider: 'QUICKBOOKS',
          realmId: realmId,
          status: 'CONNECTED'
        }
      })

      if (!integration) {
        console.warn(`[QuickBooks Webhook] No active integration found for realm ${realmId}`)
        continue
      }

      // Process each data change notification
      const dataChangeEvents = notification.dataChangeEvent?.entities || []

      for (const entity of dataChangeEvents) {
        try {
          const entityName = entity.name // Invoice, Payment, Customer
          const operation = entity.operation // Create, Update, Delete, Void, Merge

          // Map QuickBooks entity names to our standard event types
          let eventType = ''

          if (entityName === 'Invoice') {
            if (operation === 'Create') {
              eventType = 'invoice.created'
            } else if (operation === 'Update') {
              eventType = 'invoice.updated'
            } else if (operation === 'Delete' || operation === 'Void') {
              eventType = 'invoice.deleted'
            }
          } else if (entityName === 'Payment') {
            if (operation === 'Create') {
              eventType = 'payment.created'
            } else if (operation === 'Update') {
              eventType = 'payment.updated'
            } else if (operation === 'Delete' || operation === 'Void') {
              eventType = 'payment.deleted'
            }
          } else if (entityName === 'Customer') {
            if (operation === 'Create') {
              eventType = 'customer.created'
            } else if (operation === 'Update' || operation === 'Merge') {
              eventType = 'customer.updated'
            } else if (operation === 'Delete') {
              eventType = 'customer.deleted'
            }
          } else {
            // Skip unsupported entity types
            continue
          }

          // Check for duplicate events
          const existingEvent = await prisma.webhookEvent.findFirst({
            where: {
              provider: 'QUICKBOOKS',
              integrationId: integration.id,
              payload: {
                path: ['id'],
                equals: entity.id
              },
              createdAt: {
                gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
              }
            }
          })

          if (existingEvent) {
            console.log(`[QuickBooks Webhook] Duplicate event detected: ${eventType} for ${entity.id}`)
            continue
          }

          // Create webhook event record
          const webhookEvent = await prisma.webhookEvent.create({
            data: {
              provider: 'QUICKBOOKS',
              integrationId: integration.id,
              eventType,
              payload: entity,
              signature,
              status: 'PENDING'
            }
          })

          queuedEvents.push(webhookEvent.id)
          console.log(`[QuickBooks Webhook] Queued event ${webhookEvent.id}: ${eventType}`)
        } catch (error) {
          console.error(`[QuickBooks Webhook] Failed to queue event:`, error)
          // Continue processing other events
        }
      }
    }

    // Return 200 OK immediately (async processing will happen later)
    return NextResponse.json({
      success: true,
      processed: queuedEvents.length,
      eventIds: queuedEvents
    })

  } catch (error) {
    console.error('[QuickBooks Webhook] Error processing webhook:', error)

    // Return 200 to prevent QuickBooks from retrying on our errors
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 200 }
    )
  }
}
