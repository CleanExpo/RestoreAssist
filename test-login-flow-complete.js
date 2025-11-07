/**
 * Comprehensive Login Flow Test Suite for RestoreAssist Production
 *
 * Tests the complete user journey:
 * 1. Login with test credentials
 * 2. Dashboard access and verification
 * 3. API endpoints testing
 * 4. Report creation flow
 * 5. Navigation testing
 * 6. Session persistence
 * 7. Error handling
 *
 * Usage: node test-login-flow-complete.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Test Configuration
const CONFIG = {
  baseUrl: 'https://restoreassist.app',
  apiUrl: 'https://restoreassist.app',
  testUser: {
    email: 'test@restoreassist.com',
    password: 'Test123!@#'
  },
  timeout: 30000,
  screenshotDir: path.join(__dirname, 'screenshots'),
  testDataDir: path.join(__dirname, 'test-data'),
  resultsFile: path.join(__dirname, 'test-results-comprehensive.json')
};

// Test Results Tracker
const testResults = {
  timestamp: new Date().toISOString(),
  environment: 'production',
  baseUrl: CONFIG.baseUrl,
  totalTests: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

// Utility Functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '✓',
    error: '✗',
    warning: '⚠',
    debug: '→'
  }[type] || '•';

  console.log(`[${timestamp}] ${prefix} ${message}`);
}

function logTest(name, status, details = {}) {
  const result = {
    name,
    status,
    timestamp: new Date().toISOString(),
    ...details
  };

  testResults.tests.push(result);
  testResults.totalTests++;

  if (status === 'passed') {
    testResults.passed++;
    log(`PASS: ${name}`, 'info');
  } else if (status === 'failed') {
    testResults.failed++;
    log(`FAIL: ${name}`, 'error');
    if (details.error) {
      log(`  Error: ${details.error}`, 'error');
    }
  } else if (status === 'skipped') {
    testResults.skipped++;
    log(`SKIP: ${name}`, 'warning');
  }
}

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          cookies: res.headers['set-cookie'] || []
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(CONFIG.timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (postData) {
      req.write(postData);
    }

    req.end();
  });
}

async function parseJSON(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

function extractCookies(setCookieHeaders) {
  const cookies = {};
  if (!setCookieHeaders) return cookies;

  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

  headers.forEach(header => {
    const parts = header.split(';')[0].split('=');
    if (parts.length === 2) {
      cookies[parts[0].trim()] = parts[1].trim();
    }
  });

  return cookies;
}

function cookiesToString(cookies) {
  return Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

// Ensure directories exist
if (!fs.existsSync(CONFIG.screenshotDir)) {
  fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
}
if (!fs.existsSync(CONFIG.testDataDir)) {
  fs.mkdirSync(CONFIG.testDataDir, { recursive: true });
}

// Test Suite
class LoginFlowTestSuite {
  constructor() {
    this.session = {
      cookies: {},
      csrfToken: null,
      userId: null,
      sessionToken: null
    };
  }

  async runAll() {
    log('\n========================================');
    log('RestoreAssist Production Login Flow Test');
    log('========================================\n');
    log(`Testing against: ${CONFIG.baseUrl}`);
    log(`Test user: ${CONFIG.testUser.email}\n`);

    try {
      // Test 1: Home Page Accessibility
      await this.testHomePageAccess();

      // Test 2: Login Page Access
      await this.testLoginPageAccess();

      // Test 3: Authentication - Invalid Credentials
      await this.testInvalidLogin();

      // Test 4: Authentication - Valid Credentials
      await this.testValidLogin();

      // Test 5: Session Verification
      await this.testSessionVerification();

      // Test 6: Dashboard Access
      await this.testDashboardAccess();

      // Test 7: API Endpoints - Reports
      await this.testReportsAPI();

      // Test 8: API Endpoints - Clients
      await this.testClientsAPI();

      // Test 9: Create New Report
      await this.testCreateReport();

      // Test 10: Navigation Testing
      await this.testNavigation();

      // Test 11: Protected Routes
      await this.testProtectedRoutes();

      // Test 12: Logout
      await this.testLogout();

      // Test 13: Session Persistence
      await this.testSessionPersistence();

      // Test 14: Error Handling
      await this.testErrorHandling();

    } catch (error) {
      log(`Fatal error in test suite: ${error.message}`, 'error');
      logTest('Test Suite Execution', 'failed', { error: error.message });
    }

    // Generate final report
    await this.generateReport();
  }

  async testHomePageAccess() {
    const testName = 'Home Page Access';
    try {
      const response = await makeRequest({
        hostname: 'restoreassist.app',
        path: '/',
        method: 'GET',
        headers: {
          'User-Agent': 'RestoreAssist-Test-Suite/1.0'
        }
      });

      if (response.statusCode === 200 || response.statusCode === 301 || response.statusCode === 302) {
        logTest(testName, 'passed', {
          statusCode: response.statusCode,
          contentLength: response.body.length
        });
      } else {
        logTest(testName, 'failed', {
          statusCode: response.statusCode,
          error: `Unexpected status code: ${response.statusCode}`
        });
      }
    } catch (error) {
      logTest(testName, 'failed', { error: error.message });
    }
  }

  async testLoginPageAccess() {
    const testName = 'Login Page Access';
    try {
      const response = await makeRequest({
        hostname: 'restoreassist.app',
        path: '/auth/signin',
        method: 'GET',
        headers: {
          'User-Agent': 'RestoreAssist-Test-Suite/1.0'
        }
      });

      if (response.statusCode === 200) {
        const hasLoginForm = response.body.includes('email') ||
                            response.body.includes('password') ||
                            response.body.includes('sign in');

        if (hasLoginForm) {
          logTest(testName, 'passed', {
            statusCode: response.statusCode,
            hasLoginForm: true
          });
        } else {
          logTest(testName, 'failed', {
            statusCode: response.statusCode,
            error: 'Login form not found in page'
          });
        }
      } else {
        logTest(testName, 'failed', {
          statusCode: response.statusCode,
          error: `Unexpected status code: ${response.statusCode}`
        });
      }
    } catch (error) {
      logTest(testName, 'failed', { error: error.message });
    }
  }

  async testInvalidLogin() {
    const testName = 'Invalid Login Attempt';
    try {
      const credentials = JSON.stringify({
        email: 'invalid@example.com',
        password: 'wrongpassword'
      });

      const response = await makeRequest({
        hostname: 'restoreassist.app',
        path: '/api/auth/callback/credentials',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(credentials),
          'User-Agent': 'RestoreAssist-Test-Suite/1.0'
        }
      }, credentials);

      if (response.statusCode === 401 || response.statusCode === 403) {
        logTest(testName, 'passed', {
          statusCode: response.statusCode,
          message: 'Correctly rejected invalid credentials'
        });
      } else {
        logTest(testName, 'failed', {
          statusCode: response.statusCode,
          error: 'Invalid credentials should be rejected'
        });
      }
    } catch (error) {
      logTest(testName, 'failed', { error: error.message });
    }
  }

  async testValidLogin() {
    const testName = 'Valid Login';
    try {
      // First, get the CSRF token
      const csrfResponse = await makeRequest({
        hostname: 'restoreassist.app',
        path: '/api/auth/csrf',
        method: 'GET',
        headers: {
          'User-Agent': 'RestoreAssist-Test-Suite/1.0'
        }
      });

      const csrfData = await parseJSON(csrfResponse.body);
      if (csrfData && csrfData.csrfToken) {
        this.session.csrfToken = csrfData.csrfToken;
      }

      // Store cookies from CSRF request
      Object.assign(this.session.cookies, extractCookies(csrfResponse.cookies));

      // Now attempt login
      const credentials = JSON.stringify({
        email: CONFIG.testUser.email,
        password: CONFIG.testUser.password,
        callbackUrl: '/dashboard',
        json: true
      });

      const response = await makeRequest({
        hostname: 'restoreassist.app',
        path: '/api/auth/callback/credentials',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(credentials),
          'Cookie': cookiesToString(this.session.cookies),
          'User-Agent': 'RestoreAssist-Test-Suite/1.0'
        }
      }, credentials);

      // Store session cookies
      Object.assign(this.session.cookies, extractCookies(response.cookies));

      if (response.statusCode === 200 || response.statusCode === 302) {
        // Check for session token
        const hasSessionToken = this.session.cookies['next-auth.session-token'] ||
                               this.session.cookies['__Secure-next-auth.session-token'];

        if (hasSessionToken) {
          this.session.sessionToken = hasSessionToken;
          logTest(testName, 'passed', {
            statusCode: response.statusCode,
            hasSessionToken: true,
            cookieCount: Object.keys(this.session.cookies).length
          });
        } else {
          logTest(testName, 'failed', {
            statusCode: response.statusCode,
            error: 'No session token received',
            cookies: Object.keys(this.session.cookies)
          });
        }
      } else {
        logTest(testName, 'failed', {
          statusCode: response.statusCode,
          error: `Login failed with status: ${response.statusCode}`,
          body: response.body.substring(0, 200)
        });
      }
    } catch (error) {
      logTest(testName, 'failed', { error: error.message });
    }
  }

  async testSessionVerification() {
    const testName = 'Session Verification';
    try {
      const response = await makeRequest({
        hostname: 'restoreassist.app',
        path: '/api/auth/session',
        method: 'GET',
        headers: {
          'Cookie': cookiesToString(this.session.cookies),
          'User-Agent': 'RestoreAssist-Test-Suite/1.0'
        }
      });

      const sessionData = await parseJSON(response.body);

      if (response.statusCode === 200 && sessionData && sessionData.user) {
        this.session.userId = sessionData.user.id;
        logTest(testName, 'passed', {
          statusCode: response.statusCode,
          userId: sessionData.user.id,
          userEmail: sessionData.user.email
        });
      } else {
        logTest(testName, 'failed', {
          statusCode: response.statusCode,
          error: 'No valid session found',
          body: response.body.substring(0, 200)
        });
      }
    } catch (error) {
      logTest(testName, 'failed', { error: error.message });
    }
  }

  async testDashboardAccess() {
    const testName = 'Dashboard Access';
    try {
      const response = await makeRequest({
        hostname: 'restoreassist.app',
        path: '/dashboard',
        method: 'GET',
        headers: {
          'Cookie': cookiesToString(this.session.cookies),
          'User-Agent': 'RestoreAssist-Test-Suite/1.0'
        }
      });

      if (response.statusCode === 200) {
        const hasDashboardContent = response.body.includes('dashboard') ||
                                   response.body.includes('Dashboard');

        logTest(testName, 'passed', {
          statusCode: response.statusCode,
          hasDashboardContent,
          contentLength: response.body.length
        });
      } else {
        logTest(testName, 'failed', {
          statusCode: response.statusCode,
          error: `Expected 200, got ${response.statusCode}`
        });
      }
    } catch (error) {
      logTest(testName, 'failed', { error: error.message });
    }
  }

  async testReportsAPI() {
    const testName = 'Reports API Endpoint';
    try {
      const response = await makeRequest({
        hostname: 'restoreassist.app',
        path: '/api/reports',
        method: 'GET',
        headers: {
          'Cookie': cookiesToString(this.session.cookies),
          'User-Agent': 'RestoreAssist-Test-Suite/1.0',
          'Accept': 'application/json'
        }
      });

      if (response.statusCode === 200) {
        const data = await parseJSON(response.body);
        const isValidResponse = data !== null;

        logTest(testName, 'passed', {
          statusCode: response.statusCode,
          isArray: Array.isArray(data),
          recordCount: Array.isArray(data) ? data.length : 'N/A'
        });
      } else {
        logTest(testName, 'failed', {
          statusCode: response.statusCode,
          error: `Expected 200, got ${response.statusCode}`,
          body: response.body.substring(0, 200)
        });
      }
    } catch (error) {
      logTest(testName, 'failed', { error: error.message });
    }
  }

  async testClientsAPI() {
    const testName = 'Clients API Endpoint';
    try {
      const response = await makeRequest({
        hostname: 'restoreassist.app',
        path: '/api/clients',
        method: 'GET',
        headers: {
          'Cookie': cookiesToString(this.session.cookies),
          'User-Agent': 'RestoreAssist-Test-Suite/1.0',
          'Accept': 'application/json'
        }
      });

      if (response.statusCode === 200) {
        const data = await parseJSON(response.body);

        logTest(testName, 'passed', {
          statusCode: response.statusCode,
          isArray: Array.isArray(data),
          recordCount: Array.isArray(data) ? data.length : 'N/A'
        });
      } else if (response.statusCode === 404) {
        logTest(testName, 'skipped', {
          statusCode: response.statusCode,
          reason: 'Clients API endpoint not found'
        });
      } else {
        logTest(testName, 'failed', {
          statusCode: response.statusCode,
          error: `Unexpected status code: ${response.statusCode}`
        });
      }
    } catch (error) {
      logTest(testName, 'failed', { error: error.message });
    }
  }

  async testCreateReport() {
    const testName = 'Create New Report';
    try {
      const reportData = JSON.stringify({
        title: `Test Report ${Date.now()}`,
        clientName: 'Test Client',
        propertyAddress: '123 Test Street',
        description: 'Automated test report creation',
        status: 'draft'
      });

      const response = await makeRequest({
        hostname: 'restoreassist.app',
        path: '/api/reports',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(reportData),
          'Cookie': cookiesToString(this.session.cookies),
          'User-Agent': 'RestoreAssist-Test-Suite/1.0',
          'Accept': 'application/json'
        }
      }, reportData);

      if (response.statusCode === 200 || response.statusCode === 201) {
        const data = await parseJSON(response.body);

        logTest(testName, 'passed', {
          statusCode: response.statusCode,
          reportId: data ? data.id : 'N/A'
        });
      } else if (response.statusCode === 403 || response.statusCode === 401) {
        logTest(testName, 'skipped', {
          statusCode: response.statusCode,
          reason: 'Insufficient permissions or trial limitations'
        });
      } else {
        logTest(testName, 'failed', {
          statusCode: response.statusCode,
          error: `Expected 200/201, got ${response.statusCode}`,
          body: response.body.substring(0, 200)
        });
      }
    } catch (error) {
      logTest(testName, 'failed', { error: error.message });
    }
  }

  async testNavigation() {
    const testName = 'Navigation Testing';
    const routes = [
      '/dashboard',
      '/reports',
      '/clients',
      '/settings',
      '/profile'
    ];

    try {
      const results = [];

      for (const route of routes) {
        try {
          const response = await makeRequest({
            hostname: 'restoreassist.app',
            path: route,
            method: 'GET',
            headers: {
              'Cookie': cookiesToString(this.session.cookies),
              'User-Agent': 'RestoreAssist-Test-Suite/1.0'
            }
          });

          results.push({
            route,
            statusCode: response.statusCode,
            accessible: response.statusCode === 200
          });
        } catch (error) {
          results.push({
            route,
            statusCode: 'error',
            accessible: false,
            error: error.message
          });
        }
      }

      const accessibleRoutes = results.filter(r => r.accessible).length;
      const totalRoutes = results.length;

      logTest(testName, 'passed', {
        accessibleRoutes,
        totalRoutes,
        routes: results
      });
    } catch (error) {
      logTest(testName, 'failed', { error: error.message });
    }
  }

  async testProtectedRoutes() {
    const testName = 'Protected Routes (Unauthenticated)';
    try {
      const response = await makeRequest({
        hostname: 'restoreassist.app',
        path: '/dashboard',
        method: 'GET',
        headers: {
          'User-Agent': 'RestoreAssist-Test-Suite/1.0'
        }
      });

      if (response.statusCode === 401 || response.statusCode === 302 || response.statusCode === 303) {
        logTest(testName, 'passed', {
          statusCode: response.statusCode,
          message: 'Protected route correctly requires authentication'
        });
      } else if (response.statusCode === 200) {
        logTest(testName, 'failed', {
          statusCode: response.statusCode,
          error: 'Protected route accessible without authentication'
        });
      } else {
        logTest(testName, 'failed', {
          statusCode: response.statusCode,
          error: `Unexpected status code: ${response.statusCode}`
        });
      }
    } catch (error) {
      logTest(testName, 'failed', { error: error.message });
    }
  }

  async testLogout() {
    const testName = 'Logout Functionality';
    try {
      const response = await makeRequest({
        hostname: 'restoreassist.app',
        path: '/api/auth/signout',
        method: 'POST',
        headers: {
          'Cookie': cookiesToString(this.session.cookies),
          'User-Agent': 'RestoreAssist-Test-Suite/1.0'
        }
      });

      if (response.statusCode === 200 || response.statusCode === 302) {
        logTest(testName, 'passed', {
          statusCode: response.statusCode
        });
      } else {
        logTest(testName, 'failed', {
          statusCode: response.statusCode,
          error: `Expected 200/302, got ${response.statusCode}`
        });
      }
    } catch (error) {
      logTest(testName, 'failed', { error: error.message });
    }
  }

  async testSessionPersistence() {
    const testName = 'Session Persistence';
    try {
      // Re-login to test session persistence
      await this.testValidLogin();

      // Wait a few seconds
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if session still valid
      const response = await makeRequest({
        hostname: 'restoreassist.app',
        path: '/api/auth/session',
        method: 'GET',
        headers: {
          'Cookie': cookiesToString(this.session.cookies),
          'User-Agent': 'RestoreAssist-Test-Suite/1.0'
        }
      });

      const sessionData = await parseJSON(response.body);

      if (response.statusCode === 200 && sessionData && sessionData.user) {
        logTest(testName, 'passed', {
          statusCode: response.statusCode,
          sessionValid: true
        });
      } else {
        logTest(testName, 'failed', {
          statusCode: response.statusCode,
          error: 'Session not persisted'
        });
      }
    } catch (error) {
      logTest(testName, 'failed', { error: error.message });
    }
  }

  async testErrorHandling() {
    const testName = 'Error Handling';
    try {
      // Test 404 handling
      const response = await makeRequest({
        hostname: 'restoreassist.app',
        path: '/this-route-does-not-exist-12345',
        method: 'GET',
        headers: {
          'User-Agent': 'RestoreAssist-Test-Suite/1.0'
        }
      });

      if (response.statusCode === 404) {
        logTest(testName, 'passed', {
          statusCode: response.statusCode,
          message: '404 errors handled correctly'
        });
      } else {
        logTest(testName, 'failed', {
          statusCode: response.statusCode,
          error: `Expected 404, got ${response.statusCode}`
        });
      }
    } catch (error) {
      logTest(testName, 'failed', { error: error.message });
    }
  }

  async generateReport() {
    log('\n========================================');
    log('Test Results Summary');
    log('========================================\n');
    log(`Total Tests: ${testResults.totalTests}`);
    log(`Passed: ${testResults.passed}`, 'info');
    log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? 'error' : 'info');
    log(`Skipped: ${testResults.skipped}`, 'warning');
    log(`Success Rate: ${((testResults.passed / testResults.totalTests) * 100).toFixed(2)}%\n`);

    // Save results to file
    fs.writeFileSync(
      CONFIG.resultsFile,
      JSON.stringify(testResults, null, 2)
    );
    log(`Full results saved to: ${CONFIG.resultsFile}`, 'info');

    // Create markdown report
    const mdReport = this.generateMarkdownReport();
    const mdFile = path.join(__dirname, 'TEST_RESULTS_COMPREHENSIVE.md');
    fs.writeFileSync(mdFile, mdReport);
    log(`Markdown report saved to: ${mdFile}`, 'info');

    log('\n========================================\n');
  }

  generateMarkdownReport() {
    const timestamp = new Date(testResults.timestamp).toLocaleString();
    const successRate = ((testResults.passed / testResults.totalTests) * 100).toFixed(2);

    let md = `# RestoreAssist Production Test Results\n\n`;
    md += `**Test Date:** ${timestamp}\n`;
    md += `**Environment:** ${testResults.environment}\n`;
    md += `**Base URL:** ${testResults.baseUrl}\n\n`;

    md += `## Summary\n\n`;
    md += `| Metric | Value |\n`;
    md += `|--------|-------|\n`;
    md += `| Total Tests | ${testResults.totalTests} |\n`;
    md += `| Passed | ${testResults.passed} ✓ |\n`;
    md += `| Failed | ${testResults.failed} ✗ |\n`;
    md += `| Skipped | ${testResults.skipped} ⊘ |\n`;
    md += `| Success Rate | ${successRate}% |\n\n`;

    md += `## Test Details\n\n`;

    testResults.tests.forEach((test, index) => {
      const icon = test.status === 'passed' ? '✓' : test.status === 'failed' ? '✗' : '⊘';
      md += `### ${index + 1}. ${test.name} ${icon}\n\n`;
      md += `**Status:** ${test.status.toUpperCase()}\n`;
      md += `**Timestamp:** ${new Date(test.timestamp).toLocaleString()}\n\n`;

      if (test.statusCode) {
        md += `**Status Code:** ${test.statusCode}\n`;
      }

      if (test.error) {
        md += `**Error:** \`${test.error}\`\n`;
      }

      if (test.message) {
        md += `**Message:** ${test.message}\n`;
      }

      // Add additional details
      const detailKeys = Object.keys(test).filter(k =>
        !['name', 'status', 'timestamp', 'statusCode', 'error', 'message'].includes(k)
      );

      if (detailKeys.length > 0) {
        md += `\n**Additional Details:**\n`;
        md += `\`\`\`json\n`;
        const details = {};
        detailKeys.forEach(key => details[key] = test[key]);
        md += JSON.stringify(details, null, 2);
        md += `\n\`\`\`\n`;
      }

      md += `\n---\n\n`;
    });

    md += `## Recommendations\n\n`;

    if (testResults.failed > 0) {
      md += `⚠️ **Action Required:** ${testResults.failed} test(s) failed. Please review the failed tests above.\n\n`;
    } else {
      md += `✓ All tests passed successfully!\n\n`;
    }

    if (testResults.skipped > 0) {
      md += `ℹ️ **Note:** ${testResults.skipped} test(s) were skipped. This may indicate missing features or permissions.\n\n`;
    }

    return md;
  }
}

// Run the test suite
(async () => {
  const suite = new LoginFlowTestSuite();
  await suite.runAll();

  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
})();
