import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { HELP_CATEGORIES, type HelpFrontmatter, type HelpCategory } from "./types";
import { parseHelpFrontmatter } from "./frontmatter-schema";

const CONTENT_ROOT = path.join(process.cwd(), "data", "content", "help");

export type LoadedArticle = {
  frontmatter: HelpFrontmatter;
  body: string;
};

async function readMdx(filePath: string): Promise<LoadedArticle | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = matter(raw);

    // Allow `_fixtures` category in test mode (bypasses zod category enum)
    const inFixture = parsed.data.category === "_fixtures";
    if (inFixture && process.env.NODE_ENV === "test") {
      return { frontmatter: parsed.data as HelpFrontmatter, body: parsed.content };
    }

    const result = parseHelpFrontmatter(parsed.data);
    if (!result.success) {
      console.error(`[help] frontmatter invalid for ${filePath}:`, result.error.format());
      return null;
    }
    return { frontmatter: result.data, body: parsed.content };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function loadArticle(
  category: HelpCategory | "_fixtures",
  slug: string,
): Promise<LoadedArticle | null> {
  const filePath = path.join(CONTENT_ROOT, category, `${slug}.mdx`);
  return readMdx(filePath);
}

export async function loadCategoryIndex(
  category: HelpCategory | "_fixtures",
): Promise<LoadedArticle[]> {
  const dir = path.join(CONTENT_ROOT, category);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const articles = await Promise.all(
    files
      .filter((f) => f.endsWith(".mdx"))
      .map((f) => readMdx(path.join(dir, f))),
  );
  return articles
    .filter((a): a is LoadedArticle => a !== null && a.frontmatter.status === "published")
    .sort((a, b) => a.frontmatter.order - b.frontmatter.order);
}

export async function loadAllArticles(): Promise<LoadedArticle[]> {
  // The `_fixtures` category exists only for the loader unit tests. Its
  // frontmatter uses `category: "_fixtures"`, which is deliberately NOT in
  // the published HELP_CATEGORIES enum, so `parseHelpFrontmatter` rejects it
  // and `readMdx` logs `[help] frontmatter invalid`. In production (where
  // /help renders) that fires on every cold render / revalidation as pure
  // log noise (the page still 200s). Only walk `_fixtures` under test mode —
  // mirrors the existing `NODE_ENV === "test"` bypass in `readMdx`.
  const categories =
    process.env.NODE_ENV === "test"
      ? [...HELP_CATEGORIES, "_fixtures" as const]
      : [...HELP_CATEGORIES];
  const lists = await Promise.all(categories.map(loadCategoryIndex));
  return lists.flat();
}
