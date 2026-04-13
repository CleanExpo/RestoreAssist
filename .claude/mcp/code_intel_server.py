"""Code Intelligence MCP Server — RestoreAssist edition.

TypeScript-first LSP-like analysis for the RestoreAssist codebase.
Adds Prisma schema awareness on top of standard TS/JS symbol search.

Supported: TypeScript, JavaScript, Prisma schema files
Not supported: Python (not used in this project)

Usage (stdio MCP):
    python code_intel_server.py

Tools exposed:
    code_intel_analyse_file       — diagnostics for a TS/Prisma file
    code_intel_search_symbols     — find classes/functions/models across codebase
    code_intel_find_patterns      — regex search with context lines
    code_intel_get_file_structure — imports, classes, functions, constants overview
    code_intel_search_prisma      — find Prisma models, enums, fields by name
"""

from __future__ import annotations

import json
import re
import sys
import asyncio
from enum import Enum
from pathlib import Path
from typing import Any

# ─── Config ───────────────────────────────────────────────────────────────────

def _find_project_root() -> Path:
    """Find the real project root by looking for prisma/schema.prisma or CLAUDE.md.
    Checks env var first, then walks up from the script location, then checks known worktree paths.
    """
    import os
    # Explicit override via env var
    env_root = os.environ.get("PROJECT_ROOT")
    if env_root:
        p = Path(env_root)
        if p.exists():
            return p.resolve()

    # Walk up from script location looking for prisma/schema.prisma
    script_dir = Path(__file__).resolve()
    for candidate in [script_dir, *script_dir.parents]:
        if (candidate / "prisma" / "schema.prisma").exists():
            return candidate
        if (candidate / "CLAUDE.md").exists() and (candidate / "prisma").exists():
            return candidate

    # Fallback: check known worktree locations under .claude/worktrees/
    base = Path(__file__).resolve().parents[2]  # D:\RestoreAssist
    worktrees = base / ".claude" / "worktrees"
    if worktrees.exists():
        for wt in sorted(worktrees.iterdir()):
            if (wt / "prisma" / "schema.prisma").exists():
                return wt

    return base

PROJECT_ROOT = _find_project_root()

_LANG_MAP: dict[str, str] = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".prisma": "prisma",
    ".mjs": "javascript",
}

_EXCLUDED_DIRS = {
    "node_modules", ".git", "__pycache__", ".next", ".turbo",
    "dist", "build", ".mypy_cache", "venv", ".venv",
    "android", "ios", ".capacitor",
}

# ─── Models (plain dicts for JSON serialisation) ──────────────────────────────

def diagnostic(file_path: str, line: int, col: int, severity: str, message: str, code: str | None = None) -> dict:
    return {"file_path": file_path, "line": line, "column": col,
            "severity": severity, "message": message, "code": code, "source": "code-intel"}

def symbol(name: str, kind: str, file_path: str, line: int,
           signature: str | None = None, is_exported: bool = False, is_async: bool = False) -> dict:
    return {"name": name, "kind": kind, "file_path": file_path, "line": line,
            "signature": signature, "is_exported": is_exported, "is_async": is_async}

def pattern_match(file_path: str, line: int, col: int, matched: str, context: list[str]) -> dict:
    return {"file_path": file_path, "line": line, "column": col,
            "matched_text": matched, "context_lines": context}

def prisma_model(name: str, kind: str, file_path: str, line: int, fields: list[dict] | None = None) -> dict:
    return {"name": name, "kind": kind, "file_path": file_path, "line": line,
            "fields": fields or []}

# ─── TypeScript analyser ──────────────────────────────────────────────────────

