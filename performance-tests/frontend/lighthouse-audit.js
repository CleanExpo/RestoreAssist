import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import fs from 'fs';
import path from 'path';
import { TEST_CONFIG } from '../config/test-config.js';

// Lighthouse configuration
const LIGHTHOUSE_CONFIG = {
  extends: 'lighthouse:default',
  settings: {
    formFactor: 'desktop',
    screenEmulation: {
      mobile: false,
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      disabled: false
    },
    throttling: {
      rttMs: 40,
      throughputKbps: 10240,
      cpuSlowdownMultiplier: 1,
      requestLatencyMs: 0,
      downloadThroughputKbps: 10240,
      uploadThroughputKbps: 10240
    },
    emulatedUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  },
  passes: [{
    passName: 'defaultPass',
    recordTrace: true,
    pauseAfterLoadMs: 1000,
    networkQuietThresholdMs: 1000,
    cpuQuietThresholdMs: 1000,
    gatherers: []
  }],
  audits: [
    'largest-contentful-paint',
    'first-input-delay',
    'cumulative-layout-shift',
    'total-blocking-time',
    'interactive',
    'speed-index',
    'bootup-time',
    'mainthread-work-breakdown',
    'network-requests',
    'network-rtt',
    'network-server-latency',
    'uses-text-compression',
    'uses-responsive-images',
    'efficient-animated-content',
    'unused-javascript',
    'unused-css-rules',
    'modern-image-formats',
    'render-blocking-resources',
    'unminified-javascript',
    'unminified-css'
  ],
  categories: {
    performance: {
      title: 'Performance',
      supportedModes: ['navigation'],
      auditRefs: [
        { id: 'largest-contentful-paint', weight: 25, group: 'metrics' },
        { id: 'first-input-delay', weight: 25, group: 'metrics' },
        { id: 'cumulative-layout-shift', weight: 15, group: 'metrics' },
        { id: 'total-blocking-time', weight: 30, group: 'metrics' },
        { id: 'interactive', weight: 5, group: 'metrics' }
      ]
    }
  }
};

// Test pages configuration
const TEST_PAGES = [
  { name: 'Landing Page', url: '/', critical: true },
  { name: 'Login Page', url: '/login', critical: true },
  { name: 'Dashboard', url: '/dashboard', critical: true, requiresAuth: true },
  { name: 'Reports Page', url: '/reports', critical: false, requiresAuth: true },
  { name: 'Settings', url: '/settings', critical: false, requiresAuth: true }
];

class FrontendPerformanceTester {
  constructor() {
    this.baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    this.results = [];
    this.chrome = null;
  }

