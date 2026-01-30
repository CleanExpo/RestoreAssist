import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/invoices/templates - List invoice templates
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const templates = await prisma.invoiceTemplate.findMany({
      where: {
        userId: session.user.id
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ],
      select: {
        id: true,
        name: true,
        description: true,
        isDefault: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        logoUrl: true,
        usageCount: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true
      }
    })

    return NextResponse.json({ templates })
  } catch (error) {
    console.error('Error fetching invoice templates:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invoice templates' },
      { status: 500 }
    )
  }
}

// POST /api/invoices/templates - Create invoice template
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      description,
      isDefault,
      // Branding
      primaryColor,
      secondaryColor,
      accentColor,
      logoUrl,
      logoPosition,
      // Typography
      fontFamily,
      fontSize,
      headerFont,
      // Layout
      pageSize,
      marginTop,
      marginBottom,
      marginLeft,
      marginRight,
      // Header content
      showLogo,
      showCompanyName,
      showCompanyAddress,
      showCompanyPhone,
      showCompanyEmail,
      showCompanyABN,
      headerText,
      footerText,
      // Invoice details display
      showInvoiceNumber,
      showInvoiceDate,
      showDueDate,
      showPaymentTerms,
      // Line items display
      showLineItemImages,
      showItemCategory,
      showItemDescription,
      showQuantity,
      showUnitPrice,
      showGST,
      // Financial display
      showSubtotal,
      showDiscount,
      showShipping,
      showGSTBreakdown,
      // Payment information
      paymentInstructions,
      bankAccountName,
      bankAccountBSB,
      bankAccountNumber,
      paymentQRCode,
      // Custom
      customCSS,
      customHTML
    } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Template name is required' },
        { status: 400 }
      )
    }

    // If this is being set as default, unset other defaults
    if (isDefault) {
      await prisma.invoiceTemplate.updateMany({
        where: {
          userId: session.user.id,
          isDefault: true
        },
        data: {
          isDefault: false
        }
      })
    }

    const template = await prisma.invoiceTemplate.create({
      data: {
        name,
        description,
        isDefault: isDefault || false,
        // Branding
        primaryColor,
        secondaryColor,
        accentColor,
        logoUrl,
        logoPosition,
        // Typography
        fontFamily,
        fontSize,
        headerFont,
        // Layout
        pageSize,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
        // Header content
        showLogo,
        showCompanyName,
        showCompanyAddress,
        showCompanyPhone,
        showCompanyEmail,
        showCompanyABN,
        headerText,
        footerText,
        // Invoice details display
        showInvoiceNumber,
        showInvoiceDate,
        showDueDate,
        showPaymentTerms,
        // Line items display
        showLineItemImages,
        showItemCategory,
        showItemDescription,
        showQuantity,
        showUnitPrice,
        showGST,
        // Financial display
        showSubtotal,
        showDiscount,
        showShipping,
        showGSTBreakdown,
        // Payment information
        paymentInstructions,
        bankAccountName,
        bankAccountBSB,
        bankAccountNumber,
        paymentQRCode,
        // Custom
        customCSS,
        customHTML,
        // Owner
        userId: session.user.id
      }
    })

    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    console.error('Error creating invoice template:', error)
    return NextResponse.json(
      { error: 'Failed to create invoice template' },
      { status: 500 }
    )
  }
}
