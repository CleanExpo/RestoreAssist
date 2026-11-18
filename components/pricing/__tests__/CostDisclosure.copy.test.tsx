// @vitest-environment jsdom
/**
 * RA-7660 / RA-7714: buyer copy never names DR-NRPG, and the SERVICE_CRM add-on
 * is sold as "Migrate from Ascora", not "Service CRM".
 *
 * The rendered check guards the public pricing section itself. The source
 * check also covers the explanatory comment beside the copy, which had drifted
 * to "the Service CRM add-on needs Ascora or DR-NRPG" and is what the next
 * editor of this copy reads first.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CostDisclosure } from "@/components/pricing/CostDisclosure";

beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
});

describe("CostDisclosure add-on copy", () => {
  it("renders the migration add-on as 'Migrate from Ascora' and never names DR-NRPG", () => {
    const { container } = render(<CostDisclosure />);
    const text = container.textContent ?? "";
    expect(text).toContain("Migrate from Ascora");
    expect(text).not.toMatch(/NRPG/i);
    expect(text).not.toMatch(/Service CRM/i);
  });

  it("the component source never names DR-NRPG or the internal 'Service CRM' label", () => {
    const source = readFileSync(
      resolve(__dirname, "../CostDisclosure.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/NRPG/i);
    expect(source).not.toMatch(/Service CRM/i);
  });
});
