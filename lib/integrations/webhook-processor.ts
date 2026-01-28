import { prisma } from '@/lib/prisma'
import { IntegrationProvider, WebhookEventStatus } from '@prisma/client'

/**
 * Webhook Event Processor
 *
 * Processes queued webhook events from accounting systems
 * Handles payment status updates, invoice changes, and customer sync
 */

interface WebhookEvent {
  id: string
  provider: IntegrationProvider
  integrationId: string
  eventType: string
  payload: any
  signature: string | null
  status: WebhookEventStatus
  processedAt: Date | null
  errorMessage: string | null
  retryCount: number
  createdAt: Date
  updatedAt: Date
}

/**
 * Main entry point for processing a webhook event
 */
export async function processWebhookEvent(eventId: string): Promise<void> {
  const event = await prisma.webhookEvent.findUnique({
    where: { id: eventId },
    include: {
      integration: true
    }
  })

  if (!event) {
    console.error(`[Webhook Processor] Event ${eventId} not found`)
    return
  }

  // Skip if already processed
  if (event.status === 'COMPLETED' || event.status === 'SKIPPED') {
    console.log(`[Webhook Processor] Event ${eventId} already processed`)
    return
  }

  // Update status to PROCESSING
  await prisma.webhookEvent.update({
    where: { id: eventId },
    data: { status: 'PROCESSING' }
  })

  try {
    console.log(`[Webhook Processor] Processing event ${eventId}: ${event.eventType}`)

    // Route to appropriate handler based on event type
    switch (event.eventType) {
      case 'invoice.paid':
      case 'payment.created':
        await handlePaymentCreated(event)
        break

      case 'invoice.updated':
        await handleInvoiceUpdated(event)
        break

      case 'invoice.created':
        await handleInvoiceCreated(event)
        break

      case 'invoice.deleted':
        await handleInvoiceDeleted(event)
        break

      case 'customer.created':
      case 'customer.updated':
        await handleCustomerUpdated(event)
        break

      default:
        console.log(`[Webhook Processor] Unhandled event type: ${event.eventType}`)
        // Mark as SKIPPED for unsupported event types
        await prisma.webhookEvent.update({
          where: { id: eventId },
          data: {
            status: 'SKIPPED',
            processedAt: new Date(),
            errorMessage: `Unsupported event type: ${event.eventType}`
          }
        })
        return
    }

    // Mark as completed
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: 'COMPLETED',
        processedAt: new Date(),
        errorMessage: null
      }
    })

    console.log(`[Webhook Processor] Successfully processed event ${eventId}`)
  } catch (error: any) {
    console.error(`[Webhook Processor] Error processing event ${eventId}:`, error)

    // Update retry count and status
    const retryCount = event.retryCount + 1
    const maxRetries = 5

    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: retryCount >= maxRetries ? 'FAILED' : 'PENDING',
        errorMessage: error.message || 'Unknown error',
        retryCount
      }
    })

    if (retryCount >= maxRetries) {
      console.error(`[Webhook Processor] Event ${eventId} failed after ${maxRetries} retries`)
    }
  }
}

/**
 * Handle payment created / invoice paid events
 */
async function handlePaymentCreated(event: any): Promise<void> {
  const payload = event.payload

  let externalInvoiceId: string | null = null
  let paymentAmount: number = 0
  let paymentDate: Date = new Date()

  // Extract payment details based on provider
  if (event.provider === 'XERO') {
    externalInvoiceId = payload.resourceId // Invoice ID
    // Fetch full invoice details from Xero to get payment info
    // For now, we'll assume the invoice is fully paid
    paymentAmount = 0 // Will be updated when we fetch full details
    paymentDate = new Date(payload.eventDateUtc || Date.now())
  } else if (event.provider === 'QUICKBOOKS') {
    externalInvoiceId = payload.id
    paymentAmount = payload.TotalAmt || 0
    paymentDate = new Date(payload.TxnDate || Date.now())
  } else if (event.provider === 'MYOB') {
    externalInvoiceId = payload.ResourceUID
    paymentAmount = payload.Amount || 0
    paymentDate = new Date(payload.Date || Date.now())
  }

  if (!externalInvoiceId) {
    throw new Error('Missing external invoice ID in payment event')
  }

  // Find the invoice by external ID
  const invoice = await prisma.invoice.findFirst({
    where: {
      externalInvoiceId,
      externalProvider: event.provider
    }
  })

  if (!invoice) {
    console.warn(`[Webhook Processor] Invoice not found for external ID ${externalInvoiceId}`)
    return
  }

  // Convert payment amount to cents
  const paymentAmountCents = Math.round(paymentAmount * 100)

  // Create payment record (will be implemented in Phase 6)
  // For now, just update invoice status
  const amountDue = invoice.amountDue - paymentAmountCents

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: amountDue <= 0 ? 'PAID' : 'PARTIAL',
      amountDue: Math.max(0, amountDue),
      paidAt: amountDue <= 0 ? new Date() : null
    }
  })

  // Create audit log entry
  await prisma.invoiceAuditLog.create({
    data: {
      invoiceId: invoice.id,
      userId: invoice.userId,
      action: 'payment_received',
      description: `Payment received from ${event.provider}: ${paymentAmountCents / 100}`,
      metadata: {
        provider: event.provider,
        externalInvoiceId,
        paymentAmount: paymentAmountCents,
        webhookEventId: event.id
      }
    }
  })

  console.log(`[Webhook Processor] Updated invoice ${invoice.id} with payment from ${event.provider}`)
}

