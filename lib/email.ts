import { Resend } from "resend"

let resend: Resend | null = null
function getResendClient(): Resend {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured")
    }
    resend = new Resend(process.env.RESEND_API_KEY)
  }
  return resend
}

// ── Signed Authority Form Email ──

export interface SignedFormEmailData {
  recipientEmail: string
  recipientName: string
  formName: string
  clientName: string
  clientAddress: string
  companyName: string
  signatories: { name: string; role: string; signedAt: string }[]
  pdfBase64: string // Base64 encoded PDF
  pdfFilename: string
}

export async function sendSignedFormEmail(data: SignedFormEmailData) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Email service is not configured")
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || "Restore Assist <onboarding@resend.dev>"

  const sigList = data.signatories
    .map(
      (s) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${s.name}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${s.role.replace(/_/g, " ")}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${new Date(s.signedAt).toLocaleDateString("en-AU")}</td></tr>`
    )
    .join("")

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">${data.companyName}</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Signed Authority Form</p>
      </div>
      <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p>Hello ${data.recipientName},</p>
        <p>The following authority form has been <strong style="color:#10b981;">fully signed</strong> by all parties:</p>
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px;"><strong>Form:</strong> ${data.formName}</p>
          <p style="margin: 0 0 8px;"><strong>Client:</strong> ${data.clientName}</p>
          <p style="margin: 0;"><strong>Address:</strong> ${data.clientAddress}</p>
        </div>
        <p style="font-weight:600;margin:16px 0 8px;">Signatories:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead><tr style="background:#f1f5f9;">
            <th style="padding:8px 12px;text-align:left;">Name</th>
            <th style="padding:8px 12px;text-align:left;">Role</th>
            <th style="padding:8px 12px;text-align:left;">Signed</th>
          </tr></thead>
          <tbody>${sigList}</tbody>
        </table>
        <p style="margin-top:20px;">The signed PDF is attached to this email for your records.</p>
        <p style="font-size: 13px; color: #6b7280; margin-top:20px;">This is an automated email from Restore Assist. Please do not reply.</p>
      </div>
    </body>
    </html>
  `

  return getResendClient().emails.send({
    from: fromEmail,
    to: data.recipientEmail,
    subject: `Signed: ${data.formName} — ${data.clientName}`,
    html,
    attachments: [
      {
        filename: data.pdfFilename,
        content: data.pdfBase64,
      },
    ],
  })
}

// ── Invite Email ──

export interface InviteEmailData {
  email: string
  name: string
  role: "MANAGER" | "USER"
  tempPassword?: string
  loginUrl: string
  inviterName: string
  isTransfer?: boolean // True if user already exists and is being transferred
}

