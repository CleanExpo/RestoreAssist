#!/usr/bin/env python3
"""Fail-closed production deployment parity for DigitalOcean App Platform.

RestoreAssist production is served by DigitalOcean App Platform. The active
deployment must be ACTIVE and every source-backed production component must
report the expected Git commit. Unknown credentials, missing component SHAs,
in-progress deployments and API failures are verification failures.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


API_BASE = "https://api.digitalocean.com/v2"
COMPONENT_GROUPS = ("services", "static_sites", "workers", "functions", "jobs")
PRODUCTION_HEALTH_PATH = "/api/health"
CANONICAL_IMAGE_KEYS = {
    "registry_type",
    "registry",
    "repository",
    "digest",
    "deploy_on_push",
}
CANONICAL_COMPONENT_KEYS = {"image", "health_check"}


class TerminalDeploymentError(RuntimeError):
    """A deployment state that cannot become ready by waiting."""


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Never forward the DigitalOcean bearer token to a redirected host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_NO_REDIRECT_OPENER = urllib.request.build_opener(NoRedirectHandler())


def open_digitalocean(request: urllib.request.Request, timeout: int):
    return _NO_REDIRECT_OPENER.open(request, timeout=timeout)


def env_required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if value:
        return value
    raise RuntimeError(f"missing required environment variable: {name}")


def expected_sha() -> str:
    override = os.environ.get("GIT_HEAD_SHA", "").strip()
    if override:
        return override
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def get_app(token: str, app_id: str) -> dict:
    url = f"{API_BASE}/apps/{app_id}"
    request = urllib.request.Request(url)
    request.add_header("Authorization", f"Bearer {token}")
    request.add_header("Accept", "application/json")
    try:
        with open_digitalocean(request, timeout=20) as response:
            if response.geturl() != url:
                raise RuntimeError(
                    f"DigitalOcean API redirected: expected {url!r}, observed {response.geturl()!r}"
                )
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"DigitalOcean API HTTP {error.code}: {body}") from error
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(f"DigitalOcean API request failed: {error}") from error


def validate_migration_health_payload(
    payload: object, expected_logical_database_fingerprint: str | None = None
) -> dict:
    if not isinstance(payload, dict):
        raise RuntimeError("migration health response is not a JSON object")
    if payload.get("status") != "ok":
        raise RuntimeError(
            f"migration health status is not ok: {payload.get('status')!r}"
        )
    counts = payload.get("counts")
    required_counts = ("total", "applied", "failed", "rolled_back")
    if not isinstance(counts, dict) or any(
        not isinstance(counts.get(name), int) or isinstance(counts.get(name), bool)
        for name in required_counts
    ):
        raise RuntimeError(
            "migration health response must contain numeric total, applied, failed and rolled_back counts"
        )
    if counts["total"] <= 0:
        raise RuntimeError("migration health response reports an empty ledger")
    if counts["applied"] != counts["total"]:
        raise RuntimeError("migration health applied count does not equal total count")
    if counts["failed"] != 0 or counts["rolled_back"] != 0:
        raise RuntimeError("migration health response reports failed or rolled-back migrations")
    fingerprint = payload.get("databaseFingerprint")
    if (
        not isinstance(fingerprint, str)
        or len(fingerprint) != 64
        or any(character not in "0123456789abcdef" for character in fingerprint.lower())
    ):
        raise RuntimeError("migration health response has no valid database fingerprint")
    if (
        expected_logical_database_fingerprint is not None
        and fingerprint.lower() != expected_logical_database_fingerprint.lower()
    ):
        raise RuntimeError("migration health database fingerprint does not match migration target")
    return payload


def validate_runtime_health_payload(payload: object, expected_deployment_sha: str) -> dict:
    if not isinstance(payload, dict):
        raise RuntimeError("runtime health response is not a JSON object")
    if payload.get("status") != "ok":
        raise RuntimeError(f"runtime health status is not ok: {payload.get('status')!r}")
    checks = payload.get("checks")
    if not isinstance(checks, dict):
        raise RuntimeError("runtime health response has no checks object")
    for required_check in ("database", "env"):
        check = checks.get(required_check)
        if not isinstance(check, dict) or check.get("status") != "ok":
            raise RuntimeError(
                f"runtime health {required_check} check is not ok: "
                f"{check.get('status') if isinstance(check, dict) else '<missing>'!r}"
            )
    observed_sha = payload.get("deploymentSha")
    if not shas_match(expected_deployment_sha, observed_sha if isinstance(observed_sha, str) else ""):
        raise RuntimeError(
            f"runtime health deployment SHA mismatch: expected {expected_deployment_sha}, observed {observed_sha!r}"
        )
    return payload


def verify_runtime_health(base_url: str, expected_deployment_sha: str) -> dict:
    url = f"{base_url.rstrip('/')}{PRODUCTION_HEALTH_PATH}"
    request = urllib.request.Request(url)
    request.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            final_url = response.geturl()
            if final_url != url:
                raise RuntimeError(
                    f"runtime health redirected: expected {url!r}, observed {final_url!r}"
                )
            content_type = response.headers.get("Content-Type", "")
            if response.status != 200:
                raise RuntimeError(f"runtime health returned HTTP {response.status}")
            if "application/json" not in content_type.lower():
                raise RuntimeError(
                    f"runtime health returned non-JSON content type: {content_type or '<missing>'}"
                )
            cache_control = response.headers.get("Cache-Control", "")
            cache_directives = {
                directive.strip().lower()
                for directive in cache_control.split(",")
                if directive.strip()
            }
            if "no-store" not in cache_directives:
                raise RuntimeError("runtime health response is not marked Cache-Control: no-store")
            payload = json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"runtime health returned HTTP {error.code}") from error
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(f"runtime health request failed: {error}") from error
    return validate_runtime_health_payload(payload, expected_deployment_sha)


def verify_migration_health(
    base_url: str, expected_logical_database_fingerprint: str | None = None
) -> dict:
    url = f"{base_url.rstrip('/')}/api/health/migrations"
    request = urllib.request.Request(url)
    request.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            final_url = response.geturl()
            if final_url != url:
                raise RuntimeError(
                    f"migration health redirected: expected {url!r}, observed {final_url!r}"
                )
            content_type = response.headers.get("Content-Type", "")
            if response.status != 200:
                raise RuntimeError(f"migration health returned HTTP {response.status}")
            if "application/json" not in content_type.lower():
                raise RuntimeError(
                    f"migration health returned non-JSON content type: {content_type or '<missing>'}"
                )
            cache_control = response.headers.get("Cache-Control", "")
            cache_directives = {
                directive.strip().lower()
                for directive in cache_control.split(",")
                if directive.strip()
            }
            if "no-store" not in cache_directives:
                raise RuntimeError("migration health response is not marked Cache-Control: no-store")
            payload = json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"migration health returned HTTP {error.code}") from error
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(f"migration health request failed: {error}") from error
    return validate_migration_health_payload(payload, expected_logical_database_fingerprint)


def compare_component_contract(
    observed: object,
    expected: object,
    location: str,
) -> None:
    if isinstance(expected, dict):
        if not isinstance(observed, dict):
            raise RuntimeError(
                f"DigitalOcean {location} contract mismatch: expected object, observed {type(observed).__name__}"
            )
        allowed_extras = set()
        if location.endswith("]") and expected.get("type") == "SECRET":
            # DigitalOcean may return an opaque/redacted secret value. Its
            # presence is not comparable, but every other env field is exact.
            allowed_extras.add("value")
        extra_keys = set(observed) - set(expected) - allowed_extras
        if extra_keys:
            raise RuntimeError(
                f"DigitalOcean {location} has unexpected fields: {sorted(extra_keys)!r}"
            )
        for key, value in expected.items():
            if key not in observed:
                raise RuntimeError(f"DigitalOcean {location}.{key} is missing")
            compare_component_contract(observed[key], value, f"{location}.{key}")
        return
    if isinstance(expected, list):
        if not isinstance(observed, list):
            raise RuntimeError(
                f"DigitalOcean {location} contract mismatch: expected list, observed {type(observed).__name__}"
            )
        if location.endswith(".envs"):
            expected_by_key = {
                entry.get("key"): entry
                for entry in expected
                if isinstance(entry, dict) and isinstance(entry.get("key"), str)
            }
            observed_by_key = {
                entry.get("key"): entry
                for entry in observed
                if isinstance(entry, dict) and isinstance(entry.get("key"), str)
            }
            if len(expected_by_key) != len(expected) or len(observed_by_key) != len(observed):
                raise RuntimeError(f"DigitalOcean {location} contains invalid or duplicate env keys")
            if expected_by_key.keys() != observed_by_key.keys():
                raise RuntimeError(
                    f"DigitalOcean {location} key set mismatch: expected {sorted(expected_by_key)!r}, observed {sorted(observed_by_key)!r}"
                )
            for key, contract in expected_by_key.items():
                compare_component_contract(
                    observed_by_key[key], contract, f"{location}[{key}]"
                )
            return
        if observed != expected:
            raise RuntimeError(
                f"DigitalOcean {location} mismatch: expected {expected!r}, observed {observed!r}"
            )
        return
    if observed != expected:
        raise RuntimeError(
            f"DigitalOcean {location} mismatch: expected {expected!r}, observed {observed!r}"
        )


def validate_production_component_policy(expected_components: object) -> dict:
    """Reject a caller-supplied contract that weakens production safety."""
    if not isinstance(expected_components, dict) or not expected_components:
        raise RuntimeError("EXPECTED_COMPONENTS_JSON must be a non-empty object")
    services = expected_components.get("services")
    web_contract = services.get("web") if isinstance(services, dict) else None
    if not isinstance(web_contract, dict):
        raise RuntimeError("production component contract must contain services/web")
    source_component_count = 0
    for group, components in expected_components.items():
        if group not in COMPONENT_GROUPS or not isinstance(components, dict):
            raise RuntimeError(f"invalid production component group: {group!r}")
        for name, contract in components.items():
            if not isinstance(contract, dict):
                raise RuntimeError(f"production component {group}/{name} contract is not an object")
            source_keys = [
                key for key in ("image", "github", "git", "gitlab", "bitbucket")
                if key in contract
            ]
            if len(source_keys) != 1:
                raise RuntimeError(
                    f"production component {group}/{name} must have exactly one source"
                )
            source_component_count += 1
            if source_keys[0] != "image":
                raise RuntimeError(
                    f"production component {group}/{name} uses mutable {source_keys[0]} source; "
                    "a digest-pinned image is required"
                )
            allowed_component_keys = (
                CANONICAL_COMPONENT_KEYS if group == "services" and name == "web" else {"image"}
            )
            unexpected_component_keys = set(contract) - allowed_component_keys
            if unexpected_component_keys:
                raise RuntimeError(
                    f"production component {group}/{name} contract has unapproved fields: "
                    f"{sorted(unexpected_component_keys)!r}"
                )
            image = contract["image"]
            if not isinstance(image, dict):
                raise RuntimeError(
                    f"production component {group}/{name} image source is not an object"
                )
            unexpected_image_keys = set(image) - CANONICAL_IMAGE_KEYS
            missing_image_keys = CANONICAL_IMAGE_KEYS - set(image)
            if "tag" in unexpected_image_keys:
                raise RuntimeError(
                    f"production component {group}/{name} image source must disable push deploy and omit tags"
                )
            if unexpected_image_keys or missing_image_keys:
                raise RuntimeError(
                    f"production component {group}/{name} image source must contain exactly "
                    f"{sorted(CANONICAL_IMAGE_KEYS)!r}; missing={sorted(missing_image_keys)!r}, "
                    f"unapproved={sorted(unexpected_image_keys)!r}"
                )
            if image.get("registry_type") != "GHCR" or image.get("registry") != "ghcr.io":
                raise RuntimeError(
                    f"production component {group}/{name} image source must use canonical GHCR registry"
                )
            repository = image.get("repository")
            if (
                not isinstance(repository, str)
                or not repository
                or repository != repository.lower()
                or repository.startswith("/")
                or repository.endswith("/")
                or "//" in repository
                or any(character not in "abcdefghijklmnopqrstuvwxyz0123456789._/-" for character in repository)
            ):
                raise RuntimeError(
                    f"production component {group}/{name} image repository is not canonical lowercase"
                )
            digest = image.get("digest") if isinstance(image, dict) else None
            if (
                not isinstance(digest, str)
                or not digest.startswith("sha256:")
                or len(digest) != 71
                or any(character not in "0123456789abcdef" for character in digest[7:])
            ):
                raise RuntimeError(
                    f"production component {group}/{name} image source has no full sha256 digest"
                )
            image_push = image.get("deploy_on_push")
            if image_push != {"enabled": False}:
                raise RuntimeError(
                    f"production component {group}/{name} image source must exactly disable push deploy"
                )
            if group == "services" and name == "web":
                health_check = contract.get("health_check")
                if health_check != {"http_path": PRODUCTION_HEALTH_PATH}:
                    raise RuntimeError(
                        "production services/web health_check.http_path contract must exactly equal "
                        f"{{'http_path': {PRODUCTION_HEALTH_PATH!r}}}"
                    )
    if source_component_count == 0:
        raise RuntimeError("production component contract has no source-backed components")
    return expected_components


def verify_spec_components(
    spec: dict,
    expected_repository: str,
    expected_branch: str,
    expected_components: dict,
    label: str,
) -> None:
    github_sources = []
    source_component_count = 0
    observed_components = {}
    for group in COMPONENT_GROUPS:
        entries = spec.get(group) or []
        if not isinstance(entries, list):
            raise RuntimeError(f"DigitalOcean {label} {group} is not a list")
        for component in entries:
            if not isinstance(component, dict):
                raise RuntimeError(f"DigitalOcean {label} {group} contains a non-object component")
            github = component.get("github")
            image = component.get("image")
            component_name = str(component.get("name") or "<unnamed>")
            observed_components.setdefault(group, {})[component_name] = component
            if isinstance(github, dict):
                source_component_count += 1
                github_sources.append(
                    (
                        f"{group}/{component_name}",
                        github.get("repo"),
                        github.get("branch"),
                    )
                )
            elif isinstance(image, dict):
                source_component_count += 1
    if source_component_count == 0:
        raise RuntimeError(f"DigitalOcean {label} exposes no source-backed components")
    mismatches = [
        f"{name}={repo!r}@{branch!r}"
        for name, repo, branch in github_sources
        if repo != expected_repository or branch != expected_branch
    ]
    if mismatches:
        raise RuntimeError(
            f"DigitalOcean {label} GitHub source mismatch: expected "
            f"{expected_repository}@{expected_branch}; " + ", ".join(mismatches)
        )
    expected_names = {
        f"{group}/{name}"
        for group, components in expected_components.items()
        for name in components
    }
    observed_names = {
        f"{group}/{name}"
        for group, components in observed_components.items()
        for name in components
    }
    if observed_names != expected_names:
        raise RuntimeError(
            f"DigitalOcean {label} canonical component set mismatch: "
            f"expected {sorted(expected_names)!r}, observed {sorted(observed_names)!r}"
        )
    for group, components in expected_components.items():
        for name, contract in components.items():
            observed = observed_components[group][name]
            extra_fields = set(observed) - (set(contract) | {"name"})
            if extra_fields:
                raise RuntimeError(
                    f"DigitalOcean {label} {group}/{name} has unexpected fields: {sorted(extra_fields)!r}"
                )
            compare_component_contract(
                {key: value for key, value in observed.items() if key != "name"},
                contract,
                f"{label} {group}/{name}",
            )


def verify_app_identity(
    payload: dict,
    expected_name: str,
    expected_repository: str,
    expected_branch: str,
    expected_domain: str,
    expected_components: dict,
    expected_region: str | None = None,
) -> None:
    app = payload.get("app")
    if not isinstance(app, dict):
        raise RuntimeError("DigitalOcean response has no app object")
    spec = app.get("spec")
    if not isinstance(spec, dict):
        raise RuntimeError("DigitalOcean app response has no spec")
    if spec.get("name") != expected_name:
        raise RuntimeError(
            f"DigitalOcean app name mismatch: expected {expected_name!r}, observed {spec.get('name')!r}"
        )
    if expected_region is not None and spec.get("region") != expected_region:
        raise RuntimeError(
            f"DigitalOcean app region mismatch: expected {expected_region!r}, observed {spec.get('region')!r}"
        )
    allowed_spec_keys = {"name", "region", "domains", *COMPONENT_GROUPS}
    unexpected_spec_keys = set(spec) - allowed_spec_keys
    if unexpected_spec_keys:
        raise RuntimeError(
            "DigitalOcean app spec has unapproved top-level fields: "
            f"{sorted(unexpected_spec_keys)!r}"
        )

    domains = spec.get("domains") or []
    if not isinstance(domains, list):
        raise RuntimeError("DigitalOcean app spec domains is not a list")
    expected_domains = [{"domain": expected_domain, "type": "PRIMARY"}]
    observed_domains = domains
    if observed_domains != expected_domains:
        raise RuntimeError(
            "DigitalOcean app domain mismatch: expected exactly "
            f"{expected_domains!r}, observed {observed_domains!r}"
        )
    verify_spec_components(
        spec,
        expected_repository,
        expected_branch,
        expected_components,
        "desired app spec",
    )


def verify_production_origin(base_url: str, expected_host: str) -> str:
    parsed = urllib.parse.urlsplit(base_url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != expected_host
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port is not None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise RuntimeError(
            f"production base URL must be exactly https://{expected_host}; observed {base_url!r}"
        )
    return f"https://{expected_host}"


def active_component_shas(
    payload: dict,
    expected_components: dict | None = None,
    expected_repository: str | None = None,
    expected_branch: str | None = None,
    expected_name: str | None = None,
    expected_domain: str | None = None,
    expected_region: str | None = None,
    expected_deployment_id: str | None = None,
) -> tuple[str, list[tuple[str, str, str]]]:
    app = payload.get("app")
    if not isinstance(app, dict):
        raise RuntimeError("DigitalOcean response has no app object")
    deployment = app.get("active_deployment")
    if not isinstance(deployment, dict):
        raise RuntimeError("DigitalOcean app has no active deployment")
    if expected_deployment_id is not None and deployment.get("id") != expected_deployment_id:
        raise RuntimeError(
            "active deployment id mismatch: "
            f"expected {expected_deployment_id!r}, observed {deployment.get('id')!r}"
        )
    pending = app.get("pending_deployment")
    if pending is not None:
        if not isinstance(pending, dict):
            raise RuntimeError("DigitalOcean pending deployment is not an object")
        pending_phase = str(pending.get("phase") or "UNKNOWN")
        message = f"DigitalOcean app still has a pending deployment in phase {pending_phase}"
        if pending_phase in {"ERROR", "CANCELED", "SUPERSEDED"}:
            raise TerminalDeploymentError(message)
        raise RuntimeError(message)
    phase = str(deployment.get("phase") or "")
    if expected_components is not None:
        deployment_spec = deployment.get("spec")
        if not isinstance(deployment_spec, dict):
            raise RuntimeError("active deployment exposes no deployment spec")
        if expected_repository is None or expected_branch is None:
            raise RuntimeError("active deployment contract lacks expected repository or branch")
        if expected_name is not None and expected_domain is not None:
            verify_app_identity(
                {"app": {"spec": deployment_spec}},
                expected_name,
                expected_repository,
                expected_branch,
                expected_domain,
                expected_components,
                expected_region,
            )
        else:
            verify_spec_components(
                deployment_spec,
                expected_repository,
                expected_branch,
                expected_components,
                "active deployment spec",
            )
    components: list[tuple[str, str, str]] = []
    missing_sha: list[str] = []
    spec = app.get("spec")
    if not isinstance(spec, dict):
        raise RuntimeError("DigitalOcean app response has no spec")
    for group in COMPONENT_GROUPS:
        deployed_entries = deployment.get(group) or []
        if not isinstance(deployed_entries, list):
            raise RuntimeError(f"active deployment {group} is not a list")
        for component in deployed_entries:
            if not isinstance(component, dict):
                raise RuntimeError(f"active deployment {group} contains a non-object component")
            name = str(component.get("name") or "<unnamed>")
            sha = str(component.get("source_commit_hash") or "").strip()
            if sha:
                components.append((group, name, sha))
            else:
                missing_sha.append(f"{group}/{name}")
        spec_entries = spec.get(group) or []
        if not isinstance(spec_entries, list):
            raise RuntimeError(f"DigitalOcean app spec {group} is not a list")
        expected_names = (
            set((expected_components or {}).get(group, {}))
            if expected_components is not None
            else {
                str(component.get("name") or "<unnamed>")
                for component in spec_entries
                if isinstance(component, dict)
                and isinstance(component.get("github"), dict)
            }
        )
        observed_names = {
            name for observed_group, name, _ in components if observed_group == group
        } | {
            entry.split("/", 1)[1]
            for entry in missing_sha
            if entry.startswith(f"{group}/")
        }
        if expected_names != observed_names:
            raise RuntimeError(
                f"active deployment {group} component set mismatch: "
                f"expected {sorted(expected_names)!r}, observed {sorted(observed_names)!r}"
            )
    if missing_sha:
        raise RuntimeError(
            "active deployment components expose no source_commit_hash: "
            + ", ".join(missing_sha)
        )
    if not components:
        raise RuntimeError("active deployment exposes no source_commit_hash")
    return phase, components


def shas_match(expected: str, observed: str) -> bool:
    expected = expected.lower()
    observed = observed.lower()
    return (
        len(expected) == 40
        and len(observed) == 40
        and all(character in "0123456789abcdef" for character in expected + observed)
        and expected == observed
    )


def wait_for_active_components(
    token: str,
    app_id: str,
    wanted: str,
    expected_name: str,
    expected_repository: str,
    expected_branch: str,
    expected_domain: str,
    expected_components: dict,
    expected_region: str | None = None,
    expected_deployment_id: str | None = None,
    timeout_seconds: int = 300,
) -> tuple[str, list[tuple[str, str, str]]]:
    deadline = time.monotonic() + timeout_seconds
    last_error: RuntimeError | None = None
    while True:
        try:
            payload = get_app(token, app_id)
            verify_app_identity(
                payload,
                expected_name,
                expected_repository,
                expected_branch,
                expected_domain,
                expected_components,
                expected_region,
            )
            phase, components = active_component_shas(
                payload,
                expected_components,
                expected_repository,
                expected_branch,
                expected_name,
                expected_domain,
                expected_region,
                expected_deployment_id,
            )
            last_error = None
            if phase == "ACTIVE" and all(
                shas_match(wanted, observed) for _, _, observed in components
            ):
                return phase, components
        except TerminalDeploymentError:
            raise
        except RuntimeError as error:
            last_error = error
        if time.monotonic() >= deadline:
            if last_error is not None:
                raise last_error
            return phase, components
        print(
            "DigitalOcean active deployment has not reached the expected SHA; "
            "waiting 15 seconds..."
        )
        time.sleep(15)


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv not in ([], ["--spec-only"]):
        print("usage: verify_deploy.py [--spec-only]", file=sys.stderr)
        return 2
    # A digest alone does not prove which repository revision produced an
    # image. Until a separately signed registry/build receipt is verified here
    # and bound to repository + full Git SHA + digest, this executable is a
    # fail-closed design scaffold only. Do not let helper-level spec checks be
    # mistaken for an actionable production release verifier.
    print(
        "[FAIL] Production image verification is blocked: no independent signed "
        "build provenance receipt binds image digest to repository and exact Git SHA.",
        file=sys.stderr,
    )
    return 1
    spec_only = argv == ["--spec-only"]
    try:
        token = env_required("DIGITALOCEAN_ACCESS_TOKEN")
        app_id = env_required("DIGITALOCEAN_APP_ID")
        expected_app_name = env_required("EXPECTED_APP_NAME")
        expected_repository = env_required("EXPECTED_REPOSITORY")
        expected_branch = env_required("EXPECTED_BRANCH")
        expected_production_host = env_required("EXPECTED_PRODUCTION_HOST")
        expected_region = env_required("EXPECTED_REGION")
        expected_components_raw = env_required("EXPECTED_COMPONENTS_JSON")
        try:
            expected_components = json.loads(expected_components_raw)
        except json.JSONDecodeError as error:
            raise RuntimeError(f"EXPECTED_COMPONENTS_JSON is invalid: {error}") from error
        expected_components = validate_production_component_policy(expected_components)
        if spec_only:
            verify_app_identity(
                get_app(token, app_id),
                expected_app_name,
                expected_repository,
                expected_branch,
                expected_production_host,
                expected_components,
                expected_region,
            )
            print(
                "[PASS] DigitalOcean desired app spec uses a digest-pinned source "
                "and the database/environment health endpoint."
            )
            return 0
        production_base_url = env_required("PRODUCTION_BASE_URL")
        expected_deployment_id = env_required("EXPECTED_DEPLOYMENT_ID")
        expected_logical_database_fingerprint = env_required("EXPECTED_DATABASE_FINGERPRINT")
        production_base_url = verify_production_origin(
            production_base_url, expected_production_host
        )
        wanted = expected_sha()
        phase, components = wait_for_active_components(
            token,
            app_id,
            wanted,
            expected_app_name,
            expected_repository,
            expected_branch,
            expected_production_host,
            expected_components,
            expected_region,
            expected_deployment_id,
        )
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f"[FAIL] Production parity unproven: {error}", file=sys.stderr)
        return 1

    print(f"Expected Git SHA: {wanted}")
    print(f"DigitalOcean active deployment phase: {phase}")
    if phase != "ACTIVE":
        print(f"[FAIL] Active deployment is not ACTIVE: {phase or '<missing>'}", file=sys.stderr)
        return 1

    mismatches = []
    for group, name, observed in components:
        marker = "PASS" if shas_match(wanted, observed) else "FAIL"
        print(f"{marker} {group}/{name}: {observed}")
        if marker == "FAIL":
            mismatches.append(f"{group}/{name}={observed}")

    if mismatches:
        print(
            f"[FAIL] Production deployment SHA drift: expected {wanted}; "
            + ", ".join(mismatches),
            file=sys.stderr,
        )
        return 1

    try:
        runtime_health = verify_runtime_health(production_base_url, wanted)
        migration_health = verify_migration_health(
            production_base_url, expected_logical_database_fingerprint
        )
    except RuntimeError as error:
        print(f"[FAIL] Production runtime health unproven: {error}", file=sys.stderr)
        return 1

    print("[PASS] DigitalOcean production deployment is ACTIVE at the expected SHA.")
    print(
        "[PASS] Public runtime health reports database=ok and env=ok "
        f"at deployment {runtime_health['deploymentSha']}."
    )
    print(
        "[PASS] Public migration health is JSON status=ok "
        f"with {migration_health['counts']['total']} migration(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
