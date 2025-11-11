import fs from "fs";
import path from "path";

/**
 * Brand Configuration Interface
 * Matches the structure in pdfStyleTemplate.ts
 */
export interface BrandConfig {
  company_name: string;
  primary_color: string;
  accent_color: string;
  logo_url: string;
  footer_notice: string;
  updated_at: string;
  org_id?: string;
}

/**
 * Default brand configuration
 * Used as fallback when no tenant-specific config exists
 */
const DEFAULT_BRAND: BrandConfig = {
  company_name: "Insert Company Name",
  primary_color: "#003B73",
  accent_color: "#005FA3",
  logo_url: "",
  footer_notice: "Generated using the RestoreAssist Template Framework. Replace this notice with your company disclaimer.",
  updated_at: new Date().toISOString()
};

/**
 * Get tenant-aware brand configuration
 *
 * Resolution Order:
 * 1. Tenant-specific config: public/config/{tenant}_brand.json
 * 2. Default config: public/config/brand.json
 * 3. Hardcoded default (if no files exist)
 *
 * @param tenant - Tenant identifier (from subdomain or header)
 * @returns BrandConfig object
 *
 * @example
 * // Tenant "allied" → Loads allied_brand.json
 * const config = getBrandConfig("allied");
 *
 * // Tenant "default" → Loads brand.json
 * const config = getBrandConfig("default");
 *
 * // Unknown tenant → Falls back to brand.json or default
 * const config = getBrandConfig("unknown-tenant");
 */
export function getBrandConfig(tenant: string = "default"): BrandConfig {
  try {
    const base = path.join(process.cwd(), "public", "config");

    // Ensure config directory exists
    if (!fs.existsSync(base)) {
      console.warn(`Config directory does not exist: ${base}`);
      return DEFAULT_BRAND;
    }

    // 1. Try tenant-specific config first (if not default)
    if (tenant !== "default") {
      const tenantFile = path.join(base, `${tenant}_brand.json`);

      if (fs.existsSync(tenantFile)) {
        const data = fs.readFileSync(tenantFile, "utf-8");
        const config = JSON.parse(data);

        console.log(`✅ Loaded brand config for tenant: ${tenant}`);
        return {
          ...config,
          org_id: tenant
        };
      } else {
        console.log(`⚠️ No brand config found for tenant: ${tenant}, falling back to default`);
      }
    }

    // 2. Try default brand.json
    const defaultFile = path.join(base, "brand.json");

    if (fs.existsSync(defaultFile)) {
      const data = fs.readFileSync(defaultFile, "utf-8");
      const config = JSON.parse(data);

      console.log(`✅ Loaded default brand config`);
      return config;
    }

    // 3. Return hardcoded default
    console.warn("⚠️ No brand config files found, using hardcoded default");
    return DEFAULT_BRAND;

  } catch (error) {
    console.error("❌ Error loading brand config:", error);
    return DEFAULT_BRAND;
  }
}

/**
 * Save tenant-specific brand configuration
 *
 * @param tenant - Tenant identifier
 * @param config - Brand configuration to save
 * @returns Path to saved file
 */
export function saveBrandConfig(tenant: string, config: BrandConfig): string {
  try {
    const base = path.join(process.cwd(), "public", "config");

    // Ensure directory exists
    if (!fs.existsSync(base)) {
      fs.mkdirSync(base, { recursive: true });
    }

    // Determine filename
    const filename = tenant === "default" ? "brand.json" : `${tenant}_brand.json`;
    const filePath = path.join(base, filename);

    // Add metadata
    const dataToSave = {
      ...config,
      updated_at: new Date().toISOString(),
      org_id: tenant !== "default" ? tenant : undefined
    };

    // Write file
    fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), "utf-8");

    console.log(`✅ Saved brand config for tenant: ${tenant} → ${filename}`);
    return filePath;

  } catch (error) {
    console.error(`❌ Error saving brand config for tenant ${tenant}:`, error);
    throw error;
  }
}

/**
 * List all tenant brand configurations
 *
 * @returns Array of tenant identifiers with brand configs
 */
export function listTenantBrands(): string[] {
  try {
    const base = path.join(process.cwd(), "public", "config");

    if (!fs.existsSync(base)) {
      return [];
    }

    const files = fs.readdirSync(base);
    const tenants: string[] = [];

    // Find all *_brand.json files
    files.forEach(file => {
      if (file === "brand.json") {
        tenants.push("default");
      } else if (file.endsWith("_brand.json")) {
        const tenant = file.replace("_brand.json", "");
        tenants.push(tenant);
      }
    });

    return tenants;

  } catch (error) {
    console.error("❌ Error listing tenant brands:", error);
    return [];
  }
}

/**
 * Delete tenant brand configuration
 *
 * @param tenant - Tenant identifier
 * @returns true if deleted, false if not found
 */
export function deleteBrandConfig(tenant: string): boolean {
  try {
    const base = path.join(process.cwd(), "public", "config");
    const filename = tenant === "default" ? "brand.json" : `${tenant}_brand.json`;
    const filePath = path.join(base, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ Deleted brand config for tenant: ${tenant}`);
      return true;
    }

    console.warn(`⚠️ Brand config not found for tenant: ${tenant}`);
    return false;

  } catch (error) {
    console.error(`❌ Error deleting brand config for tenant ${tenant}:`, error);
    throw error;
  }
}
