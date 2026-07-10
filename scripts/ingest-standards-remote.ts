/**
 * RA-6934 / RA-7000: driver for the server-side standards ingest.
 *
 * Reads pre-extracted .txt files from a staging directory laid out as
 * <dir>/<STANDARD>-<EDITION>/*.txt and POSTs each standard to
 * /api/cron/ingest-standards, where the Vercel runtime holds the sensitive
 * DATABASE_URL + OPENAI_API_KEY this machine cannot pull.
 *
 * The route caps `files` at 50 per POST (BodySchema) and runs under a 300s
 * function budget, so a folder is split into batches bounded by BOTH a file
 * count AND a cumulative text-byte size (whichever is hit first) — otherwise a
 * big folder 400s on the file cap or 504s on the embed timeout. Re-runs are
 * idempotent (upsert by contentHash), so a partial run is safe to repeat.
 *
 * Usage:
 *   STANDARDS_INGEST_TOKEN=<token> npx tsx scripts/ingest-standards-remote.ts \
 *     --dir ~/iicrc-source/.staging --base https://restoreassist.app
 *
 * Options: --provenance authoritative-standard|knowledge (default
 * authoritative-standard), --jurisdiction AU|NZ|INTL|US (default AU),
 * --only S500-2021 (repeatable substring filter on folder names),
 * --maxfiles 50 (per-POST file cap), --maxbytes 400000 (per-POST text bytes).
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
// RA-7026: refuse to embed charge-out rates into the shared corpus.
import { scanText } from "./ci/check-corpus-hygiene.mjs";

/** Must not exceed the route's `files` array cap (BodySchema: max 50). */
export const MAX_FILES_PER_POST = 50;
/**
 * Keep one POST's text small enough to embed within the route's 300s budget.
 * Empirically ~640KB embeds fine and ~1.9MB times out (504), so 400KB leaves
 * a comfortable margin.
 */
export const MAX_BYTES_PER_POST = 400_000;

export interface IngestFile {
  name: string;
  text: string;
}

/**
 * Split a folder's files into POST-sized batches, bounded by BOTH a file
 * count and a cumulative byte size. A single file larger than `maxBytes` still
 * gets its own batch (it cannot be split without changing chunk boundaries).
 * Pure + deterministic for testability.
 */
