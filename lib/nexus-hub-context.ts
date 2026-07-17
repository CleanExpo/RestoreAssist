/**
 * Nexus Hub context bundle for Margot / Mission Control (Tier 2).
 * Reads synced data/content/nexus-hub on Vercel; optional Hermes API on LAN.
 */

import fs from "fs/promises";
import path from "path";

const NEXUS_DIR = path.join(process.cwd(), "data", "content", "nexus-hub");

export type NexusContextBundle = {
  fetchedAt: string;
  source: "disk" | "hermes" | "disk+hermes";
  voice: string;
  icp: string;
  designTokens: string;
  agentsSnippet: string;
  memorySummary: string;
  wikiIndexExcerpt: string;
};

async function readMdOptional(filename: string, maxChars: number): Promise<string> {
  try {
    const full = path.join(NEXUS_DIR, filename);
    const text = await fs.readFile(full, "utf8");
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}\n\n[truncated]`;
  } catch {
    return "";
  }
}

async function fetchHermesContext(): Promise<Partial<NexusContextBundle> | null> {
  const base = (process.env.HERMES_BASE_URL ?? "").replace(/\/$/, "");
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/nexus/context`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, string>;
    return {
      voice: data.voice ?? "",
      icp: data.icp ?? "",
      designTokens: data.designTokens ?? "",
      agentsSnippet: data.agentsSnippet ?? "",
      memorySummary: data.memorySummary ?? "",
      wikiIndexExcerpt: data.wikiIndexExcerpt ?? "",
    };
  } catch {
    return null;
  }
}

export async function loadNexusContextBundle(): Promise<NexusContextBundle> {
  const fromDisk: NexusContextBundle = {
    fetchedAt: new Date().toISOString(),
    source: "disk",
    voice: await readMdOptional("voice-profile.md", 8000),
    icp: await readMdOptional("icp-positioning.md", 8000),
    designTokens: await readMdOptional("design-tokens.md", 4000),
    agentsSnippet:
      (await readMdOptional("AGENTS.snippet.md", 4000)) ||
      (await readMdOptional("AGENTS.full.md", 6000)),
    memorySummary: "",
    wikiIndexExcerpt: "",
  };

  const fromHermes = await fetchHermesContext();
  if (fromHermes) {
    return {
      ...fromDisk,
      ...fromHermes,
      fetchedAt: new Date().toISOString(),
      source: "disk+hermes",
      memorySummary: fromHermes.memorySummary || fromDisk.memorySummary,
      wikiIndexExcerpt: fromHermes.wikiIndexExcerpt || fromDisk.wikiIndexExcerpt,
    };
  }

  return fromDisk;
}

/** System-prompt appendix for Margot when Nexus context is enabled. */
export function formatNexusContextForPrompt(bundle: NexusContextBundle): string {
  const parts: string[] = [
    "## Nexus Hub context (Unite-Group operator)",
    "RestoreAssist is one product under Unite-Group; group HQ is Nexus Hub (wiki + Hermes).",
  ];
  if (bundle.memorySummary) {
    parts.push("### MEMORY summary", bundle.memorySummary);
  }
  if (bundle.wikiIndexExcerpt) {
    parts.push("### Wiki index excerpt", bundle.wikiIndexExcerpt);
  }
  if (bundle.voice) {
    parts.push("### Voice profile", bundle.voice);
  }
  if (bundle.icp) {
    parts.push("### ICP", bundle.icp);
  }
  if (bundle.agentsSnippet) {
    parts.push("### Hub rules", bundle.agentsSnippet);
  }
  return parts.join("\n\n");
}

export function nexusContextEnabled(): boolean {
  const v = process.env.MARGOT_NEXUS_CONTEXT;
  return v === "1" || v === "true";
}
