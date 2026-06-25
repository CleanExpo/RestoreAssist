import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

// POST /api/invoices/templates/[id]/duplicate - Duplicate template
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: duplicating a template creates a new row — retry without
  // idempotency produces multiple "(Copy)" siblings.
  return withIdempotency(request, userId, async () => {
    try {
      // Get template to duplicate
      const template = await prisma.invoiceTemplate.findUnique({
        where: {
          id,
          userId,
        },
      });

      if (!template) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Template not found",
          status: 404,
        });
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
          userId,
        },
      });

      return NextResponse.json({ template: duplicate }, { status: 201 });
    } catch (error) {
      console.error("Error duplicating invoice template:", error);
      return fromException(request, error, { stage: "duplicate-template" });
    }
  });
}
