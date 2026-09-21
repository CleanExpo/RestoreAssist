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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

export const RESULTS_ROOT =
  process.env.WALKTHROUGH_DIR || "/Volumes/Storage Unit/RestoreAssist/walkthrough-20260919";

const mint = (): string =>
  `run-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}-${randomBytes(3).toString("hex")}`;

export const runDir = (id: string): string => path.join(RESULTS_ROOT, "runs", id);

const CLAIM_FILE = "claim.json";

/**
 * The run id for this process, claiming the directory if this process is the coordinator.
 *
 * A worker proves it belongs to the claiming invocation by holding a secret the claimer
 * generated and wrote INSIDE the run directory. An earlier version accepted a plain
 * `WALKTHROUGH_RUN_CLAIMED=1`, which any process could export: a second invocation
 * exporting that flag and the same id skipped the exclusive mkdir entirely and appended
 * to the first run's evidence. A flag that the thing being checked can set is not a check.
 */
export function claimRunId(): string {
  const id = process.env.WALKTHROUGH_RUN;
  const token = process.env.WALKTHROUGH_RUN_TOKEN;
  if (id && token) {
    let written = "";
    try {
      written = String(JSON.parse(readFileSync(path.join(runDir(id), CLAIM_FILE), "utf8")).token);
    } catch {
      written = "";
    }
    // Only a process holding the claimer's own secret is a worker of that invocation.
    if (written && written === token) return id;
  }
  const chosen = id || mint();
  mkdirSync(path.join(RESULTS_ROOT, "runs"), { recursive: true });
  try {
    mkdirSync(runDir(chosen), { recursive: false });
  } catch (err) {
    throw new Error(
      `walkthrough run "${chosen}" already owns a directory, so this invocation would append to ` +
        `another run's evidence. Unset WALKTHROUGH_RUN to start a new run. (${String(err)})`,
    );
  }
  const fresh = randomBytes(16).toString("hex");
  writeFileSync(
    path.join(runDir(chosen), CLAIM_FILE),
    `${JSON.stringify({ token: fresh, pid: process.pid, claimedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  process.env.WALKTHROUGH_RUN = chosen;
  process.env.WALKTHROUGH_RUN_TOKEN = fresh;
  return chosen;
}
