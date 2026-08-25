#!/usr/bin/env python3

import importlib.util
import io
import json
import tempfile
import time
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).with_name("digitalocean-production-release.py")
SPEC = importlib.util.spec_from_file_location("digitalocean_production_release", MODULE_PATH)
release = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(release)

DIGEST = f"sha256:{'a' * 64}"
GIT_SHA = "b" * 40
DATABASE_FINGERPRINT = "d" * 64
MIGRATION_LEDGER_FINGERPRINT = "e" * 64
APP_ID = "3654f979-16cb-4b7c-afae-9e89746ea5c6"
OLD_DEPLOYMENT_ID = "11111111-1111-1111-1111-111111111111"
NEW_DEPLOYMENT_ID = "22222222-2222-2222-2222-222222222222"


def target_spec(*, hydrated=False):
    spec = json.loads(Path(".do/app.yaml").read_text())
    spec["services"][0]["image"]["digest"] = DIGEST
    spec["services"][0]["image"]["registry_credentials"] = "pull-user:pull-token"
    for entry in spec["services"][0]["envs"]:
        if entry["key"] == "GIT_SHA":
            entry["value"] = GIT_SHA
        if hydrated and "value" not in entry:
            entry["value"] = f"EV[encrypted:{entry['key']}]"
    return spec


def current_spec():
    spec = target_spec(hydrated=True)
    service = spec["services"][0]
    service.pop("image")
    service["github"] = {
        "repo": "CleanExpo/RestoreAssist",
        "branch": "main",
        "deploy_on_push": False,
    }
    service["environment_slug"] = "node-js"
    service["build_command"] = "npm run build"
    service["run_command"] = "npm start"
    return spec


def app_with_active(spec, deployment_id=OLD_DEPLOYMENT_ID):
    return {
        "spec": spec,
        "pending_deployment": None,
        "active_deployment": {
            "id": deployment_id,
            "phase": "ACTIVE",
            "spec": spec,
        },
    }


def app_with_pending():
    app = app_with_active(current_spec())
    app["pending_deployment"] = {
        "id": NEW_DEPLOYMENT_ID,
        "phase": "DEPLOYING",
        "spec": target_spec(hydrated=True),
    }
    return app


def update_and_terminal_request(_token, method, _path, *_args, **_kwargs):
    if method == "PUT":
        return {"app": {"pending_deployment": app_with_pending()["pending_deployment"]}}
    if method == "GET":
        return {
            "deployment": {
                "id": NEW_DEPLOYMENT_ID,
                "phase": "CANCELED",
                "spec": target_spec(hydrated=True),
            }
        }
    raise AssertionError(f"unexpected request method {method}")


def timeout_then_terminal_request(token, method, path, *args, **kwargs):
    if method == "PUT":
        raise RuntimeError("update response timed out")
    return update_and_terminal_request(token, method, path, *args, **kwargs)


def write_inputs(directory):
    spec_path = Path(directory, "target.json")
    receipt_path = Path(directory, "preflight.json")
    spec_path.write_text(json.dumps(target_spec()))
    receipt_path.write_text(
        json.dumps(
            {
                "schema": 1,
                "app_id": APP_ID,
                "rollback_deployment_id": OLD_DEPLOYMENT_ID,
                "rollback_spec_sha256": release.spec_hash(current_spec()),
                "database_fingerprint": DATABASE_FINGERPRINT,
                "migration_count": 214,
                "migration_ledger_fingerprint": MIGRATION_LEDGER_FINGERPRINT,
                "preflight_unix": int(time.time()),
            }
        )
    )
    return spec_path, receipt_path


