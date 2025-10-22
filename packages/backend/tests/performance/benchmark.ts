/**
 * Performance Benchmarking Utilities
 *
 * Tools for measuring and tracking API endpoint performance,
 * database query performance, and overall system throughput.
 */

import { performance } from 'perf_hooks';

// ========================================
// Types
// ========================================

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  medianTime: number;
  p95Time: number;
  p99Time: number;
  throughput: number; // operations per second
}

export interface BenchmarkOptions {
  iterations?: number;
  warmupIterations?: number;
  timeout?: number;
  parallel?: boolean;
  concurrency?: number;
}

// ========================================
// Core Benchmarking Functions
// ========================================

/**
 * Run a benchmark test
 */
export async function benchmark(
  name: string,
  fn: () => Promise<void> | void,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const {
    iterations = 100,
    warmupIterations = 10,
    timeout = 30000,
    parallel = false,
    concurrency = 10,
  } = options;

  console.log(`\n🔥 Running benchmark: ${name}`);
  console.log(`   Warmup: ${warmupIterations} iterations`);
  console.log(`   Test: ${iterations} iterations`);
  console.log(`   Mode: ${parallel ? `Parallel (${concurrency})` : 'Sequential'}`);

  // Warmup phase
  console.log('   Warming up...');
  for (let i = 0; i < warmupIterations; i++) {
    await fn();
  }

  // Benchmark phase
  console.log('   Running benchmark...');
  const times: number[] = [];
  const startTime = performance.now();

  if (parallel) {
    // Parallel execution
    for (let batch = 0; batch < Math.ceil(iterations / concurrency); batch++) {
      const batchSize = Math.min(concurrency, iterations - batch * concurrency);
      const promises = Array.from({ length: batchSize }, async () => {
        const iterStart = performance.now();
        await fn();
        return performance.now() - iterStart;
      });

      const batchTimes = await Promise.all(promises);
      times.push(...batchTimes);

      // Check timeout
      if (performance.now() - startTime > timeout) {
        console.warn(`   ⚠️  Timeout reached after ${times.length} iterations`);
        break;
      }
    }
  } else {
    // Sequential execution
    for (let i = 0; i < iterations; i++) {
      const iterStart = performance.now();
      await fn();
      const iterTime = performance.now() - iterStart;
      times.push(iterTime);

      // Check timeout
      if (performance.now() - startTime > timeout) {
        console.warn(`   ⚠️  Timeout reached after ${i + 1} iterations`);
        break;
      }
    }
  }

  const totalTime = performance.now() - startTime;

  // Calculate statistics
  const sortedTimes = times.slice().sort((a, b) => a - b);
  const averageTime = times.reduce((sum, t) => sum + t, 0) / times.length;
  const minTime = sortedTimes[0];
  const maxTime = sortedTimes[sortedTimes.length - 1];
  const medianTime = sortedTimes[Math.floor(sortedTimes.length / 2)];
  const p95Time = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
  const p99Time = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
  const throughput = (times.length / totalTime) * 1000; // ops/sec

  const result: BenchmarkResult = {
    name,
    iterations: times.length,
    totalTime,
    averageTime,
    minTime,
    maxTime,
    medianTime,
    p95Time,
    p99Time,
    throughput,
  };

  printBenchmarkResult(result);
  return result;
}

/**
 * Run multiple benchmarks and compare results
 */
