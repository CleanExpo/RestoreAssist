import puppeteer from 'puppeteer';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pdfStyleTemplate, mergeBrandIntoTemplate } from './pdfStyleTemplate';

export interface PDFOptions {
  format?: 'A4' | 'Letter';
  printBackground?: boolean;
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
}

/**
 * Convert HTML string to PDF and upload to Supabase Storage
 * @param html - HTML content to convert
 * @param reportId - Report ID for file naming
 * @param options - PDF generation options
 * @returns Object with PDF URL
 */
export async function toPDF(
  html: string,
  reportId: string,
  options: PDFOptions = {}
): Promise<{ url: string; path: string }> {
  let browser;

  try {
    // Launch Puppeteer in headless mode
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set HTML content and wait for resources to load
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: options.format || 'A4',
      printBackground: options.printBackground ?? true,
      margin: options.margin || {
        top: '1cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm'
      }
    });

    await browser.close();
    browser = null;

    // Upload to Supabase Storage
    const fileName = `${reportId}_${Date.now()}.pdf`;
    const filePath = `reports/${fileName}`;

    const { data, error } = await supabaseAdmin
      .storage
      .from('reports')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (error) {
      throw new Error(`Failed to upload PDF: ${error.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = supabaseAdmin
      .storage
      .from('reports')
      .getPublicUrl(filePath);

    return {
      url: publicUrlData.publicUrl,
      path: filePath
    };

  } catch (error) {
    // Ensure browser is closed even if error occurs
    if (browser) {
      await browser.close();
    }

    console.error('PDF generation error:', error);
    throw error;
  }
}

/**
 * Generate PDF from HTML with custom styling (multi-tenant aware)
 * @param html - HTML content
 * @param reportId - Report ID
 * @param customCSS - Optional custom CSS to inject (defaults to branded pdfStyleTemplate)
 * @param applyBranding - Whether to apply brand.json configuration (default: true)
 * @param tenant - Tenant identifier for brand configuration (default: "default")
 */
export async function toPDFWithStyle(
  html: string,
  reportId: string,
  customCSS?: string,
  applyBranding: boolean = true,
  tenant: string = 'default'
): Promise<{ url: string; path: string }> {
  // Start with custom CSS or default template
  let finalCSS = customCSS ?? pdfStyleTemplate;

  // Apply branding if enabled and no custom CSS provided
  if (applyBranding && !customCSS) {
    finalCSS = mergeBrandIntoTemplate(finalCSS, tenant);
  }

  const styledHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          ${finalCSS}
        </style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `;

  return toPDF(styledHTML, reportId);
}
