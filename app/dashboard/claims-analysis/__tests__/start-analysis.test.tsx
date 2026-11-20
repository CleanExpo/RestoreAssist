// @vitest-environment node
/**
 * RA-8043e — behaviour of the claims-analysis page's startAnalysis.
 *
 * The page has no render harness, so this runs the real startAnalysis body
 * taken from page.tsx (transpiled with TypeScript) with mocked fetch, toast,
 * state setters and stream reader. It proves:
 * - a blank maxDocuments sends min(files, 100), and a larger value is clamped
 *   to 100 before sending (the API refuses more than 100);
 * - a structured API error ({ error: { message } }) shows its message;
 * - a stream {type:"error"} event is terminal: one error toast, the reader is
 *   cancelled and never read again, and processing ends false.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("../page.tsx", import.meta.url)),
  "utf8",
);

function startAnalysisSource(): string {
  const start = source.indexOf("  const startAnalysis = async () => {");
  const end = source.indexOf("\n  const getStatusColor", start);
  if (start < 0 || end < 0) throw new Error("startAnalysis not found in page.tsx");
  // Component-level values startAnalysis reads, taken from the page itself.
  const prelude = [
    source.match(/^const MAX_DOCUMENTS_PER_BATCH = \d+;$/m)?.[0],
    source.match(/^ {2}const documentCap = [^\n]+;$/m)?.[0],
  ].filter(Boolean);
  return [...prelude, source.slice(start, end), "return startAnalysis;"].join("\n");
}

const compiled = ts.transpileModule(startAnalysisSource(), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

type Options = {
  files?: number;
  maxDocuments?: string;
  events?: Record<string, unknown>[];
  response?: { ok: boolean; status?: number; json?: unknown };
  failAfterFirstRead?: boolean;
};

async function run(opts: Options = {}) {
  const errors: string[] = [];
  const successes: string[] = [];
  const processing: boolean[] = [];
  const sent: Record<string, unknown>[] = [];
  const abortControllerRef = { current: null as unknown };
  const chunk = new TextEncoder().encode(
    (opts.events ?? []).map((e) => JSON.stringify(e) + "\n").join(""),
  );
  let reads = 0;
  const reader = {
    read: vi.fn(async () => {
      reads++;
      if (reads === 1) return { done: false, value: chunk };
      if (opts.failAfterFirstRead) throw new Error("stream transport failed");
      return { done: true, value: undefined };
    }),
    cancel: vi.fn(async () => undefined),
    releaseLock: vi.fn(() => undefined),
  };
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    const r = opts.response ?? { ok: true };
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 400),
      json: async () => r.json ?? {},
      body: { getReader: () => reader },
    };
  });
  const noop = () => undefined;
  const names = [
    "folderId",
    "files",
    "maxDocuments",
    "toast",
    "setProcessing",
    "setAnalysisResults",
    "setSummary",
    "setBatchProgress",
    "abortControllerRef",
    "fetch",
    "setShowNewAnalysisForm",
  ];
  const startAnalysis = new Function(...names, compiled)(
    "folder-1",
    Array.from({ length: opts.files ?? 1 }, (_, i) => ({ id: `f${i}`, name: `f${i}.pdf` })),
    opts.maxDocuments ?? "",
    {
      error: (m: string) => errors.push(m),
      success: (m: string) => successes.push(m),
    },
    (v: boolean) => processing.push(v),
    noop,
    noop,
    noop,
    abortControllerRef,
    fetchMock,
    noop,
  ) as () => Promise<void>;
  await startAnalysis();
  return { errors, successes, processing, sent, reader, reads, abortControllerRef, fetchMock };
}

describe("claims-analysis startAnalysis (RA-8043e)", () => {
  it("[ra-8043e] T8a a blank maxDocuments sends at most 100 documents", async () => {
    const big = await run({ files: 150 });
    expect(big.sent).toHaveLength(1);
    expect(big.sent[0]).toMatchObject({ maxDocuments: 100, stream: true });
    const small = await run({ files: 5 });
    expect(small.sent[0]).toMatchObject({ maxDocuments: 5 });
  });

  it("[ra-8043e] T8b a maxDocuments above 100 is clamped to 100 before sending", async () => {
    const r = await run({ files: 150, maxDocuments: "150" });
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0]).toMatchObject({ maxDocuments: 100 });
  });

  it("[ra-8043e] T8c a structured API error shows its message", async () => {
    const r = await run({
      response: {
        ok: false,
        status: 400,
        json: {
          error: {
            code: "VALIDATION",
            message: "maxDocuments must be a whole number from 1 to 100",
            eventId: "evt-1",
          },
        },
      },
    });
    expect(r.errors).toEqual(["maxDocuments must be a whole number from 1 to 100"]);
    expect(r.processing.at(-1)).toBe(false);
  });

  it("[ra-8043e] T8d a stream error event is terminal: one toast, reader cancelled, no further read", async () => {
    const r = await run({
      events: [
        { type: "start", total: 1, batchId: "b1" },
        {
          type: "error",
          batchId: "b1",
          error: "Saving the analysis results failed. The batch has been marked as failed.",
        },
      ],
      failAfterFirstRead: true,
    });
    expect(r.errors).toEqual([
      "Saving the analysis results failed. The batch has been marked as failed.",
    ]);
    expect(r.successes).toEqual([]);
    expect(r.reads).toBe(1);
    expect(r.reader.cancel).toHaveBeenCalledTimes(1);
    expect(r.processing.at(-1)).toBe(false);
    expect(r.abortControllerRef.current).toBeNull();
  });
});
