#!/usr/bin/env bash
#
# android-generate-upload-keystore.sh
#
# One-shot generator for the Play Store upload keystore. Run this ONCE on the
# developer machine that will sign release AABs. The output keystore +
# keystore.properties are gitignored — back both up to 1Password immediately.
#
# Prerequisites:
#   - Java 17+ on PATH (keytool ships with JDK; macOS users: `brew install --cask temurin`)
#
# Re-running this script after a keystore already exists is REFUSED. Losing the
# original upload key forces a new package name on the Play Store; there is no
# recovery. Back it up first.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYSTORE_DIR="$REPO_ROOT/android/app"
KEYSTORE_FILE="$KEYSTORE_DIR/release-upload-key.jks"
PROPS_FILE="$KEYSTORE_DIR/keystore.properties"
KEY_ALIAS="restoreassist-upload"

if ! command -v keytool >/dev/null 2>&1; then
  echo "ERROR: keytool not found on PATH. Install a JDK (e.g. brew install --cask temurin)." >&2
  exit 1
fi

if ! java -version >/dev/null 2>&1; then
  echo "ERROR: java runtime not callable. Install a JDK (e.g. brew install --cask temurin)." >&2
  exit 1
fi

if [[ -f "$KEYSTORE_FILE" ]]; then
  echo "ERROR: $KEYSTORE_FILE already exists. Refusing to overwrite." >&2
  echo "       If you intentionally want a new keystore, move the old one aside first." >&2
  exit 1
fi

# Generate two strong 24-char passwords. Use openssl for portability (macOS default).
STORE_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
KEY_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"

echo "Generating release upload keystore at $KEYSTORE_FILE ..."
keytool -genkey -v \
  -keystore "$KEYSTORE_FILE" \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 25000 \
  -storepass "$STORE_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -dname "CN=Unite Group Pty Ltd, OU=RestoreAssist, O=Unite Group Pty Ltd, L=Brisbane, ST=Queensland, C=AU"

cat > "$PROPS_FILE" <<EOF
storePassword=$STORE_PASSWORD
keyPassword=$KEY_PASSWORD
keyAlias=$KEY_ALIAS
storeFile=release-upload-key.jks
EOF
chmod 600 "$PROPS_FILE" "$KEYSTORE_FILE"

echo ""
echo "================================================================"
echo "  Keystore generated. BACK THESE UP TO 1PASSWORD NOW."
echo "================================================================"
echo "  Keystore:        $KEYSTORE_FILE"
echo "  Properties:      $PROPS_FILE"
echo "  Key alias:       $KEY_ALIAS"
echo "  Store password:  $STORE_PASSWORD"
echo "  Key password:    $KEY_PASSWORD"
echo ""
echo "Verify with:  keytool -list -v -keystore $KEYSTORE_FILE -storepass '$STORE_PASSWORD'"
echo ""
echo "Next: cd android && ./gradlew bundleRelease"
echo "Output AAB: android/app/build/outputs/bundle/release/app-release.aab"
echo "================================================================"
