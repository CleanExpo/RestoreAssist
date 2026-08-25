import assert from "node:assert/strict";
import test from "node:test";

import { verifyReleaseProvenance } from "../verify-release-provenance.mjs";

const MAIN = "a".repeat(40);
const STALE = "b".repeat(40);

test("accepts an exact semver tag only at the current main tip", () => {
  assert.doesNotThrow(() =>
    verifyReleaseProvenance({ ref: "refs/tags/v1.2.3", sha: MAIN, mainSha: MAIN }),
  );
});

test("rejects a stale exact semver tag", () => {
  assert.throws(
    () => verifyReleaseProvenance({ ref: "refs/tags/v1.2.3", sha: STALE, mainSha: MAIN }),
    /must equal the current origin\/main tip/,
  );
});

test("accepts workflow_dispatch only from the current main tip", () => {
  assert.doesNotThrow(() =>
    verifyReleaseProvenance({ ref: "refs/heads/main", sha: MAIN, mainSha: MAIN }),
  );
  assert.throws(
    () => verifyReleaseProvenance({ ref: "refs/heads/main", sha: STALE, mainSha: MAIN }),
    /must equal the current origin\/main tip/,
  );
});

test("rejects workflow_dispatch from another branch even at the same SHA", () => {
  assert.throws(
    () => verifyReleaseProvenance({ ref: "refs/heads/feature", sha: MAIN, mainSha: MAIN }),
    /refs\/heads\/main/,
  );
});

test("rejects loose or prerelease tag shapes", () => {
  for (const ref of ["refs/tags/v1", "refs/tags/v1.2", "refs/tags/v1.2.3-rc.1", "refs/tags/release-1.2.3"]) {
    assert.throws(
      () => verifyReleaseProvenance({ ref, sha: MAIN, mainSha: MAIN }),
      /exact semver tag/,
    );
  }
});