export async function sendInviteEmail(data: InviteEmailData) {
  console.log("📧 [EMAIL] Starting email send process...")
  console.log("📧 [EMAIL] Recipient:", data.email)
  console.log("📧 [EMAIL] Role:", data.role)
  console.log("📧 [EMAIL] Inviter:", data.inviterName)
  
  if (!process.env.RESEND_API_KEY) {
    console.error("❌ [EMAIL] RESEND_API_KEY is not configured")
    throw new Error("Email service is not configured")
  }
  
  console.log("✅ [EMAIL] RESEND_API_KEY is configured")
  console.log("📧 [EMAIL] From email:", process.env.RESEND_FROM_EMAIL || "Restore Assist <onboarding@resend.dev>")

  const roleLabel = data.role === "MANAGER" ? "Manager" : "Technician"
  const isTransfer = data.isTransfer || false
  const hasTempPassword = !!data.tempPassword
  console.log("📧 [EMAIL] Role label:", roleLabel)
  console.log("📧 [EMAIL] Is transfer:", isTransfer)
  console.log("📧 [EMAIL] Has temp password:", hasTempPassword)
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Restore Assist</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <!-- Header with gradient -->
        <div style="background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%); padding: 50px 30px; border-radius: 16px 16px 0 0; text-align: center; box-shadow: 0 10px 25px rgba(6, 182, 212, 0.3);">
          <div style="background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); border-radius: 12px; padding: 20px; display: inline-block; margin-bottom: 20px;">
            <h1 style="color: #ffffff; margin: 0; font-size: 36px; font-weight: 700; letter-spacing: -0.5px;">Restore Assist</h1>
          </div>
          <p style="color: rgba(255, 255, 255, 0.95); margin: 0; font-size: 16px; font-weight: 500;">Water Damage Restoration Platform</p>
        </div>
        
        <!-- Main content card -->
        <div style="background: #ffffff; border-radius: 0 0 16px 16px; padding: 40px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <!-- Welcome section -->
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 16px rgba(6, 182, 212, 0.3);">
              <span style="color: #ffffff; font-size: 36px; font-weight: bold;">${data.name.charAt(0).toUpperCase()}</span>
            </div>
            <h2 style="color: #1e293b; margin: 0 0 10px 0; font-size: 28px; font-weight: 700;">${isTransfer ? "You've been added to a new organization" : "Welcome, " + data.name + "!"}</h2>
            <p style="color: #64748b; font-size: 16px; margin: 0;">
              ${isTransfer 
                ? `<strong style="color: #1e293b;">${data.inviterName}</strong> has added you as a <strong style="color: #3b82f6;">${roleLabel}</strong> to their organization. You can continue using your existing account credentials to log in.`
                : `You've been invited by <strong style="color: #1e293b;">${data.inviterName}</strong> to join Restore Assist as a <strong style="color: #3b82f6;">${roleLabel}</strong>.`
              }
            </p>
          </div>
          
          ${hasTempPassword ? `
          <!-- Credentials box -->
          <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 2px solid #06b6d4; border-radius: 12px; padding: 25px; margin: 30px 0; box-shadow: 0 4px 12px rgba(6, 182, 212, 0.1);">
            <div style="display: flex; align-items: center; margin-bottom: 15px;">
              <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-right: 15px;">
                <span style="color: #ffffff; font-size: 20px;">🔐</span>
              </div>
              <p style="margin: 0; color: #0c4a6e; font-weight: 700; font-size: 16px; letter-spacing: 0.5px;">YOUR LOGIN CREDENTIALS</p>
            </div>
            <div style="background: #ffffff; border-radius: 8px; padding: 20px; margin-top: 15px;">
              <div style="margin-bottom: 15px;">
                <p style="margin: 0 0 5px 0; color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Email Address</p>
                <p style="margin: 0; color: #1e293b; font-size: 16px; font-weight: 600; word-break: break-all;">${data.email}</p>
              </div>
              <div style="border-top: 1px solid #e2e8f0; padding-top: 15px;">
                <p style="margin: 0 0 5px 0; color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Temporary Password</p>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <code style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px 16px; border-radius: 8px; font-family: 'Monaco', 'Menlo', monospace; font-size: 18px; font-weight: 600; color: #0c4a6e; letter-spacing: 2px; flex: 1;">${data.tempPassword}</code>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Security notice -->
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px 20px; border-radius: 8px; margin: 25px 0;">
            <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
              <strong>🔒 Security Notice:</strong> For your security, you'll be required to change this temporary password when you first log in to the platform.
            </p>
          </div>
          ` : `
          <!-- Info box for transfers -->
          <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 2px solid #06b6d4; border-radius: 12px; padding: 25px; margin: 30px 0; box-shadow: 0 4px 12px rgba(6, 182, 212, 0.1);">
            <div style="display: flex; align-items: center; margin-bottom: 15px;">
              <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-right: 15px;">
                <span style="color: #ffffff; font-size: 20px;">ℹ️</span>
              </div>
              <p style="margin: 0; color: #0c4a6e; font-weight: 700; font-size: 16px; letter-spacing: 0.5px;">ACCOUNT INFORMATION</p>
            </div>
            <div style="background: #ffffff; border-radius: 8px; padding: 20px; margin-top: 15px;">
              <p style="margin: 0; color: #1e293b; font-size: 16px; line-height: 1.6;">
                <strong style="color: #1e293b;">${data.inviterName}</strong> has added you to their organization as a <strong style="color: #3b82f6;">${roleLabel}</strong>. You can continue using your existing account credentials to log in.
              </p>
            </div>
          </div>
          `}
          
          <!-- CTA Button -->
          <div style="text-align: center; margin: 35px 0;">
            <a href="${data.loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 600; font-size: 16px; box-shadow: 0 8px 16px rgba(6, 182, 212, 0.4); transition: all 0.3s ease;">
              ${isTransfer ? "🚀 Access Your Account" : "🚀 Log In to Platform"}
            </a>
          </div>
          
          <!-- Footer note -->
          <div style="border-top: 1px solid #e2e8f0; padding-top: 25px; margin-top: 30px;">
            <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0;">
              If you have any questions or need assistance, please contact your administrator or reach out to our support team. We're here to help you get started!
            </p>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 30px; padding: 20px;">
          <p style="margin: 5px 0;">This is an automated email from Restore Assist.</p>
          <p style="margin: 5px 0;">Please do not reply to this email.</p>
          <p style="margin: 10px 0 0 0; color: #cbd5e1;">© ${new Date().getFullYear()} Restore Assist. All rights reserved.</p>
        </div>
      </body>
    </html>
  `

  const text = isTransfer
    ? `
You've been added to a new organization!

${data.inviterName} has added you as a ${roleLabel} to their organization. You can continue using your existing account credentials.

Log in here: ${data.loginUrl}

If you have any questions or need assistance, please contact your administrator or our support team.

---
This is an automated email from Restore Assist. Please do not reply to this email.
  `
    : `
Welcome to Restore Assist!

You've been invited by ${data.inviterName} to join Restore Assist as a ${roleLabel}.

YOUR LOGIN CREDENTIALS:
Email: ${data.email}
Temporary Password: ${data.tempPassword}

Important: For security reasons, you'll be required to change this temporary password when you first log in.

Log in here: ${data.loginUrl}

If you have any questions or need assistance, please contact your administrator or our support team.

---
This is an automated email from Restore Assist. Please do not reply to this email.
  `

  try {
    console.log("📧 [EMAIL] Preparing email payload...")
    const emailPayload = {
      from: process.env.RESEND_FROM_EMAIL || "Restore Assist <onboarding@resend.dev>",
      to: data.email,
      subject: isTransfer 
        ? `You've been added to ${data.inviterName}'s organization - Restore Assist`
        : `Welcome to Restore Assist - Your ${roleLabel} Account`,
      html,
      text,
    }
    
    console.log("📧 [EMAIL] Email payload prepared:")
    console.log("📧 [EMAIL] - From:", emailPayload.from)
    console.log("📧 [EMAIL] - To:", emailPayload.to)
    console.log("📧 [EMAIL] - Subject:", emailPayload.subject)
    console.log("📧 [EMAIL] - HTML length:", html.length, "characters")
    console.log("📧 [EMAIL] - Text length:", text.length, "characters")
    
    console.log("📧 [EMAIL] Sending email via Resend API...")
    const startTime = Date.now()
    
    const result = await getResendClient().emails.send(emailPayload)
    
    const duration = Date.now() - startTime
    console.log("✅ [EMAIL] Email sent successfully!")
    console.log("📧 [EMAIL] Response:", JSON.stringify(result, null, 2))
    console.log("📧 [EMAIL] Duration:", duration, "ms")
    console.log("📧 [EMAIL] Email ID:", result.id || "N/A")
    
    return result
  } catch (error: any) {
    console.error("❌ [EMAIL] Failed to send invite email")
    console.error("❌ [EMAIL] Error type:", error?.constructor?.name || "Unknown")
    console.error("❌ [EMAIL] Error message:", error?.message || "No error message")
    console.error("❌ [EMAIL] Error stack:", error?.stack || "No stack trace")
    if (error?.response) {
      console.error("❌ [EMAIL] Error response:", JSON.stringify(error.response, null, 2))
    }
    throw error
  }
}
