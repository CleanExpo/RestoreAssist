#!/usr/bin/env python3
"""
verify_deploy.py — Deployment parity checker (RA-692)

Compares the git SHA deployed on Vercel and Railway against the local git HEAD.
Exits 0 on clean parity, 1 if drift is detected or credentials are missing.

Required environment variables:
  VERCEL_TOKEN        — Vercel API token (Account Settings → Tokens)
  VERCEL_PROJECT_ID   — Vercel project ID (Project Settings → General)
  RAILWAY_TOKEN       — Railway API token (Account Settings → Tokens)
  RAILWAY_SERVICE_ID  — Railway service ID (from project dashboard)

Optional:
  VERCEL_TEAM_ID      — Required for team projects (slug or ID)
  GIT_HEAD_SHA        — Override local git HEAD (useful in CI where HEAD may differ)
"""

import os
import sys
import subprocess
import urllib.request
import urllib.error
import json


# ── Helpers ─────────────────────────────────────────────────────────────────

def env_required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"[ERROR] Missing required environment variable: {name}", file=sys.stderr)
        print(f"        See DEPLOYMENT.md for setup instructions.", file=sys.stderr)
        sys.exit(1)
    return value


def env_optional(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def http_get(url: str, token: str) -> dict:
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} from {url}: {body}") from e


def get_local_sha() -> str:
    override = env_optional("GIT_HEAD_SHA")
    if override:
        return override
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


# ── Vercel ───────────────────────────────────────────────────────────────────

def get_vercel_sha(token: str, project_id: str, team_id: str) -> str | None:
    url = f"https://api.vercel.com/v6/deployments?projectId={project_id}&limit=1&state=READY"
    if team_id:
        url += f"&teamId={team_id}"
    data = http_get(url, token)

    deployments = data.get("deployments", [])
    if not deployments:
        print("[WARN] Vercel: no READY deployments found.")
        return None

    deployment = deployments[0]
    # Vercel stores the git SHA in meta.githubCommitSha or gitSource.sha
    sha = (
        deployment.get("meta", {}).get("githubCommitSha")
        or deployment.get("gitSource", {}).get("sha")
    )
    if not sha:
        print(f"[WARN] Vercel: deployment {deployment.get('uid')} has no git SHA in metadata.")
    return sha


# ── Railway ──────────────────────────────────────────────────────────────────

RAILWAY_GQL = "https://backboard.railway.app/graphql/v2"

RAILWAY_QUERY = """
query GetLatestDeployment($serviceId: String!) {
  deployments(
    input: { serviceId: $serviceId }
    first: 1
    orderBy: { field: CREATED_AT, direction: DESC }
  ) {
    edges {
      node {
        id
        status
        meta {
          commitHash
        }
      }
    }
  }
}
"""


def get_railway_sha(token: str, service_id: str) -> str | None:
    payload = json.dumps({
        "query": RAILWAY_GQL,
        "variables": {"serviceId": service_id},
    }).encode()
    req = urllib.request.Request(RAILWAY_GQL, data=payload, method="POST")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Railway API HTTP {e.code}: {body}") from e

    edges = data.get("data", {}).get("deployments", {}).get("edges", [])
    if not edges:
        print("[WARN] Railway: no deployments found for service.")
        return None

    node = edges[0]["node"]
    sha = node.get("meta", {}).get("commitHash")
    if not sha:
        print(f"[WARN] Railway: deployment {node.get('id')} has no commitHash in meta.")
    return sha


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    # Vercel is required — every project here deploys to Vercel.
    vercel_token = env_required("VERCEL_TOKEN")
    vercel_project_id = env_required("VERCEL_PROJECT_ID")
    vercel_team_id = env_optional("VERCEL_TEAM_ID")

    # Railway is OPTIONAL — RestoreAssist is Vercel-only; the Railway step
    # was copy-pasted from a different repo's template. Only run the Railway
    # parity check when both secrets are present.
    railway_token = env_optional("RAILWAY_TOKEN")
    railway_service_id = env_optional("RAILWAY_SERVICE_ID")
    railway_enabled = bool(railway_token and railway_service_id)

    try:
        local_sha = get_local_sha()
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Could not read git HEAD: {e}", file=sys.stderr)
        return 1

    print(f"Local HEAD:  {local_sha}")

    drift_detected = False

    # ── Vercel check ─────────────────────────────────────────────────────────
    try:
        vercel_sha = get_vercel_sha(vercel_token, vercel_project_id, vercel_team_id)
        if vercel_sha is None:
            print("[WARN] Vercel: could not determine deployed SHA — skipping comparison.")
        elif vercel_sha.startswith(local_sha[:8]) or local_sha.startswith(vercel_sha[:8]):
            print(f"Vercel:      {vercel_sha} ✓ (parity)")
        else:
            print(f"Vercel:      {vercel_sha} ✗ DRIFT DETECTED (expected {local_sha[:12]})")
            drift_detected = True
    except RuntimeError as e:
        print(f"[ERROR] Vercel check failed: {e}", file=sys.stderr)
        drift_detected = True

    # ── Railway check (only when configured) ────────────────────────────────
    if not railway_enabled:
        print("Railway:     skipped (RAILWAY_TOKEN / RAILWAY_SERVICE_ID not set)")
    else:
        try:
            railway_sha = get_railway_sha(railway_token, railway_service_id)
            if railway_sha is None:
                print("[WARN] Railway: could not determine deployed SHA — skipping comparison.")
            elif railway_sha.startswith(local_sha[:8]) or local_sha.startswith(railway_sha[:8]):
                print(f"Railway:     {railway_sha} ✓ (parity)")
            else:
                print(f"Railway:     {railway_sha} ✗ DRIFT DETECTED (expected {local_sha[:12]})")
                drift_detected = True
        except RuntimeError as e:
            print(f"[ERROR] Railway check failed: {e}", file=sys.stderr)
            drift_detected = True

    if drift_detected:
        print("\n[FAIL] Deployment drift detected. Investigate before merging.", file=sys.stderr)
        return 1

    print("\n[OK] All deployments are in parity with local HEAD.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
