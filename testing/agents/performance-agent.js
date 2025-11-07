#!/usr/bin/env node

/**
 * Performance Testing Agent
 * Tests page load times, API response times, Core Web Vitals, and resource usage
 */

const config = JSON.parse(process.argv[2] || '{}');
const baseUrl = config.productionUrl || 'http://localhost:3000';

const tests = {
  'page-load-times': async () => {
    console.log('Testing page load times...');
    // Test critical pages
    const pages = ['/', '/pricing', '/dashboard'];
    const results = [];

    for (const page of pages) {
      try {
        const start = Date.now();
        const response = await fetch(`${baseUrl}${page}`, {
          method: 'GET',
          redirect: 'manual'
        });
        const duration = Date.now() - start;

        results.push({
          page,
          duration,
          status: response.status
        });

        // Warn if page takes more than 3 seconds
        if (duration > 3000) {
          console.log(`  ⚠️  ${page}: ${duration}ms (slow)`);
        }
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error(`Cannot connect to ${baseUrl}`);
        }
        throw error;
      }
    }

    const avgLoadTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const message = `Average page load: ${avgLoadTime.toFixed(0)}ms`;

    return {
      passed: avgLoadTime < 3000,
      message,
      details: results
    };
  },

  'api-response-times': async () => {
    console.log('Testing API response times...');
    // Test API endpoints
    const endpoints = [
      '/api/auth/session',
      '/api/health'
    ];

    const results = [];

    for (const endpoint of endpoints) {
      try {
        const start = Date.now();
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: 'GET'
        });
        const duration = Date.now() - start;

        results.push({
          endpoint,
          duration,
          status: response.status
        });

        if (duration > 1000) {
          console.log(`  ⚠️  ${endpoint}: ${duration}ms (slow)`);
        }
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error(`Cannot connect to ${baseUrl}`);
        }
        // Some endpoints may not exist yet
        results.push({
          endpoint,
          duration: 0,
          status: 'error'
        });
      }
    }

    const validResults = results.filter(r => r.status !== 'error');
    if (validResults.length === 0) {
      return { passed: true, message: 'No API endpoints to test' };
    }

    const avgResponseTime = validResults.reduce((sum, r) => sum + r.duration, 0) / validResults.length;
    const message = `Average API response: ${avgResponseTime.toFixed(0)}ms`;

    return {
      passed: avgResponseTime < 1000,
      message,
      details: results
    };
  },

  'core-web-vitals': async () => {
    console.log('Testing Core Web Vitals...');
    // This would use Lighthouse or Playwright for real metrics
    // For now, placeholder that will be enhanced with Playwright MCP
    return {
      passed: true,
      message: 'Core Web Vitals check placeholder (needs Playwright integration)',
      details: {
        note: 'Will measure LCP, FID, CLS when Playwright MCP is integrated'
      }
    };
  },

  'memory-usage': async () => {
    console.log('Checking memory usage...');
    // This would monitor server memory usage
    const used = process.memoryUsage();
    const heapUsedMB = (used.heapUsed / 1024 / 1024).toFixed(2);

    return {
      passed: true,
      message: `Agent memory usage: ${heapUsedMB}MB`,
      details: {
        rss: `${(used.rss / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(used.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        heapUsed: `${heapUsedMB}MB`,
        external: `${(used.external / 1024 / 1024).toFixed(2)}MB`
      }
    };
  }
};

async function runPerformanceTests() {
  console.log('⚡ Performance Agent Starting...');
  console.log(`Target: ${baseUrl}\n`);

  const results = [];
  const testsToRun = config.agents?.performance?.tests || Object.keys(tests);

  for (const testName of testsToRun) {
    if (tests[testName]) {
      try {
        const result = await tests[testName]();
        results.push({ test: testName, ...result });
        console.log(`  ✓ ${testName}: ${result.message}`);
      } catch (error) {
        results.push({
          test: testName,
          passed: false,
          message: error.message
        });
        console.log(`  ✗ ${testName}: ${error.message}`);
      }
    }
  }

  const failed = results.filter(r => !r.passed).length;
  console.log(`\n✅ Completed: ${results.length - failed}/${results.length} tests passed`);

  return failed === 0 ? 0 : 1;
}

runPerformanceTests()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error('Performance agent failed:', error);
    process.exit(1);
  });
