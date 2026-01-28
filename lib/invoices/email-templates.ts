/**
 * Professional Invoice Email Templates
 *
 * Provides HTML email templates for invoice-related communications
 * including invoice sent, payment received, overdue reminders, and receipts.
 */

interface InvoiceEmailData {
  invoiceNumber: string
  invoiceDate: Date
  dueDate: Date
  totalIncGST: number
  amountPaid?: number
  amountDue: number
  customerName: string
  publicToken?: string
  businessName: string
  businessEmail?: string
  businessPhone?: string
  appUrl: string
}

interface PaymentEmailData {
  invoiceNumber: string
  paymentDate: Date
  amountPaid: number
  paymentMethod: string
  reference?: string
  customerName: string
  businessName: string
  remainingBalance: number
}

interface ReminderEmailData {
  invoiceNumber: string
  dueDate: Date
  daysOverdue: number
  amountDue: number
  customerName: string
  publicToken: string
  businessName: string
  businessEmail?: string
  businessPhone?: string
  appUrl: string
}

/**
 * Generate invoice sent email HTML
 */
export function generateInvoiceSentEmail(data: InvoiceEmailData): string {
  const {
    invoiceNumber,
    invoiceDate,
    dueDate,
    totalIncGST,
    amountDue,
    customerName,
    publicToken,
    businessName,
    businessEmail,
    businessPhone,
    appUrl
  } = data

  const viewInvoiceUrl = publicToken
    ? `${appUrl}/invoices/public/${publicToken}`
    : `${appUrl}/dashboard/invoices`

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoiceNumber}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background-color: #f9fafb;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%);
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .header p {
      color: rgba(255, 255, 255, 0.9);
      margin: 10px 0 0;
      font-size: 16px;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 18px;
      color: #1f2937;
      margin-bottom: 20px;
    }
    .invoice-details {
      background-color: #eff6ff;
      border-left: 4px solid #0ea5e9;
      padding: 20px;
      border-radius: 4px;
      margin: 30px 0;
    }
    .invoice-details h3 {
      margin: 0 0 15px;
      color: #1e40af;
      font-size: 16px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      font-size: 14px;
    }
    .detail-label {
      font-weight: 600;
      color: #4b5563;
    }
    .detail-value {
      color: #1f2937;
    }
    .amount-due {
      font-size: 24px;
      font-weight: 700;
      color: #0ea5e9;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%);
      color: #ffffff;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
      text-align: center;
      margin: 20px 0;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .button:hover {
      background: linear-gradient(135deg, #0284c7 0%, #0891b2 100%);
    }
    .footer {
      background-color: #f9fafb;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      margin: 5px 0;
      font-size: 13px;
      color: #6b7280;
    }
    .footer a {
      color: #0ea5e9;
      text-decoration: none;
    }
    .divider {
      height: 1px;
      background-color: #e5e7eb;
      margin: 30px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Invoice ${invoiceNumber}</h1>
      <p>from ${businessName}</p>
    </div>

    <div class="content">
      <p class="greeting">Dear ${customerName},</p>

      <p>Thank you for your business. Please find your invoice details below.</p>

      <div class="invoice-details">
        <h3>Invoice Details</h3>
        <div class="detail-row">
          <span class="detail-label">Invoice Number:</span>
          <span class="detail-value">${invoiceNumber}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Invoice Date:</span>
          <span class="detail-value">${formatDate(invoiceDate)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Due Date:</span>
          <span class="detail-value">${formatDate(dueDate)}</span>
        </div>
        <div class="divider" style="margin: 15px 0;"></div>
        <div class="detail-row">
          <span class="detail-label">Amount Due:</span>
          <span class="amount-due">${formatCurrency(amountDue)}</span>
        </div>
      </div>

      <center>
        <a href="${viewInvoiceUrl}" class="button">View Invoice Online</a>
      </center>

      <p style="margin-top: 30px;">You can view and download your invoice using the button above. If you have any questions about this invoice, please don't hesitate to contact us.</p>

      ${businessEmail ? `<p style="margin-top: 20px; font-size: 14px; color: #6b7280;"><strong>Questions?</strong> Contact us at <a href="mailto:${businessEmail}" style="color: #0ea5e9;">${businessEmail}</a>${businessPhone ? ` or ${businessPhone}` : ''}</p>` : ''}
    </div>

    <div class="footer">
      <p><strong>${businessName}</strong></p>
      ${businessEmail ? `<p><a href="mailto:${businessEmail}">${businessEmail}</a></p>` : ''}
      ${businessPhone ? `<p>${businessPhone}</p>` : ''}
      <p style="margin-top: 15px; font-size: 12px;">This is an automated email from RestoreAssist. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

/**
 * Generate payment received email HTML
 */
export function generatePaymentReceivedEmail(data: PaymentEmailData): string {
  const {
    invoiceNumber,
    paymentDate,
    amountPaid,
    paymentMethod,
    reference,
    customerName,
    businessName,
    remainingBalance
  } = data

  const isPaidInFull = remainingBalance === 0

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Received - ${invoiceNumber}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background-color: #f9fafb;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #22c55e 0%, #10b981 100%);
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .header p {
      color: rgba(255, 255, 255, 0.9);
      margin: 10px 0 0;
      font-size: 16px;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 18px;
      color: #1f2937;
      margin-bottom: 20px;
    }
    .payment-details {
      background-color: #f0fdf4;
      border-left: 4px solid #22c55e;
      padding: 20px;
      border-radius: 4px;
      margin: 30px 0;
    }
    .payment-details h3 {
      margin: 0 0 15px;
      color: #166534;
      font-size: 16px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      font-size: 14px;
    }
    .detail-label {
      font-weight: 600;
      color: #4b5563;
    }
    .detail-value {
      color: #1f2937;
    }
    .amount-paid {
      font-size: 24px;
      font-weight: 700;
      color: #22c55e;
    }
    .success-badge {
      display: inline-block;
      background-color: #22c55e;
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 14px;
      margin: 20px 0;
    }
    .footer {
      background-color: #f9fafb;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      margin: 5px 0;
      font-size: 13px;
      color: #6b7280;
    }
    .divider {
      height: 1px;
      background-color: #e5e7eb;
      margin: 30px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✓ Payment Received</h1>
      <p>Invoice ${invoiceNumber}</p>
    </div>

    <div class="content">
      <p class="greeting">Dear ${customerName},</p>

      <p>Thank you! We have successfully received your payment.</p>

      <div class="payment-details">
        <h3>Payment Confirmation</h3>
        <div class="detail-row">
          <span class="detail-label">Invoice Number:</span>
          <span class="detail-value">${invoiceNumber}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Payment Date:</span>
          <span class="detail-value">${formatDate(paymentDate)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Payment Method:</span>
          <span class="detail-value">${paymentMethod}</span>
        </div>
        ${reference ? `
        <div class="detail-row">
          <span class="detail-label">Reference:</span>
          <span class="detail-value">${reference}</span>
        </div>
        ` : ''}
        <div class="divider" style="margin: 15px 0;"></div>
        <div class="detail-row">
          <span class="detail-label">Amount Paid:</span>
          <span class="amount-paid">${formatCurrency(amountPaid)}</span>
        </div>
        ${!isPaidInFull ? `
        <div class="detail-row">
          <span class="detail-label">Remaining Balance:</span>
          <span class="detail-value">${formatCurrency(remainingBalance)}</span>
        </div>
        ` : ''}
      </div>

      <center>
        ${isPaidInFull ? '<div class="success-badge">✓ PAID IN FULL</div>' : '<div class="success-badge">✓ PARTIAL PAYMENT</div>'}
      </center>

      <p style="margin-top: 30px;">${isPaidInFull ? 'Your invoice has been paid in full. Thank you for your prompt payment!' : 'This is a partial payment. The remaining balance is shown above.'}</p>

      <p>A receipt for this payment will be sent to you separately.</p>
    </div>

    <div class="footer">
      <p><strong>${businessName}</strong></p>
      <p style="margin-top: 15px; font-size: 12px;">This is an automated email from RestoreAssist.</p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

/**
 * Generate overdue reminder email HTML
 */
export function generateOverdueReminderEmail(data: ReminderEmailData): string {
  const {
    invoiceNumber,
    dueDate,
    daysOverdue,
    amountDue,
    customerName,
    publicToken,
    businessName,
    businessEmail,
    businessPhone,
    appUrl
  } = data

  const viewInvoiceUrl = `${appUrl}/invoices/public/${publicToken}`
  const urgencyLevel = daysOverdue > 30 ? 'high' : daysOverdue > 14 ? 'medium' : 'low'
  const urgencyColor = urgencyLevel === 'high' ? '#ef4444' : urgencyLevel === 'medium' ? '#f59e0b' : '#f97316'
  const urgencyText = urgencyLevel === 'high' ? 'URGENT' : urgencyLevel === 'medium' ? 'IMPORTANT' : 'REMINDER'

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Reminder - ${invoiceNumber}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background-color: #f9fafb;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, ${urgencyColor} 0%, #dc2626 100%);
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .header p {
      color: rgba(255, 255, 255, 0.9);
      margin: 10px 0 0;
      font-size: 16px;
    }
    .urgency-badge {
      display: inline-block;
      background-color: rgba(255, 255, 255, 0.2);
      color: #ffffff;
      padding: 6px 14px;
      border-radius: 20px;
      font-weight: 700;
      font-size: 12px;
      margin-top: 10px;
      letter-spacing: 1px;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 18px;
      color: #1f2937;
      margin-bottom: 20px;
    }
    .overdue-details {
      background-color: #fef2f2;
      border-left: 4px solid #ef4444;
      padding: 20px;
      border-radius: 4px;
      margin: 30px 0;
    }
    .overdue-details h3 {
      margin: 0 0 15px;
      color: #991b1b;
      font-size: 16px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      font-size: 14px;
    }
    .detail-label {
      font-weight: 600;
      color: #4b5563;
    }
    .detail-value {
      color: #1f2937;
    }
    .overdue-badge {
      display: inline-block;
      background-color: #ef4444;
      color: #ffffff;
      padding: 4px 10px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 13px;
    }
    .amount-due {
      font-size: 24px;
      font-weight: 700;
      color: #ef4444;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: #ffffff;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
      text-align: center;
      margin: 20px 0;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .button:hover {
      background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    }
    .footer {
      background-color: #f9fafb;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      margin: 5px 0;
      font-size: 13px;
      color: #6b7280;
    }
    .footer a {
      color: #ef4444;
      text-decoration: none;
    }
    .divider {
      height: 1px;
      background-color: #e5e7eb;
      margin: 30px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Payment Overdue</h1>
      <p>Invoice ${invoiceNumber}</p>
      <div class="urgency-badge">${urgencyText}</div>
    </div>

    <div class="content">
      <p class="greeting">Dear ${customerName},</p>

      <p>This is a friendly reminder that payment for invoice ${invoiceNumber} is now overdue.</p>

      <div class="overdue-details">
        <h3>Invoice Details</h3>
        <div class="detail-row">
          <span class="detail-label">Invoice Number:</span>
          <span class="detail-value">${invoiceNumber}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Original Due Date:</span>
          <span class="detail-value">${formatDate(dueDate)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Days Overdue:</span>
          <span class="overdue-badge">${daysOverdue} days</span>
        </div>
        <div class="divider" style="margin: 15px 0;"></div>
        <div class="detail-row">
          <span class="detail-label">Amount Outstanding:</span>
          <span class="amount-due">${formatCurrency(amountDue)}</span>
        </div>
      </div>

      <center>
        <a href="${viewInvoiceUrl}" class="button">View Invoice & Pay Now</a>
      </center>

      <p style="margin-top: 30px;">If you have already made this payment, please disregard this email. If you're experiencing any issues or need to discuss payment arrangements, please contact us immediately.</p>

      ${businessEmail || businessPhone ? `
      <p style="margin-top: 20px; padding: 15px; background-color: #f9fafb; border-radius: 4px; font-size: 14px;">
        <strong>Need Help?</strong><br/>
        ${businessEmail ? `Email: <a href="mailto:${businessEmail}" style="color: #ef4444;">${businessEmail}</a><br/>` : ''}
        ${businessPhone ? `Phone: ${businessPhone}` : ''}
      </p>
      ` : ''}

      <p style="margin-top: 20px; font-size: 13px; color: #6b7280;">We appreciate your prompt attention to this matter and thank you for your business.</p>
    </div>

    <div class="footer">
      <p><strong>${businessName}</strong></p>
      ${businessEmail ? `<p><a href="mailto:${businessEmail}">${businessEmail}</a></p>` : ''}
      ${businessPhone ? `<p>${businessPhone}</p>` : ''}
      <p style="margin-top: 15px; font-size: 12px;">This is an automated reminder from RestoreAssist.</p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

/**
 * Generate upcoming payment reminder email HTML
 */
export function generateUpcomingPaymentReminderEmail(data: Omit<ReminderEmailData, 'daysOverdue'> & { daysUntilDue: number }): string {
  const {
    invoiceNumber,
    dueDate,
    daysUntilDue,
    amountDue,
    customerName,
    publicToken,
    businessName,
    businessEmail,
    businessPhone,
    appUrl
  } = data

  const viewInvoiceUrl = `${appUrl}/invoices/public/${publicToken}`

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Due Soon - ${invoiceNumber}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background-color: #f9fafb;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .header p {
      color: rgba(255, 255, 255, 0.9);
      margin: 10px 0 0;
      font-size: 16px;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 18px;
      color: #1f2937;
      margin-bottom: 20px;
    }
    .reminder-details {
      background-color: #fffbeb;
      border-left: 4px solid #f59e0b;
      padding: 20px;
      border-radius: 4px;
      margin: 30px 0;
    }
    .reminder-details h3 {
      margin: 0 0 15px;
      color: #92400e;
      font-size: 16px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      font-size: 14px;
    }
    .detail-label {
      font-weight: 600;
      color: #4b5563;
    }
    .detail-value {
      color: #1f2937;
    }
    .due-badge {
      display: inline-block;
      background-color: #f59e0b;
      color: #ffffff;
      padding: 4px 10px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 13px;
    }
    .amount-due {
      font-size: 24px;
      font-weight: 700;
      color: #f59e0b;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #ffffff;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
      text-align: center;
      margin: 20px 0;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .footer {
      background-color: #f9fafb;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      margin: 5px 0;
      font-size: 13px;
      color: #6b7280;
    }
    .divider {
      height: 1px;
      background-color: #e5e7eb;
      margin: 30px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Payment Due Soon</h1>
      <p>Invoice ${invoiceNumber}</p>
    </div>

    <div class="content">
      <p class="greeting">Dear ${customerName},</p>

      <p>This is a friendly reminder that payment for invoice ${invoiceNumber} is due ${daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`}.</p>

      <div class="reminder-details">
        <h3>Invoice Details</h3>
        <div class="detail-row">
          <span class="detail-label">Invoice Number:</span>
          <span class="detail-value">${invoiceNumber}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Due Date:</span>
          <span class="detail-value">${formatDate(dueDate)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Days Until Due:</span>
          <span class="due-badge">${daysUntilDue} days</span>
        </div>
        <div class="divider" style="margin: 15px 0;"></div>
        <div class="detail-row">
          <span class="detail-label">Amount Due:</span>
          <span class="amount-due">${formatCurrency(amountDue)}</span>
        </div>
      </div>

      <center>
        <a href="${viewInvoiceUrl}" class="button">View Invoice & Pay Now</a>
      </center>

      <p style="margin-top: 30px;">To avoid any late fees or service interruptions, please arrange payment before the due date. If you have any questions or need assistance, please contact us.</p>

      ${businessEmail || businessPhone ? `
      <p style="margin-top: 20px; font-size: 14px; color: #6b7280;">
        <strong>Questions?</strong><br/>
        ${businessEmail ? `Email: <a href="mailto:${businessEmail}" style="color: #f59e0b;">${businessEmail}</a><br/>` : ''}
        ${businessPhone ? `Phone: ${businessPhone}` : ''}
      </p>
      ` : ''}
    </div>

    <div class="footer">
      <p><strong>${businessName}</strong></p>
      ${businessEmail ? `<p><a href="mailto:${businessEmail}">${businessEmail}</a></p>` : ''}
      ${businessPhone ? `<p>${businessPhone}</p>` : ''}
      <p style="margin-top: 15px; font-size: 12px;">This is an automated reminder from RestoreAssist.</p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format cents to currency string
 */
function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Format date to readable format
 */
function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
}
