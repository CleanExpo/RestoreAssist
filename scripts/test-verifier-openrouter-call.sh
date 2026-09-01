#!/usr/bin/env bash
# test-verifier-openrouter-call.sh — the Stop verifier's LLM stage must run on
# the platform OpenRouter key at zero cost.
#
# Two things kept it inert or unsafe:
#   1. It never looked at OPENROUTER_API_KEY — the key the rest of the app uses —
#      so every call exited 4 ("no API key configured") and the LLM stage was
#      silently dead wherever only that key was set.
#   2. Its default model was a PAID slug. On the shared platform key that means
#      real spend, which is exactly what RA-6998 pins :free variants to prevent.
#
# Run: bash scripts/test-verifier-openrouter-call.sh
# Set OPENROUTER_CALL to test a different copy of the script (used to prove
# these cases fail against the pre-fix version).

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CALL="${OPENROUTER_CALL:-$REPO_DIR/.claude/hooks/lib/openrouter-call.sh}"
TMP=$(mktemp -d)
STUB_PID=""
cleanup() { [[ -n "$STUB_PID" ]] && kill "$STUB_PID" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

FAILURES=0

# Record a passing case: $1 is what held.
pass() { echo "  ok   — $1"; }

# Record a failing case: $1 is what should have held. Sets the exit status.
fail() { echo "  FAIL — $1"; FAILURES=$((FAILURES + 1)); }

# The free model lib/ai/openrouter.ts pins. That module owns this choice; the
# hook must follow it rather than carry its own copy.
FREE_MODEL=$(grep -oE 'DEFAULT_MARGOT_MODEL[[:space:]]*=[[:space:]]*"[^"]+"' \
  "$REPO_DIR/lib/ai/openrouter.ts" | head -n1 | cut -d'"' -f2)
[[ -z "$FREE_MODEL" ]] && { echo "cannot read DEFAULT_MARGOT_MODEL"; exit 1; }

# Resolve config without calling the API. Echoes "model=… key_source=… api_base=…".
dry_run() { env "$@" VERIFIER_DRY_RUN=1 "$CALL" </dev/null 2>/dev/null; }

# Pull one field out of a dry-run block.
field() { echo "$1" | grep -E "^$2=" | cut -d= -f2-; }

echo "case 1: OPENROUTER_API_KEY alone is enough to run the verifier"
OUT=$(dry_run OPENROUTER_API_KEY=sk-test-platform); RC=$?
if (( RC == 0 )) && [[ "$(field "$OUT" key_source)" == "OPENROUTER_API_KEY" ]]; then
  pass "platform key accepted"
else
  fail "rc=$RC, key_source='$(field "$OUT" key_source)' — the LLM stage stays dead on the platform key"
fi

echo "case 2: the default model is :free AND matches what lib/ai/openrouter.ts pins"
# Both halves matter. Equality alone is self-referential — FREE_MODEL is read
# from the same constant, so a paid DEFAULT_MARGOT_MODEL would satisfy it.
OUT=$(dry_run OPENROUTER_API_KEY=sk-test-platform)
MODEL=$(field "$OUT" model)
if [[ "$MODEL" != *:free ]]; then
  fail "default model '$MODEL' is not a :free variant — bills the platform key"
elif [[ "$MODEL" != "$FREE_MODEL" ]]; then
  fail "default $MODEL is free but does not match lib/ai/openrouter.ts ($FREE_MODEL)"
else
  pass "default is $MODEL"
fi

echo "case 3: a non-:free VERIFIER_MODEL_ID is refused on OpenRouter"
OUT=$(dry_run OPENROUTER_API_KEY=sk-test-platform VERIFIER_MODEL_ID=openai/gpt-4o)
MODEL=$(field "$OUT" model)
if [[ "$MODEL" == "$FREE_MODEL" ]]; then
  pass "fell back to $MODEL"
else
  fail "used '$MODEL' — a paid model on the shared platform key"
fi

echo "case 4: a non-OpenRouter endpoint still uses the model it was given"
OUT=$(dry_run DEEPSEEK_API_KEY=sk-test-deepseek \
  VERIFIER_API_BASE=https://api.deepseek.com/v1 VERIFIER_MODEL_ID=deepseek-chat)
MODEL=$(field "$OUT" model)
if [[ "$MODEL" == "deepseek-chat" ]]; then
  pass "DeepSeek-direct path unaffected by the :free pin"
else
  fail "model '$MODEL' — the pin should not apply off OpenRouter"
fi

echo "case 5: a real request carries the key and the pinned model"
REQ="$TMP/request.json"
PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
python3 - "$PORT" "$REQ" <<'PY' &
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

port, req_path = int(sys.argv[1]), sys.argv[2]

class H(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        with open(req_path, "w") as f:
            json.dump({"body": json.loads(body),
                       "authorization": self.headers.get("Authorization", "")}, f)
        payload = json.dumps({"choices": [{"message": {"content": '{"status":"static-clean"}'}}]})
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload.encode())
    def log_message(self, *a): pass

HTTPServer(("127.0.0.1", port), H).serve_forever()
PY
STUB_PID=$!
for _ in $(seq 1 50); do
  (exec 3<>/dev/tcp/127.0.0.1/"$PORT") 2>/dev/null && break
  python3 -c 'import time;time.sleep(0.1)'
done

RESPONSE=$(echo "some verifier context" | env OPENROUTER_API_KEY=sk-test-platform \
  VERIFIER_API_BASE="http://127.0.0.1:$PORT" "$CALL" 2>/dev/null)
RC=$?
if (( RC != 0 )) || [[ ! -r "$REQ" ]]; then
  fail "no request reached the endpoint (rc=$RC) — the call never left the ground"
else
  SENT_MODEL=$(jq -r '.body.model' "$REQ")
  SENT_AUTH=$(jq -r '.authorization' "$REQ")
  GOT=$(echo "$RESPONSE" | jq -r '.status // empty' 2>/dev/null)
  if [[ "$SENT_MODEL" == "$FREE_MODEL" && "$SENT_AUTH" == "Bearer sk-test-platform" && "$GOT" == "static-clean" ]]; then
    pass "sent $SENT_MODEL with the platform key and parsed the reply"
  else
    fail "model='$SENT_MODEL' auth='$SENT_AUTH' parsed='$GOT'"
  fi
fi

echo "case 6: an UPPERCASE OpenRouter host is still OpenRouter"
# URL hosts are case-insensitive. A case-sensitive check here let a paid model
# through to OpenRouter on the platform key.
OUT=$(dry_run OPENROUTER_API_KEY=sk-test-platform \
  VERIFIER_API_BASE=https://OPENROUTER.AI/api/v1 VERIFIER_MODEL_ID=openai/gpt-4o)
MODEL=$(field "$OUT" model)
if [[ "$MODEL" == "$FREE_MODEL" ]]; then
  pass "pin applied despite the capitalised host"
else
  fail "sent '$MODEL' to OpenRouter — the pin was bypassed by capitalisation"
fi

echo "case 7: a DEFAULT_MARGOT_MODEL that is not :free is not trusted"
# The constant says WHICH free model, never whether it is free. If a later edit
# points it at a paid slug, the hook must refuse it rather than spend.
FAKE_TS="$TMP/openrouter.ts"
echo 'export const DEFAULT_MARGOT_MODEL = "openai/gpt-4o";' > "$FAKE_TS"
OUT=$(dry_run OPENROUTER_API_KEY=sk-test-platform VERIFIER_MODEL_SOURCE_FILE="$FAKE_TS")
MODEL=$(field "$OUT" model)
if [[ "$MODEL" == *:free ]]; then
  pass "fell back to $MODEL"
else
  fail "adopted '$MODEL' from the constant without checking it is free"
fi

echo
if (( FAILURES == 0 )); then
  echo "verifier OpenRouter call: all cases pass"
  exit 0
fi
echo "verifier OpenRouter call: $FAILURES case(s) failed"
exit 1
