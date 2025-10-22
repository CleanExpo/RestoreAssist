#!/usr/bin/env node

/**
 * OAuth Configuration Verification Script
 *
 * This script verifies that Google OAuth is properly configured by:
 * 1. Checking environment variables
 * 2. Testing backend OAuth health endpoint
 * 3. Checking if servers are running
 * 4. Providing actionable next steps
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(`  ${title}`, 'cyan');
  console.log('='.repeat(60) + '\n');
}

// Read environment file
function readEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const env = {};
    content.split('\n').forEach(line => {
      const match = line.match(/^([^#][^=]+)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim();
      }
    });
    return env;
  } catch (error) {
    return null;
  }
}

// Check if URL is accessible
function checkURL(url, description) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'GET',
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      resolve({ success: true, status: res.statusCode });
    });

    req.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Timeout' });
    });

    req.end();
  });
}

async function main() {
  console.clear();
  log('╔══════════════════════════════════════════════════════════╗', 'cyan');
  log('║     Google OAuth Configuration Verification Script       ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════╝', 'cyan');

  let hasErrors = false;
  let hasWarnings = false;

  // Step 1: Check Frontend Environment
  logSection('Step 1: Frontend Environment Variables');

  let frontendEnvPath = path.join(__dirname, '../packages/frontend/.env.local');
  let frontendEnv = readEnvFile(frontendEnvPath);

  if (!frontendEnv) {
    frontendEnvPath = path.join(__dirname, '../packages/frontend/.env');
    frontendEnv = readEnvFile(frontendEnvPath);
  }

  if (!frontendEnv) {
    log('❌ Frontend environment file not found', 'red');
    log('   Checked: .env.local and .env', 'yellow');
    hasErrors = true;
  } else {
    const fileName = frontendEnvPath.includes('.env.local') ? '.env.local' : '.env';
    log(`✅ Frontend ${fileName} found`, 'green');

    const clientId = frontendEnv.VITE_GOOGLE_CLIENT_ID;
    if (clientId && clientId.includes('apps.googleusercontent.com')) {
      log(`✅ VITE_GOOGLE_CLIENT_ID is set`, 'green');
      log(`   ${clientId.substring(0, 30)}...`, 'blue');
    } else {
      log('❌ VITE_GOOGLE_CLIENT_ID is missing or invalid', 'red');
      hasErrors = true;
    }
  }

  // Step 2: Check Backend Environment
  logSection('Step 2: Backend Environment Variables');

  let backendEnvPath = path.join(__dirname, '../packages/backend/.env.local');
  let backendEnv = readEnvFile(backendEnvPath);

  if (!backendEnv) {
    backendEnvPath = path.join(__dirname, '../packages/backend/.env');
    backendEnv = readEnvFile(backendEnvPath);
  }

  if (!backendEnv) {
    log('❌ Backend environment file not found', 'red');
    log('   Checked: .env.local and .env', 'yellow');
    hasErrors = true;
  } else {
    const fileName = backendEnvPath.includes('.env.local') ? '.env.local' : '.env';
    log(`✅ Backend ${fileName} found`, 'green');

    const clientId = backendEnv.GOOGLE_CLIENT_ID;
    const clientSecret = backendEnv.GOOGLE_CLIENT_SECRET;
    const redirectUri = backendEnv.GOOGLE_REDIRECT_URI;

    if (clientId && clientId.includes('apps.googleusercontent.com')) {
      log(`✅ GOOGLE_CLIENT_ID is set`, 'green');
    } else {
      log('❌ GOOGLE_CLIENT_ID is missing or invalid', 'red');
      hasErrors = true;
    }

    if (clientSecret && clientSecret.length > 10) {
      log(`✅ GOOGLE_CLIENT_SECRET is set`, 'green');
    } else {
      log('❌ GOOGLE_CLIENT_SECRET is missing', 'red');
      hasErrors = true;
    }

    if (redirectUri) {
      log(`✅ GOOGLE_REDIRECT_URI is set`, 'green');
      log(`   ${redirectUri}`, 'blue');
    } else {
      log('⚠️  GOOGLE_REDIRECT_URI is not set', 'yellow');
      hasWarnings = true;
    }
  }

  // Step 3: Check if servers are running
  logSection('Step 3: Server Health Checks');

  log('Checking frontend server...', 'blue');
  const frontendCheck = await checkURL('http://localhost:5173', 'Frontend');
  if (frontendCheck.success) {
    log(`✅ Frontend server is running (HTTP ${frontendCheck.status})`, 'green');
  } else {
    log(`❌ Frontend server is not accessible: ${frontendCheck.error}`, 'red');
    log('   Run: npm run dev:frontend', 'yellow');
    hasErrors = true;
  }

  log('\nChecking backend server...', 'blue');
  const backendCheck = await checkURL('http://localhost:3001/api/health', 'Backend');
  if (backendCheck.success) {
    log(`✅ Backend server is running (HTTP ${backendCheck.status})`, 'green');
  } else {
    log(`❌ Backend server is not accessible: ${backendCheck.error}`, 'red');
    log('   Run: npm run dev:backend', 'yellow');
    hasErrors = true;
  }

  // Step 4: Check OAuth health endpoint
  logSection('Step 4: OAuth Configuration Health Check');

  const oauthCheck = await checkURL('http://localhost:3001/api/auth/health', 'OAuth Health');
  if (oauthCheck.success && oauthCheck.status === 200) {
    log('✅ OAuth health endpoint is responding', 'green');
    log('   This means backend OAuth config is valid', 'blue');
  } else {
    log('❌ OAuth health endpoint failed', 'red');
    log('   Backend may not have correct OAuth configuration', 'yellow');
    hasErrors = true;
  }

  // Step 5: Summary and next steps
  logSection('Summary & Next Steps');

  if (frontendEnv && backendEnv) {
    const frontendClientId = frontendEnv.VITE_GOOGLE_CLIENT_ID || '';
    const backendClientId = backendEnv.GOOGLE_CLIENT_ID || '';

    if (frontendClientId === backendClientId && frontendClientId.length > 0) {
      log('✅ Client IDs match between frontend and backend', 'green');
      log(`   ${frontendClientId.substring(0, 30)}...`, 'blue');
    } else {
      log('❌ Client IDs DO NOT match or are missing', 'red');
      log(`   Frontend: ${frontendClientId.substring(0, 30)}...`, 'yellow');
      log(`   Backend:  ${backendClientId.substring(0, 30)}...`, 'yellow');
      hasErrors = true;
    }
  }

  console.log('\n' + '-'.repeat(60));

  if (!hasErrors && !hasWarnings) {
    log('\n🎉 All checks passed! OAuth is properly configured.', 'green');
    log('\nNext steps:', 'cyan');
    log('1. Open http://localhost:5173', 'blue');
    log('2. Click "Start Free Trial"', 'blue');
    log('3. Click "Sign in with Google"', 'blue');
    log('4. Verify Google OAuth popup opens (no 403 error)', 'blue');
  } else if (hasErrors) {
    log('\n❌ Configuration errors found. Please fix the issues above.', 'red');
    log('\nQuick fixes:', 'cyan');
    if (!frontendEnv || !backendEnv) {
      log('• Copy .env.example to .env.local in both packages', 'yellow');
    }
    log('• Verify Google Cloud Console OAuth configuration', 'yellow');
    log('• See: GOOGLE_OAUTH_FIX_NOW.md for detailed instructions', 'yellow');
  } else if (hasWarnings) {
    log('\n⚠️  Configuration warnings found. Review above.', 'yellow');
    log('\nOAuth should still work for local development.', 'green');
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Exit with appropriate code
  process.exit(hasErrors ? 1 : 0);
}

// Run the script
main().catch((error) => {
  log(`\n❌ Script error: ${error.message}`, 'red');
  process.exit(1);
});