def _analyse_ts(source: str, file_path: str) -> tuple[list[dict], dict]:
    diagnostics: list[dict] = []
    lines = source.splitlines()

    structure: dict[str, Any] = {
        "file_path": file_path,
        "language": "typescript",
        "line_count": len(lines),
        "imports": [],
        "classes": [],
        "functions": [],
        "constants": [],
        "has_tests": False,
    }

    # Imports
    for m in re.finditer(r'^import\s+.+\s+from\s+[\'"](.+)[\'"]', source, re.MULTILINE):
        structure["imports"].append(m.group(1))

    # Classes
    for m in re.finditer(r'^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)', source, re.MULTILINE):
        ln = source[:m.start()].count("\n") + 1
        exported = "export" in m.group(0)
        structure["classes"].append(symbol(m.group(1), "class", file_path, ln, is_exported=exported))

    # Named functions
    for m in re.finditer(r'^(?:(export)\s+)?(?:(async)\s+)?function\s+(\w+)\s*\(([^)]*)\)', source, re.MULTILINE):
        ln = source[:m.start()].count("\n") + 1
        sig = f"{'async ' if m.group(2) else ''}function {m.group(3)}({m.group(4)})"
        structure["functions"].append(symbol(
            m.group(3), "function", file_path, ln,
            signature=sig, is_exported=bool(m.group(1)), is_async=bool(m.group(2))
        ))

    # Arrow / const functions
    for m in re.finditer(r'^(?:(export)\s+)?(?:const|let)\s+(\w+)\s*=\s*(async\s+)?\(', source, re.MULTILINE):
        ln = source[:m.start()].count("\n") + 1
        structure["functions"].append(symbol(
            m.group(2), "function", file_path, ln,
            is_exported=bool(m.group(1)), is_async=bool(m.group(3))
        ))

    # UPPER_CASE constants
    for m in re.finditer(r'^(?:export\s+)?const\s+([A-Z][A-Z0-9_]{2,})\s*=', source, re.MULTILINE):
        ln = source[:m.start()].count("\n") + 1
        structure["constants"].append(symbol(m.group(1), "constant", file_path, ln))

    # Missing getServerSession on API routes
    if "/api/" in file_path and "route.ts" in file_path:
        exempt = any(x in file_path for x in ["/auth/", "/cron/", "/webhooks/"])
        if not exempt and "getServerSession" not in source:
            diagnostics.append(diagnostic(
                file_path, 1, 0, "error",
                "API route is missing getServerSession auth check (CLAUDE.md Rule 1)",
                "missing-auth"
            ))

    # findMany without take/pagination
    for m in re.finditer(r'\.findMany\s*\(\s*\{(?![^}]*\btake\b)(?![^}]*\bskip\b)', source):
        ln = source[:m.start()].count("\n") + 1
        diagnostics.append(diagnostic(
            file_path, ln, 0, "warning",
            "findMany without 'take' limit — potential N+1 or unbounded query (CLAUDE.md Rule 2)",
            "unbounded-findmany"
        ))

    # Test detection
    structure["has_tests"] = (
        ".test." in file_path or ".spec." in file_path or
        any("describe(" in ln or " it(" in ln or "test(" in ln for ln in lines)
    )

    return diagnostics, structure

# ─── Prisma schema analyser ───────────────────────────────────────────────────

def _analyse_prisma(source: str, file_path: str) -> tuple[list[dict], list[dict]]:
    """Parse schema.prisma — returns (diagnostics, models_and_enums)."""
    diagnostics: list[dict] = []
    symbols: list[dict] = []

    # Models
    for m in re.finditer(r'^model\s+(\w+)\s*\{', source, re.MULTILINE):
        ln = source[:m.start()].count("\n") + 1
        model_name = m.group(1)
        # Extract fields until closing brace
        block_start = m.end()
        depth = 1
        pos = block_start
        while pos < len(source) and depth > 0:
            if source[pos] == "{":
                depth += 1
            elif source[pos] == "}":
                depth -= 1
            pos += 1
        block = source[block_start:pos - 1]

        fields = []
        for field_m in re.finditer(r'^\s+(\w+)\s+(\w+\??(?:\[\])?)', block, re.MULTILINE):
            field_name = field_m.group(1)
            if field_name.startswith("@@") or field_name.startswith("//"):
                continue
            fields.append({"name": field_name, "type": field_m.group(2)})

        # Check: model missing @id
        if not re.search(r'@id', block):
            diagnostics.append(diagnostic(file_path, ln, 0, "warning",
                f"Prisma model '{model_name}' has no @id field", "prisma-no-id"))

        symbols.append(prisma_model(model_name, "prisma_model", file_path, ln, fields))

    # Enums
    for m in re.finditer(r'^enum\s+(\w+)\s*\{', source, re.MULTILINE):
        ln = source[:m.start()].count("\n") + 1
        symbols.append(prisma_model(m.group(1), "prisma_enum", file_path, ln))

    return diagnostics, symbols

