#!/usr/bin/env bash
# openrouter-call.sh
#
# Calls a chat-completions endpoint (default: OpenRouter) with the verifier
# system prompt + a user-provided context blob. Returns the model's JSON
# report on stdout.
#
# Endpoint is configurable so the same script works against:
#   - OpenRouter        (default: https://openrouter.ai/api/v1)
#   - DeepSeek direct   (https://api.deepseek.com/v1)
#   - any OpenAI-compatible API
#
# Resolution order for the API key (first non-empty wins):
#   1. $VERIFIER_API_KEY              (explicit override)
#   2. $OPENROUTER_VERIFIER_KEY       (dedicated verifier key, if you have one)
#   3. $OPENROUTER_API_KEY            (the PLATFORM key the rest of the app uses)
#   4. $DEEPSEEK_API_KEY              (direct DeepSeek key)
#   5. ~/.config/pi-ceo/openrouter-verifier.env  (file-based)
#   6. ~/.config/pi-ceo/deepseek.env             (file-based, for direct API)
#
# Zero platform cost (RA-6998). Against OpenRouter the model is PINNED to a
# `:free` variant, exactly as lib/ai/openrouter.ts pins Margot's — that module is
# the single source of truth for which free model we use, and the default here is
# read from it. A `:free` model cannot spend anything on the platform key, which
# is what makes reusing $OPENROUTER_API_KEY here safe. A non-`:free`
# VERIFIER_MODEL_ID is refused (warn + fall back) rather than silently billed.
# The pin applies to OpenRouter only: pointing VERIFIER_API_BASE at DeepSeek
# direct (or any other OpenAI-compatible API) uses whatever model you name, on
# that API's own key.
#
# Debugging: VERIFIER_DRY_RUN=1 prints the resolved model and key source, then
# exits 0 without calling the API or reading stdin.
#
# Reads the user context blob from stdin.
# Writes the assistant's JSON report to stdout.
# Exit codes:
#   0  = success, valid JSON written to stdout
#   4  = no API key configured
#   5  = HTTP request failed after retries
#   6  = response was not valid JSON

set -uo pipefail

API_BASE="${VERIFIER_API_BASE:-https://openrouter.ai/api/v1}"
TIMEOUT="${VERIFIER_TIMEOUT_SECONDS:-30}"
MAX_TOKENS="${VERIFIER_MAX_OUTPUT_TOKENS:-2000}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEM_PROMPT_FILE="$SCRIPT_DIR/verifier-system-prompt.md"

if [[ ! -r "$SYSTEM_PROMPT_FILE" ]]; then
  echo "openrouter-call: system prompt missing: $SYSTEM_PROMPT_FILE" >&2
  exit 4
fi

# ---- Resolve model (zero-cost pin) ----
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Last-resort literal, used only when lib/ai/openrouter.ts cannot be read (the
# hook may run from a checkout that lacks it). Keep it a :free variant.
FREE_MODEL_FALLBACK="nvidia/nemotron-3-super-120b-a12b:free"

# The free model the platform has settled on, read from its owner rather than
# copied — lib/ai/openrouter.ts documents the review cadence for this choice.
default_free_model() {
  local ts="${VERIFIER_MODEL_SOURCE_FILE:-$REPO_ROOT/lib/ai/openrouter.ts}" found=""
  if [[ -r "$ts" ]]; then
    found=$(grep -oE 'DEFAULT_MARGOT_MODEL[[:space:]]*=[[:space:]]*"[^"]+"' "$ts" \
      | head -n1 | cut -d'"' -f2)
  fi
  # Trust that constant for WHICH free model, never for whether it is free. If
  # a future edit points it at a paid slug, an unset VERIFIER_MODEL_ID would
  # otherwise spend on the platform key without anyone touching this file.
  if [[ "$found" == *:free ]]; then echo "$found"; return 0; fi
  [[ -n "$found" ]] && echo "openrouter-call: DEFAULT_MARGOT_MODEL=\"$found\" is not a :free" \
    "variant — using $FREE_MODEL_FALLBACK instead (RA-6998)." >&2
  echo "$FREE_MODEL_FALLBACK"
}

# True when we are talking to OpenRouter, where the :free pin means $0.
# Case-folded: URL hosts are case-insensitive, so a base of
# https://OPENROUTER.AI/... is still OpenRouter and must still be pinned.
is_openrouter() { [[ "${API_BASE,,}" == *openrouter.ai* ]]; }

resolve_model() {
  local configured="${VERIFIER_MODEL_ID:-}" free_model
  free_model=$(default_free_model)
  if [[ -z "$configured" ]]; then echo "$free_model"; return 0; fi
  if is_openrouter && [[ "$configured" != *:free ]]; then
    echo "openrouter-call: VERIFIER_MODEL_ID=\"$configured\" is not a :free variant —" \
         "using $free_model so the platform key stays at \$0 (RA-6998)." >&2
    echo "$free_model"; return 0
  fi
  echo "$configured"
}

MODEL_ID=$(resolve_model)

# ---- Resolve API key ----
# Echoes "<source><TAB><key>". The source travels WITH the key rather than in a
# variable: this runs in a command substitution, so any global it set would be
# lost in the subshell.
resolve_key() {
  local name val f
  for name in VERIFIER_API_KEY OPENROUTER_VERIFIER_KEY OPENROUTER_API_KEY DEEPSEEK_API_KEY; do
    val="${!name:-}"
    if [[ -n "$val" ]]; then printf '%s\t%s\n' "$name" "$val"; return 0; fi
  done
  for f in "$HOME/.config/pi-ceo/openrouter-verifier.env" "$HOME/.config/pi-ceo/deepseek.env"; do
    if [[ -r "$f" ]]; then
      # Expect: KEY_NAME=value (one line). Strip quotes/whitespace.
      val=$(grep -E '^(OPENROUTER_VERIFIER_KEY|OPENROUTER_API_KEY|DEEPSEEK_API_KEY|VERIFIER_API_KEY)=' "$f" \
        | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '[:space:]')
      if [[ -n "$val" ]]; then printf '%s\t%s\n' "$f" "$val"; return 0; fi
    fi
  done
  return 1
}

RESOLVED_KEY=$(resolve_key) || {
  echo "openrouter-call: no API key configured. Export OPENROUTER_API_KEY (the platform key" >&2
  echo "  the app already uses — the model is pinned to a :free variant, so it cannot be billed)," >&2
  echo "  or put OPENROUTER_API_KEY=... in ~/.config/pi-ceo/openrouter-verifier.env." >&2
  exit 4
}
KEY_SOURCE="${RESOLVED_KEY%%$'\t'*}"
API_KEY="${RESOLVED_KEY#*$'\t'}"

if [[ "${VERIFIER_DRY_RUN:-}" == "1" ]]; then
  echo "model=$MODEL_ID"
  echo "key_source=$KEY_SOURCE"
  echo "api_base=$API_BASE"
  exit 0
fi

# ---- Read context from stdin ----
USER_CONTEXT=$(cat)
SYSTEM_PROMPT=$(cat "$SYSTEM_PROMPT_FILE")

# ---- Build the request body via jq (handles all string escaping) ----
REQUEST_BODY=$(jq -n \
  --arg model "$MODEL_ID" \
  --arg system "$SYSTEM_PROMPT" \
  --arg user "$USER_CONTEXT" \
  --argjson max_tokens "$MAX_TOKENS" \
  '{
    model: $model,
    temperature: 0,
    max_tokens: $max_tokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: $system },
      { role: "user",   content: $user }
    ]
  }')

