/**
 * RA-7721 — the Firecrawl MCP server for build agents lives in the repo's
 * project MCP config. Pin the package version and never commit a literal key.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MCP_PATH = path.resolve(__dirname, "../../.mcp.json");

interface McpServer {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

function loadServers(): Record<string, McpServer> {
  const raw = readFileSync(MCP_PATH, "utf8");
  const parsed = JSON.parse(raw) as { mcpServers?: Record<string, McpServer> };
  return parsed.mcpServers ?? {};
}

describe(".mcp.json firecrawl server", () => {
  it("pins firecrawl-mcp@3.25.5 via npx", () => {
    const fc = loadServers().firecrawl;
    expect(fc).toBeDefined();
    expect(fc.command).toBe("npx");
    expect(fc.args).toEqual(["-y", "firecrawl-mcp@3.25.5"]);
  });

  it("takes FIRECRAWL_API_KEY only by environment expansion", () => {
    const fc = loadServers().firecrawl;
    expect(fc.env).toEqual({ FIRECRAWL_API_KEY: "${FIRECRAWL_API_KEY}" });
  });

  it("contains no literal Firecrawl key anywhere in the file", () => {
    const raw = readFileSync(MCP_PATH, "utf8");
    expect(raw).not.toMatch(/fc-[A-Za-z0-9]{8,}/);
  });

  // .mcp.json is gitignored as "contains API keys" and force-tracked for this
  // server, so every env value of every server must be a ${VAR} expansion.
  it("every server env value is an environment expansion, never a literal", () => {
    const values = Object.values(loadServers()).flatMap((s) =>
      Object.values(s.env ?? {}),
    );
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(v).toMatch(/^\$\{[A-Z][A-Z0-9_]*\}$/);
    }
  });
});
