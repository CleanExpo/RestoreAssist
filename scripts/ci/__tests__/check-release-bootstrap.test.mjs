import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { findReleaseBootstrapViolations } from "../check-release-bootstrap.mjs";

const PIN = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const APPROVED_ENV = [
  { key: "NODE_ENV", value: "production" },
  { key: "ALLOWED_APP_HOSTS", value: "restoreassist.app,www.restoreassist.app", scope: "RUN_TIME", type: "GENERAL" },
  { key: "GIT_SHA", value: "${_self.COMMIT_HASH}", scope: "RUN_AND_BUILD_TIME", type: "GENERAL" },
  ...["CREDENTIAL_ENCRYPTION_KEY", "NEXTAUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "DATABASE_URL", "TENANT_DATABASE_HOST_ALLOWLIST", "ANTHROPIC_API_KEY", "PILOT_TESTER_JUDGE_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "CLOUDINARY_URL", "XERO_WEBHOOK_KEY", "GITHUB_WEBHOOK_SECRET", "MAILTRAP_API_KEY", "CRON_SECRET", "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"]
    .map((key) => ({ key, scope: "RUN_TIME", type: "SECRET" })),
  { key: "NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID", scope: "RUN_AND_BUILD_TIME", type: "SECRET" },
  { key: "TENANT_DATABASE_PROVISIONING_ENABLED", value: "false", scope: "RUN_TIME", type: "GENERAL" },
  { key: "NEXTAUTH_URL", value: "https://restoreassist.app", scope: "RUN_TIME", type: "GENERAL" },
  { key: "SENDER_EMAIL", scope: "RUN_TIME", type: "GENERAL" },
  { key: "ASC_API_KEY_ID", scope: "RUN_TIME", type: "GENERAL" },
  { key: "ASC_ISSUER_ID", scope: "RUN_TIME", type: "GENERAL" },
];

function fixture({ packageManager, packageLock = true, pnpmLock = false, uses = `actions/checkout@${PIN}`, workflowCommand = "node --test", runtimeCommand, manifestDependencies = {}, lockDependencies = manifestDependencies, overrides, iosVersions, serviceImage, providerBuild, providerRun, packageScripts = {}, shellFiles = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "restoreassist-release-bootstrap-"));
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  const manifest = { name: "fixture", dependencies: manifestDependencies };
  if (packageManager) manifest.packageManager = packageManager;
  if (overrides) manifest.overrides = overrides;
  manifest.scripts = { test: workflowCommand, postinstall: "prisma generate", ...packageScripts };
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(manifest),
  );
  writeFileSync(join(root, ".npmrc"), readFileSync(".npmrc"));
  if (packageLock) {
    writeFileSync(
      join(root, "package-lock.json"),
      JSON.stringify({
        name: "fixture",
        lockfileVersion: 3,
        packages: {
          "": { dependencies: lockDependencies },
          ...(iosVersions ? {
            "node_modules/@capacitor/core": { version: iosVersions.lock },
            "node_modules/@capacitor/ios": { version: iosVersions.iosLock ?? iosVersions.lock },
          } : {}),
        },
      }),
    );
  }
  if (pnpmLock) writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(
    join(root, ".github", "workflows", "ci.yml"),
    `jobs:\n  test:\n${serviceImage ? `    services:\n      db:\n        image: ${serviceImage}\n` : ""}    steps:\n      - uses: ${uses}\n`,
  );
  if (runtimeCommand) {
    mkdirSync(join(root, "config"), { recursive: true });
    writeFileSync(join(root, "config", "runtime.ts"), runtimeCommand);
  }
  if (providerBuild || providerRun) {
    mkdirSync(join(root, ".do"), { recursive: true });
    writeFileSync(
      join(root, ".do", "app.yaml"),
      `name: fixture\nservices:\n  - name: web\n    github: {repo: CleanExpo/RestoreAssist, branch: main, deploy_on_push: false}\n    environment_slug: node-js\n${providerBuild ? `    build_command: ${JSON.stringify(providerBuild)}\n` : ""}${providerRun ? `    run_command: ${JSON.stringify(providerRun)}\n` : ""}    envs: ${JSON.stringify(APPROVED_ENV)}\n`,
    );
  }
  for (const [name, contents] of Object.entries(shellFiles)) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  if (iosVersions && iosVersions.files !== false) {
    const manifestDirectory = join(root, "ios", "App", "CapApp-SPM");
    const resolutionDirectory = join(
      root,
      "ios",
      "App",
      "App.xcodeproj",
      "project.xcworkspace",
      "xcshareddata",
      "swiftpm",
    );
    mkdirSync(manifestDirectory, { recursive: true });
    mkdirSync(resolutionDirectory, { recursive: true });
    writeFileSync(
      join(manifestDirectory, "Package.swift"),
      `.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "${iosVersions.manifest}")\n`,
    );
    writeFileSync(
      join(resolutionDirectory, "Package.resolved"),
      JSON.stringify({ pins: [{ identity: "capacitor-swift-pm", state: { version: iosVersions.resolved } }] }),
    );
  }
  return root;
}