export async function compareBenchmarks(
  benchmarks: Array<{ name: string; fn: () => Promise<void> | void }>,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult[]> {
  console.log(`\n📊 Running ${benchmarks.length} benchmarks for comparison\n`);

  const results: BenchmarkResult[] = [];

  for (const benchmark of benchmarks) {
    const result = await benchmarkFn(benchmark.name, benchmark.fn, options);
    results.push(result);
  }

  printComparisonTable(results);
  return results;
}

// Alias for better naming
const benchmarkFn = benchmark;

/**
 * Measure single execution time
 */
export async function measureOnce<T>(
  fn: () => Promise<T> | T
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { result, duration };
}

// ========================================
// API Endpoint Benchmarking
// ========================================

/**
 * Benchmark an HTTP endpoint
 */
export async function benchmarkEndpoint(
  name: string,
  url: string,
  options: BenchmarkOptions & {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}
): Promise<BenchmarkResult> {
  const { method = 'GET', headers = {}, body } = options;

  return benchmark(
    name,
    async () => {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await response.json();
    },
    options
  );
}

// ========================================
// Database Query Benchmarking
// ========================================

/**
 * Benchmark a database query
 */
export async function benchmarkQuery(
  name: string,
  queryFn: () => Promise<any>,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  return benchmark(name, queryFn, options);
}

// ========================================
// Load Testing
// ========================================

/**
 * Run a load test with increasing concurrency
 */
export async function loadTest(
  name: string,
  fn: () => Promise<void>,
  options: {
    startConcurrency?: number;
    maxConcurrency?: number;
    step?: number;
    duration?: number;
  } = {}
): Promise<Array<{ concurrency: number; result: BenchmarkResult }>> {
  const {
    startConcurrency = 1,
    maxConcurrency = 100,
    step = 10,
    duration = 5000,
  } = options;

  console.log(`\n🚀 Running load test: ${name}`);
  console.log(`   Concurrency: ${startConcurrency} → ${maxConcurrency} (step ${step})`);
  console.log(`   Duration per level: ${duration}ms`);

  const results: Array<{ concurrency: number; result: BenchmarkResult }> = [];

  for (let concurrency = startConcurrency; concurrency <= maxConcurrency; concurrency += step) {
    console.log(`\n   Testing concurrency: ${concurrency}`);

    const iterations = Math.ceil((duration / 100) * concurrency);

    const result = await benchmark(`${name} (${concurrency} concurrent)`, fn, {
      iterations,
      parallel: true,
      concurrency,
      warmupIterations: Math.min(concurrency, 10),
    });

    results.push({ concurrency, result });

    // Stop if performance degrades significantly
    if (results.length > 1) {
      const prevThroughput = results[results.length - 2].result.throughput;
      const currentThroughput = result.throughput;

      if (currentThroughput < prevThroughput * 0.5) {
        console.log(`\n   ⚠️  Performance degraded by >50%, stopping load test`);
        break;
      }
    }
  }

  printLoadTestSummary(results);
  return results;
}

// ========================================
// Reporting Functions
// ========================================

/**
 * Print benchmark result
 */
function printBenchmarkResult(result: BenchmarkResult): void {
  console.log('\n   ✅ Results:');
  console.log(`      Iterations:    ${result.iterations}`);
  console.log(`      Total Time:    ${result.totalTime.toFixed(2)}ms`);
  console.log(`      Average:       ${result.averageTime.toFixed(2)}ms`);
  console.log(`      Min:           ${result.minTime.toFixed(2)}ms`);
  console.log(`      Max:           ${result.maxTime.toFixed(2)}ms`);
  console.log(`      Median:        ${result.medianTime.toFixed(2)}ms`);
  console.log(`      P95:           ${result.p95Time.toFixed(2)}ms`);
  console.log(`      P99:           ${result.p99Time.toFixed(2)}ms`);
  console.log(`      Throughput:    ${result.throughput.toFixed(2)} ops/sec`);
}

/**
 * Print comparison table
 */
function printComparisonTable(results: BenchmarkResult[]): void {
  console.log('\n📊 Benchmark Comparison\n');
  console.log('┌─────────────────────────────┬──────────────┬──────────────┬──────────────┬──────────────┐');
  console.log('│ Name                        │ Avg (ms)     │ P95 (ms)     │ P99 (ms)     │ Throughput   │');
  console.log('├─────────────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤');

  results.forEach(result => {
    const name = result.name.padEnd(27).substring(0, 27);
    const avg = result.averageTime.toFixed(2).padStart(12);
    const p95 = result.p95Time.toFixed(2).padStart(12);
    const p99 = result.p99Time.toFixed(2).padStart(12);
    const throughput = result.throughput.toFixed(2).padStart(12);

    console.log(`│ ${name} │ ${avg} │ ${p95} │ ${p99} │ ${throughput} │`);
  });

  console.log('└─────────────────────────────┴──────────────┴──────────────┴──────────────┴──────────────┘');
}

/**
 * Print load test summary
 */
function printLoadTestSummary(
  results: Array<{ concurrency: number; result: BenchmarkResult }>
): void {
  console.log('\n📈 Load Test Summary\n');
  console.log('┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐');
  console.log('│ Concurrency  │ Avg (ms)     │ P95 (ms)     │ P99 (ms)     │ Throughput   │');
  console.log('├──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤');

  results.forEach(({ concurrency, result }) => {
    const conc = concurrency.toString().padStart(12);
    const avg = result.averageTime.toFixed(2).padStart(12);
    const p95 = result.p95Time.toFixed(2).padStart(12);
    const p99 = result.p99Time.toFixed(2).padStart(12);
    const throughput = result.throughput.toFixed(2).padStart(12);

    console.log(`│ ${conc} │ ${avg} │ ${p95} │ ${p99} │ ${throughput} │`);
  });

  console.log('└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘');

  // Find optimal concurrency
  const optimal = results.reduce((best, current) =>
    current.result.throughput > best.result.throughput ? current : best
  );

  console.log(`\n   🎯 Optimal concurrency: ${optimal.concurrency} (${optimal.result.throughput.toFixed(2)} ops/sec)`);
}

// ========================================
// Export Functions
// ========================================

export default {
  benchmark,
  compareBenchmarks,
  measureOnce,
  benchmarkEndpoint,
  benchmarkQuery,
  loadTest,
};
