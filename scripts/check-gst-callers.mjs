import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = [
  "app/api/invoices/route.ts",
  "app/api/invoices/[id]/route.ts",
  "app/api/invoices/credit-notes/route.ts",
  "app/api/invoices/recurring/route.ts",
  "app/api/invoices/[id]/sync/route.ts",
  "app/api/inspections/[id]/generate-invoice/route.ts",
  "app/api/calculate/route.ts",
  "app/api/reports/generate-cost-estimation/route.ts",
  "app/api/integrations/nir-sync/route.ts",
  "app/api/ascora/sync/route.ts",
  "lib/integrations/xero/nir-sync.ts",
  "lib/integrations/quickbooks/nir-sync.ts",
  "lib/integrations/myob/nir-sync.ts",
  "lib/invoices/calc.ts",
  "lib/quotes/quote-calc.ts",
  "lib/integrations/xero.ts",
  "lib/integrations/quickbooks.ts",
  "lib/integrations/myob.ts",
  "lib/integrations/sync-queue.ts",
  "lib/invoices/pdf-generator.ts",
  "lib/dispute-pack.ts",
  "components/restoration/RestorationInvoiceForm.tsx",
  "app/dashboard/inspections/[id]/print/page.tsx",
  "app/dashboard/invoices/new/page.tsx",
  "app/dashboard/invoices/[id]/edit/page.tsx",
  "app/dashboard/invoices/recurring/new/page.tsx",
  "app/dashboard/invoices/credit-notes/new/page.tsx",
  "app/dashboard/quote/page.tsx",
];

const forbidden = [
  /(?:\*\s*(?:0\.1|1\.1)|\/\s*11)\b/,
  /\?\?\s*10(?:\.0)?\b/,
  /\bGST_RATE\s*=\s*(?:0\.1|10)\b/,
  /\bgst(?:Rate|Percent)\s*[:=]\s*10(?:\.0)?\b/,
];

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const failures = [];
for (const file of files) {
  const source = stripComments(readFileSync(resolve(file), "utf8"));
  for (const pattern of forbidden) {
    if (pattern.test(source)) failures.push(`${file}: ${pattern}`);
  }
}

if (failures.length > 0) {
  console.error("GST caller guard failed. Use lib/gst-rules.ts and the tenant country:\n");
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`GST caller guard passed for ${files.length} financial paths.`);
