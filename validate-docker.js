#!/usr/bin/env node

/**
 * Docker Configuration Validator
 *
 * Validates that all necessary Docker files are present and properly configured
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_FILES = [
  'Dockerfile',
  '.dockerignore',
  'docker-compose.yml',
  '.env.docker',
  'init-db.sql',
  'README-DOCKER.md',
  'docker-compose.prod.yml',
  'docker-compose.dev.yml',
  'app/api/health/route.ts',
];

const REQUIRED_ENV_VARS = [
  'POSTGRES_PASSWORD',
  'NEXTAUTH_SECRET',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
];

const OPTIONAL_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'STRIPE_SECRET_KEY',
  'GOOGLE_CLIENT_ID',
];

console.log('🐳 Docker Configuration Validator\n');
console.log('='.repeat(50));

let errors = 0;
let warnings = 0;

// Check required files
console.log('\n📁 Checking required files...\n');
REQUIRED_FILES.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    errors++;
  }
});

// Check package.json scripts
console.log('\n📦 Checking package.json Docker scripts...\n');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const requiredScripts = [
  'docker:build',
  'docker:up',
  'docker:down',
  'docker:logs',
];

requiredScripts.forEach(script => {
  if (packageJson.scripts[script]) {
    console.log(`✅ npm run ${script}`);
  } else {
    console.log(`❌ npm run ${script} - MISSING`);
    errors++;
  }
});

// Check next.config.mjs for standalone output
console.log('\n⚙️  Checking Next.js configuration...\n');
const nextConfigPath = path.join(__dirname, 'next.config.mjs');
if (fs.existsSync(nextConfigPath)) {
  const nextConfig = fs.readFileSync(nextConfigPath, 'utf8');
  if (nextConfig.includes("output: 'standalone'")) {
    console.log('✅ Next.js standalone output enabled');
  } else {
    console.log('⚠️  Next.js standalone output not enabled (recommended for Docker)');
    warnings++;
  }
} else {
  console.log('❌ next.config.mjs not found');
  errors++;
}

// Check .env.docker.local
console.log('\n🔐 Checking environment configuration...\n');
const envDockerLocalPath = path.join(__dirname, '.env.docker.local');
if (fs.existsSync(envDockerLocalPath)) {
  console.log('✅ .env.docker.local exists');

  const envContent = fs.readFileSync(envDockerLocalPath, 'utf8');
  const envVars = {};

  envContent.split('\n').forEach(line => {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match) {
      envVars[match[1]] = match[2];
    }
  });

  console.log('\n   Required variables:');
  REQUIRED_ENV_VARS.forEach(varName => {
    const value = envVars[varName];
    if (value && !value.includes('your-') && !value.includes('generate_') && value.length > 10) {
      console.log(`   ✅ ${varName}`);
    } else {
      console.log(`   ❌ ${varName} - Not configured or using placeholder`);
      errors++;
    }
  });

  console.log('\n   Optional variables (at least one AI key required):');
  const hasAIKey = OPTIONAL_ENV_VARS.slice(0, 2).some(varName => {
    const value = envVars[varName];
    return value && !value.includes('your-') && value.length > 10;
  });

  if (hasAIKey) {
    console.log('   ✅ AI API key configured');
  } else {
    console.log('   ❌ No AI API key configured (ANTHROPIC_API_KEY or OPENAI_API_KEY required)');
    errors++;
  }
} else {
  console.log('⚠️  .env.docker.local not found');
  console.log('   Run: copy .env.docker .env.docker.local');
  warnings++;
}

// Check Prisma schema
console.log('\n🗄️  Checking database configuration...\n');
const prismaSchemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
if (fs.existsSync(prismaSchemaPath)) {
  console.log('✅ Prisma schema found');
} else {
  console.log('❌ Prisma schema not found');
  errors++;
}

// Check gitignore
console.log('\n🔒 Checking .gitignore...\n');
const gitignorePath = path.join(__dirname, '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  if (gitignoreContent.includes('.env') || gitignoreContent.includes('.env*')) {
    console.log('✅ .env files properly ignored');
  } else {
    console.log('⚠️  .env files not in .gitignore (security risk)');
    warnings++;
  }
} else {
  console.log('⚠️  .gitignore not found');
  warnings++;
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('\n📊 Validation Summary\n');

if (errors === 0 && warnings === 0) {
  console.log('🎉 All checks passed! Docker configuration is ready.');
  console.log('\nNext steps:');
  console.log('  1. Configure .env.docker.local (if not done)');
  console.log('  2. Run: npm run docker:build');
  console.log('  3. Run: npm run docker:up');
  console.log('  4. Visit: http://localhost:3001');
  process.exit(0);
} else {
  if (errors > 0) {
    console.log(`❌ ${errors} error(s) found`);
  }
  if (warnings > 0) {
    console.log(`⚠️  ${warnings} warning(s) found`);
  }
  console.log('\nPlease fix the issues above before proceeding.');
  process.exit(1);
}
