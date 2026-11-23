// @vitest-environment jsdom
/**
 * RA-7627 — the Property Data wizard's last step must not promise a control the app does not
 * have. It told users to tap "Lookup Property Data" inside an inspection to auto-fill property
 * details; that button never fetched anything (RA-7581) and has since been removed.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PropertyDataSetupWizard } from "@/components/property-data/PropertyDataSetupWizard";

afterEach(() => cleanup());

function renderFinalStep() {
  const view = render(
    <PropertyDataSetupWizard onClose={vi.fn()} onComplete={vi.fn()} />,
  );
  // Overview -> Install -> Test (skipped) -> Done.
  for (let i = 0; i < 3; i++) {
    const next = screen.getByRole("button", { name: /^(Next|Skip)$/ });
    fireEvent.click(next);
  }
  return view;
}

describe("RA-7627 property data wizard final step", () => {
  it("names no Lookup Property Data control and promises no auto-fill", () => {
    const { container } = renderFinalStep();
    const text = container.textContent ?? "";
    expect(text).toMatch(/Done/);
    expect(text).not.toMatch(/Lookup Property Data/i);
    expect(text).not.toMatch(/auto-?fill|pull beds|automatically/i);
  });

  it("the inspection form has no Lookup Property Data control either", () => {
    const form = readFileSync(
      join(process.cwd(), "components", "InitialDataEntryForm.tsx"),
      "utf8",
    );
    expect(form).not.toMatch(/Lookup Property Data/);
  });
});
