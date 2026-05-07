#!/usr/bin/env bash
# ios-static-check.sh
#
# Fast deterministic prefilter for iOS App Review compliance. Runs BEFORE the
# LLM verifier. If this script finds a hard violation it emits a block decision
# directly — no need to spend tokens calling DeepSeek for the obvious stuff.
#
# Receives EDITED_PATHS as newline-separated absolute paths on stdin (one per
# line). Every path that exists is opened and grepped against a curated set of
# rules grounded in actual rejection history (Guideline 3.1.1).
#
# Output (stdout): a JSON report in the same shape as parse-report.sh expects.
#   - if any hard violation found       → status: "failed"
#   - if only soft warnings found       → status: "partial"
#   - if nothing flagged                → status: "static-clean" (signals "go on to LLM")
# Exit 0 always. The hook does the decision-making.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.."
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"

PATHS=()
while IFS= read -r p; do
  [[ -z "$p" ]] && continue
  [[ ! -f "$p" ]] && continue
  PATHS+=("$p")
done

if (( ${#PATHS[@]} == 0 )); then
  jq -n '{status:"static-clean", reason:"no editable files"}'
  exit 0
fi

failed=()
unverified=()
warned=()

# ---------- Helpers ----------

# True if path is exempt from iOS rules (admin / marketing / tests / scripts).
is_exempt() {
  local p="$1"
  case "$p" in
    */node_modules/*|*/.next/*|*/dist/*|*/build/*) return 0 ;;
    *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx) return 0 ;;
    */__tests__/*|*/__fixtures__/*|*/test/*|*/tests/*) return 0 ;;
    */scripts/*|*/cron/*|*/integration/*) return 0 ;;
    */app/admin/*|*/app/\(admin\)/*|app/admin/*|app/\(admin\)/*) return 0 ;;
    */app/dashboard/admin/*|app/dashboard/admin/*) return 0 ;;
    */app/api/admin/*|app/api/admin/*) return 0 ;;
    */app/\(marketing\)/*) return 0 ;;
    *) return 1 ;;
  esac
}

# True if path looks like a billing/pricing/upgrade surface by location.
looks_like_billing_surface() {
  local p="$1"
  case "$p" in
    */pricing/*|*/billing/*|*/subscribe/*|*/subscription/*|*/upgrade/*|*/checkout/*|*/plans/*) return 0 ;;
    *) return 1 ;;
  esac
}

# True if path is an API route that initiates payment.
looks_like_billing_api() {
  local p="$1"
  case "$p" in
    */app/api/*checkout*/route.ts*) return 0 ;;
    */app/api/*billing*/route.ts*) return 0 ;;
    */app/api/*subscription*/route.ts*) return 0 ;;
    */app/api/*stripe*/route.ts*) return 0 ;;
    */app/api/*payment*/route.ts*) return 0 ;;
    *) return 1 ;;
  esac
}

# True if file's import + JSX shows it has a BillingGate wrapper somewhere.
has_billing_gate_wrapper() {
  local p="$1"
  # Either imports BillingGate or references it as a JSX tag in this file.
  grep -qE 'from ["'"'"']@/components/capacitor/BillingGate' "$p" 2>/dev/null && \
    grep -qE '<BillingGate' "$p" 2>/dev/null
}

# True if file calls rejectIfIOSCapacitor early.
has_server_ios_guard() {
  local p="$1"
  grep -qE 'rejectIfIOSCapacitor\s*\(' "$p" 2>/dev/null
}

# Quote a matching line for evidence (first match only, trimmed).
first_match() {
  local pattern="$1" path="$2"
  grep -nE "$pattern" "$path" 2>/dev/null | head -n1 | sed 's/[[:space:]]\+/ /g' | cut -c 1-200
}

# Add a failure record.
add_fail() {
  local rule="$1" claim="$2" evidence="$3" why="$4" path="$5"
  failed+=("$(jq -nc \
    --arg rule "$rule" \
    --arg claim "$claim" \
    --arg evidence "$evidence" \
    --arg why "$why" \
    --arg path "$path" \
    '{rule:$rule, claim:$claim, evidence:$evidence, why:$why, path:$path}')")
}

add_warn() {
  local claim="$1" path="$2"
  warned+=("$(jq -nc --arg claim "$claim" --arg path "$path" '{claim:$claim, path:$path}')")
}

# ---------- Rule checks per file ----------

