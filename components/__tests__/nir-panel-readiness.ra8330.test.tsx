// @vitest-environment jsdom
/**
 * RA-8330, PR review round 7 (CodeRabbit). The same defect kind as rounds 3 and 4:
 * a side panel could be marked ready with data that belonged to another read.
 *
 * Design change, not another patch:
 * - Every side-panel read goes through readIfCurrent, which re-checks that the
 *   request is still the newest after EVERY wait (the network and the body).
 * - The make-safe checklist is one component instance per inspection, so its
 *   readiness and state can never carry over from a previous inspection.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRef } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readIfCurrent } from "@/lib/nir-draft-save";
import {
  MakeSafeChecklist,
  type MakeSafeChecklistHandle,
} from "@/components/inspection/MakeSafeChecklist";

const here = dirname(fileURLToPath(import.meta.url));
function readSource(rel: string): string {
  return readFileSync(join(here, "../..", rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("readIfCurrent: the one way a side panel reads its saved record", () => {
  it("drops a reply whose request was superseded while its body was being read", async () => {
    let current = true;
    const res = jsonResponse({ insurerName: "old" });
    const json = res.json.bind(res);
    vi.spyOn(res, "json").mockImplementation(async () => {
      current = false; // a newer request starts while this body is read
      return json();
    });
    expect(await readIfCurrent(async () => res, () => current)).toBeNull();
  });

  it("drops a reply whose request was superseded while it was on the network", async () => {
    let current = true;
    const read = readIfCurrent(async () => {
      current = false;
      return jsonResponse({ a: 1 });
    }, () => current);
    expect(await read).toBeNull();
  });

  it("returns the record for a current 200 and an empty record for a 404", async () => {
    expect(await readIfCurrent(async () => jsonResponse({ a: 1 }), () => true)).toEqual({
      ok: true,
      status: 200,
      record: { a: 1 },
    });
    expect(await readIfCurrent(async () => jsonResponse({}, 404), () => true)).toEqual({
      ok: false,
      status: 404,
      record: null,
    });
  });
});

describe("the claim panel reads only through readIfCurrent", () => {
  const src = readSource("components/inspection/NIRClaimAssessmentPanel.tsx");
  const slice = (from: string, to: string) => {
    const start = src.indexOf(from);
    expect(start).toBeGreaterThan(-1);
    return src.slice(start, src.indexOf(to, start));
  };

  it("loadAssessment and loadCompliance never touch a raw reply", () => {
    for (const body of [
      slice("const loadAssessment = useCallback", "const loadCompliance"),
      slice("const loadCompliance = useCallback", "useEffect("),
    ]) {
      expect(body).toContain("readIfCurrent(");
      expect(body).not.toContain(".json(");
      expect(body).not.toMatch(/await fetch\(/);
    }
  });
});

describe("the make-safe checklist is one instance per inspection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is not ready for a new inspection until that inspection's checklist has loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        String(url).includes("/insp-a/")
          ? Promise.resolve(jsonResponse({ data: [] }))
          : new Promise<Response>(() => {}), // insp-b never answers
      ),
    );
    const ref = createRef<MakeSafeChecklistHandle>();
    const view = render(<MakeSafeChecklist ref={ref} inspectionId="insp-a" />);
    await waitFor(() => expect(ref.current?.isReady()).toBe(true));

    await act(async () => {
      view.rerender(<MakeSafeChecklist ref={ref} inspectionId="insp-b" />);
    });
    expect(ref.current?.isReady()).toBe(false);
    await expect(ref.current!.persist()).rejects.toThrow(/still loading/);
  });
});

describe("the sync badge forgets a failed draft save when the account changes", () => {
  it("resets draftSaveFailed whenever the signed-in user changes", () => {
    const src = readSource("components/nir-offline-provider.tsx");
    expect(src).toMatch(
      /useEffect\(\(\) => \{\s*setDraftSaveFailed\(false\);\s*\}, \[sessionUserId\]\)/,
    );
  });
});
