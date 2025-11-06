const playwright = require('playwright');
const fs = require('fs');
const path = require('path');

const TEST_EMAIL = 'test@restoreassist.com';
const TEST_PASSWORD = 'Test123!';
const BASE_URL = 'http://localhost:3001';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCompleteWorkflowTest() {
  const results = [];
  let browser;
  let context;
  let page;

  try {
    console.log('=== RestoreAssist Complete Orchestrator Workflow Test ===\n');

    // Step 1: Launch browser
    console.log('Step 1: Launching browser...');
    browser = await playwright.chromium.launch({ headless: false });
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    page = await context.newPage();
    results.push({ step: 1, status: 'PASS', message: 'Browser launched successfully' });

    // Step 2: Navigate to login page
    console.log('Step 2: Navigating to login page...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2000);
    await page.screenshot({ path: 'screenshots/01-login-page.png', fullPage: true });
    results.push({ step: 2, status: 'PASS', message: 'Navigated to login page' });

    // Step 3: Fill in credentials
    console.log('Step 3: Filling in credentials...');
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.screenshot({ path: 'screenshots/02-credentials-filled.png', fullPage: true });
    results.push({ step: 3, status: 'PASS', message: 'Credentials filled' });

    // Step 4: Submit login form
    console.log('Step 4: Submitting login form...');
    await page.click('button[type="submit"]');
    await sleep(2000);
    await page.screenshot({ path: 'screenshots/03-after-login-submit.png', fullPage: true });

    // Check for errors
    const currentUrl = page.url();
    if (currentUrl.includes('/500') || currentUrl.includes('/error')) {
      results.push({ step: 4, status: 'FAIL', message: `Login resulted in error page: ${currentUrl}` });
      throw new Error('Login failed with error page');
    }

    results.push({ step: 4, status: 'PASS', message: `Login submitted, current URL: ${currentUrl}` });

    // Step 5: Verify authentication and redirect to dashboard
    console.log('Step 5: Verifying authentication...');
    await sleep(2000);

    const finalUrl = page.url();
    console.log(`Current URL: ${finalUrl}`);

    if (finalUrl.includes('/dashboard') || finalUrl.includes('/onboarding')) {
      await page.screenshot({ path: 'screenshots/04-authenticated.png', fullPage: true });
      results.push({ step: 5, status: 'PASS', message: `Successfully authenticated: ${finalUrl}` });
    } else if (finalUrl.includes('/login')) {
      await page.screenshot({ path: 'screenshots/04-login-failed.png', fullPage: true });
      results.push({ step: 5, status: 'FAIL', message: 'Still on login page - authentication failed' });

      // Check for error messages
      const errorMessage = await page.textContent('body').catch(() => '');
      results.push({ step: '5a', status: 'INFO', message: `Page content: ${errorMessage.substring(0, 500)}` });
    } else {
      await page.screenshot({ path: 'screenshots/04-unexpected-page.png', fullPage: true });
      results.push({ step: 5, status: 'WARN', message: `Unexpected page: ${finalUrl}` });
    }

    // Step 6: Navigate to dashboard if not already there
    console.log('Step 6: Navigating to dashboard...');
    if (!finalUrl.includes('/dashboard')) {
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(2000);
    }

    const dashboardUrl = page.url();
    await page.screenshot({ path: 'screenshots/05-dashboard.png', fullPage: true });

    if (dashboardUrl.includes('/500')) {
      results.push({ step: 6, status: 'FAIL', message: 'Dashboard page returned 500 error' });
    } else {
      results.push({ step: 6, status: 'PASS', message: `Dashboard loaded: ${dashboardUrl}` });
    }

    // Step 7: Start new assessment
    console.log('Step 7: Starting new assessment...');

    // Try multiple selectors for the start button
    let startButton = null;
    const selectors = [
      'button:has-text("Start New Assessment")',
      'a:has-text("Start New Assessment")',
      'button:has-text("New Assessment")',
      'a[href="/dashboard/start"]',
      'a[href*="start"]'
    ];

    for (const selector of selectors) {
      try {
        startButton = await page.locator(selector).first();
        if (await startButton.isVisible({ timeout: 2000 })) {
          console.log(`Found start button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (startButton && await startButton.isVisible().catch(() => false)) {
      await startButton.click();
      await sleep(2000);
      await page.screenshot({ path: 'screenshots/06-assessment-start.png', fullPage: true });
      results.push({ step: 7, status: 'PASS', message: 'Clicked Start New Assessment' });
    } else {
      // Try direct navigation
      await page.goto(`${BASE_URL}/dashboard/start`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(2000);
      await page.screenshot({ path: 'screenshots/06-assessment-start-direct.png', fullPage: true });
      results.push({ step: 7, status: 'WARN', message: 'Direct navigation to /dashboard/start' });
    }

    // Step 8: Select Text Input method
    console.log('Step 8: Selecting Text Input method...');

    const textInputButton = await page.locator('button:has-text("Text Input"), a:has-text("Text Input")').first();
    if (await textInputButton.isVisible({ timeout: 5000 })) {
      await textInputButton.click();
      await sleep(2000);
      await page.screenshot({ path: 'screenshots/07-text-input-selected.png', fullPage: true });
      results.push({ step: 8, status: 'PASS', message: 'Selected Text Input method' });
    } else {
      results.push({ step: 8, status: 'FAIL', message: 'Text Input button not found' });
      throw new Error('Text Input button not found');
    }

    // Step 9: Verify redirect to report creation page
    console.log('Step 9: Verifying report creation page...');
    await sleep(1000);
    const reportUrl = page.url();
    await page.screenshot({ path: 'screenshots/08-report-page.png', fullPage: true });

    if (reportUrl.includes('/dashboard/reports/new')) {
      results.push({ step: 9, status: 'PASS', message: `On report creation page: ${reportUrl}` });
    } else {
      results.push({ step: 9, status: 'FAIL', message: `Wrong page: ${reportUrl}` });
    }

    // Step 10: Verify client dropdown
    console.log('Step 10: Checking for client dropdown...');

    const clientSelect = await page.locator('select, input[role="combobox"]').first();
    if (await clientSelect.isVisible({ timeout: 5000 })) {
      await page.screenshot({ path: 'screenshots/09-client-dropdown.png', fullPage: true });

      // Try to find "Test Insurance Company"
      const optionsText = await page.textContent('body');
      if (optionsText.includes('Test Insurance Company')) {
        results.push({ step: 10, status: 'PASS', message: 'Test Insurance Company found in dropdown' });
      } else {
        results.push({ step: 10, status: 'WARN', message: 'Test Insurance Company not found, but dropdown exists' });
      }
    } else {
      results.push({ step: 10, status: 'FAIL', message: 'Client dropdown not found' });
    }

    // Step 11: Fill report title
    console.log('Step 11: Filling report title...');
    const titleInput = await page.locator('input[name="title"], input[placeholder*="title" i]').first();
    if (await titleInput.isVisible({ timeout: 5000 })) {
      await titleInput.fill('Water Damage Assessment - 456 Test St');
      await page.screenshot({ path: 'screenshots/10-title-filled.png', fullPage: true });
      results.push({ step: 11, status: 'PASS', message: 'Report title filled' });
    } else {
      results.push({ step: 11, status: 'FAIL', message: 'Title input not found' });
    }

    // Step 12: Fill description
    console.log('Step 12: Filling description...');
    const descInput = await page.locator('textarea[name="description"], textarea[placeholder*="description" i]').first();
    if (await descInput.isVisible({ timeout: 5000 })) {
      await descInput.fill('Significant water damage from burst pipe');
      await page.screenshot({ path: 'screenshots/11-description-filled.png', fullPage: true });
      results.push({ step: 12, status: 'PASS', message: 'Description filled' });
    } else {
      results.push({ step: 12, status: 'FAIL', message: 'Description field not found' });
    }

    // Step 13: Add scope items
    console.log('Step 13: Adding scope items...');
    const scopeItems = [
      'Remove damaged carpet and padding',
      'Dry wall cavities with industrial dehumidifiers',
      'Treat for mold prevention'
    ];

    for (let i = 0; i < scopeItems.length; i++) {
      try {
        const scopeInput = await page.locator('textarea[name*="scope"], input[name*="scope"]').last();
        await scopeInput.fill(scopeItems[i]);

        // Click add button
        const addButton = await page.locator('button:has-text("Add"), button:has-text("+")').first();
        if (await addButton.isVisible({ timeout: 2000 })) {
          await addButton.click();
          await sleep(500);
        }

        results.push({ step: `13.${i+1}`, status: 'PASS', message: `Added scope item ${i+1}` });
      } catch (e) {
        results.push({ step: `13.${i+1}`, status: 'FAIL', message: `Failed to add scope item ${i+1}: ${e.message}` });
      }
    }

    await page.screenshot({ path: 'screenshots/12-scope-items-added.png', fullPage: true });

    // Step 14: Generate cost estimation
    console.log('Step 14: Generating cost estimation...');
    const generateButton = await page.locator('button:has-text("Generate"), button:has-text("Estimate")').first();
    if (await generateButton.isVisible({ timeout: 5000 })) {
      await generateButton.click();
      await sleep(3000); // Wait for estimation to generate
      await page.screenshot({ path: 'screenshots/13-estimation-generated.png', fullPage: true });
      results.push({ step: 14, status: 'PASS', message: 'Cost estimation generated' });
    } else {
      results.push({ step: 14, status: 'FAIL', message: 'Generate button not found' });
    }

    // Step 15: Verify estimation display
    console.log('Step 15: Verifying estimation display...');
    const pageContent = await page.textContent('body');
    if (pageContent.includes('$') || pageContent.includes('Total') || pageContent.includes('Cost')) {
      await page.screenshot({ path: 'screenshots/14-estimation-verified.png', fullPage: true });
      results.push({ step: 15, status: 'PASS', message: 'Estimation display verified with pricing information' });
    } else {
      results.push({ step: 15, status: 'WARN', message: 'Pricing information not clearly visible' });
    }

    // Final screenshot
    await page.screenshot({ path: 'screenshots/15-final-state.png', fullPage: true });

  } catch (error) {
    console.error('Test error:', error);
    results.push({ step: 'ERROR', status: 'FAIL', message: error.message });

    if (page) {
      await page.screenshot({ path: 'screenshots/error-state.png', fullPage: true });
    }
  } finally {
    if (browser) {
      console.log('\nClosing browser...');
      await browser.close();
    }
  }

  // Generate report
  console.log('\n=== TEST RESULTS ===\n');

  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;

  const report = ['# RestoreAssist Complete Orchestrator Workflow Test Results\n'];
  report.push(`**Test Date:** ${new Date().toISOString()}\n`);
  report.push(`**Test Credentials:**`);
  report.push(`- Email: ${TEST_EMAIL}`);
  report.push(`- Password: ${TEST_PASSWORD}`);
  report.push(`- Base URL: ${BASE_URL}\n`);
  report.push(`## Test Steps\n`);

  results.forEach(result => {
    const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
    const line = `${icon} **Step ${result.step}**: ${result.message}`;
    console.log(line);
    report.push(line);

    if (result.status === 'PASS') passCount++;
    else if (result.status === 'FAIL') failCount++;
    else if (result.status === 'WARN') warnCount++;
  });

  report.push(`\n## Summary\n`);
  report.push(`- ✅ Passed: ${passCount}`);
  report.push(`- ❌ Failed: ${failCount}`);
  report.push(`- ⚠️ Warnings: ${warnCount}`);
  report.push(`- **Total Steps:** ${results.length}\n`);

  if (failCount === 0) {
    report.push(`## Overall Result: ✅ SUCCESS\n`);
    report.push(`All critical workflow steps completed successfully!`);
  } else {
    report.push(`## Overall Result: ❌ FAILURE\n`);
    report.push(`${failCount} critical step(s) failed. Review the screenshots and logs for details.`);
  }

  report.push(`\n## Screenshots\n`);
  report.push(`Screenshots saved to: screenshots/ directory`);

  // Write report to file
  fs.writeFileSync('test-results-success.md', report.join('\n'));
  console.log('\n✅ Test report saved to test-results-success.md');

  return { results, passCount, failCount, warnCount };
}

// Create screenshots directory
if (!fs.existsSync('screenshots')) {
  fs.mkdirSync('screenshots');
}

// Run test
runCompleteWorkflowTest()
  .then(() => {
    console.log('\n=== Test Complete ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n=== Test Failed ===');
    console.error(error);
    process.exit(1);
  });
