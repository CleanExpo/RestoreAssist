/**
 * RA-6934 / RA-7000: driver for the server-side standards ingest.
 *
 * Reads pre-extracted .txt files from a staging directory laid out as
 * <dir>/<STANDARD>-<EDITION>/*.txt and POSTs each standard to
 * /api/cron/ingest-standards, where the Vercel runtime holds the sensitive
 * DATABASE_URL + OPENAI_API_KEY this machine cannot pull.
 *
 * Usage:
 *   STANDARDS_INGEST_TOKEN=<token> npx tsx scripts/ingest-standards-remote.ts \
 *     --dir ~/iicrc-source/.staging --base https://restoreassist.app
 *
 * Options: --provenance authoritative-standard|knowledge (default
 * authoritative-standard), --jurisdiction AU|NZ|INTL|US (default AU),
 * --only S500-2021 (repeatable substring filter on folder names).
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface DriverArgs {
  dir: string;
  base: string;
  provenance: string;
  jurisdiction: string;
  only: string[];
}

function parseDriverArgs(argv: string[] = process.argv.slice(2)): DriverArgs {
  const get = (flag: string, def: string) => {
    const idx = argv.indexOf(flag);
    return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : def;
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

  const { dir, base, provenance, jurisdiction, only } = parseDriverArgs();
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

    console.log(
      `ingest ${standard}:${edition}  (${files.length} file(s), ` +
        `${Math.round(files.reduce((n, f) => n + f.text.length, 0) / 1024)} KB)`,
    );

    const res = await fetch(`${base}/api/cron/ingest-standards`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ standard, edition, provenance, jurisdiction, files }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      failures++;
      console.error(`  FAILED (${res.status}):`, JSON.stringify(payload));
      continue;
    }
    console.log(
      `  ok — files ${payload.filesProcessed}, inserted ${payload.chunksUpserted}, ` +
        `skipped ${payload.chunksSkipped}`,
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} standard(s) failed — re-run is safe (idempotent).`);
    process.exit(1);
  }
  console.log("\nDONE — all standards ingested.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
