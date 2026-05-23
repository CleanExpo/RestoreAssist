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
#   2. $OPENROUTER_VERIFIER_KEY       (per-consumer OpenRouter key, preferred)
#   3. $DEEPSEEK_API_KEY              (direct DeepSeek key)
#   4. ~/.config/pi-ceo/openrouter-verifier.env  (file-based)
#   5. ~/.config/pi-ceo/deepseek.env             (file-based, for direct API)
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
MODEL_ID="${VERIFIER_MODEL_ID:-deepseek/deepseek-v4-pro}"
TIMEOUT="${VERIFIER_TIMEOUT_SECONDS:-30}"
MAX_TOKENS="${VERIFIER_MAX_OUTPUT_TOKENS:-2000}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEM_PROMPT_FILE="$SCRIPT_DIR/verifier-system-prompt.md"

if [[ ! -r "$SYSTEM_PROMPT_FILE" ]]; then
  echo "openrouter-call: system prompt missing: $SYSTEM_PROMPT_FILE" >&2
  exit 4
fi

# ---- Resolve API key ----
resolve_key() {
  if [[ -n "${VERIFIER_API_KEY:-}" ]]; then
    echo "$VERIFIER_API_KEY"; return 0
  fi
  if [[ -n "${OPENROUTER_VERIFIER_KEY:-}" ]]; then
    echo "$OPENROUTER_VERIFIER_KEY"; return 0
  fi
  if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
    echo "$DEEPSEEK_API_KEY"; return 0
  fi
  for f in "$HOME/.config/pi-ceo/openrouter-verifier.env" "$HOME/.config/pi-ceo/deepseek.env"; do
    if [[ -r "$f" ]]; then
      # Expect: KEY_NAME=value (one line). Strip quotes/whitespace.
      val=$(grep -E '^(OPENROUTER_VERIFIER_KEY|DEEPSEEK_API_KEY|VERIFIER_API_KEY)=' "$f" \
        | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '[:space:]')
      if [[ -n "$val" ]]; then echo "$val"; return 0; fi
    fi
  done
  return 1
}

API_KEY=$(resolve_key) || {
  echo "openrouter-call: no API key configured (set VERIFIER_API_KEY or OPENROUTER_VERIFIER_KEY)" >&2
  exit 4
}

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
