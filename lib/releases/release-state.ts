/**
 * RA-8607 — one owner for the "What's New" release lifecycle values.
 *
 * The GitHub push webhook writes an AppRelease row before its notes exist,
 * then fills the notes in a background step. Readers (the unseen route) must
 * never show a row whose notes are not ready, so both sides import these
 * markers from here rather than repeating the strings.
 */

/** Notes value while the background job has not finished. Never shown. */
export const RELEASE_NOTES_PENDING = "Release notes generating…";

/** Notes value after the background job failed. Never shown. */
export const RELEASE_NOTES_FAILED = "Release notes unavailable.";

/** Notes values that mean "not ready": the unseen route excludes these. */
export const RELEASE_NOTES_NOT_READY: readonly string[] = [
  RELEASE_NOTES_PENDING,
  RELEASE_NOTES_FAILED,
];

/**
 * Where the in-app release notice sends the user. The dashboard mounts the
 * What's New popup, which opens the newest unseen release on load. The old
 * `/dashboard?release=<id>` link pointed at a query parameter nothing read.
 */
export const RELEASE_NOTICE_LINK = "/dashboard";

/** Users are read in pages of this size for the release notice fan-out. */
export const RELEASE_FANOUT_PAGE_SIZE = 1000;

/**
 * Display label for a release. The base version is a constant
 * (package.json), so it cannot tell two pushes apart; the short commit SHA
 * is added as semver build metadata so every push gets its own label and the
 * `AppRelease.version` unique key never blocks a new release.
 */
export function releaseVersionLabel(
  commits: Array<{ message: string }>,
  commitSha: string,
  baseVersion: string = process.env.npm_package_version || "1.0.0",
): string {
  const messages = commits.map((c) => c.message.toLowerCase());
  const hasMajor = messages.some(
    (m) => m.includes("breaking") || m.includes("!:"),
  );
  const hasMinor = messages.some((m) => m.startsWith("feat"));
  const [major, minor, patch] = baseVersion.split(".").map(Number);

  const core = hasMajor
    ? `${major + 1}.0.0`
    : hasMinor
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;

  return `${core}+${commitSha.slice(0, 7)}`;
}
