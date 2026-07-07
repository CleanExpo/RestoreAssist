/**
 * RA-6934 — batching logic for the remote ingest driver. The route caps
 * `files` at 50/POST and runs under a 300s budget, so planBatches must split
 * folders by BOTH file count and cumulative byte size (regression: Actichem's
 * 133 files 400'd, and the 1.9MB CERT4INCLEANIN bucket 504'd, on the old
 * single-POST-per-folder driver).
 */
import { describe, expect, it } from "vitest";
import {
  planBatches,
  MAX_FILES_PER_POST,
  type IngestFile,
} from "@/scripts/ingest-standards-remote";

const mk = (n: number, size = 10): IngestFile[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `f${i}.txt`,
    text: "x".repeat(size),
  }));

describe("planBatches", () => {
  it("keeps a small folder in a single batch", () => {
    const batches = planBatches(mk(5));
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(5);
  });

  it("splits Actichem's 133 files into 50/50/33 on the file cap", () => {
    const batches = planBatches(mk(133));
    expect(batches.map((b) => b.length)).toEqual([50, 50, 33]);
  });

  it("never exceeds the route's hard 50-file cap", () => {
    const batches = planBatches(mk(200));
    expect(batches.every((b) => b.length <= MAX_FILES_PER_POST)).toBe(true);
  });

  it("splits on cumulative byte size before the file cap is reached", () => {
    // 6 files x 100KB with a 250KB cap -> three batches of two.
    const batches = planBatches(mk(6, 100_000), 50, 250_000);
    expect(batches.map((b) => b.length)).toEqual([2, 2, 2]);
  });

  it("gives a single oversized file its own batch", () => {
    const files: IngestFile[] = [
      { name: "big.txt", text: "x".repeat(500_000) },
      { name: "small.txt", text: "x".repeat(10) },
    ];
    const batches = planBatches(files, 50, 400_000);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(1);
    expect(batches[0][0].name).toBe("big.txt");
  });

  it("returns no batches for an empty folder", () => {
    expect(planBatches([])).toEqual([]);
  });
});
