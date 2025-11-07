/**
 * Login Debug Test - Diagnoses why login is failing
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  baseUrl: 'https://restoreassist.app',
  testUser: {
    email: 'test@restoreassist.com',
    password: 'Test123!@#'
  },
  debugDir: path.join(__dirname, 'debug-output')
};

if (!fs.existsSync(CONFIG.debugDir)) {
  fs.mkdirSync(CONFIG.debugDir, { recursive: true });
}

async function debugLogin() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  console.log('\n=== LOGIN DEBUG SESSION ===\n');

  try {
    // 1. Navigate to login page
    console.log('1. Navigating to login page...');
    await page.goto(`${CONFIG.baseUrl}/login`, { waitUntil: 'networkidle' });

    // Save page HTML
    const loginPageHtml = await page.content();
    fs.writeFileSync(
      path.join(CONFIG.debugDir, 'login-page.html'),
      loginPageHtml
    );
    console.log('   ✓ Login page HTML saved');

    // 2. Analyze form
    console.log('\n2. Analyzing login form...');
    const formInfo = await page.evaluate(() => {
      const forms = Array.from(document.querySelectorAll('form'));
      return forms.map(form => ({
        action: form.action,
        method: form.method,
        inputs: Array.from(form.querySelectorAll('input')).map(input => ({
          name: input.name,
          type: input.type,
          id: input.id,
          placeholder: input.placeholder
        })),
        buttons: Array.from(form.querySelectorAll('button')).map(btn => ({
          type: btn.type,
          text: btn.textContent.trim()
        }))
      }));
    });

    console.log('   Form Details:', JSON.stringify(formInfo, null, 2));
    fs.writeFileSync(
      path.join(CONFIG.debugDir, 'form-structure.json'),
      JSON.stringify(formInfo, null, 2)
    );

    // 3. Fill and submit form
    console.log('\n3. Filling login form...');
    await page.fill('input[type="email"], input[name="email"]', CONFIG.testUser.email);
    await page.fill('input[type="password"], input[name="password"]', CONFIG.testUser.password);

    await page.screenshot({
      path: path.join(CONFIG.debugDir, 'before-submit.png'),
      fullPage: true
    });
    console.log('   ✓ Screenshot before submit saved');

    // Setup request/response logging
    const requests = [];
    const responses = [];

    page.on('request', request => {
      requests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        postData: request.postData()
      });
    });

    page.on('response', response => {
      responses.push({
        url: response.url(),
        status: response.status(),
        headers: response.headers()
      });
    });

    console.log('\n4. Submitting form...');
    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();

    // Wait for navigation or timeout
    await Promise.race([
      page.waitForNavigation({ timeout: 20000 }).catch(() => null),
      page.waitForTimeout(20000)
    ]);

    await page.screenshot({
      path: path.join(CONFIG.debugDir, 'after-submit.png'),
      fullPage: true
    });
    console.log('   ✓ Screenshot after submit saved');

    // 5. Capture result
    console.log('\n5. Analyzing result...');
    const currentUrl = page.url();
    const pageHtml = await page.content();
    const cookies = await context.cookies();

    fs.writeFileSync(
      path.join(CONFIG.debugDir, 'after-submit.html'),
      pageHtml
    );

    fs.writeFileSync(
      path.join(CONFIG.debugDir, 'requests.json'),
      JSON.stringify(requests, null, 2)
    );

    fs.writeFileSync(
      path.join(CONFIG.debugDir, 'responses.json'),
      JSON.stringify(responses, null, 2)
    );

    fs.writeFileSync(
      path.join(CONFIG.debugDir, 'cookies.json'),
      JSON.stringify(cookies, null, 2)
    );

    // Check for error messages
    const errorElements = await page.locator('text=/error|invalid|incorrect|failed/i').all();
    const errorMessages = [];
    for (const el of errorElements) {
      const text = await el.textContent();
      errorMessages.push(text);
    }

    // Check console logs
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text()
      });
    });

    // Generate report
    const report = {
      timestamp: new Date().toISOString(),
      testUser: CONFIG.testUser.email,
      results: {
        currentUrl,
        redirectedToDashboard: currentUrl.includes('/dashboard'),
        stayedOnLogin: currentUrl.includes('/login'),
        cookies: cookies.map(c => ({ name: c.name, value: c.value.substring(0, 20) + '...' })),
        errorMessages,
        hasSessionCookie: cookies.some(c => c.name.includes('session')),
        requestCount: requests.length,
        authRequests: requests.filter(r => r.url.includes('auth')).length
      }
    };

    console.log('\n=== RESULTS ===');
    console.log(JSON.stringify(report, null, 2));

    fs.writeFileSync(
      path.join(CONFIG.debugDir, 'debug-report.json'),
      JSON.stringify(report, null, 2)
    );

    console.log('\n=== All debug files saved to:', CONFIG.debugDir);
    console.log('\nPress Enter to close browser...');

    // Keep browser open for manual inspection
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

debugLogin();