# ---- Call the API with retry ----
ATTEMPT=0
MAX_ATTEMPTS=3
DELAYS=(1 3 9)

while (( ATTEMPT < MAX_ATTEMPTS )); do
  HTTP_BODY=$(mktemp)
  HTTP_CODE=$(curl --silent --show-error --location \
    --max-time "$TIMEOUT" \
    --output "$HTTP_BODY" \
    --write-out '%{http_code}' \
    --header "Authorization: Bearer $API_KEY" \
    --header "Content-Type: application/json" \
    --header "HTTP-Referer: https://pi-ceo.local" \
    --header "X-Title: pi-ceo-verifier" \
    --data "$REQUEST_BODY" \
    "$API_BASE/chat/completions" 2>/dev/null) || HTTP_CODE="000"

  if [[ "$HTTP_CODE" =~ ^2[0-9]{2}$ ]]; then
    # Success path: extract assistant content (must be JSON-shaped per response_format).
    CONTENT=$(jq -r '.choices[0].message.content // empty' "$HTTP_BODY" 2>/dev/null)
    rm -f "$HTTP_BODY"
    if [[ -z "$CONTENT" ]]; then
      echo "openrouter-call: empty content in response" >&2
      exit 6
    fi
    # Validate it parses as JSON (DeepSeek occasionally wraps in markdown despite response_format).
    if echo "$CONTENT" | jq empty 2>/dev/null; then
      echo "$CONTENT"
      exit 0
    fi
    # Strip ```json ... ``` fences if the model wrapped output.
    UNFENCED=$(echo "$CONTENT" | sed -e 's/^```json//' -e 's/^```//' -e 's/```$//' | jq -c . 2>/dev/null || true)
    if [[ -n "$UNFENCED" ]]; then
      echo "$UNFENCED"
      exit 0
    fi
    echo "openrouter-call: response content was not valid JSON" >&2
    echo "openrouter-call: raw content: $CONTENT" >&2
    exit 6
  fi

  # Retryable: 429 (rate-limit) or 5xx (server). Anything else (4xx other) → bail.
  if [[ ! "$HTTP_CODE" =~ ^(429|5[0-9]{2}|000)$ ]]; then
    echo "openrouter-call: non-retryable HTTP $HTTP_CODE" >&2
    cat "$HTTP_BODY" >&2
    rm -f "$HTTP_BODY"
    exit 5
  fi

  echo "openrouter-call: attempt $((ATTEMPT+1)) failed (HTTP $HTTP_CODE), retrying in ${DELAYS[$ATTEMPT]}s" >&2
  rm -f "$HTTP_BODY"
  sleep "${DELAYS[$ATTEMPT]}"
  ATTEMPT=$((ATTEMPT + 1))
done

echo "openrouter-call: all retries exhausted" >&2
exit 5
