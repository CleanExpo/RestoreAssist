#!/usr/bin/env node
/**
 * CI/CD Setup Verification Script
 *
 * Run this script to verify that all CI/CD components are properly configured.
 *
 * Usage: node scripts/verify-ci-setup.js
 */

const fs = require('fs');
const path = require('path');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let errors = 0;
let warnings = 0;
let passed = 0;

function success(message) {
  console.log(`${GREEN}✓${RESET} ${message}`);
  passed++;
}

function error(message) {
  console.log(`${RED}✗${RESET} ${message}`);
  errors++;
}

function warning(message) {
  console.log(`${YELLOW}⚠${RESET} ${message}`);
  warnings++;
}

function info(message) {
  console.log(`${BLUE}ℹ${RESET} ${message}`);
}

function section(title) {
  console.log(`\n${BLUE}━━━ ${title} ━━━${RESET}\n`);
}

function checkFileExists(filePath, description) {
  const fullPath = path.join(__dirname, '..', filePath);
  if (fs.existsSync(fullPath)) {
    success(`${description} exists: ${filePath}`);
    return true;
  } else {
    error(`${description} missing: ${filePath}`);
    return false;
  }
}

function checkDirectoryExists(dirPath, description) {
  const fullPath = path.join(__dirname, '..', dirPath);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    success(`${description} exists: ${dirPath}`);
    return true;
  } else {
    error(`${description} missing: ${dirPath}`);
    return false;
  }
}

function checkPackageScript(packagePath, scriptName, description) {
  const fullPath = path.join(__dirname, '..', packagePath);
  if (!fs.existsSync(fullPath)) {
    error(`package.json not found: ${packagePath}`);
    return false;
  }

  const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  if (pkg.scripts && pkg.scripts[scriptName]) {
    success(`${description}: ${scriptName}`);
    return true;
  } else {
    warning(`Script missing in ${packagePath}: ${scriptName}`);
    return false;
  }
}

function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║         CI/CD Setup Verification                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  // ==========================================
  // GitHub Actions Workflows
  // ==========================================
  section('GitHub Actions Workflows');
  checkFileExists('.github/workflows/test.yml', 'Test workflow');
  checkFileExists('.github/workflows/deploy.yml', 'Deploy workflow');
  checkFileExists('.github/workflows/deploy-backend.yml', 'Backend deploy workflow');

  // ==========================================
  // Husky Git Hooks
  // ==========================================
  section('Husky Git Hooks');
  checkDirectoryExists('.husky', 'Husky directory');
  checkFileExists('.husky/pre-commit', 'Pre-commit hook');
  checkFileExists('.husky/commit-msg', 'Commit-msg hook');

  // ==========================================
  // Code Quality Tools
  // ==========================================
  section('Code Quality Configuration');
  checkFileExists('.eslintrc.json', 'ESLint config');
  checkFileExists('.prettierrc', 'Prettier config');
  checkFileExists('.prettierignore', 'Prettier ignore');
  checkFileExists('commitlint.config.js', 'Commitlint config');

  // ==========================================
  // Test Files and Utilities
  // ==========================================
  section('Test Infrastructure');
  checkFileExists('packages/backend/tests/utils/testHelpers.ts', 'Backend test helpers');
  checkFileExists('packages/frontend/tests/utils/testHelpers.tsx', 'Frontend test helpers');
  checkFileExists('packages/backend/tests/performance/benchmark.ts', 'Performance benchmark utils');
  checkFileExists('packages/backend/tests/performance/api-benchmarks.test.ts', 'API benchmark tests');

  // ==========================================
  // Documentation
  // ==========================================
  section('Documentation');
  checkFileExists('TESTING.md', 'Testing guide');
  checkFileExists('CI-CD-SETUP.md', 'CI/CD setup guide');

  // ==========================================
  // Package Scripts
  // ==========================================
  section('Package Scripts');

  // Root package
  checkPackageScript('package.json', 'prepare', 'Husky prepare script (root)');

  // Backend package
  checkPackageScript('packages/backend/package.json', 'test', 'Backend test script');
  checkPackageScript('packages/backend/package.json', 'test:coverage', 'Backend coverage script');
  checkPackageScript('packages/backend/package.json', 'test:perf', 'Backend performance tests');
  checkPackageScript('packages/backend/package.json', 'lint', 'Backend lint script');
  checkPackageScript('packages/backend/package.json', 'format', 'Backend format script');

  // Frontend package
  checkPackageScript('packages/frontend/package.json', 'test', 'Frontend test script');
  checkPackageScript('packages/frontend/package.json', 'test:e2e', 'Frontend E2E tests');
  checkPackageScript('packages/frontend/package.json', 'test:e2e:ui', 'Frontend E2E UI mode');

  // ==========================================
  // Dependencies
  // ==========================================
  section('Dependencies');

  const rootPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const devDeps = rootPkg.devDependencies || {};

  const requiredDeps = [
    'husky',
    'lint-staged',
    '@commitlint/cli',
    '@commitlint/config-conventional',
    'eslint',
    '@typescript-eslint/parser',
    '@typescript-eslint/eslint-plugin',
    'prettier',
  ];

  requiredDeps.forEach(dep => {
    if (devDeps[dep]) {
      success(`Dependency installed: ${dep}`);
    } else {
      error(`Dependency missing: ${dep}`);
    }
  });

  // ==========================================
  // Git Configuration
  // ==========================================
  section('Git Configuration');

  if (fs.existsSync(path.join(__dirname, '..', '.git'))) {
    success('Git repository initialized');

    // Check if hooks are executable (Unix only)
    if (process.platform !== 'win32') {
      try {
        const preCommitPath = path.join(__dirname, '..', '.husky', 'pre-commit');
        const stats = fs.statSync(preCommitPath);
        const isExecutable = (stats.mode & 0o111) !== 0;

        if (isExecutable) {
          success('Pre-commit hook is executable');
        } else {
          warning('Pre-commit hook may not be executable (run: chmod +x .husky/pre-commit)');
        }
      } catch (err) {
        warning('Could not check hook permissions');
      }
    }
  } else {
    warning('Not a git repository (git init not run)');
  }

  // ==========================================
  // Environment Variables
  // ==========================================
  section('Environment Variables (Local)');

  if (fs.existsSync(path.join(__dirname, '..', '.env'))) {
    success('.env file exists');
  } else {
    warning('.env file not found (may not be needed for CI/CD)');
  }

  info('Note: GitHub secrets must be configured manually in repository settings');

  // ==========================================
  // Summary
  // ==========================================
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    Summary                                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log(`${GREEN}Passed:${RESET}   ${passed}`);
  console.log(`${YELLOW}Warnings:${RESET} ${warnings}`);
  console.log(`${RED}Errors:${RESET}   ${errors}\n`);

  if (errors === 0 && warnings === 0) {
    console.log(`${GREEN}🎉 Perfect! CI/CD setup is complete and verified!${RESET}\n`);
    process.exit(0);
  } else if (errors === 0) {
    console.log(`${YELLOW}⚠ Setup complete with warnings. Review warnings above.${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${RED}❌ Setup incomplete. Please fix errors above.${RESET}\n`);
    process.exit(1);
  }
}

main();