test("accepts the npm lockfile contract and immutable action SHA", () => {
  assert.deepEqual(findReleaseBootstrapViolations(fixture()), []);
});

test("rejects a missing npm lockfile", () => {
  const violations = findReleaseBootstrapViolations(fixture({ packageLock: false }));
  assert.match(violations.join("\n"), /package-lock\.json is required/);
});

test("rejects a pnpm lockfile beside the npm lockfile", () => {
  const violations = findReleaseBootstrapViolations(fixture({ pnpmLock: true }));
  assert.match(violations.join("\n"), /pnpm-lock\.yaml must not coexist/);
});

test("rejects a package script that invokes pnpm", () => {
  const violations = findReleaseBootstrapViolations(
    fixture({ workflowCommand: "pnpm vitest run" }),
  );
  assert.match(violations.join("\n"), /still invokes pnpm/);
});

test("rejects direct and transitive provider migration commands", () => {
  assert.match(
    findReleaseBootstrapViolations(fixture({ providerBuild: "npx --no-install prisma migrate deploy" })).join("\n"),
    /automatic production migration command/,
  );
  assert.match(
    findReleaseBootstrapViolations(fixture({
      providerBuild: "npm run build",
      packageScripts: { build: "npm run prepare-prod", "prepare-prod": "prisma migrate resolve --applied stale" },
    })).join("\n"),
    /package\.json#scripts\.prepare-prod.*automatic production migration command/,
  );
  assert.match(
    findReleaseBootstrapViolations(fixture({
      providerRun: "npm start",
      packageScripts: { prestart: "prisma migrate deploy", start: "next start" },
    })).join("\n"),
    /package\.json#scripts\.prestart.*automatic production migration command/,
  );
  assert.match(
    findReleaseBootstrapViolations(fixture({
      providerBuild: "npm run build",
      packageScripts: { build: "sh scripts/build.sh", "db:release": "prisma migrate deploy" },
      shellFiles: { "scripts/build.sh": "#!/bin/sh\nexec npm run db:release\n" },
    })).join("\n"),
    /scripts\/build\.sh.*package\.json#scripts\.db:release.*automatic production migration command/,
  );
});

test("rejects an unapproved echo without misclassifying quoted migration words as execution", () => {
  const violations = findReleaseBootstrapViolations(
    fixture({ providerBuild: 'echo "prisma migrate deploy is forbidden"' }),
  );
  assert.match(violations.join("\n"), /not an exact approved provider command/);
  assert.doesNotMatch(violations.join("\n"), /reaches an automatic production migration command/);
});

test("rejects executable shell substitution in an otherwise harmless-looking echo", () => {
  assert.match(
    findReleaseBootstrapViolations(
      fixture({ providerBuild: 'echo "$(npx prisma migrate deploy)"' }),
    ).join("\n"),
    /executable shell substitution/,
  );
});

test("rejects inline Node and Python provider programs", () => {
  for (const providerRun of [
    `node -e "require('child_process').execFileSync('npx',['prisma','migrate','deploy'])"`,
    `python3 -c "import subprocess; subprocess.run(['npx','prisma','migrate','deploy'])"`,
  ]) {
    assert.match(
      findReleaseBootstrapViolations(fixture({ providerRun })).join("\n"),
      /dynamic or inline runtime invocation that cannot be statically proven non-mutating/,
    );
  }
});

test("rejects runtime flags and dynamic sourced paths that obscure provider code", () => {
  for (const providerRun of [
    `node -p "require('child_process').execSync('npx prisma migrate deploy')"`,
    `node --no-warnings -e "require('child_process').execSync('npx prisma migrate deploy')"`,
    "bash scripts/start.sh",
  ]) {
    const shellFiles = providerRun.startsWith("bash")
      ? { "scripts/start.sh": ". \"$SCRIPT_DIR/migrate.sh\"\n" }
      : {};
    assert.match(
      findReleaseBootstrapViolations(fixture({ providerRun, shellFiles })).join("\n"),
      /cannot be statically proven non-mutating/,
    );
  }
});

test("normalises env and nohup wrappers before provider inspection", () => {
  for (const providerRun of [
    `env node -e "require('child_process').execSync('npx prisma migrate deploy')"`,
    "env NODE_ENV=production bash scripts/migrate.sh",
    `nohup python3 -c "import subprocess; subprocess.run(['npx','prisma','migrate','deploy'])"`,
  ]) {
    const shellFiles = providerRun.includes("scripts/migrate.sh")
      ? { "scripts/migrate.sh": "npx prisma migrate deploy\n" }
      : {};
    assert.match(
      findReleaseBootstrapViolations(fixture({ providerRun, shellFiles })).join("\n"),
      /cannot be statically proven non-mutating|automatic production migration command/,
    );
  }
});

test("rejects env wrapper options it cannot safely normalise", () => {
  assert.match(
    findReleaseBootstrapViolations(fixture({ providerRun: "env -i node scripts/harmless.mjs" })).join("\n"),
    /env wrapper with dynamic options/,
  );
});

