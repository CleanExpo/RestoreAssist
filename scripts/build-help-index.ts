// scripts/build-help-index.ts
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";

const CONTENT_ROOT = path.join(process.cwd(), "data", "content", "help");
const OUTPUT = path.join(process.cwd(), "public", "help-index.json");

type IndexEntry = {
  slug: string;
  category: string;
  title: string;
  audience: string[];
  aiSummary: string;
  userIntents: string[];
  readTimeMin: number;
};

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith("_") || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.name.endsWith(".mdx")) out.push(full);
  }
  return out;
}

async function main() {
  let files: string[] = [];
  try {
    files = await walk(CONTENT_ROOT);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    // data/content/help directory doesn't exist yet (pre-T13 seed articles) — emit empty index.
  }
  const entries: IndexEntry[] = [];
  for (const f of files) {
    const raw = await fs.readFile(f, "utf-8");
    const { data } = matter(raw);
    if (data.status !== "published") continue;
    entries.push({
      slug: data.slug,
      category: data.category,
      title: data.title,
      audience: data.audience ?? [],
      aiSummary: data.aiSummary,
      userIntents: data.userIntents ?? [],
      readTimeMin: data.readTimeMin ?? 0,
    });
  }
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(entries, null, 2));
  console.log(`[help-index] wrote ${entries.length} entries → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
