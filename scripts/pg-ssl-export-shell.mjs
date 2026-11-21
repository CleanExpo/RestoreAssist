#!/usr/bin/env node
// CLI entry for printExportShell(). It always runs: there is deliberately no
// is-this-the-main-module check (RA-7785). The logic lives in
// ./lib/pg-ssl-for-migrate.mjs, which is a library with no side effects.
import { printExportShell } from "./lib/pg-ssl-for-migrate.mjs";

printExportShell();