# ─── Server ───────────────────────────────────────────────────────────────────

class CodeIntelServer:
    def __init__(self, root: Path = PROJECT_ROOT):
        self.root = root

    def _iter_files(self, language: str | None = None):
        import os as _os
        exts = set(_LANG_MAP.keys())
        if language:
            exts = {e for e, l in _LANG_MAP.items() if l == language}

        for dirpath, dirnames, filenames in _os.walk(
            str(self.root), onerror=lambda _e: None, followlinks=False
        ):
            # Prune excluded dirs in-place so os.walk won't descend into them
            dirnames[:] = [d for d in dirnames if d not in _EXCLUDED_DIRS]

            for filename in filenames:
                suffix = Path(filename).suffix
                if suffix not in exts:
                    continue
                if language and _LANG_MAP.get(suffix) != language:
                    continue
                filepath = Path(dirpath) / filename
                try:
                    rel = str(filepath.relative_to(self.root))
                    yield rel, filepath.read_text(encoding="utf-8", errors="replace"), _LANG_MAP[suffix]
                except (OSError, PermissionError, ValueError):
                    continue

    async def analyse_file(self, file_path: str) -> list[dict]:
        abs_path = self.root / file_path
        if not abs_path.exists():
            return [diagnostic(file_path, 1, 0, "error", f"File not found: {file_path}", "not-found")]
        source = abs_path.read_text(encoding="utf-8", errors="replace")
        lang = _LANG_MAP.get(abs_path.suffix.lower(), "unknown")
        if lang in ("typescript", "javascript"):
            diags, _ = _analyse_ts(source, file_path)
        elif lang == "prisma":
            diags, _ = _analyse_prisma(source, file_path)
        else:
            diags = []
        return sorted(diags, key=lambda d: d["line"])

    async def search_symbols(self, query: str, kind: str | None = None,
                              language: str | None = None, max_results: int = 50) -> list[dict]:
        results: list[dict] = []
        q = query.lower()
        for rel, source, lang in self._iter_files(language):
            if lang in ("typescript", "javascript"):
                _, struct = _analyse_ts(source, rel)
                candidates = struct["classes"] + struct["functions"] + struct["constants"]
            elif lang == "prisma":
                _, candidates = _analyse_prisma(source, rel)
            else:
                continue
            for s in candidates:
                if q in s["name"].lower():
                    if kind is None or s.get("kind") == kind:
                        results.append(s)
                        if len(results) >= max_results:
                            return results
        return results

    async def find_patterns(self, pattern: str, language: str | None = None,
                             context_lines: int = 2, max_results: int = 100) -> list[dict]:
        compiled = re.compile(pattern, re.MULTILINE)
        matches: list[dict] = []
        for rel, source, _ in self._iter_files(language):
            lines = source.splitlines()
            for m in compiled.finditer(source):
                ln = source[:m.start()].count("\n") + 1
                col = m.start() - source.rfind("\n", 0, m.start()) - 1
                start = max(0, ln - 1 - context_lines)
                end = min(len(lines), ln + context_lines)
                matches.append(pattern_match(rel, ln, col, m.group(0), lines[start:end]))
                if len(matches) >= max_results:
                    return matches
        return matches

    async def get_file_structure(self, file_path: str) -> dict:
        abs_path = self.root / file_path
        if not abs_path.exists():
            return {"file_path": file_path, "language": "unknown", "error": "File not found"}
        source = abs_path.read_text(encoding="utf-8", errors="replace")
        lang = _LANG_MAP.get(abs_path.suffix.lower(), "unknown")
        if lang in ("typescript", "javascript"):
            _, struct = _analyse_ts(source, file_path)
            return struct
        elif lang == "prisma":
            _, syms = _analyse_prisma(source, file_path)
            return {"file_path": file_path, "language": "prisma",
                    "line_count": source.count("\n") + 1, "symbols": syms}
        return {"file_path": file_path, "language": lang, "line_count": source.count("\n") + 1}

    async def search_prisma(self, query: str, kind: str | None = None) -> list[dict]:
        """Search Prisma models and enums by name. kind: 'prisma_model' | 'prisma_enum'"""
        results: list[dict] = []
        q = query.lower()
        for rel, source, lang in self._iter_files("prisma"):
            _, syms = _analyse_prisma(source, rel)
            for s in syms:
                if q in s["name"].lower():
                    if kind is None or s["kind"] == kind:
                        results.append(s)
        return results

