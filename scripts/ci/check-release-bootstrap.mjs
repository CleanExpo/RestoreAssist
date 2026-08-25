#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isAlias, parse as parseYaml, parseDocument, visit } from "yaml";

const IMMUTABLE_ACTION_REF = /^[0-9a-f]{40}$/i;
const IMMUTABLE_IMAGE_REF = /^[^\s@]+@sha256:[0-9a-f]{64}$/;
const IMMUTABLE_DOCKER_ACTION_REF = /^docker:\/\/[^\s@]+@sha256:[0-9a-f]{64}$/;
const APPROVED_EXTERNAL_ACTIONS = new Set([
  "actions/checkout",
  "actions/attest",
  "actions/setup-java",
  "actions/setup-node",
  "actions/setup-python",
  "actions/upload-artifact",
  "r0adkll/upload-google-play",
  "treosh/lighthouse-ci-action",
]);

function workflowFiles(root) {
  const directory = join(root, ".github", "workflows");
  return readdirSync(directory)
    .filter((name) => /\.ya?ml$/i.test(name))
    .map((name) => join(directory, name))
    .filter((path) => statSync(path).isFile())
    .sort();
}

function workflowSemanticViolations(root, path) {
  const violations = [];
  const repositoryRoot = resolve(root);
  const workflowRoot = resolve(root, ".github", "workflows");
  const inspected = new Set();
  const active = new Set();

  const hasSymlinkComponent = (absolutePath) => {
    const relativePath = relative(repositoryRoot, absolutePath);
    if (!relativePath || relativePath.startsWith("..") || resolve(repositoryRoot, relativePath) !== absolutePath) return true;
    let current = repositoryRoot;
    for (const segment of relativePath.split(/[\\/]/)) {
      current = join(current, segment);
      if (!existsSync(current) || lstatSync(current).isSymbolicLink()) return true;
    }
    return false;
  };

  const parseTrustedYaml = (absolutePath, kind) => {
    const location = relative(root, absolutePath);
    let source;
    try {
      source = readFileSync(absolutePath, "utf8");
    } catch (error) {
      violations.push(`${location} cannot be read as ${kind}: ${error.message}`);
      return null;
    }
    const document = parseDocument(source, { merge: false, strict: true, uniqueKeys: true });
    for (const error of document.errors) {
      violations.push(`${location} is not strict unambiguous YAML: ${error.message}`);
    }
    let containsAnchorOrAlias = false;
    visit(document, (_key, node) => {
      if (node?.anchor || isAlias(node)) containsAnchorOrAlias = true;
    });
    if (containsAnchorOrAlias) {
      violations.push(`${location} contains YAML anchors or aliases, which are not permitted in workflow trust policy`);
    }
    if (document.errors.length > 0 || containsAnchorOrAlias) return null;
    try {
      return document.toJS({ maxAliasCount: 0 });
    } catch (error) {
      violations.push(`${location} cannot be converted from strict YAML: ${error.message}`);
      return null;
    }
  };

  const inspectImage = (child, location, fieldPath, dockerAction = false) => {
    const pattern = dockerAction ? IMMUTABLE_DOCKER_ACTION_REF : IMMUTABLE_IMAGE_REF;
    if (typeof child !== "string" || !pattern.test(child)) {
      violations.push(
        `${location}#${fieldPath} ${dockerAction ? "Docker action" : "image"} must use an immutable sha256 digest with exact grammar; observed ${JSON.stringify(child)}`,
      );
    }
  };

  const inspectLocalReference = (target, sourceLocation, fieldPath) => {
    if (target.includes("@")) {
      violations.push(`${sourceLocation}#${fieldPath} local reference must not carry an @ ref; observed ${target}`);
      return;
    }
    const absolutePath = resolve(repositoryRoot, target);
    if (
      (absolutePath !== repositoryRoot && !absolutePath.startsWith(`${repositoryRoot}/`)) ||
      hasSymlinkComponent(absolutePath)
    ) {
      violations.push(`${sourceLocation}#${fieldPath} local reference escapes the repository, is missing, or traverses a symlink; observed ${target}`);
      return;
    }

    if (absolutePath.startsWith(`${workflowRoot}/`) && /\.ya?ml$/i.test(absolutePath)) {
      if (!lstatSync(absolutePath).isFile()) {
        violations.push(`${sourceLocation}#${fieldPath} local reusable workflow is not a regular file; observed ${target}`);
        return;
      }
      inspectWorkflow(absolutePath);
      return;
    }

    if (!lstatSync(absolutePath).isDirectory()) {
      violations.push(`${sourceLocation}#${fieldPath} local action must reference a directory; observed ${target}`);
      return;
    }
    const candidates = ["action.yml", "action.yaml"]
      .map((name) => join(absolutePath, name))
      .filter((candidate) => existsSync(candidate));
    if (candidates.length !== 1 || hasSymlinkComponent(candidates[0])) {
      violations.push(`${sourceLocation}#${fieldPath} local action must contain exactly one regular non-symlink action.yml or action.yaml; observed ${target}`);
      return;
    }
    inspectAction(candidates[0]);
  };

  const inspectUses = (child, location, fieldPath) => {
    if (typeof child !== "string") {
      violations.push(`${location}#${fieldPath} action reference must be a string`);
    } else if (child.startsWith("./")) {
      inspectLocalReference(child, location, fieldPath);
    } else if (child.startsWith("docker://")) {
      inspectImage(child, location, fieldPath, true);
    } else {
      const separator = child.lastIndexOf("@");
      const actionName = separator === -1 ? child : child.slice(0, separator);
      const ref = separator === -1 ? "" : child.slice(separator + 1);
      if (!APPROVED_EXTERNAL_ACTIONS.has(actionName)) {
        violations.push(`${location}#${fieldPath} external action is not on the approved repository list; observed ${actionName}`);
      }
      if (!IMMUTABLE_ACTION_REF.test(ref)) {
        violations.push(`${location}#${fieldPath} external action must use a full immutable commit SHA; observed ${child}`);
      }
    }
  };

  const walk = (value, location, pathParts = []) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, location, [...pathParts, String(index)]));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const fieldPath = [...pathParts, key].join(".");
      if (key === "uses") {
        inspectUses(child, location, fieldPath);
      }
      if (key === "image") {
        inspectImage(child, location, fieldPath);
      }
      if (key === "container" && typeof child === "string") {
        inspectImage(child, location, fieldPath);
      }
      walk(child, location, [...pathParts, key]);
    }
  };

  function inspectAction(actionPath) {
    const canonical = resolve(actionPath);
    if (inspected.has(canonical)) return;
    if (active.has(canonical)) {
      violations.push(`${relative(root, actionPath)} contains a cyclic local action reference`);
      return;
    }
    active.add(canonical);
    const action = parseTrustedYaml(actionPath, "local action");
    if (action && (!action.runs || typeof action.runs !== "object" || Array.isArray(action.runs))) {
      violations.push(`${relative(root, actionPath)}#runs must be an action execution object`);
    } else if (action) {
      const using = action.runs.using;
      if (using === "composite") {
        if (!Array.isArray(action.runs.steps) || action.runs.steps.length === 0) {
          violations.push(`${relative(root, actionPath)}#runs.steps must be a non-empty composite step list`);
        } else {
          walk(action.runs.steps, relative(root, actionPath), ["runs", "steps"]);
        }
      } else if (using === "docker") {
        inspectImage(action.runs.image, relative(root, actionPath), "runs.image", true);
      } else if (/^node(?:20|24)$/.test(using ?? "")) {
        for (const field of ["main", "pre", "post"]) {
          const executable = action.runs[field];
          if (field !== "main" && executable === undefined) continue;
          if (typeof executable !== "string" || executable.startsWith("/") || executable.includes("..")) {
            violations.push(`${relative(root, actionPath)}#runs.${field} must be a repository-local relative file`);
          } else {
            const executablePath = resolve(actionPath, "..", executable);
            if (!existsSync(executablePath) || hasSymlinkComponent(executablePath) || !lstatSync(executablePath).isFile()) {
              violations.push(`${relative(root, actionPath)}#runs.${field} is missing, a symlink, or not a regular file`);
            }
          }
        }
      } else {
        violations.push(`${relative(root, actionPath)}#runs.using is unsupported; observed ${JSON.stringify(using)}`);
      }
    }
    active.delete(canonical);
    inspected.add(canonical);
  }

  function inspectWorkflow(workflowPath) {
    const canonical = resolve(workflowPath);
    if (hasSymlinkComponent(canonical) || !lstatSync(canonical).isFile()) {
      violations.push(`${relative(root, workflowPath)} workflow must be a regular non-symlink repository file`);
      return;
    }
    if (inspected.has(canonical)) return;
    if (active.has(canonical)) {
      violations.push(`${relative(root, workflowPath)} contains a cyclic local reusable-workflow reference`);
      return;
    }
    active.add(canonical);
    const workflow = parseTrustedYaml(workflowPath, "workflow");
    if (workflow) walk(workflow, relative(root, workflowPath));
    active.delete(canonical);
    inspected.add(canonical);
  }

  inspectWorkflow(path);
  return violations;
}

