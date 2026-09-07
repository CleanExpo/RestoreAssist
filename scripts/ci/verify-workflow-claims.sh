#!/usr/bin/env bash
# Every manifest entry claiming `workflow:<file>` must be named literally in that file.
#
# check-e2e-coverage.mjs already asserts this. This script asserts it a second time, by a
# different route, because a claim certified only by the instrument that produced it is not
# independently checked. If the two ever disagree, one of them is broken and that is worth
# knowing loudly.
#
# Exit 0 = every claim is backed by a literal mention. Exit 1 = at least one is not.

set -uo pipefail

MANIFEST="scripts/ci/e2e-coverage-manifest.txt"
FAILED=0
CHECKED=0

if [ ! -f "$MANIFEST" ]; then
  echo "verify-workflow-claims: $MANIFEST not found — refusing to report success"
  exit 1
fi

while read -r spec disposition; do
  case "$disposition" in
    workflow:*) ;;
    *) continue ;;
  esac

  wf=".github/workflows/${disposition#workflow:}"
  CHECKED=$((CHECKED + 1))

  if [ ! -f "$wf" ]; then
    echo "FAIL  $spec claims $disposition but $wf does not exist"
    FAILED=1
    continue
  fi

  # The workflow names specs by their path under docs/archive/playwright-e2e.
  if ! grep -qF "$spec" "$wf"; then
    echo "FAIL  $spec claims $disposition but that workflow never names it"
    FAILED=1
  fi
done < <(grep -vE '^\s*#|^\s*$' "$MANIFEST")

# A run that checked nothing must not report success. Silence is the failure mode this
# whole manifest exists to remove, so it is not permitted here either.
if [ "$CHECKED" -eq 0 ]; then
  echo "verify-workflow-claims: no workflow: claims found in $MANIFEST — that cannot be right"
  exit 1
fi

if [ "$FAILED" -eq 0 ]; then
  echo "verify-workflow-claims: $CHECKED workflow claim(s), all named in their workflow"
fi
exit "$FAILED"
