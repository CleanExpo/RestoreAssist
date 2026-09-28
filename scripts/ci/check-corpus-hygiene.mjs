#!/usr/bin/env node
/**
 * CLI entry for the corpus-hygiene gate. Always runs `main()`.
 *
 * There is no `import.meta.url` / `argv` guard. Node resolves a symlink in
 * `import.meta.url` and leaves `argv[1]` as the link path, so a guard exits 0
 * without scanning. A lowercase drive letter misses the same way.
 *
 *   node scripts/ci/check-corpus-hygiene.mjs --dir <staging-dir> [--strict]
 *
 * Detector: `scripts/ci/lib/corpus-hygiene.mjs`.
 * See .claude/skills/rag-corpus-hygiene/SKILL.md.
 */
import { main } from "./lib/corpus-hygiene.mjs";

process.exitCode = main();