const RUNTIME_SOURCE_ROOTS = [
  "scripts",
  "config",
  "lib",
  "ios",
  ".claude/agents",
  ".codex/agents",
  ".claude/RULES.md",
  ".claude/TESTING.md",
  ".claude/WORKFLOWS.md",
  ".claude/ARCHITECTURE.md",
  ".claude/launch.json",
  "README.md",
  "docs/RELEASE_GATE.md",
  "packages",
  "mobile",
];
const RUNTIME_SOURCE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".sh",
  ".ps1",
  ".swift",
  ".md",
  ".toml",
  ".json",
]);

function runtimeSourceFiles(root) {
  const files = [];
  const visit = (path) => {
    if (!existsSync(path)) return;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (["node_modules", "__tests__"].includes(path.split(/[\\/]/).at(-1))) return;
      for (const name of readdirSync(path)) visit(join(path, name));
      return;
    }
    if (RUNTIME_SOURCE_EXTENSIONS.has(extname(path))) files.push(path);
  };
  for (const directory of RUNTIME_SOURCE_ROOTS) visit(join(root, directory));
  return files.sort();
}

function isCommentOnly(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*");
}

const PROVIDER_COMPONENT_GROUPS = ["services", "workers", "jobs", "functions", "static_sites"];

// Production provider entry points are an allow-list, not a shell deny-list.
// These values are deliberately versioned beside the checker: changing a
// provider command, lifecycle hook, or executable body requires an explicit
// review of this trust policy.  A broad "harmless-looking" command is not
// sufficient because shell and runtime wrappers have an unbounded grammar.
const APPROVED_PROVIDER_COMMANDS = new Map();
const APPROVED_PROVIDER_COMPONENTS = new Set(["services/web"]);
const APPROVED_PROVIDER_TOP_LEVEL_FIELDS = new Set([
  "name",
  "region",
  "domains",
  ...PROVIDER_COMPONENT_GROUPS,
]);
const APPROVED_WEB_COMPONENT_FIELDS = new Set([
  "name",
  "image",
  "instance_count",
  "instance_size_slug",
  "http_port",
  "health_check",
  "envs",
]);
const APPROVED_PROVIDER_PACKAGE_SCRIPTS = new Map([
  ["postinstall", "prisma generate"],
  ["prebuild", "tsx scripts/build-help-index.ts"],
  ["build", 'NODE_OPTIONS="--max-old-space-size=8192" sh scripts/build.sh'],
  ["start", "sh scripts/start-production.sh"],
]);
const PROVIDER_INSTALL_LIFECYCLES = [
  "preinstall",
  "install",
  "postinstall",
  "prepublish",
  "preprepare",
  "prepare",
  "postprepare",
  "dependencies",
];
const PROVIDER_COMMAND_LIFECYCLES = [
  ...PROVIDER_INSTALL_LIFECYCLES,
  "prebuild",
  "build",
  "postbuild",
  "prestart",
  "start",
  "poststart",
];
const APPROVED_PROVIDER_ENV = new Map([
  ["NODE_ENV", { value: "production" }],
  ["ALLOWED_APP_HOSTS", { value: "restoreassist.app,www.restoreassist.app", scope: "RUN_TIME", type: "GENERAL" }],
  ["GIT_SHA", { value: "0000000000000000000000000000000000000000", scope: "RUN_AND_BUILD_TIME", type: "GENERAL" }],
  ["CREDENTIAL_ENCRYPTION_KEY", { scope: "RUN_TIME", type: "SECRET" }],
  ["NEXTAUTH_SECRET", { scope: "RUN_TIME", type: "SECRET" }],
  ["NEXTAUTH_URL", { value: "https://restoreassist.app", scope: "RUN_TIME", type: "GENERAL" }],
  ["GOOGLE_CLIENT_ID", { scope: "RUN_TIME", type: "SECRET" }],
  ["GOOGLE_CLIENT_SECRET", { scope: "RUN_TIME", type: "SECRET" }],
  ["NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID", { scope: "RUN_AND_BUILD_TIME", type: "SECRET" }],
  ["DATABASE_URL", { scope: "RUN_TIME", type: "SECRET" }],
  ["TENANT_DATABASE_HOST_ALLOWLIST", { scope: "RUN_TIME", type: "SECRET" }],
  ["TENANT_DATABASE_PROVISIONING_ENABLED", { value: "false", scope: "RUN_TIME", type: "GENERAL" }],
  ["ANTHROPIC_API_KEY", { scope: "RUN_TIME", type: "SECRET" }],
  ["PILOT_TESTER_JUDGE_API_KEY", { scope: "RUN_TIME", type: "SECRET" }],
  ["STRIPE_SECRET_KEY", { scope: "RUN_TIME", type: "SECRET" }],
  ["STRIPE_WEBHOOK_SECRET", { scope: "RUN_TIME", type: "SECRET" }],
  ["CLOUDINARY_URL", { scope: "RUN_TIME", type: "SECRET" }],
  ["XERO_WEBHOOK_KEY", { scope: "RUN_TIME", type: "SECRET" }],
  ["GITHUB_WEBHOOK_SECRET", { scope: "RUN_TIME", type: "SECRET" }],
  ["RESEND_API_KEY", { scope: "RUN_TIME", type: "SECRET" }],
  ["RESEND_FROM_EMAIL", { scope: "RUN_TIME", type: "GENERAL" }],
  ["CRON_SECRET", { scope: "RUN_TIME", type: "SECRET" }],
  ["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", { scope: "RUN_TIME", type: "SECRET" }],
  ["ASC_API_KEY_ID", { scope: "RUN_TIME", type: "GENERAL" }],
  ["ASC_ISSUER_ID", { scope: "RUN_TIME", type: "GENERAL" }],
]);
const APPROVED_NPMRC_SHA256 = "564668503437e39b5868b479ec257455a0c4083adf15767fc75ce6b1391d32a2";
const APPROVED_PROVIDER_EXECUTABLES = new Map([
  ["Dockerfile", "5b0edcc0e17a97bf11711e8f468d742ec678d0896ed6e960029afad4549ffbbb"],
  ["docker/entrypoint.sh", "5582a15a3407ac31a28c7056b87b02c9c5563acf78d36a4acd141d3f0167c1b4"],
  ["scripts/build-help-index.ts", "ec8849f2c4f0d26e1467886040f3e01b16eefec0d14ce2d2daba0a1a382c2553"],
  ["scripts/build.sh", "25583db2753872420f27e050050ee8e0bc8df7059f08c91cbbcf6865ed7adc4a"],
  ["scripts/start-production.sh", "64d68c68850c19bb6ef00b856c221aba985945de9b71533ee7b53941f32a45ad"],
]);