test("fails closed on other command wrappers", () => {
  for (const wrapper of ["nice", "timeout 30", "stdbuf -oL", "setsid", "sudo", "xargs"]) {
    assert.match(
      findReleaseBootstrapViolations(fixture({ providerRun: `${wrapper} node scripts/harmless.mjs` })).join("\n"),
      /unsupported command wrapper/,
    );
  }
});

test("fails closed on shell control flow and grouping around migration commands", () => {
  for (const providerRun of [
    "if true; then npx --no-install prisma migrate deploy; fi",
    "while true; do npx --no-install prisma migrate deploy; done",
    "true && ( npx --no-install prisma migrate deploy )",
    "{ npx --no-install prisma migrate deploy; }",
    "! npx --no-install prisma migrate deploy",
  ]) {
    assert.match(
      findReleaseBootstrapViolations(fixture({ providerRun })).join("\n"),
      /shell control flow or grouping that cannot be statically proven non-mutating/,
    );
  }
});

test("fails closed on a single pipe before a migration command", () => {
  assert.match(
    findReleaseBootstrapViolations(
      fixture({ providerBuild: "true | npx --no-install prisma migrate deploy" }),
    ).join("\n"),
    /shell metacharacters, a pipe/,
  );
});

test("normalises absolute shell paths and inspects the referenced file", () => {
  assert.match(
    findReleaseBootstrapViolations(fixture({
      providerRun: "/bin/sh scripts/migrate.sh",
      shellFiles: { "scripts/migrate.sh": "npx --no-install prisma migrate deploy\n" },
    })).join("\n"),
    /automatic production migration command/,
  );
});

test("rejects npx global options and version-selected Prisma migration commands", () => {
  for (const providerBuild of [
    "npx --yes prisma migrate deploy",
    "npx prisma@6.13.0 migrate deploy",
  ]) {
    assert.match(
      findReleaseBootstrapViolations(fixture({ providerBuild })).join("\n"),
      /automatic production migration command/,
    );
  }
});

test("normalises npm global options before recursively inspecting package scripts", () => {
  assert.match(
    findReleaseBootstrapViolations(fixture({
      providerBuild: "npm --silent run db:release",
      packageScripts: { "db:release": "prisma migrate deploy" },
    })).join("\n"),
    /automatic production migration command/,
  );
});

test("recursively inspects tsx provider entry points", () => {
  assert.match(
    findReleaseBootstrapViolations(fixture({
      providerBuild: "tsx scripts/migrate.ts",
      shellFiles: {
        "scripts/migrate.ts": "import { execSync } from 'node:child_process';\nexecSync('npx prisma migrate deploy');\n",
      },
    })).join("\n"),
    /can execute child processes or reach a database/,
  );
});

test("rejects an unapproved local tsx helper even when it looks harmless", () => {
  assert.match(
    findReleaseBootstrapViolations(fixture({
      providerBuild: "tsx scripts/build-index.ts",
      shellFiles: {
        "scripts/build-index.ts": "import fs from 'node:fs/promises';\nawait fs.writeFile('public/index.json', '[]');\n",
      },
    })).join("\n"),
    /not an exact approved provider command/,
  );
});

test("rejects unapproved echoes without mistaking quoted words for control flow", () => {
  for (const providerRun of [
    'echo "if then while do done"',
    'echo "( harmless grouping text )"',
    'echo "{ harmless brace text }"',
  ]) {
    const violations = findReleaseBootstrapViolations(fixture({ providerRun }));
    assert.match(violations.join("\n"), /not an exact approved provider command/);
    assert.doesNotMatch(violations.join("\n"), /shell control flow or grouping/);
  }
});

test("recursively inspects sourced provider shell files", () => {
  assert.match(
    findReleaseBootstrapViolations(fixture({
      providerRun: "bash scripts/start.sh",
      shellFiles: {
        "scripts/start.sh": "#!/bin/sh\n. scripts/migrate.sh\n",
        "scripts/migrate.sh": "#!/bin/sh\nnpx prisma migrate deploy\n",
      },
    })).join("\n"),
    /scripts\/migrate\.sh.*automatic production migration command/,
  );
});

test("rejects a local Node provider wrapper that can launch migration commands", () => {
  assert.match(
    findReleaseBootstrapViolations(fixture({
      providerBuild: "node scripts/provider-migrate.mjs",
      shellFiles: {
        "scripts/provider-migrate.mjs": "import { execFileSync } from 'node:child_process';\nexecFileSync('npx', ['prisma', 'migrate', 'deploy']);\n",
      },
    })).join("\n"),
    /can execute child processes/,
  );
});

test("rejects an unapproved local Node provider helper even when it looks harmless", () => {
  assert.match(
    findReleaseBootstrapViolations(fixture({
      providerBuild: "node scripts/harmless.mjs",
      shellFiles: { "scripts/harmless.mjs": "console.log('build metadata');\n" },
    })).join("\n"),
    /not an exact approved provider command/,
  );
});

