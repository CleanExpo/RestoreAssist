/**
 * Neutral CSS style tokens for template reports
 *
 * This provides a professional, brand-agnostic design for generated reports.
 * Organizations can customize this template to match their branding guidelines.
 */

export const pdfStyleTemplate = `
  /* Page setup */
  @page {
    margin: 24mm 18mm;
    size: A4;
  }

  /* Base typography */
  body {
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #222;
    background: #fff;
    margin: 0;
    padding: 0;
  }

  /* Layout containers */
  header, footer {
    width: 100%;
  }

  /* Header styling */
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #ccc;
    padding-bottom: 8px;
    margin-bottom: 16px;
  }

  /* Logo placeholder box */
  .logo-box {
    width: 120px;
    height: 40px;
    border: 1px dashed #999;
    font-size: 8pt;
    text-align: center;
    display: flex;
    justify-content: center;
    align-items: center;
    color: #666;
    background: #f9f9f9;
  }

  /* Header metadata */
  .header-info {
    text-align: right;
    font-size: 9pt;
    color: #666;
  }

  .header-info p {
    margin: 2px 0;
  }

  /* Headings */
  h1, h2, h3 {
    color: #003B73;
    margin-top: 0.5em;
    margin-bottom: 0.3em;
    font-weight: 600;
  }

  h1 {
    font-size: 24pt;
    border-bottom: 2px solid #003B73;
    padding-bottom: 8px;
  }

  h2 {
    font-size: 16pt;
    margin-top: 1.2em;
  }

  h3 {
    font-size: 13pt;
    margin-top: 1em;
  }

  /* Category labels */
  .category {
    color: #005FA3;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 9pt;
    letter-spacing: 0.5px;
  }

  /* Verification status */
  .verified {
    color: #16a34a;
    font-weight: 600;
  }

  .verified::before {
    content: '✓ ';
  }

  .unverified {
    color: #eab308;
    font-weight: 600;
  }

  .unverified::before {
    content: '✗ ';
  }

  /* Badges */
  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 9pt;
    font-weight: 600;
    margin-right: 6px;
    margin-bottom: 4px;
  }

  .badge-service {
    background: #dbeafe;
    color: #1e40af;
  }

  .badge-grade {
    background: #fef3c7;
    color: #92400e;
  }

  .badge-standard {
    background: #d1fae5;
    color: #065f46;
  }

  /* Metadata grid */
  .metadata {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 16px;
    padding: 12px;
    background: #f3f4f6;
    border-radius: 4px;
    font-size: 10pt;
  }

  .metadata-item {
    display: flex;
    gap: 4px;
  }

  .metadata-label {
    font-weight: 600;
    color: #4b5563;
  }

  /* Summary box */
  .summary {
    background: #eff6ff;
    padding: 12px;
    border-left: 4px solid #2563eb;
    margin-bottom: 16px;
    border-radius: 4px;
  }

  /* Hazard warnings */
  .hazard-list {
    list-style: none;
    padding-left: 0;
    margin: 8px 0;
  }

  .hazard-item {
    padding: 8px 12px;
    margin-bottom: 6px;
    background: #fef2f2;
    border-left: 4px solid #dc2626;
    border-radius: 4px;
    font-size: 10pt;
  }

  .hazard-item::before {
    content: '⚠ ';
    color: #dc2626;
    font-weight: bold;
    margin-right: 4px;
  }

  /* Question sections */
  .question-category {
    margin-bottom: 16px;
    page-break-inside: avoid;
  }

  .question-item {
    padding: 10px;
    margin-bottom: 8px;
    background: #f9fafb;
    border-left: 4px solid #6b7280;
    border-radius: 4px;
    font-size: 10pt;
  }

  .question-item.verified {
    border-left-color: #10b981;
    background: #f0fdf4;
  }

  .question-item.unverified {
    border-left-color: #eab308;
    background: #fefce8;
  }

  .question-text {
    font-weight: 600;
    margin-bottom: 4px;
    color: #1f2937;
  }

  .answer-text {
    margin-left: 12px;
    margin-top: 4px;
    color: #4b5563;
    font-size: 9.5pt;
  }

  .evidence-link {
    margin-left: 12px;
    margin-top: 4px;
    font-size: 9pt;
    color: #2563eb;
  }

  /* Keywords */
  .keywords {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }

  .keyword {
    padding: 2px 6px;
    background: #e5e7eb;
    border-radius: 3px;
    font-size: 8.5pt;
    color: #374151;
  }

  /* Footer */
  footer {
    font-size: 8pt;
    color: #555;
    border-top: 1px solid #ccc;
    margin-top: 24px;
    padding-top: 8px;
    line-height: 1.4;
  }

  footer p {
    margin: 4px 0;
  }

  .disclaimer {
    background: #fef3c7;
    padding: 10px;
    border-left: 3px solid #f59e0b;
    margin-top: 12px;
    font-size: 8.5pt;
    line-height: 1.5;
  }

  /* Print optimizations */
  @media print {
    body {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .page-break {
      page-break-before: always;
    }

    .avoid-break {
      page-break-inside: avoid;
    }

    .no-print {
      display: none;
    }
  }

  /* Utility classes */
  .text-right {
    text-align: right;
  }

  .text-center {
    text-align: center;
  }

  .mb-4 {
    margin-bottom: 16px;
  }

  .mt-4 {
    margin-top: 16px;
  }
`;

