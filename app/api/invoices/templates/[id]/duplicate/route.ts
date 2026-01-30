import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/invoices/templates/[id]/duplicate - Duplicate template
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Get template to duplicate
    const template = await prisma.invoiceTemplate.findUnique({
      where: {
        id,
        userId: session.user.id
      }
    })

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      )
    }

    // Create duplicate
    const duplicate = await prisma.invoiceTemplate.create({
      data: {
        name: `${template.name} (Copy)`,
        description: template.description,
        isDefault: false, // Copy is never default
        // Branding
        primaryColor: template.primaryColor,
        secondaryColor: template.secondaryColor,
        accentColor: template.accentColor,
        logoUrl: template.logoUrl,
        logoPosition: template.logoPosition,
        // Typography
        fontFamily: template.fontFamily,
        fontSize: template.fontSize,
        headerFont: template.headerFont,
        // Layout
        pageSize: template.pageSize,
        marginTop: template.marginTop,
        marginBottom: template.marginBottom,
        marginLeft: template.marginLeft,
        marginRight: template.marginRight,
        // Header content
        showLogo: template.showLogo,
        showCompanyName: template.showCompanyName,
        showCompanyAddress: template.showCompanyAddress,
        showCompanyPhone: template.showCompanyPhone,
        showCompanyEmail: template.showCompanyEmail,
        showCompanyABN: template.showCompanyABN,
        headerText: template.headerText,
        footerText: template.footerText,
        // Invoice details display
        showInvoiceNumber: template.showInvoiceNumber,
        showInvoiceDate: template.showInvoiceDate,
        showDueDate: template.showDueDate,
        showPaymentTerms: template.showPaymentTerms,
        // Line items display
        showLineItemImages: template.showLineItemImages,
        showItemCategory: template.showItemCategory,
        showItemDescription: template.showItemDescription,
        showQuantity: template.showQuantity,
        showUnitPrice: template.showUnitPrice,
        showGST: template.showGST,
        // Financial display
        showSubtotal: template.showSubtotal,
        showDiscount: template.showDiscount,
        showShipping: template.showShipping,
        showGSTBreakdown: template.showGSTBreakdown,
        // Payment information
        paymentInstructions: template.paymentInstructions,
        bankAccountName: template.bankAccountName,
        bankAccountBSB: template.bankAccountBSB,
        bankAccountNumber: template.bankAccountNumber,
        paymentQRCode: template.paymentQRCode,
        // Custom
        customCSS: template.customCSS,
        customHTML: template.customHTML,
        // Owner
        userId: session.user.id
      }
    })

    return NextResponse.json({ template: duplicate }, { status: 201 })
  } catch (error) {
    console.error('Error duplicating invoice template:', error)
    return NextResponse.json(
      { error: 'Failed to duplicate invoice template' },
      { status: 500 }
    )
  }
}