function providerAllowlistViolations(root, spec, packageJson) {
  const violations = [];
  const observedCommands = new Map();
  const observedComponents = new Set();
  const unexpectedTopLevelFields = Object.keys(spec).filter(
    (field) => !APPROVED_PROVIDER_TOP_LEVEL_FIELDS.has(field),
  );
  if (unexpectedTopLevelFields.length > 0) {
    violations.push(
      `.do/app.yaml contains unapproved top-level fields: ${unexpectedTopLevelFields.sort().join(", ")}`,
    );
  }
  if (spec.name !== "restore-assist" || spec.region !== "syd") {
    violations.push('.do/app.yaml must identify exactly "restore-assist" in region "syd"');
  }
  if (
    JSON.stringify(spec.domains) !==
    JSON.stringify([{ domain: "restoreassist.app", type: "PRIMARY" }])
  ) {
    violations.push(".do/app.yaml must bind exactly the canonical production domain");
  }
  for (const group of PROVIDER_COMPONENT_GROUPS) {
    const components = spec[group] ?? [];
    if (!Array.isArray(components)) continue;
    for (const component of components) {
      if (!component || typeof component !== "object" || Array.isArray(component)) continue;
      const name = typeof component.name === "string" ? component.name : "<unnamed>";
      const componentId = `${group}/${name}`;
      if (observedComponents.has(componentId)) {
        violations.push(`.do/app.yaml contains duplicate provider component ${componentId}`);
      }
      observedComponents.add(componentId);
      if (!APPROVED_PROVIDER_COMPONENTS.has(componentId)) {
        violations.push(`.do/app.yaml#${componentId} is not an approved provider component`);
      }
      if (componentId === "services/web") {
        const unexpectedComponentFields = Object.keys(component).filter(
          (field) => !APPROVED_WEB_COMPONENT_FIELDS.has(field),
        );
        if (unexpectedComponentFields.length > 0) {
          violations.push(
            `.do/app.yaml#${componentId} contains unapproved fields: ${unexpectedComponentFields.sort().join(", ")}`,
          );
        }
      }
      for (const field of [
        "github",
        "git",
        "gitlab",
        "bitbucket",
        "source_dir",
        "dockerfile_path",
        "build_command",
        "run_command",
        "environment_slug",
      ]) {
        if (Object.hasOwn(component, field)) {
          violations.push(`.do/app.yaml#${componentId}.${field} is an unapproved source or execution selector`);
        }
      }
      if (componentId === "services/web") {
        const approvedImage = {
          registry_type: "GHCR",
          registry: "cleanexpo",
          repository: "restoreassist",
          registry_credentials: "${GHCR_PULL_CREDENTIALS}",
          digest: `sha256:${"0".repeat(64)}`,
        };
        if (JSON.stringify(component.image) !== JSON.stringify(approvedImage)) {
          violations.push(`.do/app.yaml#${componentId}.image is not the exact reviewed digest template`);
        }
        if (component.instance_count !== 1 || component.instance_size_slug !== "basic-xxs") {
          violations.push(`.do/app.yaml#${componentId} capacity contract drifted`);
        }
        if (
          component.http_port !== 3000 ||
          JSON.stringify(component.health_check) !==
            JSON.stringify({ http_path: "/api/health/migrations" })
        ) {
          violations.push(`.do/app.yaml#${componentId} runtime health contract drifted`);
        }
      }
      for (const field of ["build_command", "run_command"]) {
        if (typeof component[field] === "string" && component[field].trim()) {
          observedCommands.set(`${group}/${name}.${field}`, component[field]);
        }
      }
      const envs = component.envs ?? [];
      if (!Array.isArray(envs)) {
        violations.push(`.do/app.yaml#${componentId}.envs must be a list`);
      } else {
        const observedEnv = new Map();
        for (const entry of envs) {
          if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.key !== "string") {
            violations.push(`.do/app.yaml#${componentId}.envs contains an invalid entry`);
            continue;
          }
          if (observedEnv.has(entry.key)) {
            violations.push(`.do/app.yaml#${componentId}.envs contains duplicate key ${entry.key}`);
          }
          observedEnv.set(entry.key, entry);
        }
        for (const [key, entry] of observedEnv) {
          const approved = APPROVED_PROVIDER_ENV.get(key);
          if (!approved || JSON.stringify(entry) !== JSON.stringify({ key, ...approved })) {
            violations.push(
              `.do/app.yaml#${componentId}.envs.${key} is not an exact approved provider environment entry`,
            );
          }
        }
        for (const key of APPROVED_PROVIDER_ENV.keys()) {
          if (!observedEnv.has(key)) {
            violations.push(`.do/app.yaml#${componentId}.envs is missing approved key ${key}`);
          }
        }
      }
    }
  }
  for (const componentId of APPROVED_PROVIDER_COMPONENTS) {
    if (!observedComponents.has(componentId)) {
      violations.push(`.do/app.yaml is missing approved provider component ${componentId}`);
    }
  }
  for (const [location, command] of observedCommands) {
    const approved = APPROVED_PROVIDER_COMMANDS.get(location);
    if (command !== approved) {
      violations.push(
        `.do/app.yaml#${location} is not an exact approved provider command; observed ${JSON.stringify(command)}`,
      );
    }
  }
  for (const [location, approved] of APPROVED_PROVIDER_COMMANDS) {
    if (observedCommands.get(location) !== approved) {
      violations.push(`.do/app.yaml#${location} must exactly equal ${JSON.stringify(approved)}`);
    }
  }

  const scripts = packageJson.scripts ?? {};
  for (const lifecycle of PROVIDER_COMMAND_LIFECYCLES) {
    const approved = APPROVED_PROVIDER_PACKAGE_SCRIPTS.get(lifecycle);
    if (approved === undefined) {
      if (Object.hasOwn(scripts, lifecycle)) {
        violations.push(`package.json#scripts.${lifecycle} is an unapproved provider lifecycle hook`);
      }
    } else if (scripts[lifecycle] !== approved) {
      violations.push(
        `package.json#scripts.${lifecycle} must exactly equal ${JSON.stringify(approved)}; observed ${JSON.stringify(scripts[lifecycle])}`,
      );
    }
  }

  const npmrcPath = join(root, ".npmrc");
  if (
    !existsSync(npmrcPath) ||
    !lstatSync(npmrcPath).isFile() ||
    lstatSync(npmrcPath).isSymbolicLink()
  ) {
    violations.push(".npmrc is missing from the provider execution closure");
  } else {
    const observedHash = createHash("sha256").update(readFileSync(npmrcPath)).digest("hex");
    if (observedHash !== APPROVED_NPMRC_SHA256) {
      violations.push(
        `.npmrc content hash mismatch; expected ${APPROVED_NPMRC_SHA256}, observed ${observedHash}`,
      );
    }
  }

  for (const [relativePath, expectedHash] of APPROVED_PROVIDER_EXECUTABLES) {
    const absolutePath = join(root, relativePath);
    if (
      !existsSync(absolutePath) ||
      !lstatSync(absolutePath).isFile() ||
      lstatSync(absolutePath).isSymbolicLink()
    ) {
      violations.push(`approved provider executable ${relativePath} is missing`);
      continue;
    }
    const source = readFileSync(absolutePath);
    const observedHash = createHash("sha256").update(source).digest("hex");
    if (observedHash !== expectedHash) {
      violations.push(
        `approved provider executable ${relativePath} content hash mismatch; expected ${expectedHash}, observed ${observedHash}`,
      );
    }
    if (/\bprisma\s+migrate\s+(?:deploy|resolve)\b/i.test(source.toString("utf8"))) {
      violations.push(`${relativePath} contains a forbidden prisma migrate deploy/resolve sequence`);
    }
  }
  for (const [name, command] of APPROVED_PROVIDER_PACKAGE_SCRIPTS) {
    if (/\bprisma\s+migrate\s+(?:deploy|resolve)\b/i.test(command)) {
      violations.push(`package.json#scripts.${name} contains a forbidden prisma migrate deploy/resolve sequence`);
    }
  }
  return violations;
}