/**
 * Alternative color schemes (examples)
 * Organizations can create their own color schemes
 */

export const colorSchemes = {
  // Default professional blue
  default: {
    primary: '#003B73',
    secondary: '#005FA3',
    success: '#16a34a',
    warning: '#eab308',
    danger: '#dc2626',
  },

  // Warm earth tones
  earth: {
    primary: '#78350f',
    secondary: '#92400e',
    success: '#15803d',
    warning: '#ca8a04',
    danger: '#b91c1c',
  },

  // Cool greens
  green: {
    primary: '#14532d',
    secondary: '#166534',
    success: '#16a34a',
    warning: '#ca8a04',
    danger: '#dc2626',
  },

  // Corporate grey
  corporate: {
    primary: '#1f2937',
    secondary: '#374151',
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
  },
};

/**
 * Generate custom styled template with color scheme
 */
export function generateCustomTemplate(scheme: keyof typeof colorSchemes = 'default'): string {
  const colors = colorSchemes[scheme];

  return pdfStyleTemplate
    .replace(/#003B73/g, colors.primary)
    .replace(/#005FA3/g, colors.secondary)
    .replace(/#16a34a/g, colors.success)
    .replace(/#eab308/g, colors.warning)
    .replace(/#dc2626/g, colors.danger);
}

/**
 * Brand configuration interface
 */
export interface BrandConfig {
  company_name: string;
  primary_color: string;
  accent_color: string;
  logo_url: string;
  footer_notice: string;
  updated_at: string;
}

/**
 * Merge brand configuration into template CSS (multi-tenant aware)
 * Reads from tenant-specific brand config or default
 *
 * @param baseCSS - Base CSS template to merge branding into
 * @param tenant - Tenant identifier (default: "default")
 * @returns CSS with brand colors and configuration applied
 */
export function mergeBrandIntoTemplate(baseCSS: string, tenant: string = 'default'): string {
  try {
    // Import getBrandConfig dynamically to avoid circular dependencies
    const { getBrandConfig } = require('./getBrandConfig');

    // Load tenant-specific brand configuration
    const brandData: BrandConfig = getBrandConfig(tenant);

    // Apply brand colors to CSS
    let brandedCSS = baseCSS
      .replace(/#003B73/g, brandData.primary_color || '#003B73')
      .replace(/#005FA3/g, brandData.accent_color || '#005FA3');

    // Add logo URL if provided
    if (brandData.logo_url) {
      brandedCSS += `
        /* Brand logo override */
        .logo-box {
          background-image: url('${brandData.logo_url}');
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
          text-indent: -9999px; /* Hide placeholder text */
          border: none;
          background-color: transparent;
        }
      `;
    }

    // Add company name styling if no logo
    if (!brandData.logo_url && brandData.company_name) {
      brandedCSS += `
        /* Company name override */
        .logo-box::after {
          content: "${brandData.company_name}";
          font-weight: 600;
          font-size: 11pt;
          color: ${brandData.primary_color};
          text-indent: 0;
          display: block;
        }
      `;
    }

    console.log(`Brand configuration applied for tenant ${tenant}: ${brandData.company_name}`);
    return brandedCSS;

  } catch (error) {
    console.error(`Error merging brand configuration for tenant ${tenant}:`, error);
    // Return original CSS if brand merge fails
    return baseCSS;
  }
}
