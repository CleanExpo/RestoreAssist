/**
 * Nexus Hub context bundle for Margot / Mission Control (Tier 2).
 * Reads synced data/content/nexus-hub on Vercel; optional Hermes API on LAN.
 */

import fs from "fs/promises";
import path from "path";

const NEXUS_DIR = path.join(process.cwd(), "data", "content", "nexus-hub");

/**
 * Why a field has no text. An absent file, an unreadable file and a file that
 * genuinely contains nothing are three different facts, and a reader that
 * renders all three as "(empty)" is asserting a successful read that never
 * happened. Callers must be able to tell them apart.
 */
export type FieldStatus = "loaded" | "empty" | "missing" | "error";

export type FieldStatuses = Record<NexusContextField, FieldStatus>;

export type NexusContextField =
  | "voice"
  | "icp"
  | "designTokens"
  | "agentsSnippet"
  | "memorySummary"
  | "wikiIndexExcerpt";

/** Where each half of the bundle came from, and whether it actually arrived. */
export type NexusSourceReport = {
  /** True when at least one file was read off disk. */
  disk: boolean;
  /** Hermes is optional; "off" means unconfigured, not failed. */
  hermes: "off" | "ok" | "unreachable";
  /** Present only when Hermes was configured and did not answer. */
  hermesReason?: string;
};

export type NexusContextBundle = {
  fetchedAt: string;
  source: "disk" | "hermes" | "disk+hermes" | "none";
  /** Per-field provenance. Never infer "no content" from an empty string. */
  fields: FieldStatuses;
  sources: NexusSourceReport;
  voice: string;
  icp: string;
  designTokens: string;
  agentsSnippet: string;
  memorySummary: string;
  wikiIndexExcerpt: string;
};

type ReadResult =
  | { status: "loaded"; text: string }
  | { status: "empty"; text: "" }
  | { status: "missing"; text: "" }
  | { status: "error"; text: "" };

async function readMdOptional(
  filename: string,
  maxChars: number,
): Promise<ReadResult> {
  const full = path.join(NEXUS_DIR, filename);
  let text: string;
  try {
    text = await fs.readFile(full, "utf8");
  } catch (err) {
    // ENOENT is a legitimate "this hub file was never synced". Anything else
    // (permissions, EISDIR, I/O) is a failure we must not disguise as absence.
    const code = (err as NodeJS.ErrnoException)?.code;
    return { status: code === "ENOENT" ? "missing" : "error", text: "" };
  }
  if (text.trim() === "") return { status: "empty", text: "" };
  if (text.length <= maxChars) return { status: "loaded", text };
  return { status: "loaded", text: `${text.slice(0, maxChars)}\n\n[truncated]` };
}

type HermesFetch =
  | { ok: true; data: Record<string, string> }
  | { ok: false; configured: false }
  | { ok: false; configured: true; reason: string };

async function fetchHermesContext(): Promise<HermesFetch> {
  const base = (process.env.HERMES_BASE_URL ?? "").replace(/\/$/, "");
  if (!base) return { ok: false, configured: false };
  try {
    const res = await fetch(`${base}/api/nexus/context`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      return { ok: false, configured: true, reason: `Hermes ${res.status}` };
    }
    const data = (await res.json()) as Record<string, string>;
    return { ok: true, data };
  } catch {
    return { ok: false, configured: true, reason: "Hermes unreachable" };
  }
}

export async function loadNexusContextBundle(): Promise<NexusContextBundle> {
  const voice = await readMdOptional("voice-profile.md", 8000);
  const icp = await readMdOptional("icp-positioning.md", 8000);
  const designTokens = await readMdOptional("design-tokens.md", 4000);

  // The snippet is preferred, but a missing snippet must fall through to the
  // full file without laundering a read *error* on the snippet into silence.
  const snippet = await readMdOptional("AGENTS.snippet.md", 4000);
  const agentsSnippet =
    snippet.status === "loaded"
      ? snippet
      : await readMdOptional("AGENTS.full.md", 6000);

  // These two only ever come from Hermes; on disk they are not empty, they
  // are absent. Saying "empty" here would be the lie this module exists to
  // stop telling.
  const diskOnly: ReadResult = { status: "missing", text: "" };

  const fields: FieldStatuses = {
    voice: voice.status,
    icp: icp.status,
    designTokens: designTokens.status,
    agentsSnippet: agentsSnippet.status,
    memorySummary: diskOnly.status,
    wikiIndexExcerpt: diskOnly.status,
  };

  const diskLoaded = [voice, icp, designTokens, agentsSnippet].some(
    (r) => r.status === "loaded",
  );

  const hermes = await fetchHermesContext();

  const sources: NexusSourceReport = {
    disk: diskLoaded,
    hermes: hermes.ok ? "ok" : hermes.configured ? "unreachable" : "off",
    ...(hermes.ok === false && hermes.configured
      ? { hermesReason: hermes.reason }
      : {}),
  };

  const bundle: NexusContextBundle = {
    fetchedAt: new Date().toISOString(),
    source: sourceLabel(diskLoaded, hermes.ok),
    fields,
    sources,
    voice: voice.text,
    icp: icp.text,
    designTokens: designTokens.text,
    agentsSnippet: agentsSnippet.text,
    memorySummary: "",
    wikiIndexExcerpt: "",
  };

  if (!hermes.ok) return bundle;

  // Hermes answered: let each field it actually supplied override disk, and
  // mark the ones it did not as still missing rather than empty.
  for (const key of Object.keys(fields) as NexusContextField[]) {
    const value = hermes.data[key];
    if (typeof value !== "string") continue;
    bundle[key] = value;
    bundle.fields[key] = value.trim() === "" ? "empty" : "loaded";
  }

  return bundle;
}

function sourceLabel(
  diskLoaded: boolean,
  hermesOk: boolean,
): NexusContextBundle["source"] {
  if (diskLoaded && hermesOk) return "disk+hermes";
  if (hermesOk) return "hermes";
  if (diskLoaded) return "disk";
  return "none";
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
