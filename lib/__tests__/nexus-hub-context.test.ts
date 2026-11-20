import { beforeEach, describe, expect, it, vi } from "vitest";

const readFile = vi.fn();

vi.mock("fs/promises", () => ({
  default: { readFile: (...args: unknown[]) => readFile(...args) },
  readFile: (...args: unknown[]) => readFile(...args),
}));

import { loadNexusContextBundle } from "../nexus-hub-context";

function enoent() {
  const e = new Error("ENOENT: no such file or directory") as NodeJS.ErrnoException;
  e.code = "ENOENT";
  return e;
}

function eacces() {
  const e = new Error("EACCES: permission denied") as NodeJS.ErrnoException;
  e.code = "EACCES";
  return e;
}

/** Resolve reads by filename so each test states only what it cares about. */
function diskWith(files: Record<string, string | Error>) {
  readFile.mockImplementation(async (full: string) => {
    for (const [name, value] of Object.entries(files)) {
      if (full.endsWith(name)) {
        if (value instanceof Error) throw value;
        return value;
      }
    }
    throw enoent();
  });
}

beforeEach(() => {
  readFile.mockReset();
  delete process.env.HERMES_BASE_URL;
  vi.stubGlobal("fetch", vi.fn());
});

describe("loadNexusContextBundle — a failed read is not an empty field", () => {
  it("marks an absent file missing, not empty", async () => {
    diskWith({});

    const b = await loadNexusContextBundle();

    expect(b.fields.voice).toBe("missing");
    expect(b.voice).toBe("");
  });

  it("marks an unreadable file error, distinctly from missing", async () => {
    diskWith({ "voice-profile.md": eacces() });

    const b = await loadNexusContextBundle();

    expect(b.fields.voice).toBe("error");
    expect(b.fields.icp).toBe("missing");
  });

  it("marks a present-but-blank file empty, distinctly from missing", async () => {
    diskWith({ "voice-profile.md": "   \n  " });

    const b = await loadNexusContextBundle();

    expect(b.fields.voice).toBe("empty");
    expect(b.fields.icp).toBe("missing");
  });

  it("marks a file with content loaded and returns the text", async () => {
    diskWith({ "voice-profile.md": "Direct, plain, Australian." });

    const b = await loadNexusContextBundle();

    expect(b.fields.voice).toBe("loaded");
    expect(b.voice).toBe("Direct, plain, Australian.");
  });

  it("reports source none when nothing loaded at all", async () => {
    diskWith({});

    const b = await loadNexusContextBundle();

    expect(b.source).toBe("none");
    expect(b.sources.disk).toBe(false);
  });

  it("does not claim source disk when every disk read failed", async () => {
    diskWith({
      "voice-profile.md": eacces(),
      "icp-positioning.md": eacces(),
      "design-tokens.md": eacces(),
      "AGENTS.snippet.md": eacces(),
      "AGENTS.full.md": eacces(),
    });

    const b = await loadNexusContextBundle();

    expect(b.source).toBe("none");
  });

  it("falls through to the full agents file when the snippet is absent", async () => {
    diskWith({ "AGENTS.full.md": "Hub rules." });

    const b = await loadNexusContextBundle();

    expect(b.fields.agentsSnippet).toBe("loaded");
    expect(b.agentsSnippet).toBe("Hub rules.");
  });

  it("reports Hermes off, not failed, when it is unconfigured", async () => {
    diskWith({ "voice-profile.md": "v" });

    const b = await loadNexusContextBundle();

    expect(b.sources.hermes).toBe("off");
    expect(b.sources.hermesReason).toBeUndefined();
    // Hermes-only fields must not read as empty when Hermes was never asked.
    expect(b.fields.memorySummary).toBe("missing");
    expect(b.fields.wikiIndexExcerpt).toBe("missing");
  });

  it("reports Hermes unreachable with a reason when it is configured and fails", async () => {
    diskWith({ "voice-profile.md": "v" });
    process.env.HERMES_BASE_URL = "http://hermes.local";
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));

    const b = await loadNexusContextBundle();

    expect(b.sources.hermes).toBe("unreachable");
    expect(b.sources.hermesReason).toBe("Hermes unreachable");
    expect(b.source).toBe("disk");
    expect(b.fields.memorySummary).toBe("missing");
  });

  it("reports an HTTP failure from Hermes with its status", async () => {
    diskWith({ "voice-profile.md": "v" });
    process.env.HERMES_BASE_URL = "http://hermes.local";
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    } as unknown as Response);

    const b = await loadNexusContextBundle();

    expect(b.sources.hermes).toBe("unreachable");
    expect(b.sources.hermesReason).toBe("Hermes 502");
  });

  it("marks Hermes-supplied fields loaded and leaves unsupplied ones missing", async () => {
    diskWith({ "voice-profile.md": "disk voice" });
    process.env.HERMES_BASE_URL = "http://hermes.local";
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ memorySummary: "recent decisions" }),
    } as unknown as Response);

    const b = await loadNexusContextBundle();

    expect(b.source).toBe("disk+hermes");
    expect(b.sources.hermes).toBe("ok");
    expect(b.fields.memorySummary).toBe("loaded");
    expect(b.memorySummary).toBe("recent decisions");
    // Hermes said nothing about the wiki, so it is still missing, not empty.
    expect(b.fields.wikiIndexExcerpt).toBe("missing");
    // And it must not clobber a field it did not supply.
    expect(b.voice).toBe("disk voice");
  });

  it("marks a Hermes field it supplied as blank empty, not missing", async () => {
    diskWith({});
    process.env.HERMES_BASE_URL = "http://hermes.local";
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ memorySummary: "" }),
    } as unknown as Response);

    const b = await loadNexusContextBundle();

    expect(b.fields.memorySummary).toBe("empty");
  });
});
