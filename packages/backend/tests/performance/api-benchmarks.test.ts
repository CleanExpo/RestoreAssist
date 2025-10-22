/**
 * API Performance Benchmarks
 *
 * Run with: npm run test:perf
 *
 * These benchmarks measure API endpoint performance under various loads.
 * Use these results to:
 * - Establish performance baselines
 * - Detect performance regressions
 * - Identify optimization opportunities
 */

import { describe, it, expect } from '@jest/globals';
import { benchmark, compareBenchmarks, loadTest, benchmarkEndpoint } from './benchmark';

// Skip performance tests in CI by default
const skipInCI = process.env.CI === 'true';
const describePerf = skipInCI ? describe.skip : describe;

describePerf('API Performance Benchmarks', () => {
  const BASE_URL = process.env.API_URL || 'http://localhost:3000';

  describe('Health Check Endpoint', () => {
    it('should handle 1000 requests efficiently', async () => {
      const result = await benchmark(
        'GET /health',
        async () => {
          const response = await fetch(`${BASE_URL}/health`);
          await response.text();
        },
        {
          iterations: 1000,
          warmupIterations: 50,
        }
      );

      // Performance assertions
      expect(result.averageTime).toBeLessThan(50); // < 50ms average
      expect(result.p95Time).toBeLessThan(100); // < 100ms P95
      expect(result.throughput).toBeGreaterThan(100); // > 100 ops/sec
    }, 60000);
  });

  describe('Authentication Endpoints', () => {
    it('should compare auth config vs token validation', async () => {
      const results = await compareBenchmarks([
        {
          name: 'GET /api/auth/config',
          fn: async () => {
            const response = await fetch(`${BASE_URL}/api/auth/config`);
            await response.json();
          },
        },
        {
          name: 'POST /api/auth/verify',
          fn: async () => {
            const response = await fetch(`${BASE_URL}/api/auth/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: 'test-token' }),
            });
            await response.json();
          },
        },
      ], {
        iterations: 500,
      });

      // Both should be reasonably fast
      results.forEach(result => {
        expect(result.averageTime).toBeLessThan(200);
        expect(result.p95Time).toBeLessThan(500);
      });
    }, 60000);
  });

  describe('Subscription Endpoints', () => {
    it('should handle subscription queries under load', async () => {
      const result = await loadTest(
        'GET /api/subscriptions/:userId',
        async () => {
          const response = await fetch(`${BASE_URL}/api/subscriptions/test-user-123`);
          await response.json();
        },
        {
          startConcurrency: 5,
          maxConcurrency: 50,
          step: 5,
          duration: 3000,
        }
      );

      // Performance should not degrade significantly under load
      const firstResult = result[0].result;
      const lastResult = result[result.length - 1].result;

      const degradation = (firstResult.averageTime - lastResult.averageTime) / firstResult.averageTime;
      expect(Math.abs(degradation)).toBeLessThan(2); // < 200% degradation
    }, 120000);
  });

  describe('Report Generation Endpoints', () => {
    it('should benchmark report creation', async () => {
      const result = await benchmark(
        'POST /api/reports',
        async () => {
          const response = await fetch(`${BASE_URL}/api/reports`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer test-token',
            },
            body: JSON.stringify({
              propertyAddress: '123 Test St',
              damageType: 'water',
              severity: 'moderate',
              description: 'Test damage',
            }),
          });
          await response.json();
        },
        {
          iterations: 100,
          warmupIterations: 10,
        }
      );

      // Report generation is more expensive, but should still be reasonable
      expect(result.averageTime).toBeLessThan(1000); // < 1s average
      expect(result.p95Time).toBeLessThan(2000); // < 2s P95
    }, 120000);
  });

  describe('Database Query Performance', () => {
    it('should benchmark user lookup queries', async () => {
      const result = await benchmark(
        'User Lookup Query',
        async () => {
          // Simulate database query
          const response = await fetch(`${BASE_URL}/api/users/test-user-123`);
          await response.json();
        },
        {
          iterations: 1000,
          parallel: true,
          concurrency: 20,
        }
      );

      // Database queries should be fast
      expect(result.averageTime).toBeLessThan(100);
      expect(result.p99Time).toBeLessThan(300);
    }, 60000);

    it('should benchmark subscription history queries', async () => {
      const result = await benchmark(
        'Subscription History Query',
        async () => {
          const response = await fetch(`${BASE_URL}/api/subscriptions/test-user-123/history`);
          await response.json();
        },
        {
          iterations: 500,
        }
      );

      expect(result.averageTime).toBeLessThan(200);
      expect(result.p95Time).toBeLessThan(500);
    }, 60000);
  });

  describe('Concurrent Request Handling', () => {
    it('should handle mixed endpoint load', async () => {
      const endpoints = [
        `${BASE_URL}/health`,
        `${BASE_URL}/api/auth/config`,
        `${BASE_URL}/api/subscriptions/test-user-123`,
      ];

      const result = await benchmark(
        'Mixed Endpoint Load',
        async () => {
          const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
          const response = await fetch(endpoint);
          await response.json().catch(() => response.text());
        },
        {
          iterations: 1000,
          parallel: true,
          concurrency: 50,
        }
      );

      // Should handle mixed load well
      expect(result.averageTime).toBeLessThan(200);
      expect(result.throughput).toBeGreaterThan(100);
    }, 60000);
  });

  describe('Response Size Impact', () => {
    it('should compare small vs large response performance', async () => {
      const results = await compareBenchmarks([
        {
          name: 'Small Response (Health Check)',
          fn: async () => {
            const response = await fetch(`${BASE_URL}/health`);
            await response.text();
          },
        },
        {
          name: 'Medium Response (User Data)',
          fn: async () => {
            const response = await fetch(`${BASE_URL}/api/users/test-user-123`);
            await response.json();
          },
        },
        {
          name: 'Large Response (Report List)',
          fn: async () => {
            const response = await fetch(`${BASE_URL}/api/reports?limit=50`);
            await response.json();
          },
        },
      ], {
        iterations: 200,
      });

      // Larger responses should still be reasonable
      results.forEach(result => {
        expect(result.averageTime).toBeLessThan(500);
      });

      // Small responses should be faster
      expect(results[0].averageTime).toBeLessThan(results[2].averageTime);
    }, 90000);
  });
});

describePerf('Performance Regression Detection', () => {
  it('should detect performance changes', async () => {
    // This test would compare against baseline metrics
    // stored in a file or database

    const baseline = {
      healthCheck: {
        averageTime: 30,
        p95Time: 80,
        throughput: 150,
      },
    };

    const current = await benchmark(
      'Health Check (Regression Test)',
      async () => {
        const response = await fetch('http://localhost:3000/health');
        await response.text();
      },
      {
        iterations: 500,
      }
    );

    // Allow 20% variance from baseline
    const variance = 0.2;

    expect(current.averageTime).toBeLessThan(baseline.healthCheck.averageTime * (1 + variance));
    expect(current.p95Time).toBeLessThan(baseline.healthCheck.p95Time * (1 + variance));
    expect(current.throughput).toBeGreaterThan(baseline.healthCheck.throughput * (1 - variance));
  }, 60000);
});
