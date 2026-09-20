/**
 * One invocation, one run directory, claimed exclusively.
 *
 * Shared by walkthrough.config.ts (the coordinator) and recorder.ts (the workers). It
 * deliberately imports nothing beyond node builtins, so loading the Playwright config
 * does not pull in the database client.
 *
 * Two earlier designs leaked evidence between runs:
 *   - an O_EXCL `run.json` per RESULTS DIRECTORY. The second invocation read the first
 *     one's id and appended to its results file, so an interrupted rerun presented an
 *     earlier complete run's coverage as its own.
 *   - minting per invocation but honouring any inherited WALKTHROUGH_RUN. Exporting that
 *     variable in the shell merged two invocations again.
 *
 * So the identity is not what closes this; the exclusive directory claim is. mkdir
 * without `recursive` fails when the directory exists, so a run can never append to
 * another run's evidence however its id was chosen.
 */
import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

export const RESULTS_ROOT =
  process.env.WALKTHROUGH_DIR || "/Volumes/Storage Unit/RestoreAssist/walkthrough-20260919";

const mint = (): string =>
  `run-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}-${randomBytes(3).toString("hex")}`;

/** The run id for this process, claiming the directory if this process is the coordinator. */
export function claimRunId(): string {
  // A worker of the invocation that already claimed the directory inherits both variables.
  if (process.env.WALKTHROUGH_RUN_CLAIMED === "1" && process.env.WALKTHROUGH_RUN) {
    return process.env.WALKTHROUGH_RUN;
  }
  const id = process.env.WALKTHROUGH_RUN || mint();
  mkdirSync(path.join(RESULTS_ROOT, "runs"), { recursive: true });
  try {
    mkdirSync(path.join(RESULTS_ROOT, "runs", id), { recursive: false });
  } catch (err) {
    throw new Error(
      `walkthrough run "${id}" already owns a directory, so this invocation would append to ` +
        `another run's evidence. Unset WALKTHROUGH_RUN to start a new run. (${String(err)})`,
    );
  }
  process.env.WALKTHROUGH_RUN = id;
  process.env.WALKTHROUGH_RUN_CLAIMED = "1";
  return id;
}

export const runDir = (id: string): string => path.join(RESULTS_ROOT, "runs", id);
