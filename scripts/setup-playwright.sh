#!/usr/bin/env bash
# setup-playwright.sh — ensure the Playwright Chromium build the repo's
# @playwright/test version needs is present in $PLAYWRIGHT_BROWSERS_PATH.
#
# Why this exists: the managed cloud/remote sessions ship an older Chromium
# revision than @playwright/test@1.60 requires (1223), and the standard
# `npx playwright install` download is cut mid-stream by the egress proxy on
# large single transfers. Google Cloud Storage (the real CDN origin behind
# cdn.playwright.dev) supports HTTP range requests, so a resumable
# `curl -L -C -` survives the cut where the bundled downloader does not.
#
# Idempotent: exits early if the required Chromium is already runnable.
# Run from repo root:  bash scripts/setup-playwright.sh
set -euo pipefail

CA="${NODE_EXTRA_CA_CERTS:-/root/.ccr/ca-bundle.crt}"
BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"

# Resolve the Chromium revision @playwright/test pins.
REV="$(node -e "const f=require('child_process').execSync('find node_modules/.pnpm node_modules -name browsers.json -path \"*playwright-core*\"',{encoding:'utf8'}).split('\n').filter(Boolean)[0]; const b=require(require('path').resolve(f)); console.log(b.browsers.find(x=>x.name==='chromium').revision)")"
EXE="$BROWSERS_PATH/chromium-$REV/chrome-linux64/chrome"

if [ -x "$EXE" ] && "$EXE" --version >/dev/null 2>&1; then
  echo "playwright: chromium $REV already present at $EXE"
  exit 0
fi

# Chrome-for-Testing version string for this Playwright revision.
CFT_VERSION="$(node -e "console.log(require('@playwright/test/package.json').version)" >/dev/null 2>&1 && echo)"
# The CfT build number is embedded in Playwright; the download URL pattern is
# stable. Discover the redirect target from the Playwright CDN, then resume.
CDN="https://cdn.playwright.dev/builds/cft"
# Resolve the concrete CfT build the bundled installer would use by reading the
# 307 from the CDN index for this revision.
ZIP_URL="$(curl -sSI -L --cacert "$CA" "$CDN/$REV/linux64/chrome-linux64.zip" 2>/dev/null | awk 'tolower($1)=="location:"{print $2}' | tr -d '\r' | tail -1)"
[ -z "$ZIP_URL" ] && ZIP_URL="$CDN/$REV/linux64/chrome-linux64.zip"

TMP="$(mktemp -d)"
echo "playwright: downloading chromium $REV (resumable) ..."
for i in 1 2 3 4 5 6 7 8; do
  curl -sS -L --cacert "$CA" -C - -o "$TMP/chrome.zip" --max-time 90 "$ZIP_URL" >/dev/null 2>&1 || true
  if unzip -t "$TMP/chrome.zip" >/dev/null 2>&1; then echo "download complete"; break; fi
  echo "  ...chunk $i, $(($(stat -c%s "$TMP/chrome.zip" 2>/dev/null || echo 0)/1024/1024)) MiB"
done
unzip -t "$TMP/chrome.zip" >/dev/null 2>&1 || { echo "ERROR: could not complete chromium download"; exit 1; }

mkdir -p "$BROWSERS_PATH/chromium-$REV"
unzip -q -o "$TMP/chrome.zip" -d "$BROWSERS_PATH/chromium-$REV"
chmod +x "$EXE"
touch "$BROWSERS_PATH/chromium-$REV/INSTALLATION_COMPLETE"
rm -rf "$TMP"

"$EXE" --version && echo "playwright: chromium $REV installed at $EXE"
