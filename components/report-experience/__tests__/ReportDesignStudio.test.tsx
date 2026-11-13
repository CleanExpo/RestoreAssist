// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { REPORT_THEMES } from "@/lib/report-experience/catalog";
import { ReportDesignStudio } from "../ReportDesignStudio";

afterEach(() => cleanup());

describe("Report Experience Studio synthetic-only prototype", () => {
  it("renders all ten selectable styles and a clearly marked synthetic inspection", () => {
    render(<ReportDesignStudio />);
    for (const theme of REPORT_THEMES) {
      expect(screen.getByRole("button", { name: new RegExp(theme.label, "i") })).toBeTruthy();
    }
    expect(screen.getByText(/DESIGN LAB · SYNTHETIC DATA/i)).toBeTruthy();
    expect(screen.getByText(/DRAFT CONCEPT · NOT FOR CLAIM USE/i)).toBeTruthy();
    expect(screen.getByText(/No property measurements/i)).toBeTruthy();
  });

  it("switches report styles while retaining the identical safety warning", () => {
    render(<ReportDesignStudio />);
    const root = screen.getByRole("article", { name: /Executive Modern synthetic report preview/i });
    expect(root.getAttribute("data-theme")).toBe("executive-modern");
    const safety = screen.getByRole("note", { name: /Safety warning/i });
    expect(within(safety).getByText(/Safety comes before presentation/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Safety & Compliance/i }));
    expect(screen.getByRole("article", { name: /Safety & Compliance synthetic report preview/i }).getAttribute("data-theme")).toBe("safety-compliance");
    expect(screen.getByRole("note", { name: /Safety warning/i }).textContent).toContain("Possible electrical exposure");
    fireEvent.click(screen.getByRole("button", { name: /Dark Tech/i }));
    expect(screen.getByRole("article", { name: /Dark Tech synthetic report preview/i }).getAttribute("data-theme")).toBe("dark-tech");
  });

  it("enables manual motion only after selecting preview motion", () => {
    render(<ReportDesignStudio />);
    const report = screen.getByRole("article", { name: /Executive Modern synthetic report preview/i });
    expect(report.getAttribute("data-animated")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /Preview motion/i }));
    expect(report.getAttribute("data-animated")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Pause motion/i }));
    expect(report.getAttribute("data-animated")).toBe("false");
  });

  it("the PDF mode is static and cannot enable motion", () => {
    render(<ReportDesignStudio />);
    fireEvent.click(screen.getByRole("button", { name: /Preview motion/i }));
    fireEvent.click(screen.getByRole("button", { name: /Print \/ PDF/i }));
    const report = screen.getByRole("article", { name: /Executive Modern synthetic report preview/i });
    expect(report.getAttribute("data-pdf")).toBe("true");
    expect(report.getAttribute("data-animated")).toBe("false");
    expect((screen.getByRole("button", { name: /Preview motion/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/PDF mode is a static layout preview/i)).toBeTruthy();
  });

  it("displays the same sample report identity and limitations for every style", () => {
    render(<ReportDesignStudio />);
    for (const theme of REPORT_THEMES) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(theme.label, "i") }));
      const report = screen.getByRole("article", { name: new RegExp(theme.label + " synthetic report preview", "i") });
      expect(within(report).getByText(/SAMPLE REPORT 0001/i)).toBeTruthy();
      expect(within(report).getByText(/Limits and missing evidence/i)).toBeTruthy();
      expect(within(report).getByText(/Required evidence and sign-off/i)).toBeTruthy();
      expect(within(report).getByText(/Authorised work/i)).toBeTruthy();
    }
  });
});