  async launchChrome() {
    this.chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless', '--disable-gpu', '--no-sandbox']
    });
    return this.chrome;
  }

  async runLighthouseAudit(url, options = {}) {
    const runnerResult = await lighthouse(url, {
      port: this.chrome.port,
      output: 'json',
      logLevel: 'info',
      ...options
    }, LIGHTHOUSE_CONFIG);

    return runnerResult.lhr;
  }

  async testPage(page) {
    console.log(`Testing ${page.name}...`);

    const url = `${this.baseUrl}${page.url}`;

    // If authentication is required, set auth cookie/token
    const options = {};
    if (page.requiresAuth) {
      options.extraHeaders = {
        'Cookie': 'auth_token=test_performance_token'
      };
    }

    try {
      const lhr = await this.runLighthouseAudit(url, options);

      const metrics = {
        pageName: page.name,
        url: page.url,
        critical: page.critical,
        timestamp: new Date().toISOString(),

        // Core Web Vitals
        lcp: lhr.audits['largest-contentful-paint']?.numericValue,
        fid: lhr.audits['first-input-delay']?.numericValue || 0,
        cls: lhr.audits['cumulative-layout-shift']?.numericValue,

        // Additional metrics
        tti: lhr.audits['interactive']?.numericValue,
        tbt: lhr.audits['total-blocking-time']?.numericValue,
        speedIndex: lhr.audits['speed-index']?.numericValue,

        // Performance score
        performanceScore: lhr.categories.performance.score * 100,

        // Bundle and resource metrics
        totalBundleSize: this.calculateTotalBundleSize(lhr),
        unusedJavaScript: lhr.audits['unused-javascript']?.details?.overallSavingsBytes || 0,
        unusedCSS: lhr.audits['unused-css-rules']?.details?.overallSavingsBytes || 0,

        // Render blocking resources
        renderBlockingResources: lhr.audits['render-blocking-resources']?.details?.items?.length || 0,

        // Network metrics
        totalRequests: lhr.audits['network-requests']?.details?.items?.length || 0,
        totalTransferSize: this.calculateTotalTransferSize(lhr),

        // Optimization opportunities
        opportunities: this.extractOpportunities(lhr)
      };

      // Check against thresholds
      metrics.passesThresholds = this.checkThresholds(metrics);

      this.results.push(metrics);

      return metrics;
    } catch (error) {
      console.error(`Error testing ${page.name}:`, error);
      return null;
    }
  }

  calculateTotalBundleSize(lhr) {
    const requests = lhr.audits['network-requests']?.details?.items || [];
    const jsRequests = requests.filter(r => r.resourceType === 'Script');
    return jsRequests.reduce((total, req) => total + (req.transferSize || 0), 0);
  }

  calculateTotalTransferSize(lhr) {
    const requests = lhr.audits['network-requests']?.details?.items || [];
    return requests.reduce((total, req) => total + (req.transferSize || 0), 0);
  }

  extractOpportunities(lhr) {
    const opportunities = [];

    const opportunityAudits = [
      'unused-javascript',
      'unused-css-rules',
      'render-blocking-resources',
      'unminified-javascript',
      'unminified-css',
      'uses-text-compression',
      'modern-image-formats',
      'efficient-animated-content'
    ];

    opportunityAudits.forEach(auditId => {
      const audit = lhr.audits[auditId];
      if (audit && audit.score < 0.9) {
        opportunities.push({
          audit: auditId,
          title: audit.title,
          savings: audit.details?.overallSavingsBytes || 0,
          savingsMs: audit.details?.overallSavingsMs || 0
        });
      }
    });

    return opportunities.sort((a, b) => b.savingsMs - a.savingsMs);
  }

  checkThresholds(metrics) {
    const thresholds = TEST_CONFIG.thresholds.frontend;

    const checks = {
      bundleSize: (metrics.totalBundleSize / 1024) <= thresholds.bundle_size_kb,
      lcp: metrics.lcp <= thresholds.lcp_ms,
      fid: metrics.fid <= thresholds.fid_ms,
      cls: metrics.cls <= thresholds.cls,
      tti: metrics.tti <= thresholds.page_load_time_ms
    };

    return {
      passed: Object.values(checks).every(v => v),
      details: checks
    };
  }

  async testCodeSplitting() {
    console.log('Testing code splitting...');

    const url = `${this.baseUrl}/`;
    const lhr = await this.runLighthouseAudit(url);

    const scriptRequests = lhr.audits['network-requests']?.details?.items?.filter(
      item => item.resourceType === 'Script'
    ) || [];

    const analysis = {
      totalScripts: scriptRequests.length,
      chunks: [],
      hasCodeSplitting: false,
      lazyLoadedChunks: 0
    };

    scriptRequests.forEach(script => {
      if (script.url.includes('.chunk.') || script.url.includes('lazy')) {
        analysis.hasCodeSplitting = true;

        if (!script.isLinkPreload) {
          analysis.lazyLoadedChunks++;
        }
      }

      analysis.chunks.push({
        url: script.url,
        size: script.transferSize,
        cached: script.fromCache || false
      });
    });

    return analysis;
  }

  async testLazyLoading() {
    console.log('Testing lazy loading...');

    const url = `${this.baseUrl}/`;
    const lhr = await this.runLighthouseAudit(url);

    const imageRequests = lhr.audits['network-requests']?.details?.items?.filter(
      item => item.resourceType === 'Image'
    ) || [];

    const analysis = {
      totalImages: imageRequests.length,
      lazyLoadedImages: 0,
      eagerLoadedImages: 0,
      offscreenImages: []
    };

    // Check for offscreen images
    const offscreenImagesAudit = lhr.audits['offscreen-images'];
    if (offscreenImagesAudit?.details?.items) {
      analysis.offscreenImages = offscreenImagesAudit.details.items;
      analysis.lazyLoadedImages = imageRequests.length - offscreenImagesAudit.details.items.length;
    }

    return analysis;
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      baseUrl: this.baseUrl,
      summary: {
        totalPagesTested: this.results.length,
        averagePerformanceScore: this.calculateAverage('performanceScore'),
        averageLCP: this.calculateAverage('lcp'),
        averageFID: this.calculateAverage('fid'),
        averageCLS: this.calculateAverage('cls'),
        criticalPagesPassingThresholds: this.results
          .filter(r => r.critical && r.passesThresholds?.passed).length,
        totalBundleSizeKB: Math.max(...this.results.map(r => r.totalBundleSize)) / 1024
      },
      pages: this.results,
      codeSplitting: await this.testCodeSplitting(),
      lazyLoading: await this.testLazyLoading(),
      recommendations: this.generateRecommendations()
    };

    return report;
  }

  calculateAverage(metric) {
    const values = this.results.map(r => r[metric]).filter(v => v !== undefined);
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  generateRecommendations() {
    const recommendations = [];

    // Check bundle size
    const maxBundleSize = Math.max(...this.results.map(r => r.totalBundleSize));
    if (maxBundleSize > TEST_CONFIG.thresholds.frontend.bundle_size_kb * 1024) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Bundle Size',
        issue: `Bundle size (${(maxBundleSize/1024).toFixed(2)}KB) exceeds threshold`,
        solution: 'Implement code splitting, tree shaking, and remove unused dependencies'
      });
    }

    // Check Core Web Vitals
    this.results.forEach(result => {
      if (result.lcp > TEST_CONFIG.thresholds.frontend.lcp_ms) {
        recommendations.push({
          priority: 'HIGH',
          category: 'Core Web Vitals',
          page: result.pageName,
          issue: `LCP (${result.lcp}ms) exceeds threshold`,
          solution: 'Optimize critical rendering path, preload key resources'
        });
      }

      if (result.cls > TEST_CONFIG.thresholds.frontend.cls) {
        recommendations.push({
          priority: 'MEDIUM',
          category: 'Core Web Vitals',
          page: result.pageName,
          issue: `CLS (${result.cls}) exceeds threshold`,
          solution: 'Add size attributes to images, avoid inserting content above existing content'
        });
      }
    });

    // Check for optimization opportunities
    this.results.forEach(result => {
      if (result.unusedJavaScript > 50000) {
        recommendations.push({
          priority: 'MEDIUM',
          category: 'Code Optimization',
          page: result.pageName,
          issue: `${(result.unusedJavaScript/1024).toFixed(2)}KB of unused JavaScript`,
          solution: 'Remove unused code, implement tree shaking'
        });
      }

      if (result.renderBlockingResources > 0) {
        recommendations.push({
          priority: 'MEDIUM',
          category: 'Render Blocking',
          page: result.pageName,
          issue: `${result.renderBlockingResources} render-blocking resources`,
          solution: 'Defer non-critical CSS/JS, inline critical CSS'
        });
      }
    });

    return recommendations;
  }

  async cleanup() {
    if (this.chrome) {
      await this.chrome.kill();
    }
  }
}