for p in "${PATHS[@]}"; do
  if is_exempt "$p"; then
    continue
  fi

  ext="${p##*.}"
  case "$ext" in tsx|ts|jsx|js|plist) ;; *) continue ;; esac

  # ===== RULE 4: Info.plist hollow permissions =====
  if [[ "$p" == *Info.plist ]]; then
    # Only inspect NS*UsageDescription keys — those are the user-facing strings
    # App Review evaluates. Bundle identifiers, device caps, and other <string>
    # values must NOT be flagged.
    # awk extracts: when we see <key>NS...UsageDescription</key>, capture the
    # very next <string>...</string> value.
    while IFS=$'\t' read -r key desc; do
      [[ -z "$key" || -z "$desc" ]] && continue
      if (( ${#desc} < 60 )); then
        add_fail "4" \
          "Info.plist $key too short" \
          "$desc" \
          "Description is ${#desc} chars; App Review rejects descriptions under 60 chars as 'hollow'. Mention RestoreAssist by name and the specific field-tool use case." \
          "$p"
      fi
      if echo "$desc" | grep -qiE '^(app needs|required for|we need|allows the app|used by the app)' ; then
        add_fail "4" \
          "Info.plist $key uses auto-rejected phrasing" \
          "$desc" \
          "Phrasing is auto-rejected. Replace with concrete RestoreAssist use case." \
          "$p"
      fi
    done < <(awk '
      /<key>NS[A-Za-z]*UsageDescription<\/key>/ {
        match($0, /<key>([^<]+)<\/key>/, k); current_key = k[1]; next
      }
      current_key && /<string>/ {
        match($0, /<string>(.*)<\/string>/, s)
        if (s[1] != "") { printf "%s\t%s\n", current_key, s[1]; current_key = "" }
      }
    ' "$p" 2>/dev/null)
    continue
  fi

  # ===== RULE 1: BillingGate wrapping on iOS-reachable billing surfaces =====
  if looks_like_billing_surface "$p"; then
    # page.tsx files in billing surfaces must wrap in BillingGate.
    if [[ "$p" == *page.tsx ]] && ! has_billing_gate_wrapper "$p"; then
      ev=$(first_match 'export default|export async function' "$p")
      add_fail "1" \
        "Billing-surface page is not wrapped in <BillingGate>" \
        "$ev" \
        "Path matches a known iOS-reachable billing surface but no <BillingGate> import + JSX usage was found. App Review will see Stripe/upgrade UI on iOS and reject under Guideline 3.1.1." \
        "$p"
    fi
  fi

  # ===== RULE 1 cont.: ungated billing CTAs anywhere in the tree =====
  # Forbidden CTA strings reachable from iOS shell. Only flag if file itself
  # is a non-exempt component AND has no BillingGate wrapper. Match the CTA
  # tokens as standalone words — they appear both as JSX text content
  # (>Upgrade Now<) and as string literals ("Upgrade Now").
  if ! has_billing_gate_wrapper "$p"; then
    cta_match=$(grep -nE '\b(Upgrade Now|Buy Pro|View Plans|Get Pro|Start free trial|Start trial|Choose plan|Buy now|Subscribe now|Upgrade to Pro|Upgrade Plan)\b' "$p" 2>/dev/null \
      | grep -vE '^\s*\*|^\s*//|^\s*#' \
      | head -n1)
    if [[ -n "$cta_match" ]]; then
      add_fail "1" \
        "Billing CTA text is not gated by <BillingGate>" \
        "$(echo "$cta_match" | cut -c 1-200)" \
        "This CTA renders to the iOS WebView with no BillingGate wrapper. Wrap the component (or its parent) in <BillingGate>." \
        "$p"
    fi

    # router.push to ANY path containing a billing surface segment.
    # Must catch both /pricing AND /dashboard/pricing — but NOT
    # /pricing-config (that's the user's internal labor-rate config, not
    # subscription pricing). The trailing pattern enforces the segment ends
    # at quote / slash / query / hash.
    #
    # Also exclude lines whose preceding 3 lines contain `isCapacitorIOS()`
    # — those pushes are guarded against iOS at runtime.
    push_match=$(grep -nE -B8 'router\.(push|replace)\(\s*["'"'"'][^"'"'"']*\/(pricing|billing|subscribe|subscription|upgrade|checkout|plans)(["'"'"']|/|\?|#)' "$p" 2>/dev/null \
      | awk 'BEGIN{RS="--\n"} !/isCapacitorIOS/' \
      | grep -E 'router\.(push|replace)\(\s*["'"'"'][^"'"'"']*\/(pricing|billing|subscribe|subscription|upgrade|checkout|plans)(["'"'"']|/|\?|#)' \
      | head -n1)
    if [[ -n "$push_match" ]]; then
      add_fail "1" \
        "Navigation to billing surface from non-gated component" \
        "$(echo "$push_match" | cut -c 1-200)" \
        "router.push to a billing route from a component that is not wrapped in <BillingGate> or guarded by isCapacitorIOS(). iOS users will land on an ungated billing page." \
        "$p"
    fi
  fi

  # ===== RULE 2: Server guard on billing API routes =====
  if looks_like_billing_api "$p" && ! has_server_ios_guard "$p"; then
    ev=$(first_match 'export (async )?function|export const' "$p")
    add_fail "2" \
      "Billing API route missing rejectIfIOSCapacitor guard" \
      "$ev" \
      "API route handles payment/billing but does not call rejectIfIOSCapacitor(request) early. iOS shell can hit this endpoint and bypass the WebView restriction." \
      "$p"
  fi

  # ===== RULE 3: External Stripe / billing URLs from iOS-reachable code =====
  stripe_url=$(grep -nE 'https?://(buy\.stripe\.com|checkout\.stripe\.com|js\.stripe\.com)' "$p" 2>/dev/null | head -n1)
  if [[ -n "$stripe_url" ]] && ! has_billing_gate_wrapper "$p" && [[ "$p" != */api/* ]]; then
    add_fail "3" \
      "External Stripe URL referenced from non-gated client code" \
      "$(echo "$stripe_url" | cut -c 1-200)" \
      "Stripe URL appears in a client-reachable file with no <BillingGate>. iOS users can reach this URL." \
      "$p"
  fi

  # External pricing URL (the marketing-site fallback) outside BillingGate.
  pricing_url=$(grep -nE 'https?://restoreassist\.app/pricing' "$p" 2>/dev/null | head -n1)
  # BillingGate.tsx itself is allowed to reference the marketing pricing URL (that's its fallback).
  if [[ -n "$pricing_url" ]] && [[ "$p" != *BillingGate.tsx ]] && ! has_billing_gate_wrapper "$p"; then
    add_warn "External marketing pricing URL referenced outside BillingGate (review needed)" "$p"
  fi

  # ===== RULE 5: isCapacitorIOS branches without early-return =====
  # Heuristic: if file calls isCapacitorIOS() but does not also have either
  # a return / redirect / BillingGate render in proximity, warn.
  if grep -qE 'isCapacitorIOS\s*\(' "$p" 2>/dev/null; then
    if ! grep -qE 'return\s+null|return\s+<BillingGate|return\s+<Redirect|router\.replace|notFound\(\)' "$p" 2>/dev/null; then
      add_warn "isCapacitorIOS() branch with no obvious early-return / redirect / BillingGate" "$p"
    fi
  fi
done

# ---------- Emit report ----------

claims_failed=${#failed[@]}
claims_unverified=${#unverified[@]}
claims_warned=${#warned[@]}
claims_total=$(( claims_failed + claims_warned ))

if (( claims_failed > 0 )); then
  status="failed"
  feedback="iOS App Review will reject this. Hard violations:

$(for f in "${failed[@]}"; do
    echo "$f" | jq -r '"- [Rule \(.rule)] \(.path)\n  \(.claim)\n  Evidence: \(.evidence)\n  Fix: \(.why)\n"'
  done)"
elif (( claims_warned > 0 )); then
  status="partial"
  feedback=""
else
  status="static-clean"
  feedback=""
fi

jq -n \
  --arg status "$status" \
  --arg feedback "$feedback" \
  --argjson failed "[$(IFS=,; echo "${failed[*]:-}")]" \
  --argjson warned "[$(IFS=,; echo "${warned[*]:-}")]" \
  --argjson claims_total "$claims_total" \
  --argjson claims_failed "$claims_failed" \
  --argjson claims_warned "$claims_warned" \
  '{
     status: $status,
     confidence: "high",
     source: "static-check",
     claims_total: $claims_total,
     claims_verified: 0,
     claims_failed: $claims_failed,
     claims_unverified: 0,
     claims_warned: $claims_warned,
     verified: [],
     failed: $failed,
     unverified: [],
     warnings: $warned,
     feedback: $feedback
   }'

exit 0
