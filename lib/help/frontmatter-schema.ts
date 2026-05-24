import { z } from "zod";
import { HELP_CATEGORIES, type HelpFrontmatter } from "./types";

const Schema = z.object({
  title: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be kebab-case"),
  category: z.enum(HELP_CATEGORIES),
  order: z.number().int().nonnegative(),
  audience: z.array(z.enum(["tradie", "admin", "client"])).min(1),
  readTimeMin: z.number().int().positive(),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use ISO date YYYY-MM-DD"),
  status: z.enum(["draft", "published", "archived"]),
  heroImage: z.string().optional(),
  relatedSlugs: z.array(z.string()).default([]),
  aiSummary: z.string().min(20, "aiSummary is required for SP-G readiness"),
  userIntents: z.array(z.string()).min(1),
  successCriteria: z.array(z.string()).min(1),
});

export function parseHelpFrontmatter(
  input: unknown,
):
  | { success: true; data: HelpFrontmatter }
  | { success: false; error: z.ZodError } {
  const result = Schema.safeParse(input);
  if (result.success)
    return { success: true, data: result.data as HelpFrontmatter };
  return { success: false, error: result.error };
}