function providerMigrationViolations(root, packageJson) {
  const specPath = join(root, ".do", "app.yaml");
  if (!existsSync(specPath)) return [];
  let spec;
  try {
    spec = parseYaml(readFileSync(specPath, "utf8"));
  } catch (error) {
    return [`.do/app.yaml cannot be parsed: ${error.message}`];
  }
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return [".do/app.yaml must contain an object"];
  }

  const violations = [];
  violations.push(...providerAllowlistViolations(root, spec, packageJson));
  const scripts = packageJson.scripts ?? {};
  const visitedScripts = new Set();

  const unquotedShell = (value) => {
    let output = "";
    let quote = "";
    let escaped = false;
    for (const character of value) {
      if (escaped) {
        escaped = false;
        output += " ";
        continue;
      }
      if (character === "\\" && quote !== "'") {
        escaped = true;
        output += " ";
        continue;
      }
      if (quote) {
        if (character === quote) quote = "";
        output += " ";
        continue;
      }
      if (character === "'" || character === '"') {
        quote = character;
        output += " ";
        continue;
      }
      output += character;
    }
    return { output, balanced: quote === "" && !escaped };
  };

  const inspectLocalExecutable = (relativePath, location) => {
    const normalised = relativePath.replace(/^\.\//, "");
    const absolutePath = resolve(root, normalised);
    const scriptsRoot = `${resolve(root, "scripts")}/`;
    if (!absolutePath.startsWith(scriptsRoot) || !existsSync(absolutePath)) {
      violations.push(`${location} invokes an unavailable or out-of-scope provider executable: ${normalised}`);
      return;
    }
    if (visitedScripts.has(`executable:${normalised}`)) return;
    visitedScripts.add(`executable:${normalised}`);
    const source = readFileSync(absolutePath, "utf8");
    const canExecute =
      /(?:node:)?child_process|\b(?:exec|execFile|spawn|fork|system|popen|check_call|check_output)\s*\(/.test(source) ||
      /\bsubprocess\s*\.|\bos\s*\.\s*(?:system|popen|spawn)/.test(source);
    const canReachDatabase =
      /@prisma\/client|\bDATABASE_URL\b|\b(?:queryRaw|executeRaw|\$queryRaw|\$executeRaw)\b|\b(?:pg|postgres)\b/.test(source);
    if (canExecute || canReachDatabase) {
      violations.push(
        `${location} invokes ${normalised}, which can execute child processes or reach a database and is not statically provable as non-mutating`,
      );
    }
    for (const match of source.matchAll(/(?:import\s+(?:[^"']+?\s+from\s+)?|require\s*\()(["'])(\.{1,2}\/[^"']+)\1\)?/g)) {
      let dependency = resolve(absolutePath, "..", match[2]);
      const candidates = [dependency, ...[".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".sh"].map((extension) => `${dependency}${extension}`)];
      dependency = candidates.find((candidate) => existsSync(candidate));
      if (!dependency) {
        violations.push(`${location} contains an unresolved local executable import: ${match[2]}`);
        continue;
      }
      inspectLocalExecutable(relative(root, dependency), `${location} -> ${normalised}`);
    }
  };

  const inspect = (command, location) => {
    if (typeof command !== "string" || !command.trim()) return;
    const shellShape = unquotedShell(command);
    if (!shellShape.balanced) {
      violations.push(`${location} contains unbalanced shell quoting or escaping`);
      return;
    }
    if (/(^|[^|])\|([^|]|$)|(^|[^&])&([^&]|$)|[<>]|[(){}]/.test(shellShape.output)) {
      violations.push(`${location} contains shell control flow or grouping that cannot be statically proven non-mutating (shell metacharacters, a pipe or redirection)`);
      return;
    }
    for (const rawSegment of command.split(/(?:&&|\|\||;|\n)/)) {
      const controlSegment = rawSegment.trim();
      // This is a release guard, not a shell parser.  Control-flow and command
      // grouping can put an executable command behind tokens such as `then`,
      // `do`, `(` or `{`, which makes the anchored checks below miss it.  Fail
      // closed instead of pretending that a partial parse proves the provider
      // command non-mutating.  Quoted words remain harmless because the token
      // must occur at the executable boundary.
      if (
        /^(?:if|then|elif|else|fi|while|until|for|select|do|done|case|esac|function|!)(?:\s|$)/.test(controlSegment) ||
        /^(?:\(|\{)(?:\s|$)/.test(controlSegment) ||
        /(?:\s|^)(?:\)|\})(?:\s|$)/.test(controlSegment)
      ) {
        violations.push(
          `${location} contains shell control flow or grouping that cannot be statically proven non-mutating: ${controlSegment}`,
        );
        continue;
      }
      let segment = rawSegment
        .trim()
        .replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*/, "")
        .replace(/^(?:exec|command)\s+/, "");
      if (!segment) continue;
      const wrappers = [];
      while (true) {
        if (/^(?:\S+\/)?nohup\s+/.test(segment)) {
          wrappers.push("nohup");
          segment = segment.replace(/^(?:\S+\/)?nohup\s+/, "");
          continue;
        }
        if (/^(?:\S+\/)?env\s+/.test(segment)) {
          wrappers.push("env");
          segment = segment
            .replace(/^(?:\S+\/)?env\s+/, "")
            .replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*/, "");
          if (!segment || /^-/.test(segment)) {
            violations.push(`${location} contains an env wrapper with dynamic options that cannot be statically proven non-mutating`);
            segment = "";
          }
          continue;
        }
        break;
      }
      if (!segment) continue;
      if (/^(?:nice|timeout|stdbuf|setsid|chrt|ionice|sudo|doas|xargs)\b/.test(segment)) {
        violations.push(`${location} contains an unsupported command wrapper that cannot be statically proven non-mutating: ${segment}`);
        continue;
      }
      const analysedLocation = wrappers.length > 0
        ? `${location} via ${wrappers.join(" -> ")}`
        : location;
      if (/\$\(|`/.test(segment)) {
        violations.push(`${analysedLocation} contains executable shell substitution that cannot be proven non-mutating: ${segment}`);
        continue;
      }
      const runtimeInvocation = /^(?:(?:\S+\/)?(?:node|python3?|py|tsx|ts-node))\b/.test(segment);
      const staticallyInspectibleRuntime = /^(?:(?:\S+\/)?(?:node|python3?|py|tsx|ts-node))(?:\s+--?[A-Za-z0-9_-]+(?:=\S+)?)*\s+(?:\.\/)?scripts\/[A-Za-z0-9_./-]+\.(?:[cm]?js|tsx?|py)\b/.test(segment);
      if (runtimeInvocation && !staticallyInspectibleRuntime) {
        violations.push(
          `${analysedLocation} contains a dynamic or inline runtime invocation that cannot be statically proven non-mutating: ${segment}`,
        );
        continue;
      }
      if (/^(?:(?:npx\s+(?:(?:--[A-Za-z0-9_-]+(?:=\S+)?|-[A-Za-z])\s+)*)|(?:npm\s+(?:(?:--[A-Za-z0-9_-]+(?:=\S+)?|-[A-Za-z])\s+)*exec\s+(?:--\s+)?))?prisma(?:@[^\s]+)?\s+migrate\s+(?:deploy|resolve)\b/.test(segment)) {
        violations.push(`${analysedLocation} reaches an automatic production migration command: ${segment}`);
      }
      const shell = segment.match(/^(?:\S+\/)?(?:sh|bash)\s+-c\s+(["'])([\s\S]*)\1$/);
      if (shell) inspect(shell[2], `${analysedLocation} via shell -c`);
      const shellFile = segment.match(/^(?:(?:\S+\/)?(?:sh|bash)\s+)?((?:\.\/)?scripts\/[A-Za-z0-9_./-]+\.sh)\b/);
      if (shellFile) {
        const relativePath = shellFile[1].replace(/^\.\//, "");
        const absolutePath = resolve(root, relativePath);
        const scriptsRoot = `${resolve(root, "scripts")}/`;
        if (!absolutePath.startsWith(scriptsRoot) || !existsSync(absolutePath)) {
          violations.push(`${analysedLocation} invokes an unavailable or out-of-scope provider shell file: ${relativePath}`);
        } else if (!visitedScripts.has(`file:${relativePath}`)) {
          visitedScripts.add(`file:${relativePath}`);
          inspect(readFileSync(absolutePath, "utf8"), `${analysedLocation} -> ${relativePath}`);
        }
      }

      const sourcedShellFile = segment.match(
        /^(?:source|\.)\s+((?:\.\/)?scripts\/[A-Za-z0-9_./-]+\.sh)\b/,
      );
      if (sourcedShellFile) {
        const relativePath = sourcedShellFile[1].replace(/^\.\//, "");
        const absolutePath = resolve(root, relativePath);
        const scriptsRoot = `${resolve(root, "scripts")}/`;
        if (!absolutePath.startsWith(scriptsRoot) || !existsSync(absolutePath)) {
          violations.push(`${analysedLocation} sources an unavailable or out-of-scope provider shell file: ${relativePath}`);
        } else if (!visitedScripts.has(`file:${relativePath}`)) {
          visitedScripts.add(`file:${relativePath}`);
          inspect(readFileSync(absolutePath, "utf8"), `${analysedLocation} -> ${relativePath}`);
        }
      } else if (/^(?:source|\.)\s+/.test(segment)) {
        violations.push(`${analysedLocation} contains a dynamic sourced shell path that cannot be statically proven non-mutating: ${segment}`);
      }

      const executableFile = segment.match(
        /^(?:(?:\S+\/)?(?:node|python3?|py|tsx|ts-node))(?:\s+--?[A-Za-z0-9_-]+(?:=\S+)?)*\s+((?:\.\/)?scripts\/[A-Za-z0-9_./-]+\.(?:[cm]?js|tsx?|py))\b/,
      );
      if (executableFile) {
        inspectLocalExecutable(executableFile[1], analysedLocation);
      }

      const npmRun = segment.match(/^npm(?:\s+(?:--[A-Za-z0-9_-]+(?:=\S+)?|-[A-Za-z]))*\s+(?:(?:run|run-script)\s+([A-Za-z0-9:_-]+)|(start|test|stop|restart))\b/);
      if (!npmRun) {
        if (/^npm\b/.test(segment)) {
          violations.push(`${analysedLocation} contains a dynamic npm script invocation that cannot be proven non-mutating`);
        }
        continue;
      }
      const name = npmRun[1] ?? npmRun[2];
      for (const lifecycleName of [`pre${name}`, name, `post${name}`]) {
        if (!(lifecycleName in scripts)) continue;
        if (visitedScripts.has(lifecycleName)) continue;
        visitedScripts.add(lifecycleName);
        inspect(scripts[lifecycleName], `${analysedLocation} -> package.json#scripts.${lifecycleName}`);
      }
    }
  };

  for (const lifecycle of PROVIDER_INSTALL_LIFECYCLES) {
    if (Object.hasOwn(scripts, lifecycle)) {
      inspect(scripts[lifecycle], `package.json#scripts.${lifecycle}`);
    }
  }

  let componentCount = 0;
  for (const group of PROVIDER_COMPONENT_GROUPS) {
    const components = spec[group] ?? [];
    if (!Array.isArray(components)) {
      violations.push(`.do/app.yaml#${group} must be a list`);
      continue;
    }
    for (const component of components) {
      componentCount += 1;
      if (!component || typeof component !== "object" || Array.isArray(component)) {
        violations.push(`.do/app.yaml#${group} contains a non-object component`);
        continue;
      }
      const name = typeof component.name === "string" ? component.name : "<unnamed>";
      inspect(component.build_command, `.do/app.yaml#${group}/${name}.build_command`);
      inspect(component.run_command, `.do/app.yaml#${group}/${name}.run_command`);
    }
  }
  if (componentCount === 0) violations.push(".do/app.yaml exposes no runnable provider components");
  return violations;
}

export function findReleaseBootstrapViolations(root) {
  const violations = [];
  const packagePath = join(root, "package.json");
  let packageJson;
  try {
    const packageSource = readFileSync(packagePath, "utf8");
    const packageDocument = parseDocument(packageSource, {
      merge: false,
      strict: true,
      uniqueKeys: true,
    });
    if (packageDocument.errors.length > 0) {
      throw new Error(
        `duplicate or ambiguous keys: ${packageDocument.errors.map((error) => error.message).join("; ")}`,
      );
    }
    packageJson = JSON.parse(packageSource);
  } catch (error) {
    return [`package.json cannot be read: ${error.message}`];
  }

  if (packageJson.packageManager && !packageJson.packageManager.startsWith("npm@")) {
    violations.push(
      `package.json#packageManager must be npm when declared; observed ${JSON.stringify(packageJson.packageManager)}`,
    );
  }

  const npmLockPath = join(root, "package-lock.json");
  let npmLock;
  if (!existsSync(npmLockPath)) {
    violations.push("package-lock.json is required for deterministic npm ci installs");
  } else {
    try {
      npmLock = JSON.parse(readFileSync(npmLockPath, "utf8"));
      if (npmLock.lockfileVersion !== 3) {
        violations.push(
          `package-lock.json#lockfileVersion must be 3; observed ${JSON.stringify(npmLock.lockfileVersion)}`,
        );
      }
    } catch (error) {
      violations.push(`package-lock.json cannot be read: ${error.message}`);
    }
  }

  const dependencyGroups = ["dependencies", "devDependencies", "optionalDependencies"];
  if (npmLock) {
    const lockRoot = npmLock.packages?.[""] ?? {};
    for (const group of dependencyGroups) {
      const manifestDependencies = packageJson[group] ?? {};
      const lockedDependencies = lockRoot[group] ?? {};
      for (const [name, spec] of Object.entries(manifestDependencies)) {
        if (lockedDependencies[name] !== spec) {
          violations.push(
            `package-lock.json root ${group}.${name} must match package.json; expected ${JSON.stringify(spec)}, observed ${JSON.stringify(lockedDependencies[name])}`,
          );
        }
      }
      for (const name of Object.keys(lockedDependencies)) {
        if (!(name in manifestDependencies)) {
          violations.push(
            `package-lock.json root ${group}.${name} is absent from package.json`,
          );
        }
      }
    }

    const declaredCapacitorCore = Object.hasOwn(
      packageJson.dependencies ?? {},
      "@capacitor/core",
    );
    const declaredCapacitorIos = Object.hasOwn(
      packageJson.dependencies ?? {},
      "@capacitor/ios",
    );
    const capacitorVersion = npmLock.packages?.["node_modules/@capacitor/core"]?.version;
    const capacitorIosVersion = npmLock.packages?.["node_modules/@capacitor/ios"]?.version;
    if (declaredCapacitorCore && !capacitorVersion) {
      violations.push(
        "package-lock.json must resolve node_modules/@capacitor/core when package.json declares it",
      );
    }
    if (declaredCapacitorIos && !capacitorIosVersion) {
      violations.push(
        "package-lock.json must resolve node_modules/@capacitor/ios when package.json declares it",
      );
    }
    const swiftManifestPath = join(root, "ios", "App", "CapApp-SPM", "Package.swift");
    const swiftResolutionPath = join(
      root,
      "ios",
      "App",
      "App.xcodeproj",
      "project.xcworkspace",
      "xcshareddata",
      "swiftpm",
      "Package.resolved",
    );
    if (capacitorVersion && capacitorIosVersion !== capacitorVersion) {
      violations.push(
        `package-lock.json @capacitor/ios must match @capacitor/core ${capacitorVersion}; observed ${JSON.stringify(capacitorIosVersion)}`,
      );
    }
    if (capacitorVersion && !existsSync(swiftManifestPath)) {
      violations.push("ios Package.swift is required when @capacitor/core is installed");
    } else if (capacitorVersion) {
      const manifest = readFileSync(swiftManifestPath, "utf8");
      const manifestVersion = manifest.match(
        /capacitor-swift-pm\.git",\s*exact:\s*"([^"]+)"/,
      )?.[1];
      if (manifestVersion !== capacitorVersion) {
        violations.push(
          `ios Capacitor SwiftPM version must match package-lock.json @capacitor/core ${capacitorVersion}; observed ${JSON.stringify(manifestVersion)}`,
        );
      }
    }
    if (capacitorVersion && !existsSync(swiftResolutionPath)) {
      violations.push("ios Package.resolved is required when @capacitor/core is installed");
    } else if (capacitorVersion) {
      try {
        const resolution = JSON.parse(readFileSync(swiftResolutionPath, "utf8"));
        const pin = resolution.pins?.find(
          (entry) => entry.identity === "capacitor-swift-pm",
        );
        if (pin?.state?.version !== capacitorVersion) {
          violations.push(
            `ios Package.resolved capacitor-swift-pm must match package-lock.json @capacitor/core ${capacitorVersion}; observed ${JSON.stringify(pin?.state?.version)}`,
          );
        }
      } catch (error) {
        violations.push(`ios Package.resolved cannot be read: ${error.message}`);
      }
    }
  }

  const directDependencies = Object.assign(
    {},
    ...dependencyGroups.map((group) => packageJson[group] ?? {}),
  );

  const packagesDirectory = join(root, "packages");
  if (existsSync(packagesDirectory)) {
    for (const packageName of readdirSync(packagesDirectory)) {
      const nestedManifestPath = join(packagesDirectory, packageName, "package.json");
      if (!existsSync(nestedManifestPath)) continue;
      let nestedManifest;
      try {
        nestedManifest = JSON.parse(readFileSync(nestedManifestPath, "utf8"));
      } catch (error) {
        violations.push(`packages/${packageName}/package.json cannot be read: ${error.message}`);
        continue;
      }
      if (existsSync(join(packagesDirectory, packageName, "pnpm-lock.yaml"))) {
        violations.push(`packages/${packageName}/pnpm-lock.yaml is not an npm lock source`);
      }
      for (const group of dependencyGroups) {
        for (const [name, spec] of Object.entries(nestedManifest[group] ?? {})) {
          if (directDependencies[name] !== spec) {
            violations.push(
              `packages/${packageName}/package.json ${group}.${name} must match a root dependency used by root npm ci; expected ${JSON.stringify(spec)}, observed ${JSON.stringify(directDependencies[name])}`,
            );
          }
        }
      }
      for (const [name, command] of Object.entries(nestedManifest.scripts ?? {})) {
        if (/\bpnpm\b/.test(command)) {
          violations.push(`packages/${packageName}/package.json#scripts.${name} still invokes pnpm`);
        }
      }
    }
  }
  for (const [name, override] of Object.entries(packageJson.overrides ?? {})) {
    if (!(name in directDependencies)) continue;
    const selfOverride = typeof override === "string" ? override : override?.["."];
    if (
      selfOverride !== undefined &&
      selfOverride !== directDependencies[name] &&
      selfOverride !== `$${name}`
    ) {
      violations.push(
        `package.json#overrides.${name} conflicts with direct dependency ${JSON.stringify(directDependencies[name])}`,
      );
    }
  }

  if (existsSync(join(root, "pnpm-lock.yaml"))) {
    violations.push("pnpm-lock.yaml must not coexist with the npm source of truth");
  }

  for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
    if (/\bpnpm\b/.test(command)) {
      violations.push(`package.json#scripts.${name} still invokes pnpm`);
    }
  }

  violations.push(...providerMigrationViolations(root, packageJson));

  for (const path of workflowFiles(root)) {
    violations.push(...workflowSemanticViolations(root, path));
    // Secondary textual scan: retained as an independent instrument that can
    // contradict semantic traversal if a future parser change loses coverage.
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      const executable = line.split("#", 1)[0];
      if (/\bpnpm\b/.test(executable)) {
        violations.push(
          `${relative(root, path)}:${index + 1} still invokes or configures pnpm`,
        );
      }
      const match = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/);
      if (match) {
        const target = match[1].replace(/^[\'"]|[\'"]$/g, "");
        if (target.startsWith("./")) return;
        if (target.startsWith("docker://") && IMMUTABLE_DOCKER_ACTION_REF.test(target)) return;
        const separator = target.lastIndexOf("@");
        const actionName = separator === -1 ? target : target.slice(0, separator);
        const ref = separator === -1 ? "" : target.slice(separator + 1);
        if (!APPROVED_EXTERNAL_ACTIONS.has(actionName)) {
          violations.push(
            `${relative(root, path)}:${index + 1} external action is not on the approved repository list; observed ${actionName}`,
          );
        }
        if (!IMMUTABLE_ACTION_REF.test(ref)) {
          violations.push(
            `${relative(root, path)}:${index + 1} external action must use a full immutable commit SHA; observed ${target}`,
          );
        }
        return;
      }
      const image = line
        .match(/^\s*image:\s*([^\s#]+)/)?.[1]
        ?.replace(/^[\'"]|[\'"]$/g, "");
      if (image && !IMMUTABLE_IMAGE_REF.test(image)) {
        violations.push(
          `${relative(root, path)}:${index + 1} service image must use an immutable sha256 digest; observed ${image}`,
        );
      }
    });
  }


  for (const path of runtimeSourceFiles(root)) {
    if (path.endsWith(join("scripts", "ci", "check-release-bootstrap.mjs"))) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (isCommentOnly(line)) return;
      if (/node_modules[/\\]\.pnpm\b/.test(line) || /\bpnpm\s+(?:install|run|exec|add|build|dev|start|test|lint|type-check|prisma|audit|check:|validate:|security:)\b/.test(line)) {
        violations.push(
          `${relative(root, path)}:${index + 1} contains a pnpm runtime path or invocation`,
        );
      }
    });
  }

  return violations;
}

export function main(root = process.cwd()) {
  const violations = findReleaseBootstrapViolations(resolve(root));
  if (violations.length > 0) {
    console.error("check:release-bootstrap - FAIL");
    for (const violation of violations) console.error(`- ${violation}`);
    return 1;
  }
  console.log(
    "check:release-bootstrap - PASS (npm lockfile; active runtime paths avoid pnpm; immutable workflow actions)",
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv[2]);
}