test("rejects shell and runtime migration indirections outside the old deny-list", () => {
  for (const providerRun of [
    "time npx --no-install prisma migrate deploy",
    "/usr/bin/time npx prisma migrate deploy",
    "bash -lc 'npx --no-install prisma migrate deploy'",
    "sh -lc 'npx prisma migrate deploy'",
    "dash -c 'npx prisma migrate deploy'",
    "zsh -c 'npx prisma migrate deploy'",
    "./node_modules/.bin/prisma migrate deploy",
    "eval 'npx --no-install prisma migrate deploy'",
    "corepack npx --no-install prisma migrate deploy",
    "perl -e 'system q(npx prisma migrate deploy)'",
    "ruby -e 'system(%q[npx prisma migrate deploy])'",
    "find . -maxdepth 0 -exec npx prisma migrate deploy ';'",
    "bunx prisma migrate deploy",
    "yarn dlx prisma migrate deploy",
    "make migrate",
  ]) {
    assert.match(
      findReleaseBootstrapViolations(fixture({ providerRun })).join("\n"),
      /not an exact approved provider command/,
      providerRun,
    );
  }
});

test("accepts only the current versioned provider command and executable closure", () => {
  assert.deepEqual(findReleaseBootstrapViolations(process.cwd()), []);
});

test("provider allow-list detects a changed approved executable body", () => {
  const root = fixture({
    providerBuild: "npm run build",
    providerRun: "npm start",
    packageScripts: {
      prebuild: "tsx scripts/build-help-index.ts",
      build: 'NODE_OPTIONS="--max-old-space-size=8192" sh scripts/build.sh',
      start: "sh scripts/start-production.sh",
    },
    shellFiles: Object.fromEntries(
      [
        "Dockerfile",
        "docker/entrypoint.sh",
        "scripts/build-help-index.ts",
        "scripts/build.sh",
        "scripts/start-production.sh",
      ]
        .map((name) => [name, readFileSync(name, "utf8")]),
    ),
  });
  writeFileSync(join(root, ".do", "app.yaml"), readFileSync(".do/app.yaml", "utf8"));
  assert.deepEqual(findReleaseBootstrapViolations(root), []);
  writeFileSync(
    join(root, "scripts", "build.sh"),
    `${readFileSync(join(root, "scripts", "build.sh"), "utf8")}\necho changed\n`,
  );
  assert.match(
    findReleaseBootstrapViolations(root).join("\n"),
    /scripts\/build\.sh content hash mismatch/,
  );
});

test("provider allow-list detects an added lifecycle indirection", () => {
  const root = fixture({
    providerBuild: "npm run build",
    providerRun: "npm start",
    packageScripts: {
      prebuild: "tsx scripts/build-help-index.ts",
      build: 'NODE_OPTIONS="--max-old-space-size=8192" sh scripts/build.sh',
      postbuild: "time npx prisma migrate deploy",
      start: "sh scripts/start-production.sh",
    },
    shellFiles: Object.fromEntries(
      ["scripts/build-help-index.ts", "scripts/build.sh", "scripts/start-production.sh"]
        .map((name) => [name, readFileSync(name, "utf8")]),
    ),
  });
  const violations = findReleaseBootstrapViolations(root).join("\n");
  assert.match(violations, /scripts\.postbuild is an unapproved provider lifecycle hook/);
});

test("provider allow-list rejects every npm install lifecycle hook except the exact approved postinstall", () => {
  for (const lifecycle of [
    "preinstall", "install", "prepublish", "preprepare", "prepare", "postprepare", "dependencies",
  ]) {
    const root = fixture({
      providerBuild: "npm run build",
      providerRun: "npm start",
      packageScripts: { [lifecycle]: "prisma migrate deploy" },
    });
    assert.match(
      findReleaseBootstrapViolations(root).join("\n"),
      new RegExp(`scripts\\.${lifecycle} is an unapproved provider lifecycle hook`),
      lifecycle,
    );
  }
  const root = fixture({
    providerBuild: "npm run build",
    providerRun: "npm start",
    packageScripts: { postinstall: "prisma migrate deploy" },
  });
  const violations = findReleaseBootstrapViolations(root).join("\n");
  assert.match(violations, /scripts\.postinstall must exactly equal "prisma generate"/);
  assert.match(violations, /automatic production migration command/);
});

