// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * RA-8104: development-only page that shows one authorised report.
 * Every collaborator is replaced, so each test shows which step the page
 * reached and what it did with the result.
 */

const m = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  getServerSession: vi.fn(),
  authorise: vi.fn(),
  adapter: vi.fn(),
  snapshot: vi.fn(),
  studio: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: m.notFound }));
vi.mock("next-auth", () => ({ getServerSession: m.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: { marker: "auth-options" } }));
vi.mock("@/lib/report-experience/authorise", () => ({ authoriseReportExperienceRead: m.authorise }));
vi.mock("@/lib/report-experience/evidence-adapter", () => ({ buildVerifiedReportProjection: m.adapter }));
vi.mock("@/lib/report-experience/snapshot", () => ({ buildReportExperienceSnapshot: m.snapshot }));
vi.mock("@/components/report-experience/ReportDesignStudio", () => ({
  ReportDesignStudio: (props: { snapshot?: { reportNumber: string } }) => {
    m.studio(props);
    return <div data-testid="studio">{props.snapshot?.reportNumber ?? "synthetic"}</div>;
  },
}));

import Page, { dynamic, metadata } from "../dev/report-experience/[reportId]/page";

const env = process.env as Record<string, string | undefined>;
const originalEnv = env.NODE_ENV;
const grant = { reportId: "report_001" };
const snapshot = { reportNumber: "RA-42" };

async function show() {
  const element = await Page({ params: Promise.resolve({ reportId: "report_001" }) });
  return render(element);
}

beforeEach(() => {
  env.NODE_ENV = "development";
  Object.values(m).forEach((fn) => fn.mockClear());
  m.getServerSession.mockResolvedValue({ user: { id: "user_a" } });
  m.authorise.mockResolvedValue({ ok: true, grant });
  m.adapter.mockResolvedValue({ projection: { p: 1 }, omitted: [] });
  m.snapshot.mockReturnValue(snapshot);
});

afterEach(() => {
  cleanup();
  env.NODE_ENV = originalEnv;
});

describe("development report experience page", () => {
  it("declares itself uncached and unindexed", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("is not found outside development, before the gate is touched", async () => {
    env.NODE_ENV = "production";
    await expect(show()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(m.notFound).toHaveBeenCalled();
    expect(m.getServerSession).not.toHaveBeenCalled();
    expect(m.authorise).not.toHaveBeenCalled();
  });

  it("is not found when the gate refuses", async () => {
    m.authorise.mockResolvedValue({ ok: false, status: 401 });
    await expect(show()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(m.notFound).toHaveBeenCalled();
    expect(m.adapter).not.toHaveBeenCalled();
  });

  it("asks the gate with the session only, never a share token", async () => {
    await show();
    expect(m.authorise).toHaveBeenCalledWith({ reportId: "report_001", session: { user: { id: "user_a" } } });
    expect(m.getServerSession).toHaveBeenCalledWith({ marker: "auth-options" });
  });

  it("passes the snapshot to the studio and lists what was not shown", async () => {
    m.adapter.mockResolvedValue({
      projection: { p: 1 },
      omitted: [{ kind: "moisture-reading", id: "read_9", reason: "No unit stored" }],
    });
    await show();
    expect(m.adapter).toHaveBeenCalledWith(grant);
    expect(m.snapshot).toHaveBeenCalledWith({ p: 1 }, grant, expect.any(String));
    expect(m.studio).toHaveBeenCalledWith({ snapshot });
    expect(screen.getByText("Not shown: moisture-reading read_9 - No unit stored")).toBeTruthy();
  });

  it("says so when every record was mapped", async () => {
    await show();
    expect(screen.getByText("Every record found for this report was mapped.")).toBeTruthy();
  });

  it("names the adapter step when the adapter throws, and renders no studio", async () => {
    m.adapter.mockRejectedValue(new Error("Denied: report tenant does not match the grant"));
    await show();
    expect(screen.getByRole("alert").textContent).toMatch(/adapter/i);
    expect(screen.queryByTestId("studio")).toBeNull();
    expect(m.studio).not.toHaveBeenCalled();
  });

  it("never shows exception text from any step, and logs it on the server", async () => {
    const secret = "SECRET-DB-CONNECTION-DETAIL";
    const failures: Array<() => void> = [
      () => m.getServerSession.mockRejectedValue(new Error(secret)),
      () => m.authorise.mockRejectedValue(new Error(secret)),
      () => m.adapter.mockRejectedValue(new Error(secret)),
      () =>
        m.snapshot.mockImplementation(() => {
          throw new Error(secret);
        }),
    ];
    for (const fail of failures) {
      fail();
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const { container } = await show();
      expect(screen.getByRole("alert").textContent).toContain("server log");
      expect(container.textContent).not.toContain(secret);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("step failed"), expect.objectContaining({ message: secret }));
      log.mockRestore();
      cleanup();
      m.getServerSession.mockResolvedValue({ user: { id: "user_a" } });
      m.authorise.mockResolvedValue({ ok: true, grant });
      m.adapter.mockResolvedValue({ projection: { p: 1 }, omitted: [] });
      m.snapshot.mockReturnValue(snapshot);
    }
  });

  it("names the snapshot step when the snapshot builder throws", async () => {
    m.snapshot.mockImplementation(() => {
      throw new Error("Missing authoritative organisation brand");
    });
    await show();
    expect(screen.getByRole("alert").textContent).toMatch(/snapshot/i);
    expect(screen.queryByTestId("studio")).toBeNull();
  });
});
