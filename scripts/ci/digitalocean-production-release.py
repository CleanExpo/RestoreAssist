#!/usr/bin/env python3
"""Fail-closed DigitalOcean App Platform production release controller.

The controller never builds images and never receives registry-push authority.
It accepts a rendered, digest-pinned app spec only after an independent build
job has produced and verified the image provenance receipt.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


API_BASE = "https://api.digitalocean.com/v2"
PRODUCTION_ORIGIN = "https://restoreassist.app"
TERMINAL_FAILURES = {"ERROR", "CANCELED", "SUPERSEDED"}
DIGEST_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
FINGERPRINT_PATTERN = re.compile(r"^[0-9a-f]{64}$")
ID_PATTERN = re.compile(r"^[A-Za-z0-9-]{8,128}$")
SAFE_RECEIPT_ENV_VALUES = {
    "NODE_ENV",
    "ALLOWED_APP_HOSTS",
    "GIT_SHA",
    "NEXTAUTH_URL",
    "TENANT_DATABASE_PROVISIONING_ENABLED",
}
APPROVED_ENV = {
    "NODE_ENV": {"value": "production"},
    "ALLOWED_APP_HOSTS": {
        "value": "restoreassist.app,www.restoreassist.app",
        "scope": "RUN_TIME",
        "type": "GENERAL",
    },
    "CREDENTIAL_ENCRYPTION_KEY": {"scope": "RUN_TIME", "type": "SECRET"},
    "NEXTAUTH_SECRET": {"scope": "RUN_TIME", "type": "SECRET"},
    "NEXTAUTH_URL": {
        "value": "https://restoreassist.app",
        "scope": "RUN_TIME",
        "type": "GENERAL",
    },
    "GOOGLE_CLIENT_ID": {"scope": "RUN_TIME", "type": "SECRET"},
    "GOOGLE_CLIENT_SECRET": {"scope": "RUN_TIME", "type": "SECRET"},
    "NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID": {
        "scope": "RUN_AND_BUILD_TIME",
        "type": "SECRET",
    },
    "DATABASE_URL": {"scope": "RUN_TIME", "type": "SECRET"},
    "TENANT_DATABASE_HOST_ALLOWLIST": {"scope": "RUN_TIME", "type": "SECRET"},
    "TENANT_DATABASE_PROVISIONING_ENABLED": {
        "value": "false",
        "scope": "RUN_TIME",
        "type": "GENERAL",
    },
    "ANTHROPIC_API_KEY": {"scope": "RUN_TIME", "type": "SECRET"},
    "PILOT_TESTER_JUDGE_API_KEY": {"scope": "RUN_TIME", "type": "SECRET"},
    "STRIPE_SECRET_KEY": {"scope": "RUN_TIME", "type": "SECRET"},
    "STRIPE_WEBHOOK_SECRET": {"scope": "RUN_TIME", "type": "SECRET"},
    "CLOUDINARY_URL": {"scope": "RUN_TIME", "type": "SECRET"},
    "XERO_WEBHOOK_KEY": {"scope": "RUN_TIME", "type": "SECRET"},
    "GITHUB_WEBHOOK_SECRET": {"scope": "RUN_TIME", "type": "SECRET"},
    "MAILTRAP_API_KEY": {"scope": "RUN_TIME", "type": "SECRET"},
    "SENDER_EMAIL": {"scope": "RUN_TIME", "type": "GENERAL"},
    "CRON_SECRET": {"scope": "RUN_TIME", "type": "SECRET"},
    "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON": {"scope": "RUN_TIME", "type": "SECRET"},
    "ASC_API_KEY_ID": {"scope": "RUN_TIME", "type": "GENERAL"},
    "ASC_ISSUER_ID": {"scope": "RUN_TIME", "type": "GENERAL"},
}


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


NO_REDIRECT_OPENER = urllib.request.build_opener(NoRedirectHandler())


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"missing required environment variable: {name}")
    return value


def canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def redacted_spec(spec: dict) -> dict:
    value = json.loads(json.dumps(spec))
    for group in ("services", "workers", "jobs", "functions", "static_sites"):
        for component in value.get(group, []) or []:
            image = component.get("image")
            if isinstance(image, dict) and "registry_credentials" in image:
                image["registry_credentials"] = "[REDACTED]"
            for entry in component.get("envs", []) or []:
                if (
                    isinstance(entry, dict)
                    and "value" in entry
                    and (
                        entry.get("type") == "SECRET"
                        or entry.get("key") not in SAFE_RECEIPT_ENV_VALUES
                    )
                ):
                    entry["value"] = "[REDACTED]"
    return value


def spec_hash(spec: dict) -> str:
    return hashlib.sha256(canonical_json(redacted_spec(spec)).encode()).hexdigest()


def request_json(
    token: str,
    method: str,
    path: str,
    body: object | None = None,
    timeout: int = 30,
) -> dict:
    if not path.startswith("/") or "//" in path or "?" in path or "#" in path:
        raise RuntimeError(f"unsafe DigitalOcean API path: {path!r}")
    url = f"{API_BASE}{path}"
    data = None if body is None else canonical_json(body).encode()
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Authorization", f"Bearer {token}")
    request.add_header("Accept", "application/json")
    if data is not None:
        request.add_header("Content-Type", "application/json")
    try:
        with NO_REDIRECT_OPENER.open(request, timeout=timeout) as response:
            if response.geturl() != url:
                raise RuntimeError("DigitalOcean API redirected unexpectedly")
            payload = json.loads(response.read())
    except urllib.error.HTTPError as error:
        # Provider validation errors may echo submitted encrypted secrets or
        # registry credentials. Keep logs useful without reflecting the body.
        request_id = error.headers.get("x-request-id", "") if error.headers else ""
        suffix = f" (request {request_id})" if request_id else ""
        raise RuntimeError(f"DigitalOcean API HTTP {error.code}{suffix}") from error
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(f"DigitalOcean API request failed: {error}") from error
    if not isinstance(payload, dict):
        raise RuntimeError("DigitalOcean API response is not an object")
    return payload


def require_id(value: object, location: str) -> str:
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
        raise RuntimeError(f"{location} has no valid identifier")
    return value


def validate_app_identity(spec: object) -> dict:
    if not isinstance(spec, dict):
        raise RuntimeError("DigitalOcean app spec is not an object")
    if spec.get("name") != "restore-assist" or spec.get("region") != "syd":
        raise RuntimeError("DigitalOcean app identity or region drifted")
    if spec.get("domains") != [{"domain": "restoreassist.app", "type": "PRIMARY"}]:
        raise RuntimeError("DigitalOcean canonical production domain drifted")
    services = spec.get("services")
    if not isinstance(services, list) or len(services) != 1 or services[0].get("name") != "web":
        raise RuntimeError("DigitalOcean production component set drifted")
    for group in ("workers", "jobs", "functions", "static_sites"):
        if spec.get(group) not in (None, []):
            raise RuntimeError(f"DigitalOcean production has unapproved {group}")
    return spec


def validate_release_spec(
    spec: object,
    expected_digest: str,
    expected_sha: str,
    *,
    allow_provider_values: bool = False,
) -> dict:
    spec = validate_app_identity(spec)
    if not DIGEST_PATTERN.fullmatch(expected_digest):
        raise RuntimeError("expected image digest is not canonical")
    if not SHA_PATTERN.fullmatch(expected_sha):
        raise RuntimeError("expected Git SHA is not canonical")
    if set(spec) != {"name", "region", "domains", "services"}:
        raise RuntimeError("DigitalOcean top-level release contract drifted")
    service = spec["services"][0]
    if set(service) != {
        "name",
        "image",
        "instance_count",
        "instance_size_slug",
        "http_port",
        "health_check",
        "envs",
    }:
        raise RuntimeError("DigitalOcean services/web release contract drifted")
    for forbidden in (
        "github",
        "git",
        "gitlab",
        "bitbucket",
        "source_dir",
        "dockerfile_path",
        "build_command",
        "run_command",
        "environment_slug",
    ):
        if forbidden in service:
            raise RuntimeError(f"DigitalOcean services/web contains forbidden field {forbidden}")
    image = service.get("image")
    if not isinstance(image, dict):
        raise RuntimeError("DigitalOcean services/web has no image source")
    if set(image) != {
        "registry_type",
        "registry",
        "repository",
        "registry_credentials",
        "digest",
    }:
        raise RuntimeError("DigitalOcean services/web image contract drifted")
    if (
        image.get("registry_type") != "GHCR"
        or image.get("registry") != "cleanexpo"
        or image.get("repository") != "restoreassist"
        or image.get("digest") != expected_digest
        or not isinstance(image.get("registry_credentials"), str)
        or image.get("registry_credentials") in ("", "${GHCR_PULL_CREDENTIALS}", "[REDACTED]")
    ):
        raise RuntimeError("DigitalOcean services/web image source is not exact and immutable")
    if service.get("health_check") != {"http_path": "/api/health/migrations"}:
        raise RuntimeError("DigitalOcean services/web health contract drifted")
    if (
        service.get("instance_count") != 1
        or service.get("instance_size_slug") != "basic-xxs"
        or service.get("http_port") != 3000
    ):
        raise RuntimeError("DigitalOcean services/web capacity or port contract drifted")
    envs = service.get("envs")
    if not isinstance(envs, list):
        raise RuntimeError("DigitalOcean services/web envs are not a list")
    expected_env = dict(APPROVED_ENV)
    expected_env["GIT_SHA"] = {
        "value": expected_sha,
        "scope": "RUN_AND_BUILD_TIME",
        "type": "GENERAL",
    }
    observed_env = {}
    for entry in envs:
        if not isinstance(entry, dict) or not isinstance(entry.get("key"), str):
            raise RuntimeError("DigitalOcean services/web has an invalid environment entry")
        key = entry["key"]
        if key in observed_env:
            raise RuntimeError(f"DigitalOcean services/web has duplicate environment key {key}")
        observed_env[key] = entry
    if set(observed_env) != set(expected_env):
        raise RuntimeError("DigitalOcean services/web environment key set drifted")
    for key, approved in expected_env.items():
        entry = observed_env[key]
        expected_entry = {"key": key, **approved}
        if "value" not in approved and allow_provider_values:
            value = entry.get("value")
            if not isinstance(value, str) or not value:
                raise RuntimeError(f"DigitalOcean services/web environment {key} has no provider value")
            expected_entry["value"] = value
        if entry != expected_entry:
            raise RuntimeError(f"DigitalOcean services/web environment contract drifted at {key}")
    return spec


def validate_release_identity(spec: object, expected_digest: str, expected_sha: str) -> None:
    if not isinstance(spec, dict):
        raise RuntimeError("deployment spec has no release identity")
    services = spec.get("services")
    if not isinstance(services, list) or len(services) != 1 or services[0].get("name") != "web":
        raise RuntimeError("deployment spec has no exact web component identity")
    image = services[0].get("image")
    if (
        not isinstance(image, dict)
        or image.get("registry_type") != "GHCR"
        or image.get("registry") != "cleanexpo"
        or image.get("repository") != "restoreassist"
        or image.get("digest") != expected_digest
    ):
        raise RuntimeError("deployment spec has a different image identity")
    matching_sha = [
        entry
        for entry in services[0].get("envs", [])
        if isinstance(entry, dict) and entry.get("key") == "GIT_SHA"
    ]
    if len(matching_sha) != 1 or matching_sha[0].get("value") != expected_sha:
        raise RuntimeError("deployment spec has a different Git identity")


def hydrate_provider_values(target_spec: dict, current_spec: object) -> dict:
    current_spec = validate_app_identity(current_spec)
    current_envs = current_spec["services"][0].get("envs")
    if not isinstance(current_envs, list):
        raise RuntimeError("current DigitalOcean app spec has no environment list")
    current_by_key = {
        entry.get("key"): entry
        for entry in current_envs
        if isinstance(entry, dict) and isinstance(entry.get("key"), str)
    }
    hydrated = json.loads(json.dumps(target_spec))
    for entry in hydrated["services"][0]["envs"]:
        if "value" in entry:
            continue
        key = entry["key"]
        current = current_by_key.get(key)
        value = current.get("value") if isinstance(current, dict) else None
        if (
            current is None
            or current.get("type") != entry.get("type")
            or current.get("scope") != entry.get("scope")
            or not isinstance(value, str)
            or not value
        ):
            raise RuntimeError(f"current DigitalOcean app spec cannot preserve value for {key}")
        entry["value"] = value
    return hydrated


def validate_replacement_compatibility(current_spec: object, target_spec: dict) -> None:
    current_spec = validate_app_identity(current_spec)
    unexpected_top = sorted(set(current_spec) - set(target_spec))
    if unexpected_top:
        raise RuntimeError(
            "current DigitalOcean app has unreviewed top-level controls: "
            + ", ".join(unexpected_top)
        )
    current_service = current_spec["services"][0]
    target_service = target_spec["services"][0]
    reviewed_source_replacement = {
        "github",
        "git",
        "gitlab",
        "bitbucket",
        "build_command",
        "run_command",
        "environment_slug",
        "source_dir",
        "dockerfile_path",
    }
    unexpected_service = sorted(
        set(current_service) - set(target_service) - reviewed_source_replacement
    )
    if unexpected_service:
        raise RuntimeError(
            "current DigitalOcean web service has unreviewed controls: "
            + ", ".join(unexpected_service)
        )
    current_env = {
        entry.get("key")
        for entry in current_service.get("envs", [])
        if isinstance(entry, dict) and isinstance(entry.get("key"), str)
    }
    target_env = {entry["key"] for entry in target_service["envs"]}
    if current_env != target_env:
        missing = sorted(target_env - current_env)
        extra = sorted(current_env - target_env)
        raise RuntimeError(
            "current DigitalOcean environment key set is not replacement-safe; "
            f"missing={','.join(missing) or '<none>'} extra={','.join(extra) or '<none>'}"
        )


def get_app(token: str, app_id: str) -> dict:
    payload = request_json(token, "GET", f"/apps/{app_id}")
    app = payload.get("app")
    if not isinstance(app, dict):
        raise RuntimeError("DigitalOcean response has no app object")
    return app


def deployment_from_payload(payload: dict) -> dict:
    deployment = payload.get("deployment")
    if not isinstance(deployment, dict):
        raise RuntimeError("DigitalOcean response has no deployment object")
    return deployment


def read_public_json(path: str, *, require_no_store: bool) -> dict:
    url = f"{PRODUCTION_ORIGIN}{path}"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with NO_REDIRECT_OPENER.open(request, timeout=35) as response:
            if response.geturl() != url or response.status != 200:
                raise RuntimeError(f"production probe failed at {path}")
            if "application/json" not in response.headers.get("Content-Type", "").lower():
                raise RuntimeError(f"production probe at {path} is not JSON")
            if require_no_store:
                directives = {
                    item.strip().lower()
                    for item in response.headers.get("Cache-Control", "").split(",")
                    if item.strip()
                }
                if "no-store" not in directives:
                    raise RuntimeError(f"production probe at {path} is cacheable")
            payload = json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"production probe at {path} returned HTTP {error.code}") from error
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(f"production probe at {path} failed: {error}") from error
    if not isinstance(payload, dict):
        raise RuntimeError(f"production probe at {path} is not an object")
    return payload


def verify_runtime(
    expected_sha: str,
    expected_database_fingerprint: str,
    expected_migration_count: int,
    expected_migration_ledger_fingerprint: str,
) -> None:
    health = read_public_json("/api/health", require_no_store=True)
    if health.get("status") != "ok" or health.get("deploymentSha") != expected_sha:
        raise RuntimeError("production runtime health is not ok at the expected Git SHA")
    checks = health.get("checks")
    if not isinstance(checks, dict) or any(
        not isinstance(checks.get(key), dict) or checks[key].get("status") != "ok"
        for key in ("database", "env")
    ):
        raise RuntimeError("production database or environment health is not ok")

    migrations = read_public_json("/api/health/migrations", require_no_store=True)
    counts = migrations.get("counts")
    if (
        migrations.get("status") != "ok"
        or migrations.get("databaseFingerprint") != expected_database_fingerprint
        or migrations.get("migrationLedgerFingerprint")
        != expected_migration_ledger_fingerprint
        or not isinstance(counts, dict)
        or not isinstance(counts.get("total"), int)
        or counts.get("total") != expected_migration_count
        or counts.get("applied") != counts.get("total")
        or counts.get("failed") != 0
        or counts.get("rolled_back") != 0
    ):
        raise RuntimeError("production migration health or database identity is not exact")


def verify_rollback_target(
    expected_database_fingerprint: str,
    expected_migration_count: int,
    expected_migration_ledger_fingerprint: str,
) -> None:
    if (
        not FINGERPRINT_PATTERN.fullmatch(expected_database_fingerprint)
        or not FINGERPRINT_PATTERN.fullmatch(expected_migration_ledger_fingerprint)
        or not isinstance(expected_migration_count, int)
        or expected_migration_count <= 0
    ):
        raise RuntimeError("expected database or migration identity is not canonical")
    health = read_public_json("/api/health", require_no_store=True)
    checks = health.get("checks")
    if (
        health.get("status") != "ok"
        or not isinstance(checks, dict)
        or any(
            not isinstance(checks.get(key), dict) or checks[key].get("status") != "ok"
            for key in ("database", "env")
        )
    ):
        raise RuntimeError("current production is not a healthy rollback target")
    migrations = read_public_json("/api/health/migrations", require_no_store=True)
    counts = migrations.get("counts")
    if (
        migrations.get("status") != "ok"
        or migrations.get("databaseFingerprint") != expected_database_fingerprint
        or migrations.get("migrationLedgerFingerprint")
        != expected_migration_ledger_fingerprint
        or not isinstance(counts, dict)
        or not isinstance(counts.get("total"), int)
        or counts.get("total") != expected_migration_count
        or counts.get("applied") != counts.get("total")
        or counts.get("failed") != 0
        or counts.get("rolled_back") != 0
    ):
        raise RuntimeError("current production migration health is not rollback-safe")


def write_receipt(path: Path, receipt: dict) -> None:
    path.write_text(f"{json.dumps(receipt, indent=2, sort_keys=True)}\n")
    path.chmod(0o600)


def preflight(
    token: str,
    app_id: str,
    receipt_path: Path,
    expected_database_fingerprint: str,
    expected_migration_count: int,
    expected_migration_ledger_fingerprint: str,
) -> dict:
    app = get_app(token, app_id)
    validate_app_identity(app.get("spec"))
    if app.get("pending_deployment") is not None:
        raise RuntimeError("DigitalOcean already has a pending production deployment")
    active = app.get("active_deployment")
    if not isinstance(active, dict) or active.get("phase") != "ACTIVE":
        raise RuntimeError("DigitalOcean production has no ACTIVE rollback target")
    rollback_id = require_id(active.get("id"), "active deployment")
    active_spec = validate_app_identity(active.get("spec"))
    verify_rollback_target(
        expected_database_fingerprint,
        expected_migration_count,
        expected_migration_ledger_fingerprint,
    )
    receipt = {
        "schema": 1,
        "app_id": app_id,
        "rollback_deployment_id": rollback_id,
        "rollback_spec_sha256": spec_hash(active_spec),
        "rollback_spec_redacted": redacted_spec(active_spec),
        "database_fingerprint": expected_database_fingerprint,
        "migration_count": expected_migration_count,
        "migration_ledger_fingerprint": expected_migration_ledger_fingerprint,
        "preflight_unix": int(time.time()),
    }
    write_receipt(receipt_path, receipt)
    return receipt


def cancel_deployment(token: str, app_id: str, deployment_id: str) -> None:
    request_json(token, "POST", f"/apps/{app_id}/deployments/{deployment_id}/cancel")


def matching_target_from_app(
    token: str,
    app_id: str,
    app: dict,
    rollback_id: str,
    expected_digest: str,
    expected_sha: str,
) -> tuple[dict, bool] | None:
    for field, is_active in (("pending_deployment", False), ("active_deployment", True)):
        deployment = app.get(field)
        if not isinstance(deployment, dict):
            continue
        deployment_id = require_id(deployment.get("id"), field)
        if deployment_id == rollback_id:
            continue
        if not isinstance(deployment.get("spec"), dict):
            deployment = deployment_from_payload(
                request_json(token, "GET", f"/apps/{app_id}/deployments/{deployment_id}")
            )
        try:
            validate_release_identity(deployment.get("spec"), expected_digest, expected_sha)
        except RuntimeError:
            continue
        return deployment, is_active or deployment.get("phase") == "ACTIVE"
    return None


def recover_failed_release(
    token: str,
    app_id: str,
    receipt: dict,
    expected_digest: str,
    expected_sha: str,
    deployment_id: str | None,
) -> None:
    rollback_id = require_id(receipt.get("rollback_deployment_id"), "rollback receipt")
    target = None
    for attempt in range(6):
        app = get_app(token, app_id)
        target = matching_target_from_app(
            token,
            app_id,
            app,
            rollback_id,
            expected_digest,
            expected_sha,
        )
        if target is not None:
            break
        if attempt < 5:
            time.sleep(2)
    if target is None:
        raise RuntimeError(
            "provider mutation outcome is unknown and no exact target deployment became visible"
        )

    deployment, is_active = target
    observed_id = require_id(deployment.get("id"), "recovery target")
    if deployment_id is not None and observed_id != deployment_id:
        raise RuntimeError("provider exposed a different exact-spec deployment during recovery")
    if is_active:
        rollback(token, app_id, receipt)
        return

    cancel_error = None
    try:
        cancel_deployment(token, app_id, observed_id)
    except Exception as error:
        cancel_error = error

    app = get_app(token, app_id)
    active = app.get("active_deployment")
    if isinstance(active, dict) and active.get("id") == observed_id:
        validate_release_identity(active.get("spec"), expected_digest, expected_sha)
        rollback(token, app_id, receipt)
        return
    for attempt in range(6):
        deployment = deployment_from_payload(
            request_json(token, "GET", f"/apps/{app_id}/deployments/{observed_id}")
        )
        if require_id(deployment.get("id"), "canceled deployment") != observed_id:
            raise RuntimeError("DigitalOcean returned a different deployment during cancel recovery")
        phase = deployment.get("phase")
        if phase in TERMINAL_FAILURES:
            return
        if phase == "ACTIVE":
            validate_release_identity(deployment.get("spec"), expected_digest, expected_sha)
            rollback(token, app_id, receipt)
            return
        if attempt < 5:
            time.sleep(2)
    detail = f": {cancel_error}" if cancel_error else ""
    raise RuntimeError(
        f"exact target deployment did not reach a terminal phase after cancel{detail}"
    )


def wait_for_deployment(
    token: str,
    app_id: str,
    deployment_id: str,
    *,
    expected_digest: str | None = None,
    expected_sha: str | None = None,
    timeout_seconds: int = 900,
) -> dict:
    deadline = time.monotonic() + timeout_seconds
    while True:
        deployment = deployment_from_payload(
            request_json(token, "GET", f"/apps/{app_id}/deployments/{deployment_id}")
        )
        if require_id(deployment.get("id"), "deployment") != deployment_id:
            raise RuntimeError("DigitalOcean returned the wrong deployment")
        if expected_digest is not None and expected_sha is not None:
            validate_release_spec(
                deployment.get("spec"),
                expected_digest,
                expected_sha,
                allow_provider_values=True,
            )
        phase = str(deployment.get("phase") or "")
        if phase == "ACTIVE":
            return deployment
        if phase in TERMINAL_FAILURES:
            raise RuntimeError(f"DigitalOcean deployment entered terminal phase {phase}")
        if time.monotonic() >= deadline:
            raise RuntimeError(f"DigitalOcean deployment timed out in phase {phase or 'UNKNOWN'}")
        time.sleep(10)


def rollback(token: str, app_id: str, receipt: dict) -> None:
    rollback_id = require_id(receipt.get("rollback_deployment_id"), "rollback receipt")
    rollback_request = {"deployment_id": rollback_id, "skip_pin": True}
    validation = request_json(token, "POST", f"/apps/{app_id}/rollback/validate", rollback_request)
    if validation.get("valid") is not True or validation.get("error") not in (None, {}):
        raise RuntimeError("DigitalOcean rejected the exact rollback target")
    response = request_json(token, "POST", f"/apps/{app_id}/rollback", rollback_request)
    deployment = response.get("deployment")
    if not isinstance(deployment, dict):
        raise RuntimeError("DigitalOcean rollback response has no exact deployment")
    rollback_run_id = require_id(
        deployment.get("id") if isinstance(deployment, dict) else None,
        "rollback deployment",
    )
    rolled_back = wait_for_deployment(token, app_id, rollback_run_id)
    if spec_hash(validate_app_identity(rolled_back.get("spec"))) != receipt.get("rollback_spec_sha256"):
        raise RuntimeError("rollback activated a spec different from the proven rollback target")


def deploy(
    token: str,
    app_id: str,
    spec_path: Path,
    receipt_path: Path,
    expected_digest: str,
    expected_sha: str,
    expected_database_fingerprint: str,
) -> str:
    receipt = json.loads(receipt_path.read_text())
    if receipt.get("app_id") != app_id:
        raise RuntimeError("preflight receipt belongs to a different DigitalOcean app")
    if int(time.time()) - int(receipt.get("preflight_unix", 0)) > 1800:
        raise RuntimeError("preflight receipt is stale")
    if receipt.get("database_fingerprint") != expected_database_fingerprint:
        raise RuntimeError("preflight receipt database identity drifted")
    spec = validate_release_spec(json.loads(spec_path.read_text()), expected_digest, expected_sha)

    app = get_app(token, app_id)
    if app.get("pending_deployment") is not None:
        raise RuntimeError("DigitalOcean gained a pending deployment after preflight")
    active = app.get("active_deployment")
    if not isinstance(active, dict) or active.get("id") != receipt.get("rollback_deployment_id"):
        raise RuntimeError("DigitalOcean active deployment changed after preflight")
    validate_replacement_compatibility(app.get("spec"), spec)
    spec = hydrate_provider_values(spec, app.get("spec"))
    validate_release_spec(
        spec,
        expected_digest,
        expected_sha,
        allow_provider_values=True,
    )

    deployment_id = None
    activated = False
    try:
        update = request_json(
            token,
            "PUT",
            f"/apps/{app_id}",
            {"spec": spec},
            timeout=60,
        )
        updated_app = update.get("app")
        target = (
            matching_target_from_app(
                token,
                app_id,
                updated_app,
                receipt["rollback_deployment_id"],
                expected_digest,
                expected_sha,
            )
            if isinstance(updated_app, dict)
            else None
        )
        if target is None:
            target = matching_target_from_app(
                token,
                app_id,
                get_app(token, app_id),
                receipt["rollback_deployment_id"],
                expected_digest,
                expected_sha,
            )
        if target is None:
            raise RuntimeError("DigitalOcean update did not expose the exact created deployment")
        created, activated = target
        deployment_id = require_id(created.get("id"), "created deployment")
        receipt.update(
            {
                "target_deployment_id": deployment_id,
                "target_git_sha": expected_sha,
                "target_image_digest": expected_digest,
            }
        )
        write_receipt(receipt_path, receipt)

        if activated:
            validate_release_spec(
                created.get("spec"),
                expected_digest,
                expected_sha,
                allow_provider_values=True,
            )
        else:
            wait_for_deployment(
                token,
                app_id,
                deployment_id,
                expected_digest=expected_digest,
                expected_sha=expected_sha,
            )
            activated = True
        app = get_app(token, app_id)
        if app.get("active_deployment", {}).get("id") != deployment_id:
            raise RuntimeError("the exact created deployment is not active")
        validate_release_spec(
            app.get("active_deployment", {}).get("spec"),
            expected_digest,
            expected_sha,
            allow_provider_values=True,
        )
        verify_runtime(
            expected_sha,
            expected_database_fingerprint,
            receipt.get("migration_count"),
            receipt.get("migration_ledger_fingerprint"),
        )
    except Exception as release_error:
        try:
            recover_failed_release(
                token,
                app_id,
                receipt,
                expected_digest,
                expected_sha,
                deployment_id,
            )
        except Exception as recovery_error:
            raise RuntimeError(
                f"release failed ({release_error}); automatic recovery also failed ({recovery_error})"
            ) from recovery_error
        raise
    return deployment_id


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    sub = root.add_subparsers(dest="command", required=True)
    pre = sub.add_parser("preflight")
    pre.add_argument("--receipt", required=True, type=Path)
    pre.add_argument("--database-fingerprint", required=True)
    pre.add_argument("--migration-count", required=True, type=int)
    pre.add_argument("--migration-ledger-fingerprint", required=True)
    dep = sub.add_parser("deploy")
    dep.add_argument("--spec", required=True, type=Path)
    dep.add_argument("--receipt", required=True, type=Path)
    dep.add_argument("--digest", required=True)
    dep.add_argument("--sha", required=True)
    dep.add_argument("--database-fingerprint", required=True)
    roll = sub.add_parser("rollback")
    roll.add_argument("--receipt", required=True, type=Path)
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        token = required_env("DIGITALOCEAN_ACCESS_TOKEN")
        app_id = require_id(required_env("DIGITALOCEAN_APP_ID"), "DIGITALOCEAN_APP_ID")
        if args.command == "preflight":
            receipt = preflight(
                token,
                app_id,
                args.receipt,
                args.database_fingerprint,
                args.migration_count,
                args.migration_ledger_fingerprint,
            )
            print(f"[digitalocean-release] PASS rollback target {receipt['rollback_deployment_id']}")
        elif args.command == "deploy":
            deployment_id = deploy(
                token,
                app_id,
                args.spec,
                args.receipt,
                args.digest,
                args.sha,
                args.database_fingerprint,
            )
            print(f"[digitalocean-release] PASS active deployment {deployment_id}")
        else:
            receipt = json.loads(args.receipt.read_text())
            rollback(token, app_id, receipt)
            print("[digitalocean-release] PASS rollback active")
    except (RuntimeError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"[digitalocean-release] FAIL: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