test("provider allow-list rejects execution-affecting environment entries", () => {
  const root = fixture({ providerBuild: "npm run build", providerRun: "npm start" });
  const specPath = join(root, ".do", "app.yaml");
  writeFileSync(
    specPath,
    readFileSync(specPath, "utf8").replace(
      /envs: \[/,
      'envs: [{"key":"NODE_OPTIONS","value":"--require ./scripts/preload.cjs","scope":"RUN_AND_BUILD_TIME","type":"GENERAL"},',
    ),
  );
  assert.match(
    findReleaseBootstrapViolations(root).join("\n"),
    /envs\.NODE_OPTIONS is not an exact approved provider environment entry/,
  );
});

test("provider allow-list rejects inherited app-level environment entries", () => {
  const root = fixture({ providerBuild: "npm run build", providerRun: "npm start" });
  const specPath = join(root, ".do", "app.yaml");
  writeFileSync(
    specPath,
    readFileSync(specPath, "utf8").replace(
      "services:\n",
      "envs:\n  - key: NPM_CONFIG_SCRIPT_SHELL\n    value: ./scripts/provider-shell.sh\n    scope: RUN_AND_BUILD_TIME\n    type: GENERAL\nservices:\n",
    ),
  );
  assert.match(
    findReleaseBootstrapViolations(root).join("\n"),
    /unapproved top-level fields: envs/,
  );
});

test("provider allow-list rejects a second git source beside the approved GitHub source", () => {
  const root = fixture({ providerBuild: "npm run build", providerRun: "npm start" });
  const specPath = join(root, ".do", "app.yaml");
  writeFileSync(
    specPath,
    readFileSync(specPath, "utf8").replace(
      "    environment_slug: node-js\n",
      "    git: {repo_clone_url: https://example.invalid/alternate.git, branch: main}\n    environment_slug: node-js\n",
    ),
  );
  assert.match(
    findReleaseBootstrapViolations(root).join("\n"),
    /services\/web\.git is an unapproved source or execution selector/,
  );
});

test("provider allow-list rejects source-directory and Dockerfile closure escapes", () => {
  for (const field of ["source_dir", "dockerfile_path"]) {
    const root = fixture({ providerBuild: "npm run build", providerRun: "npm start" });
    const specPath = join(root, ".do", "app.yaml");
    writeFileSync(
      specPath,
      readFileSync(specPath, "utf8").replace("    environment_slug: node-js\n", `    environment_slug: node-js\n    ${field}: alternate\n`),
    );
    assert.match(
      findReleaseBootstrapViolations(root).join("\n"),
      new RegExp(`${field} is an unapproved source or execution selector`),
    );
  }
});

test("provider allow-list binds npm configuration byte-for-byte", () => {
  const root = fixture({ providerBuild: "npm run build", providerRun: "npm start" });
  writeFileSync(join(root, ".npmrc"), "legacy-peer-deps=true\nscript-shell=./scripts/provider-shell.sh\n");
  assert.match(findReleaseBootstrapViolations(root).join("\n"), /\.npmrc content hash mismatch/);
});

test("provider allow-list rejects symlink substitutions even when target bytes match", () => {
  const root = fixture({
    providerBuild: "npm run build",
    providerRun: "npm start",
    packageScripts: {
      prebuild: "tsx scripts/build-help-index.ts",
      build: 'NODE_OPTIONS="--max-old-space-size=8192" sh scripts/build.sh',
      start: "sh scripts/start-production.sh",
    },
    shellFiles: Object.fromEntries(
      ["scripts/build-help-index.ts", "scripts/build.sh", "scripts/start-production.sh"]
        .map((name) => [name, readFileSync(name, "utf8")]),
    ),
  });
  renameSync(join(root, ".npmrc"), join(root, ".npmrc.bytes"));
  symlinkSync(".npmrc.bytes", join(root, ".npmrc"));
  renameSync(join(root, "scripts", "build.sh"), join(root, "scripts", "build.sh.bytes"));
  symlinkSync("build.sh.bytes", join(root, "scripts", "build.sh"));
  const violations = findReleaseBootstrapViolations(root).join("\n");
  assert.match(violations, /\.npmrc is missing from the provider execution closure/);
  assert.match(violations, /approved provider executable scripts\/build\.sh is missing/);
});

test("provider allow-list rejects duplicate component identities introduced by YAML aliases", () => {
  const root = fixture({ providerBuild: "npm run build", providerRun: "npm start" });
  const specPath = join(root, ".do", "app.yaml");
  const source = readFileSync(specPath, "utf8");
  writeFileSync(
    specPath,
    source.replace(
      "services:\n  - name: web\n",
      `component: &web\n  name: web\n  build_command: npm run build\n  run_command: npm start\n  envs: ${JSON.stringify(APPROVED_ENV)}\nservices:\n  - *web\n  - name: web\n`,
    ),
  );
  assert.match(
    findReleaseBootstrapViolations(root).join("\n"),
    /duplicate provider component services\/web/,
  );
});

test("provider allow-list rejects an extra component even without explicit commands", () => {
  const root = fixture({
    providerBuild: "npm run build",
    providerRun: "npm start",
    packageScripts: {
      prebuild: "tsx scripts/build-help-index.ts",
      build: 'NODE_OPTIONS="--max-old-space-size=8192" sh scripts/build.sh',
      start: "sh scripts/start-production.sh",
    },
    shellFiles: Object.fromEntries(
      ["scripts/build-help-index.ts", "scripts/build.sh", "scripts/start-production.sh"]
        .map((name) => [name, readFileSync(name, "utf8")]),
    ),
  });
  const specPath = join(root, ".do", "app.yaml");
  writeFileSync(
    specPath,
    `${readFileSync(specPath, "utf8")}\nworkers:\n  - name: unreviewed-worker\n`,
  );
  assert.match(
    findReleaseBootstrapViolations(root).join("\n"),
    /workers\/unreviewed-worker is not an approved provider component/,
  );
});

test("rejects a mutable major action tag", () => {
  const violations = findReleaseBootstrapViolations(
    fixture({ uses: "actions/checkout@v7" }),
  );
  assert.match(violations.join("\n"), /immutable commit SHA/);
});

test("semantic workflow inspection rejects a mutable action behind a quoted uses key", () => {
  const root = fixture();
  const workflowPath = join(root, ".github", "workflows", "ci.yml");
  writeFileSync(
    workflowPath,
    readFileSync(workflowPath, "utf8").replace(
      `- uses: actions/checkout@${PIN}`,
      '- "uses": actions/checkout@v7',
    ),
  );
  assert.match(
    findReleaseBootstrapViolations(root).join("\n"),
    /external action must use a full immutable commit SHA; observed actions\/checkout@v7/,
  );
});

test("semantic workflow inspection rejects a mutable image behind a quoted image key", () => {
  const root = fixture({ serviceImage: "pgvector/pgvector:pg16" });
  const workflowPath = join(root, ".github", "workflows", "ci.yml");
  writeFileSync(
    workflowPath,
    readFileSync(workflowPath, "utf8").replace(
      "image: pgvector/pgvector:pg16",
      '"image": pgvector/pgvector:pg16',
    ),
  );
  assert.match(
    findReleaseBootstrapViolations(root).join("\n"),
    /image must use an immutable sha256 digest/,
  );
});

test("semantic workflow inspection rejects anchors, aliases and merge indirection", () => {
  const root = fixture();
  const workflowPath = join(root, ".github", "workflows", "ci.yml");
  writeFileSync(
    workflowPath,
    `defaults: &step\n  uses: actions/checkout@${PIN}\njobs:\n  test:\n    steps:\n      - <<: *step\n`,
  );
  assert.match(
    findReleaseBootstrapViolations(root).join("\n"),
    /contains YAML anchors or aliases/,
  );
});

test("semantic workflow inspection rejects duplicate YAML keys", () => {
  const root = fixture();
  const workflowPath = join(root, ".github", "workflows", "ci.yml");
  writeFileSync(
    workflowPath,
    `jobs:\n  test:\n    steps:\n      - uses: actions/checkout@${PIN}\n        uses: actions/checkout@v7\n`,
  );
  assert.match(
    findReleaseBootstrapViolations(root).join("\n"),
    /is not strict unambiguous YAML: Map keys must be unique/,
  );
});

test("semantic workflow inspection rejects scalar mutable job containers and digest suffixes", () => {
  for (const container of [
    "alpine:latest",
    `alpine@sha256:${"a".repeat(64)}-mutable`,
    `alpine@SHA256:${"a".repeat(64)}`,
    `alpine@sha256:${"A".repeat(64)}`,
  ]) {
    const root = fixture();
    const workflowPath = join(root, ".github", "workflows", "ci.yml");
    writeFileSync(
      workflowPath,
      readFileSync(workflowPath, "utf8").replace("  test:\n", `  test:\n    container: ${container}\n`),
    );
    assert.match(findReleaseBootstrapViolations(root).join("\n"), /image must use an immutable sha256 digest/);
  }
});

test("semantic workflow inspection rejects digest-looking suffixes on Docker actions", () => {
  const root = fixture();
  const workflowPath = join(root, ".github", "workflows", "ci.yml");
  writeFileSync(
    workflowPath,
    readFileSync(workflowPath, "utf8").replace(
      `actions/checkout@${PIN}`,
      `docker://alpine@sha256:${"a".repeat(64)}-mutable`,
    ),
  );
  assert.match(findReleaseBootstrapViolations(root).join("\n"), /Docker action must use an immutable sha256 digest/);
});

test("semantic workflow inspection requires canonical lowercase Docker action digests", () => {
  for (const target of [
    `docker://alpine@SHA256:${"a".repeat(64)}`,
    `docker://alpine@sha256:${"A".repeat(64)}`,
  ]) {
    const root = fixture({ uses: target });
    assert.match(
      findReleaseBootstrapViolations(root).join("\n"),
      /Docker action must use an immutable sha256 digest/,
    );
  }

  assert.deepEqual(
    findReleaseBootstrapViolations(
      fixture({ uses: `docker://alpine@sha256:${"a".repeat(64)}` }),
    ),
    [],
  );
});

test("semantic workflow inspection resolves local Docker and composite actions", () => {
  const root = fixture();
  const workflowPath = join(root, ".github", "workflows", "ci.yml");
  writeFileSync(
    workflowPath,
    readFileSync(workflowPath, "utf8").replace(`actions/checkout@${PIN}`, "./.github/actions/outer"),
  );
  mkdirSync(join(root, ".github", "actions", "outer"), { recursive: true });
  mkdirSync(join(root, ".github", "actions", "inner"), { recursive: true });
  writeFileSync(
    join(root, ".github", "actions", "outer", "action.yml"),
    "name: outer\nruns:\n  using: composite\n  steps:\n    - uses: ./.github/actions/inner\n",
  );
  writeFileSync(
    join(root, ".github", "actions", "inner", "action.yaml"),
    "name: inner\nruns:\n  using: docker\n  image: docker://alpine:latest\n",
  );
  assert.match(findReleaseBootstrapViolations(root).join("\n"), /Docker action must use an immutable sha256 digest/);
});

test("semantic workflow inspection rejects missing, escaping and ambiguous local actions", () => {
  for (const target of ["./.github/actions/missing", "./../escape"] ) {
    const root = fixture();
    const workflowPath = join(root, ".github", "workflows", "ci.yml");
    writeFileSync(workflowPath, readFileSync(workflowPath, "utf8").replace(`actions/checkout@${PIN}`, target));
    assert.match(findReleaseBootstrapViolations(root).join("\n"), /local reference escapes|local action must reference/);
  }

  const root = fixture();
  const workflowPath = join(root, ".github", "workflows", "ci.yml");
  writeFileSync(workflowPath, readFileSync(workflowPath, "utf8").replace(`actions/checkout@${PIN}`, "./.github/actions/ambiguous"));
  mkdirSync(join(root, ".github", "actions", "ambiguous"), { recursive: true });
  for (const name of ["action.yml", "action.yaml"]) {
    writeFileSync(join(root, ".github", "actions", "ambiguous", name), "name: x\nruns: {using: node20, main: index.js}\n");
  }
  assert.match(findReleaseBootstrapViolations(root).join("\n"), /exactly one regular non-symlink/);
});

test("semantic workflow inspection rejects symlinked and unknown local actions", () => {
  const root = fixture();
  const workflowPath = join(root, ".github", "workflows", "ci.yml");
  writeFileSync(workflowPath, readFileSync(workflowPath, "utf8").replace(`actions/checkout@${PIN}`, "./.github/actions/link"));
  mkdirSync(join(root, ".github", "actions", "target"), { recursive: true });
  writeFileSync(join(root, ".github", "actions", "target", "action.yml"), "name: x\nruns: {using: node20, main: index.js}\n");
  symlinkSync("target", join(root, ".github", "actions", "link"));
  assert.match(findReleaseBootstrapViolations(root).join("\n"), /traverses a symlink/);

  writeFileSync(workflowPath, readFileSync(workflowPath, "utf8").replace("./.github/actions/link", "./.github/actions/target"));
  writeFileSync(join(root, ".github", "actions", "target", "action.yml"), "name: x\nruns: {using: plugin, main: index.js}\n");
  assert.match(findReleaseBootstrapViolations(root).join("\n"), /runs\.using is unsupported/);
});

test("semantic workflow inspection binds every Node local-action executable", () => {
  const root = fixture();
  const workflowPath = join(root, ".github", "workflows", "ci.yml");
  writeFileSync(workflowPath, readFileSync(workflowPath, "utf8").replace(`actions/checkout@${PIN}`, "./.github/actions/node-action"));
  mkdirSync(join(root, ".github", "actions", "node-action"), { recursive: true });
  writeFileSync(
    join(root, ".github", "actions", "node-action", "action.yml"),
    "name: node action\nruns:\n  using: node20\n  main: main.js\n  pre: missing-pre.js\n  post: missing-post.js\n",
  );
  writeFileSync(join(root, ".github", "actions", "node-action", "main.js"), "export {};\n");
  const violations = findReleaseBootstrapViolations(root).join("\n");
  assert.match(violations, /runs\.pre is missing/);
  assert.match(violations, /runs\.post is missing/);
});

test("semantic workflow inspection resolves local reusable workflows and rejects missing targets", () => {
  const root = fixture();
  const workflowPath = join(root, ".github", "workflows", "ci.yml");
  writeFileSync(
    workflowPath,
    `jobs:\n  reusable:\n    uses: ./.github/workflows/nested.yml\n`,
  );
  writeFileSync(
    join(root, ".github", "workflows", "nested.yml"),
    `jobs:\n  test:\n    container: alpine:latest\n    steps: []\n`,
  );
  assert.match(findReleaseBootstrapViolations(root).join("\n"), /image must use an immutable sha256 digest/);

  writeFileSync(workflowPath, `jobs:\n  reusable:\n    uses: ./.github/workflows/missing.yml\n`);
  assert.match(findReleaseBootstrapViolations(root).join("\n"), /local reference escapes the repository, is missing/);
});

test("semantic workflow inspection rejects cyclic local reusable workflows", () => {
  const root = fixture();
  const workflowPath = join(root, ".github", "workflows", "ci.yml");
  const nestedPath = join(root, ".github", "workflows", "nested.yml");
  writeFileSync(workflowPath, "jobs:\n  nested:\n    uses: ./.github/workflows/nested.yml\n");
  writeFileSync(nestedPath, "jobs:\n  original:\n    uses: ./.github/workflows/ci.yml\n");
  assert.match(findReleaseBootstrapViolations(root).join("\n"), /cyclic local reusable-workflow reference/);
});

test("semantic workflow inspection covers the current workflow population", () => {
  const workflowPopulation = readdirSync(join(process.cwd(), ".github", "workflows"))
    .filter((name) => /\.ya?ml$/i.test(name));
  assert.equal(workflowPopulation.length, 20);
  assert.deepEqual(findReleaseBootstrapViolations(process.cwd()), []);
});

test("rejects an abbreviated action commit", () => {
  const violations = findReleaseBootstrapViolations(
    fixture({ uses: "actions/checkout@3d3c42e" }),
  );
  assert.match(violations.join("\n"), /immutable commit SHA/);
});

test("rejects an unapproved action even with a 40-character ref", () => {
  const violations = findReleaseBootstrapViolations(
    fixture({ uses: `attacker/action@${"0".repeat(40)}` }),
  );
  assert.match(violations.join("\n"), /not on the approved repository list/);
});

test("rejects a mutable service image tag", () => {
  const violations = findReleaseBootstrapViolations(
    fixture({ serviceImage: "pgvector/pgvector:pg16" }),
  );
  assert.match(violations.join("\n"), /service image must use an immutable sha256 digest/);
});

test("accepts only canonical lowercase service image digests", () => {
  assert.deepEqual(
    findReleaseBootstrapViolations(
      fixture({ serviceImage: `pgvector/pgvector@sha256:${"a".repeat(64)}` }),
    ),
    [],
  );
  for (const serviceImage of [
    `pgvector/pgvector@SHA256:${"a".repeat(64)}`,
    `pgvector/pgvector@sha256:${"A".repeat(64)}`,
  ]) {
    assert.match(
      findReleaseBootstrapViolations(fixture({ serviceImage })).join("\n"),
      /service image must use an immutable sha256 digest/,
    );
  }
});

test("rejects pnpm hidden in runtime configuration", () => {
  const violations = findReleaseBootstrapViolations(
    fixture({ runtimeCommand: 'export const command = "pnpm dev";\n' }),
  );
  assert.match(violations.join("\n"), /pnpm runtime path or invocation/);
});

test("rejects a pnpm-specific node_modules path", () => {
  const violations = findReleaseBootstrapViolations(
    fixture({ runtimeCommand: 'export const plugin = "node_modules/.pnpm/example";\n' }),
  );
  assert.match(violations.join("\n"), /pnpm runtime path or invocation/);
});

test("rejects package-lock root dependency drift", () => {
  const violations = findReleaseBootstrapViolations(
    fixture({ manifestDependencies: { example: "^2.0.0" }, lockDependencies: { example: "^1.0.0" } }),
  );
  assert.match(violations.join("\n"), /must match package\.json/);
});

test("rejects duplicate package manifest keys", () => {
  const root = fixture();
  writeFileSync(
    join(root, "package.json"),
    '{"name":"fixture","dependencies":{},"overrides":{"safe":"1"},"overrides":{"safe":"2"},"scripts":{"postinstall":"prisma generate"}}',
  );
  assert.match(
    findReleaseBootstrapViolations(root).join("\n"),
    /duplicate or ambiguous keys/,
  );
});

test("rejects an npm direct-dependency override conflict", () => {
  const violations = findReleaseBootstrapViolations(
    fixture({ manifestDependencies: { example: "^2.0.0" }, overrides: { example: ">=2.1.0" } }),
  );
  assert.match(violations.join("\n"), /conflicts with direct dependency/);
});

test("rejects iOS Capacitor version drift from the npm lock", () => {
  const violations = findReleaseBootstrapViolations(
    fixture({ iosVersions: { lock: "8.5.0", manifest: "8.3.3", resolved: "8.3.3" } }),
  );
  assert.equal(violations.filter((entry) => /ios .*Capacitor|ios Package\.resolved/.test(entry)).length, 2);
});

test("rejects a missing iOS SwiftPM manifest and resolution", () => {
  const violations = findReleaseBootstrapViolations(
    fixture({ iosVersions: { lock: "8.5.0", files: false } }),
  );
  assert.match(violations.join("\n"), /ios Package\.swift is required/);
  assert.match(violations.join("\n"), /ios Package\.resolved is required/);
});

test("rejects @capacitor\/ios drift from @capacitor\/core", () => {
  const violations = findReleaseBootstrapViolations(
    fixture({
      iosVersions: {
        lock: "8.5.0",
        iosLock: "8.4.0",
        manifest: "8.5.0",
        resolved: "8.5.0",
      },
    }),
  );
  assert.match(violations.join("\n"), /@capacitor\/ios must match @capacitor\/core/);
});

test("rejects declared Capacitor packages omitted from resolved lock entries", () => {
  const violations = findReleaseBootstrapViolations(
    fixture({
      manifestDependencies: {
        "@capacitor/core": "8.5.0",
        "@capacitor/ios": "8.5.0",
      },
    }),
  );
  assert.match(violations.join("\n"), /must resolve node_modules\/@capacitor\/core/);
  assert.match(violations.join("\n"), /must resolve node_modules\/@capacitor\/ios/);
});
