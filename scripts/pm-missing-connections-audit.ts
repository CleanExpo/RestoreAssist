import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join, relative } from "path";

type Finding = {
  severity: "P0" | "P1" | "P2";
  source: string;
  target: string;
  reason: string;
};

const root = process.cwd();
const appDir = join(root, "app");
const reportDir = join(root, "docs/production-grade-implementation");
const reportPath = join(
  reportDir,
  "PM_MISSING_CONNECTIONS_AUDIT_2026-05-28.md",
);
const iterations = Number(
  process.argv.find((arg) => arg.startsWith("--iterations="))?.split("=")[1] ??
    "1",
);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === ".git"
      ) {
        return [];
      }
      return walk(fullPath);
    }
    return [fullPath];
  });
}

function isProductSource(filePath: string): boolean {
  const rel = relative(root, filePath);
  return (
    !rel.startsWith("vendor/") &&
    !rel.startsWith("mobile/") &&
    !rel.includes("/__tests__/") &&
    !rel.includes(".test.") &&
    !rel.includes(".spec.")
  );
}

function pageRouteFromFile(filePath: string): string | null {
  const rel = relative(appDir, filePath);
  if (!/(^|\/)page\.(tsx|ts|jsx|js)$/.test(rel)) return null;
  const route = rel
    .replace(/\/page\.(tsx|ts|jsx|js)$/, "")
    .replace(/^page\.(tsx|ts|jsx|js)$/, "")
    .replace(/\/\(.*?\)/g, "");
  return route === "" ? "/" : `/${route}`;
}

function routePattern(route: string): RegExp {
  const escaped = route
    .split("/")
    .map((part) => {
      if (part === "") return "";
      if (/^\[\.\.\..+\]$/.test(part)) return ".+";
      if (/^\[\[?\.\.\..+\]?\]$/.test(part)) return ".*";
      if (/^\[.+\]$/.test(part)) return "[^/]+";
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${escaped}$`);
}

function isInternalLiteralTarget(target: string): boolean {
  return (
    target.startsWith("/") &&
    !target.startsWith("//") &&
    !target.startsWith("/api/") &&
    !target.includes("${") &&
    !target.includes("[")
  );
}

function normalizeTarget(target: string): string {
  const [withoutHash] = target.split("#");
  const [withoutQuery] = withoutHash.split("?");
  return withoutQuery.length > 1 && withoutQuery.endsWith("/")
    ? withoutQuery.slice(0, -1)
    : withoutQuery;
}

function extractTargets(filePath: string): string[] {
  const text = readFileSync(filePath, "utf8");
  const targets = new Set<string>();
  const patterns = [
    /\bhref\s*=\s*["']([^"']+)["']/g,
    /\bhref\s*:\s*["']([^"']+)["']/g,
    /\bto\s*=\s*["']([^"']+)["']/g,
    /\brouter\.(?:push|replace)\(\s*["']([^"']+)["']/g,
    /\bwindow\.location\.href\s*=\s*["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const target = match[1];
      if (isInternalLiteralTarget(target)) {
        targets.add(normalizeTarget(target));
      }
    }
  }

  return [...targets].filter(Boolean);
}

const files = walk(root).filter(
  (file) => /\.(tsx|ts|jsx|js|mdx)$/.test(file) && isProductSource(file),
);
const routeFiles = walk(appDir).filter((file) =>
  /\/page\.(tsx|ts|jsx|js)$/.test(file),
);
const routes = routeFiles.map(pageRouteFromFile).filter(Boolean) as string[];
const routeSet = new Set(routes);
const routePatterns = routes.map((route) => ({
  route,
  pattern: routePattern(route),
}));
const extractedTargets = files.map((file) => ({
  rel: relative(root, file),
  targets: extractTargets(file),
}));

function routeExists(target: string): boolean {
  if (target.match(/\.(ico|png|jpg|jpeg|svg|webp|gif|txt|xml|json)$/)) {
    return existsSync(join(root, "public", target));
  }
  if (routeSet.has(target)) return true;
  return routePatterns.some(({ pattern }) => pattern.test(target));
}

const findings = new Map<string, Finding>();
let validationCount = 0;

for (let iteration = 0; iteration < Math.max(1, iterations); iteration += 1) {
  for (const { rel, targets } of extractedTargets) {
    for (const target of targets) {
      validationCount += 1;
      if (!routeExists(target)) {
        const severity = target.startsWith("/dashboard") ? "P1" : "P2";
        const key = `${rel}::${target}`;
        findings.set(key, {
          severity,
          source: rel,
          target,
          reason:
            "Internal literal link does not match a discovered App Router page.",
        });
      }
    }
  }
}

const sortedFindings = [...findings.values()].sort((a, b) => {
  const rank = { P0: 0, P1: 1, P2: 2 };
  return (
    rank[a.severity] - rank[b.severity] || a.source.localeCompare(b.source)
  );
});

const bySeverity = sortedFindings.reduce<Record<string, number>>(
  (acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] ?? 0) + 1;
    return acc;
  },
  {},
);

const generatedAt = new Date().toISOString();
const markdown = `# PM Missing Connections Audit - 2026-05-28

Generated: ${generatedAt}
Iterations requested: ${iterations}
Literal link validations executed: ${validationCount}
Discovered page routes: ${routes.length}
Unique missing internal connections: ${sortedFindings.length}

## Summary

- P0: ${bySeverity.P0 ?? 0}
- P1: ${bySeverity.P1 ?? 0}
- P2: ${bySeverity.P2 ?? 0}

## Notes

This is a static senior-PM connection audit. It checks literal internal links in code and content against discovered App Router page routes. It intentionally skips API routes, external links, hash-only behaviour, and template/dynamic hrefs that need authenticated runtime data.

## Findings

${sortedFindings
  .map(
    (finding) =>
      `### ${finding.severity} - ${finding.target}

- Source: \`${finding.source}\`
- Reason: ${finding.reason}
`,
  )
  .join("\n")}
`;

if (!existsSync(reportDir)) {
  mkdirSync(reportDir, { recursive: true });
}

writeFileSync(reportPath, markdown);

console.log(
  JSON.stringify(
    {
      reportPath,
      iterations,
      validationCount,
      routes: routes.length,
      findings: sortedFindings.length,
      bySeverity,
    },
    null,
    2,
  ),
);