# ─── MCP stdio transport ──────────────────────────────────────────────────────

TOOLS = [
    {"name": "code_intel_analyse_file",
     "description": "Analyse a TS/Prisma file and return diagnostics including missing auth checks and N+1 risks.",
     "inputSchema": {"type": "object", "properties": {"file_path": {"type": "string"}}, "required": ["file_path"]}},
    {"name": "code_intel_search_symbols",
     "description": "Search for classes, functions, constants, or Prisma models across the entire RestoreAssist codebase.",
     "inputSchema": {"type": "object", "properties": {
         "query": {"type": "string"},
         "kind": {"type": "string", "enum": ["class","function","constant","prisma_model","prisma_enum"]},
         "language": {"type": "string", "enum": ["typescript","javascript","prisma"]},
         "max_results": {"type": "integer", "default": 50}
     }, "required": ["query"]}},
    {"name": "code_intel_find_patterns",
     "description": "Regex search across source files with surrounding context lines.",
     "inputSchema": {"type": "object", "properties": {
         "pattern": {"type": "string"},
         "language": {"type": "string"},
         "context_lines": {"type": "integer", "default": 2},
         "max_results": {"type": "integer", "default": 100}
     }, "required": ["pattern"]}},
    {"name": "code_intel_get_file_structure",
     "description": "Get imports, classes, functions, constants overview of a file without reading it all.",
     "inputSchema": {"type": "object", "properties": {"file_path": {"type": "string"}}, "required": ["file_path"]}},
    {"name": "code_intel_search_prisma",
     "description": "Find Prisma models and enums by name. Returns model fields. Essential for 120+ model schema navigation.",
     "inputSchema": {"type": "object", "properties": {
         "query": {"type": "string"},
         "kind": {"type": "string", "enum": ["prisma_model","prisma_enum"]}
     }, "required": ["query"]}},
]

server = CodeIntelServer()

async def handle_request(req: dict) -> dict:
    method = req.get("method", "")
    req_id = req.get("id")

    if method == "initialize":
        return {"jsonrpc": "2.0", "id": req_id, "result": {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "code-intelligence", "version": "1.0.0"}
        }}

    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS}}

    if method == "tools/call":
        name = req["params"]["name"]
        args = req["params"].get("arguments", {})
        try:
            if name == "code_intel_analyse_file":
                result = await server.analyse_file(args["file_path"])
            elif name == "code_intel_search_symbols":
                result = await server.search_symbols(
                    args["query"], kind=args.get("kind"),
                    language=args.get("language"), max_results=args.get("max_results", 50))
            elif name == "code_intel_find_patterns":
                result = await server.find_patterns(
                    args["pattern"], language=args.get("language"),
                    context_lines=args.get("context_lines", 2), max_results=args.get("max_results", 100))
            elif name == "code_intel_get_file_structure":
                result = await server.get_file_structure(args["file_path"])
            elif name == "code_intel_search_prisma":
                result = await server.search_prisma(args["query"], kind=args.get("kind"))
            else:
                raise ValueError(f"Unknown tool: {name}")
            return {"jsonrpc": "2.0", "id": req_id, "result": {
                "content": [{"type": "text", "text": json.dumps(result, indent=2)}]
            }}
        except Exception as e:
            return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32603, "message": str(e)}}

    if method == "notifications/initialized":
        return None  # type: ignore

    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Method not found: {method}"}}

async def main():
    while True:
        line = await asyncio.get_event_loop().run_in_executor(None, sys.stdin.readline)
        if not line:
            break
        try:
            req = json.loads(line.strip())
            resp = await handle_request(req)
            if resp is not None:
                print(json.dumps(resp), flush=True)
        except json.JSONDecodeError:
            pass

if __name__ == "__main__":
    asyncio.run(main())
