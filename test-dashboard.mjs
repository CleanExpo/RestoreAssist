import { chromium } from 'playwright';

async function testDashboard() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Enable console and error logging
  page.on('console', msg => console.log('Browser Console:', msg.text()));
  page.on('pageerror', err => console.error('Page Error:', err));
  page.on('requestfailed', request =>
    console.error('Request Failed:', request.url(), request.failure()?.errorText)
  );

  try {
    console.log('Navigating to dashboard...');
    const response = await page.goto('http://localhost:3001/dashboard', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log('Response Status:', response.status());
    console.log('Response URL:', response.url());

    // Wait a bit for any redirects or loading
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({ path: 'D:\\RestoreAssist\\dashboard-test.png', fullPage: true });
    console.log('Screenshot saved to dashboard-test.png');

    // Get page title and current URL
    const title = await page.title();
    const url = page.url();
    console.log('Page Title:', title);
    console.log('Current URL:', url);

    // Check for any error messages in the page
    const bodyText = await page.textContent('body');
    if (bodyText.includes('error') || bodyText.includes('Error')) {
      console.log('Page contains error text');
      console.log('Body snippet:', bodyText.substring(0, 500));
    }

  } catch (error) {
    console.error('Test Error:', error.message);
    await page.screenshot({ path: 'D:\\RestoreAssist\\dashboard-error.png' });
    console.log('Error screenshot saved to dashboard-error.png');
  } finally {
    await browser.close();
  }
}

testDashboard();