class DigitalOceanProductionReleaseTests(unittest.TestCase):
    def test_degraded_site_cannot_be_captured_as_a_rollback_target(self):
        with patch.object(
            release,
            "read_public_json",
            return_value={
                "status": "degraded",
                "checks": {
                    "database": {"status": "ok"},
                    "env": {"status": "degraded"},
                },
            },
        ):
            with self.assertRaisesRegex(RuntimeError, "not a healthy rollback target"):
                release.verify_rollback_target(
                    DATABASE_FINGERPRINT,
                    214,
                    MIGRATION_LEDGER_FINGERPRINT,
                )

    def test_provider_error_body_cannot_reflect_secrets_into_logs(self):
        error = urllib.error.HTTPError(
            "https://api.digitalocean.com/v2/apps/example",
            422,
            "unprocessable",
            {"x-request-id": "safe-request-id"},
            io.BytesIO(b'{"message":"pull-user:pull-token EV[encrypted:DATABASE_URL]"}'),
        )
        with patch.object(release.NO_REDIRECT_OPENER, "open", side_effect=error):
            with self.assertRaises(RuntimeError) as raised:
                release.request_json("token", "PUT", "/apps/example", {"spec": {}})
        message = str(raised.exception)
        self.assertIn("HTTP 422", message)
        self.assertIn("safe-request-id", message)
        self.assertNotIn("pull-token", message)
        self.assertNotIn("DATABASE_URL", message)

    def test_accepts_only_exact_digest_pinned_release_contract(self):
        release.validate_release_spec(target_spec(), DIGEST, GIT_SHA)
        for mutation in ("tag", "github", "run_command", "autoscaling"):
            candidate = target_spec()
            if mutation == "tag":
                candidate["services"][0]["image"].pop("digest")
                candidate["services"][0]["image"]["tag"] = "latest"
            else:
                candidate["services"][0][mutation] = "unreviewed"
            with self.assertRaises(RuntimeError, msg=mutation):
                release.validate_release_spec(candidate, DIGEST, GIT_SHA)

    def test_hydrates_every_secret_from_current_provider_spec(self):
        hydrated = release.hydrate_provider_values(target_spec(), current_spec())
        release.validate_release_spec(
            hydrated,
            DIGEST,
            GIT_SHA,
            allow_provider_values=True,
        )
        redacted = json.dumps(release.redacted_spec(hydrated))
        self.assertNotIn("EV[encrypted", redacted)
        self.assertNotIn("pull-token", redacted)

        missing = current_spec()
        missing["services"][0]["envs"] = [
            entry
            for entry in missing["services"][0]["envs"]
            if entry["key"] != "DATABASE_URL"
        ]
        with self.assertRaisesRegex(RuntimeError, "cannot preserve value for DATABASE_URL"):
            release.hydrate_provider_values(target_spec(), missing)

    def test_receipts_redact_unapproved_general_environment_values(self):
        spec = current_spec()
        spec["services"][0]["envs"].append(
            {
                "key": "UNREVIEWED_IDENTIFIER",
                "value": "plaintext-sensitive-value",
                "scope": "RUN_TIME",
                "type": "GENERAL",
            }
        )
        redacted = release.redacted_spec(spec)
        entry = next(
            item
            for item in redacted["services"][0]["envs"]
            if item["key"] == "UNREVIEWED_IDENTIFIER"
        )
        self.assertEqual(entry["value"], "[REDACTED]")
        self.assertNotIn("plaintext-sensitive-value", json.dumps(redacted))

    def test_full_spec_replacement_rejects_unreviewed_live_controls(self):
        release.validate_replacement_compatibility(current_spec(), target_spec())
        with_ingress = current_spec()
        with_ingress["ingress"] = {"rules": []}
        with self.assertRaisesRegex(RuntimeError, "top-level controls: ingress"):
            release.validate_replacement_compatibility(with_ingress, target_spec())

        with_termination = current_spec()
        with_termination["services"][0]["termination"] = {"grace_period_seconds": 300}
        with self.assertRaisesRegex(RuntimeError, "web service has unreviewed controls: termination"):
            release.validate_replacement_compatibility(with_termination, target_spec())

        with_extra_env = current_spec()
        with_extra_env["services"][0]["envs"].append({"key": "UNREVIEWED", "value": "x"})
        with self.assertRaisesRegex(RuntimeError, "replacement-safe"):
            release.validate_replacement_compatibility(with_extra_env, target_spec())

    def test_cancels_exact_created_deployment_before_activation_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            spec_path, receipt_path = write_inputs(directory)
            active = app_with_active(current_spec())
            with (
                patch.object(
                    release,
                    "get_app",
                    side_effect=[active, app_with_pending(), active],
                ),
                patch.object(
                    release,
                    "request_json",
                    side_effect=update_and_terminal_request,
                ) as request,
                patch.object(
                    release,
                    "wait_for_deployment",
                    side_effect=RuntimeError("build failed"),
                ),
                patch.object(release, "cancel_deployment") as cancel,
                patch.object(release, "rollback") as rollback,
            ):
                with self.assertRaisesRegex(RuntimeError, "build failed"):
                    release.deploy(
                        "token",
                        APP_ID,
                        spec_path,
                        receipt_path,
                        DIGEST,
                        GIT_SHA,
                        DATABASE_FINGERPRINT,
                    )
                cancel.assert_called_once_with("token", APP_ID, NEW_DEPLOYMENT_ID)
                rollback.assert_not_called()
                put = next(call for call in request.call_args_list if call.args[1] == "PUT")
                self.assertEqual(put.args[:3], ("token", "PUT", f"/apps/{APP_ID}"))

    def test_rolls_back_exact_previous_deployment_after_runtime_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            spec_path, receipt_path = write_inputs(directory)
            old = app_with_active(current_spec())
            new = app_with_active(target_spec(hydrated=True), NEW_DEPLOYMENT_ID)
            with (
                patch.object(release, "get_app", side_effect=[old, new, new]),
                patch.object(
                    release,
                    "request_json",
                    return_value={
                        "app": {
                            "pending_deployment": app_with_pending()["pending_deployment"],
                        }
                    },
                ),
                patch.object(
                    release,
                    "wait_for_deployment",
                    return_value={
                        "id": NEW_DEPLOYMENT_ID,
                        "phase": "ACTIVE",
                        "spec": target_spec(hydrated=True),
                    },
                ),
                patch.object(
                    release,
                    "verify_runtime",
                    side_effect=RuntimeError("smoke failed"),
                ),
                patch.object(release, "cancel_deployment") as cancel,
                patch.object(release, "rollback") as rollback,
            ):
                with self.assertRaisesRegex(RuntimeError, "smoke failed"):
                    release.deploy(
                        "token",
                        APP_ID,
                        spec_path,
                        receipt_path,
                        DIGEST,
                        GIT_SHA,
                        DATABASE_FINGERPRINT,
                    )
                rollback.assert_called_once()
                self.assertEqual(
                    rollback.call_args.args[2]["rollback_deployment_id"],
                    OLD_DEPLOYMENT_ID,
                )
                cancel.assert_not_called()

    def test_put_timeout_discovers_and_cancels_exact_pending_target(self):
        with tempfile.TemporaryDirectory() as directory:
            spec_path, receipt_path = write_inputs(directory)
            old = app_with_active(current_spec())
            with (
                patch.object(
                    release,
                    "get_app",
                    side_effect=[old, app_with_pending(), old],
                ),
                patch.object(
                    release,
                    "request_json",
                    side_effect=timeout_then_terminal_request,
                ),
                patch.object(release, "cancel_deployment") as cancel,
                patch.object(release, "rollback") as rollback,
            ):
                with self.assertRaisesRegex(RuntimeError, "update response timed out"):
                    release.deploy(
                        "token",
                        APP_ID,
                        spec_path,
                        receipt_path,
                        DIGEST,
                        GIT_SHA,
                        DATABASE_FINGERPRINT,
                    )
                cancel.assert_called_once_with("token", APP_ID, NEW_DEPLOYMENT_ID)
                rollback.assert_not_called()

    def test_cancel_race_falls_back_to_exact_rollback_after_activation(self):
        with tempfile.TemporaryDirectory() as directory:
            spec_path, receipt_path = write_inputs(directory)
            old = app_with_active(current_spec())
            new = app_with_active(target_spec(hydrated=True), NEW_DEPLOYMENT_ID)
            with (
                patch.object(
                    release,
                    "get_app",
                    side_effect=[old, app_with_pending(), new],
                ),
                patch.object(
                    release,
                    "request_json",
                    return_value={
                        "app": {
                            "pending_deployment": app_with_pending()["pending_deployment"],
                        }
                    },
                ),
                patch.object(
                    release,
                    "wait_for_deployment",
                    side_effect=RuntimeError("activation timeout"),
                ),
                patch.object(
                    release,
                    "cancel_deployment",
                    side_effect=RuntimeError("already active"),
                ),
                patch.object(release, "rollback") as rollback,
            ):
                with self.assertRaisesRegex(RuntimeError, "activation timeout"):
                    release.deploy(
                        "token",
                        APP_ID,
                        spec_path,
                        receipt_path,
                        DIGEST,
                        GIT_SHA,
                        DATABASE_FINGERPRINT,
                    )
                rollback.assert_called_once()
                self.assertEqual(
                    rollback.call_args.args[2]["rollback_deployment_id"],
                    OLD_DEPLOYMENT_ID,
                )

    def test_rollback_is_validated_and_does_not_pin_the_app(self):
        receipt = {
            "rollback_deployment_id": OLD_DEPLOYMENT_ID,
            "rollback_spec_sha256": release.spec_hash(current_spec()),
        }
        rollback_run_id = "33333333-3333-3333-3333-333333333333"
        with (
            patch.object(
                release,
                "request_json",
                side_effect=[
                    {"valid": True},
                    {"deployment": {"id": rollback_run_id}},
                ],
            ) as request,
            patch.object(
                release,
                "wait_for_deployment",
                return_value={"id": rollback_run_id, "phase": "ACTIVE", "spec": current_spec()},
            ),
        ):
            release.rollback("token", APP_ID, receipt)
        expected_body = {"deployment_id": OLD_DEPLOYMENT_ID, "skip_pin": True}
        self.assertEqual(request.call_args_list[0].args[3], expected_body)
        self.assertEqual(request.call_args_list[1].args[3], expected_body)


if __name__ == "__main__":
    unittest.main()