export function planBatches(
  files: IngestFile[],
  maxFiles: number = MAX_FILES_PER_POST,
  maxBytes: number = MAX_BYTES_PER_POST,
): IngestFile[][] {
  const batches: IngestFile[][] = [];
  let current: IngestFile[] = [];
  let currentBytes = 0;
  for (const file of files) {
    const bytes = Buffer.byteLength(file.text, "utf8");
    if (
      current.length > 0 &&
      (current.length >= maxFiles || currentBytes + bytes > maxBytes)
    ) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(file);
    currentBytes += bytes;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

interface DriverArgs {
  dir: string;
  base: string;
  provenance: string;
  jurisdiction: string;
  only: string[];
  maxFiles: number;
  maxBytes: number;
}

function parseDriverArgs(argv: string[] = process.argv.slice(2)): DriverArgs {
  const get = (flag: string, def: string) => {
    const idx = argv.indexOf(flag);
    return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : def;
  };
  const getNum = (flag: string, def: number) => {
    const n = parseInt(get(flag, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : def;
  };
  const only: string[] = [];
  argv.forEach((a, i) => {
    if (a === "--only" && argv[i + 1]) only.push(argv[i + 1]);
  });
  return {
    dir: get("--dir", path.join(os.homedir(), "iicrc-source", ".staging")),
    base: get("--base", "https://restoreassist.app"),
    provenance: get("--provenance", "authoritative-standard"),
    jurisdiction: get("--jurisdiction", "AU"),
    only,
    // Never let --maxfiles exceed the route's hard cap of 50.
    maxFiles: Math.min(getNum("--maxfiles", MAX_FILES_PER_POST), MAX_FILES_PER_POST),
    maxBytes: getNum("--maxbytes", MAX_BYTES_PER_POST),
  };
}

async function main() {
  const token = process.env.STANDARDS_INGEST_TOKEN?.trim();
  if (!token) {
    console.error(
      "FATAL: STANDARDS_INGEST_TOKEN is not set. It must match the value in " +
        "Vercel (Production) for /api/cron/ingest-standards.",
    );
    process.exit(1);
  }

  const { dir, base, provenance, jurisdiction, only, maxFiles, maxBytes } =
    parseDriverArgs();
  if (!fs.existsSync(dir)) {
    console.error(`FATAL: staging dir not found: ${dir}`);
    process.exit(1);
  }

  const folders = fs
    .readdirSync(dir)
    .filter((f) => fs.statSync(path.join(dir, f)).isDirectory())
    .filter((f) => /^[A-Za-z0-9-]+-[A-Za-z0-9.]+$/.test(f))
    .filter((f) => only.length === 0 || only.some((o) => f.includes(o)))
    .sort();

  if (folders.length === 0) {
    console.error(`FATAL: no <STANDARD>-<EDITION> folders under ${dir}`);
    process.exit(1);
  }

  let failures = 0;
  for (const folder of folders) {
    const lastDash = folder.lastIndexOf("-");
    const standard = folder.slice(0, lastDash);
    const edition = folder.slice(lastDash + 1);
    const folderPath = path.join(dir, folder);
    const files = fs
      .readdirSync(folderPath)
      .filter((f) => f.endsWith(".txt"))
      .sort()
      .map((name) => ({
        name,
        text: fs.readFileSync(path.join(folderPath, name), "utf-8"),
      }));

    if (files.length === 0) {
      console.log(`skip ${folder} — no .txt files`);
      continue;
    }

    // RA-7026 corpus-hygiene gate: a charge-out rate ($/hr, per day) must never
    // enter the shared corpus — pricing is a live per-tenant injection. Refuse
    // the folder loudly rather than embedding a figure a retriever can surface.
    const rateHits = files.flatMap((f) =>
      scanText(f.text).map((h) => ({ name: f.name, ...h })),
    );
    if (rateHits.length > 0) {
      failures++;
      console.error(
        `  SKIP ${folder} — charge-out rate pattern(s) (rag-corpus-hygiene):`,
      );
      for (const h of rateHits) {
        console.error(`    ${h.name}:${h.line}  ${h.text}`);
      }
      continue;
    }

    const batches = planBatches(files, maxFiles, maxBytes);
    const kb = Math.round(files.reduce((n, f) => n + f.text.length, 0) / 1024);
    console.log(
      `ingest ${standard}:${edition}  (${files.length} file(s), ${kb} KB, ` +
        `${batches.length} POST(s))`,
    );

    let folderInserted = 0;
    let folderSkipped = 0;
    let folderFailed = false;
    for (let i = 0; i < batches.length; i++) {
      const res = await fetch(`${base}/api/cron/ingest-standards`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          standard,
          edition,
          provenance,
          jurisdiction,
          files: batches[i],
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        failures++;
        folderFailed = true;
        console.error(
          `  batch ${i + 1}/${batches.length} FAILED (${res.status}):`,
          JSON.stringify(payload),
        );
        continue;
      }
      folderInserted += payload.chunksUpserted ?? 0;
      folderSkipped += payload.chunksSkipped ?? 0;
      console.log(
        `  batch ${i + 1}/${batches.length} ok — inserted ` +
          `${payload.chunksUpserted}, skipped ${payload.chunksSkipped}`,
      );
    }
    if (!folderFailed) {
      console.log(
        `  -> ${standard}:${edition} done — inserted ${folderInserted}, ` +
          `skipped ${folderSkipped}`,
      );
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} batch(es) failed — re-run is safe (idempotent).`);
    process.exit(1);
  }
  console.log("\nDONE — all standards ingested.");
}

// Run only when executed directly (not imported in tests)
if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))
) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