/**
 * Handle invoice updated events
 */
async function handleInvoiceUpdated(event: any): Promise<void> {
  const payload = event.payload

  let externalInvoiceId: string | null = null

  // Extract invoice ID based on provider
  if (event.provider === 'XERO') {
    externalInvoiceId = payload.resourceId
  } else if (event.provider === 'QUICKBOOKS') {
    externalInvoiceId = payload.id
  } else if (event.provider === 'MYOB') {
    externalInvoiceId = payload.ResourceUID
  }

  if (!externalInvoiceId) {
    throw new Error('Missing external invoice ID in update event')
  }

  // Find the invoice by external ID
  const invoice = await prisma.invoice.findFirst({
    where: {
      externalInvoiceId,
      externalProvider: event.provider
    }
  })

  if (!invoice) {
    console.warn(`[Webhook Processor] Invoice not found for external ID ${externalInvoiceId}`)
    return
  }

  // Create audit log entry for the update
  await prisma.invoiceAuditLog.create({
    data: {
      invoiceId: invoice.id,
      userId: invoice.userId,
      action: 'external_update',
      description: `Invoice updated in ${event.provider}`,
      metadata: {
        provider: event.provider,
        externalInvoiceId,
        webhookEventId: event.id
      }
    }
  })

  console.log(`[Webhook Processor] Logged external update for invoice ${invoice.id}`)
}

/**
 * Handle invoice created events
 */
async function handleInvoiceCreated(event: any): Promise<void> {
  // For now, just log the creation
  // In a full two-way sync, we might want to import the invoice
  console.log(`[Webhook Processor] Invoice created in ${event.provider}:`, event.payload)
}

/**
 * Handle invoice deleted events
 */
async function handleInvoiceDeleted(event: any): Promise<void> {
  const payload = event.payload

  let externalInvoiceId: string | null = null

  // Extract invoice ID based on provider
  if (event.provider === 'XERO') {
    externalInvoiceId = payload.resourceId
  } else if (event.provider === 'QUICKBOOKS') {
    externalInvoiceId = payload.id
  } else if (event.provider === 'MYOB') {
    externalInvoiceId = payload.ResourceUID
  }

  if (!externalInvoiceId) {
    throw new Error('Missing external invoice ID in delete event')
  }

  // Find the invoice by external ID
  const invoice = await prisma.invoice.findFirst({
    where: {
      externalInvoiceId,
      externalProvider: event.provider
    }
  })

  if (!invoice) {
    console.warn(`[Webhook Processor] Invoice not found for external ID ${externalInvoiceId}`)
    return
  }

  // Create audit log entry for the deletion
  await prisma.invoiceAuditLog.create({
    data: {
      invoiceId: invoice.id,
      userId: invoice.userId,
      action: 'external_delete',
      description: `Invoice deleted in ${event.provider}`,
      metadata: {
        provider: event.provider,
        externalInvoiceId,
        webhookEventId: event.id
      }
    }
  })

  console.log(`[Webhook Processor] Logged external deletion for invoice ${invoice.id}`)
}

/**
 * Handle customer created/updated events
 */
async function handleCustomerUpdated(event: any): Promise<void> {
  // For now, just log the customer change
  // In a full two-way sync, we might want to update client records
  console.log(`[Webhook Processor] Customer ${event.eventType} in ${event.provider}:`, event.payload)
}

/**
 * Batch process pending webhook events
 * Should be called by background job queue
 */
export async function processPendingWebhookEvents(limit: number = 10): Promise<void> {
  const pendingEvents = await prisma.webhookEvent.findMany({
    where: {
      status: 'PENDING',
      retryCount: {
        lt: 5 // Max 5 retries
      }
    },
    orderBy: {
      createdAt: 'asc'
    },
    take: limit
  })

  console.log(`[Webhook Processor] Processing ${pendingEvents.length} pending events`)

  for (const event of pendingEvents) {
    await processWebhookEvent(event.id)
  }
}
