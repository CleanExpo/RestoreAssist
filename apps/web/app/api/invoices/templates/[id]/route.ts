import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/invoices/templates/[id] - Get template details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

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

    return NextResponse.json({ template })
  } catch (error) {
    console.error('Error fetching invoice template:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invoice template' },
      { status: 500 }
    )
  }
}

// PUT /api/invoices/templates/[id] - Update template
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    // Check template exists and belongs to user
    const existingTemplate = await prisma.invoiceTemplate.findUnique({
      where: {
        id,
        userId: session.user.id
      }
    })

    if (!existingTemplate) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      )
    }

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

    // If this is being set as default, unset other defaults
    if (isDefault && !existingTemplate.isDefault) {
      await prisma.invoiceTemplate.updateMany({
        where: {
          userId: session.user.id,
          isDefault: true,
          id: { not: id }
        },
        data: {
          isDefault: false
        }
      })
    }

    const template = await prisma.invoiceTemplate.update({
      where: { id },
      data: {
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
      }
    })

    return NextResponse.json({ template })
  } catch (error) {
    console.error('Error updating invoice template:', error)
    return NextResponse.json(
      { error: 'Failed to update invoice template' },
      { status: 500 }
    )
  }
}

// DELETE /api/invoices/templates/[id] - Delete template
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Check template exists and belongs to user
    const template = await prisma.invoiceTemplate.findUnique({
      where: {
        id,
        userId: session.user.id
      },
      include: {
        _count: {
          select: { invoices: true }
        }
      }
    })

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      )
    }

    // Don't allow deleting template if it's being used by invoices
    if (template._count.invoices > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete template that is used by ${template._count.invoices} invoice(s)`
        },
        { status: 400 }
      )
    }

    await prisma.invoiceTemplate.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting invoice template:', error)
    return NextResponse.json(
      { error: 'Failed to delete invoice template' },
      { status: 500 }
    )
  }
}