// Main execution
async function runFrontendPerformanceTests() {
  const tester = new FrontendPerformanceTester();

  try {
    await tester.launchChrome();

    // Test all pages
    for (const page of TEST_PAGES) {
      await tester.testPage(page);
    }

    // Generate and save report
    const report = await tester.generateReport();

    // Save report to file
    const reportPath = path.join(process.cwd(), 'performance-tests', 'results', 'frontend-performance.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Print summary
    console.log('\n=== Frontend Performance Summary ===');
    console.log(`Average Performance Score: ${report.summary.averagePerformanceScore.toFixed(1)}/100`);
    console.log(`Average LCP: ${report.summary.averageLCP.toFixed(0)}ms`);
    console.log(`Average CLS: ${report.summary.averageCLS.toFixed(3)}`);
    console.log(`Bundle Size: ${report.summary.totalBundleSizeKB.toFixed(2)}KB`);
    console.log(`Critical Pages Passing: ${report.summary.criticalPagesPassingThresholds}/${TEST_PAGES.filter(p => p.critical).length}`);

    if (report.recommendations.length > 0) {
      console.log('\n=== Top Recommendations ===');
      report.recommendations.slice(0, 5).forEach(rec => {
        console.log(`[${rec.priority}] ${rec.category}: ${rec.issue}`);
      });
    }

    return report;
  } catch (error) {
    console.error('Error running frontend performance tests:', error);
    throw error;
  } finally {
    await tester.cleanup();
  }
}

// Export for use in other scripts
export { FrontendPerformanceTester, runFrontendPerformanceTests };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runFrontendPerformanceTests()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}