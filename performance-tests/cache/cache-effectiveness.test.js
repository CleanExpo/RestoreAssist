import http from 'k6/http';
import { check, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { TEST_CONFIG } from '../config/test-config.js';

// Custom metrics
const cacheHitRate = new Rate('cache_hit_rate');
const cacheMissRate = new Rate('cache_miss_rate');
const cacheResponseTime = new Trend('cache_response_time');
const directResponseTime = new Trend('direct_response_time');
const cacheBytesSaved = new Counter('cache_bytes_saved');
const materializedViewFreshness = new Trend('materialized_view_freshness');

export let options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    'cache_hit_rate': ['rate>0.80'],           // > 80% cache hit rate
    'cache_response_time': ['p(95)<50'],       // Cache responses < 50ms
    'direct_response_time': ['p(95)<500'],     // Direct responses < 500ms
    'materialized_view_freshness': ['p(95)<60000'] // Views refreshed < 1 minute
  }
};

export function setup() {
  const baseUrl = TEST_CONFIG.BASE_URL;

  // Warm up caches
  console.log('Warming up caches...');

  const warmupRequests = [
    '/api/reports/templates',
    '/api/user/profile',
    '/api/settings',
    '/api/reports/recent',
    '/api/dashboard/stats'
  ];

  warmupRequests.forEach(endpoint => {
    for (let i = 0; i < 5; i++) {
      http.get(`${baseUrl}${endpoint}`, {
        headers: { 'Authorization': 'Bearer test-token' }
      });
    }
  });

  return { cacheWarmed: true };
}

export default function(data) {
  const baseUrl = TEST_CONFIG.BASE_URL;

  group('Application Layer Caching', () => {
    // Test in-memory cache
    testInMemoryCache(baseUrl);

    // Test computed value cache
    testComputedValueCache(baseUrl);

    // Test object caching
    testObjectCache(baseUrl);
  });

  group('Distributed Caching (Redis)', () => {
    // Test Redis session caching
    testRedisSessionCache(baseUrl);

    // Test Redis query result caching
    testRedisQueryCache(baseUrl);

    // Test cache invalidation
    testCacheInvalidation(baseUrl);
  });

  group('Database Caching', () => {
    // Test query result caching
    testDatabaseQueryCache(baseUrl);

    // Test connection pooling
    testConnectionPooling(baseUrl);

    // Test buffer pool effectiveness
    testBufferPool(baseUrl);
  });

  group('CDN and Browser Caching', () => {
    // Test CDN cache headers
    testCDNCaching(baseUrl);

    // Test browser cache headers
    testBrowserCaching(baseUrl);

    // Test service worker caching
    testServiceWorkerCache(baseUrl);
  });

  group('Materialized Views', () => {
    // Test materialized view performance
    testMaterializedViews(baseUrl);

    // Test view refresh timing
    testViewRefreshTiming(baseUrl);
  });
}

function testInMemoryCache(baseUrl) {
  // First request - should be cache miss
  const firstStart = Date.now();
  const firstRes = http.get(`${baseUrl}/api/reports/templates`, {
    headers: { 'Authorization': 'Bearer test-token' }
  });
  const firstDuration = Date.now() - firstStart;

  // Second request - should be cache hit
  const secondStart = Date.now();
  const secondRes = http.get(`${baseUrl}/api/reports/templates`, {
    headers: { 'Authorization': 'Bearer test-token' }
  });
  const secondDuration = Date.now() - secondStart;

  const isCacheHit = secondRes.headers['X-Cache'] === 'HIT';

  check(firstRes, {
    'First request successful': (r) => r.status === 200
  });

  check(secondRes, {
    'Second request successful': (r) => r.status === 200,
    'Cache hit detected': (r) => r.headers['X-Cache'] === 'HIT',
    'Cached response faster': () => secondDuration < firstDuration * 0.5
  });

  cacheHitRate.add(isCacheHit);
  cacheMissRate.add(!isCacheHit);

  if (isCacheHit) {
    cacheResponseTime.add(secondDuration);
    cacheBytesSaved.add(secondRes.body.length);
  } else {
    directResponseTime.add(secondDuration);
  }
}

function testComputedValueCache(baseUrl) {
  // Request expensive computation
  const res = http.post(`${baseUrl}/api/reports/calculate-tax`,
    JSON.stringify({
      year: 2023,
      userId: 'test_user_1'
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    }
  );

  // Second request with same parameters - should use cached result
  const cachedStart = Date.now();
  const cachedRes = http.post(`${baseUrl}/api/reports/calculate-tax`,
    JSON.stringify({
      year: 2023,
      userId: 'test_user_1'
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    }
  );
  const cachedDuration = Date.now() - cachedStart;

  check(cachedRes, {
    'Computed value cached': (r) => r.headers['X-Cache'] === 'HIT',
    'Computation result matches': (r) => r.json('result') === res.json('result'),
    'Cached computation fast': () => cachedDuration < 50
  });

  if (cachedRes.headers['X-Cache'] === 'HIT') {
    cacheHitRate.add(1);
    cacheResponseTime.add(cachedDuration);
  }
}

function testObjectCache(baseUrl) {
  // Request user object
  const res = http.get(`${baseUrl}/api/user/profile`, {
    headers: { 'Authorization': 'Bearer test-token' }
  });

  check(res, {
    'User object cacheable': (r) => r.headers['Cache-Control'] !== undefined,
    'ETag present': (r) => r.headers['ETag'] !== undefined
  });

  // Request with ETag - should return 304 if not modified
  const etag = res.headers['ETag'];
  if (etag) {
    const conditionalRes = http.get(`${baseUrl}/api/user/profile`, {
      headers: {
        'Authorization': 'Bearer test-token',
        'If-None-Match': etag
      }
    });

    check(conditionalRes, {
      'Conditional request works': (r) => r.status === 304 || r.status === 200,
      'Not Modified when appropriate': (r) => r.status === 304 || r.headers['ETag'] !== etag
    });

    if (conditionalRes.status === 304) {
      cacheHitRate.add(1);
      cacheBytesSaved.add(res.body.length); // Saved entire response body
    }
  }
}

function testRedisSessionCache(baseUrl) {
  // Login to create session
  const loginRes = http.post(`${baseUrl}/api/auth/login`,
    JSON.stringify({
      email: 'test@example.com',
      password: 'TestPass123!'
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const token = loginRes.json('token');

  // Multiple requests with same session - should use cached session
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    const res = http.get(`${baseUrl}/api/user/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const duration = Date.now() - start;

    check(res, {
      'Session validated quickly': () => duration < 50,
      'Session cache used': (r) => r.headers['X-Session-Cache'] === 'HIT'
    });

    if (res.headers['X-Session-Cache'] === 'HIT') {
      cacheHitRate.add(1);
      cacheResponseTime.add(duration);
    }
  }
}

function testRedisQueryCache(baseUrl) {
  // Complex query that should be cached
  const queryStart = Date.now();
  const res = http.get(`${baseUrl}/api/reports/analytics`, {
    params: {
      startDate: '2023-01-01',
      endDate: '2023-12-31',
      groupBy: 'month'
    },
    headers: { 'Authorization': 'Bearer test-token' }
  });
  const queryDuration = Date.now() - queryStart;

  // Same query - should hit cache
  const cacheStart = Date.now();
  const cachedRes = http.get(`${baseUrl}/api/reports/analytics`, {
    params: {
      startDate: '2023-01-01',
      endDate: '2023-12-31',
      groupBy: 'month'
    },
    headers: { 'Authorization': 'Bearer test-token' }
  });
  const cacheDuration = Date.now() - cacheStart;

  check(cachedRes, {
    'Query result cached': (r) => r.headers['X-Cache'] === 'HIT',
    'Cache significantly faster': () => cacheDuration < queryDuration * 0.2,
    'Results match': (r) => r.body === res.body
  });

  if (cachedRes.headers['X-Cache'] === 'HIT') {
    cacheHitRate.add(1);
    cacheResponseTime.add(cacheDuration);
  } else {
    directResponseTime.add(cacheDuration);
  }
}

function testCacheInvalidation(baseUrl) {
  // Get initial data
  const initialRes = http.get(`${baseUrl}/api/user/settings`, {
    headers: { 'Authorization': 'Bearer test-token' }
  });

  // Update data - should invalidate cache
  const updateRes = http.put(`${baseUrl}/api/user/settings`,
    JSON.stringify({ theme: 'dark' }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    }
  );

  // Get updated data - should not use stale cache
  const newRes = http.get(`${baseUrl}/api/user/settings`, {
    headers: { 'Authorization': 'Bearer test-token' }
  });

  check(newRes, {
    'Cache invalidated on update': (r) => r.json('theme') === 'dark',
    'Not serving stale data': (r) => r.body !== initialRes.body
  });
}

function testDatabaseQueryCache(baseUrl) {
  // Execute same query multiple times
  const queries = [];

  for (let i = 0; i < 3; i++) {
    const start = Date.now();
    const res = http.get(`${baseUrl}/api/test/db/cached-query`, {
      params: {
        query: 'SELECT * FROM reports WHERE status = ?',
        params: 'completed'
      },
      headers: { 'Authorization': 'Bearer test-token' }
    });
    const duration = Date.now() - start;

    queries.push({ res, duration, iteration: i });
  }

  // First query should be slowest, subsequent should be faster
  check(queries[1].res, {
    'Second query faster': () => queries[1].duration < queries[0].duration * 0.5,
    'Query plan cached': (r) => r.json('planCached') === true
  });

  check(queries[2].res, {
    'Third query fastest': () => queries[2].duration < queries[0].duration * 0.3,
    'Result cached': (r) => r.json('resultCached') === true
  });

  // Add metrics
  queries.slice(1).forEach(q => {
    if (q.res.json('resultCached')) {
      cacheHitRate.add(1);
      cacheResponseTime.add(q.duration);
    }
  });
}

function testConnectionPooling(baseUrl) {
  // Test connection pool effectiveness
  const concurrentRequests = 10;
  const responses = [];

  // Fire multiple concurrent requests
  for (let i = 0; i < concurrentRequests; i++) {
    responses.push(
      http.get(`${baseUrl}/api/test/db/connection-pool`, {
        headers: { 'Authorization': 'Bearer test-token' }
      })
    );
  }

  // Check that connection pooling is working
  responses.forEach(res => {
    check(res, {
      'Connection pool available': (r) => r.json('connectionAcquired') === true,
      'No connection timeout': (r) => r.json('waitTime') < 100,
      'Reused connection': (r) => r.json('connectionReused') === true
    });
  });
}

function testBufferPool(baseUrl) {
  // Test database buffer pool hit rate
  const res = http.get(`${baseUrl}/api/test/db/buffer-pool-stats`, {
    headers: { 'Authorization': 'Bearer test-token' }
  });

  const hitRate = res.json('bufferPoolHitRate');

  check(res, {
    'Buffer pool stats available': (r) => r.status === 200,
    'Buffer pool hit rate > 90%': (r) => r.json('bufferPoolHitRate') > 0.9,
    'Pages in memory': (r) => r.json('pagesInMemory') > 0
  });

  if (hitRate) {
    cacheHitRate.add(hitRate);
  }
}

function testCDNCaching(baseUrl) {
  // Test static asset caching
  const staticAssets = [
    '/static/css/main.css',
    '/static/js/bundle.js',
    '/images/logo.png'
  ];

  staticAssets.forEach(asset => {
    const res = http.get(`${baseUrl}${asset}`);

    check(res, {
      'CDN cache headers present': (r) =>
        r.headers['Cache-Control'] !== undefined ||
        r.headers['X-Cache'] !== undefined,
      'Long cache TTL': (r) => {
        const cacheControl = r.headers['Cache-Control'] || '';
        const maxAge = cacheControl.match(/max-age=(\d+)/);
        return maxAge && parseInt(maxAge[1]) > 86400; // > 1 day
      },
      'CDN hit': (r) =>
        r.headers['X-Cache'] === 'HIT' ||
        r.headers['CF-Cache-Status'] === 'HIT' ||
        r.headers['X-Vercel-Cache'] === 'HIT'
    });

    if (res.headers['X-Cache'] === 'HIT') {
      cacheHitRate.add(1);
      cacheBytesSaved.add(res.body.length);
    }
  });
}

function testBrowserCaching(baseUrl) {
  // Test browser cache headers for different resource types
  const resources = [
    { path: '/api/settings', expectedCache: 'private, max-age=300' },
    { path: '/static/js/vendor.js', expectedCache: 'public, max-age=31536000, immutable' },
    { path: '/api/user/profile', expectedCache: 'private, no-cache' }
  ];

  resources.forEach(resource => {
    const res = http.get(`${baseUrl}${resource.path}`, {
      headers: { 'Authorization': 'Bearer test-token' }
    });

    check(res, {
      'Cache-Control header present': (r) => r.headers['Cache-Control'] !== undefined,
      'ETag or Last-Modified present': (r) =>
        r.headers['ETag'] !== undefined ||
        r.headers['Last-Modified'] !== undefined
    });
  });
}

function testServiceWorkerCache(baseUrl) {
  // Test service worker cache API
  const res = http.get(`${baseUrl}/api/test/sw-cache-status`, {
    headers: { 'Authorization': 'Bearer test-token' }
  });

  check(res, {
    'Service worker active': (r) => r.json('serviceWorkerActive') === true,
    'Cache storage available': (r) => r.json('cacheStorageAvailable') === true,
    'Offline capable': (r) => r.json('offlineCapable') === true,
    'Cached routes count': (r) => r.json('cachedRoutes') > 0
  });
}

function testMaterializedViews(baseUrl) {
  // Test materialized view performance
  const directStart = Date.now();
  const directRes = http.get(`${baseUrl}/api/test/db/direct-aggregate`, {
    headers: { 'Authorization': 'Bearer test-token' }
  });
  const directDuration = Date.now() - directStart;

  const viewStart = Date.now();
  const viewRes = http.get(`${baseUrl}/api/test/db/materialized-view`, {
    headers: { 'Authorization': 'Bearer test-token' }
  });
  const viewDuration = Date.now() - viewStart;

  check(viewRes, {
    'Materialized view faster': () => viewDuration < directDuration * 0.1,
    'View data matches': (r) => r.json('total') === directRes.json('total'),
    'View is fresh': (r) => {
      const age = Date.now() - new Date(r.json('lastRefreshed')).getTime();
      return age < 60000; // Less than 1 minute old
    }
  });

  directResponseTime.add(directDuration);
  cacheResponseTime.add(viewDuration);
}

function testViewRefreshTiming(baseUrl) {
  // Test materialized view refresh timing
  const res = http.get(`${baseUrl}/api/test/db/view-refresh-stats`, {
    headers: { 'Authorization': 'Bearer test-token' }
  });

  const views = res.json('views') || [];

  views.forEach(view => {
    const freshness = Date.now() - new Date(view.lastRefreshed).getTime();
    materializedViewFreshness.add(freshness);

    check(view, {
      'View refreshed recently': () => freshness < 300000, // < 5 minutes
      'Refresh time acceptable': () => view.refreshDuration < 5000, // < 5 seconds
      'No refresh failures': () => view.failedRefreshes === 0
    });
  });
}

export function handleSummary(data) {
  const hitRate = data.metrics.cache_hit_rate?.values?.rate || 0;
  const avgCacheTime = data.metrics.cache_response_time?.values?.avg || 0;
  const avgDirectTime = data.metrics.direct_response_time?.values?.avg || 0;
  const bytesSaved = data.metrics.cache_bytes_saved?.values?.count || 0;

  const summary = {
    timestamp: new Date().toISOString(),
    test_type: 'Cache Effectiveness Test',
    results: {
      cache_performance: {
        hit_rate: (hitRate * 100).toFixed(2) + '%',
        avg_cache_response_time: avgCacheTime.toFixed(2) + 'ms',
        avg_direct_response_time: avgDirectTime.toFixed(2) + 'ms',
        speedup_factor: (avgDirectTime / avgCacheTime).toFixed(2) + 'x',
        bytes_saved: (bytesSaved / 1024 / 1024).toFixed(2) + 'MB'
      },
      materialized_views: {
        avg_freshness: data.metrics.materialized_view_freshness?.values?.avg || 0,
        p95_freshness: data.metrics.materialized_view_freshness?.values?.['p(95)'] || 0
      },
      recommendations: generateCacheRecommendations(hitRate, avgCacheTime, avgDirectTime)
    }
  };

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'performance-tests/results/cache-effectiveness.json': JSON.stringify(summary, null, 2)
  };
}

function generateCacheRecommendations(hitRate, avgCacheTime, avgDirectTime) {
  const recommendations = [];

  if (hitRate < 0.8) {
    recommendations.push({
      priority: 'HIGH',
      issue: 'Low cache hit rate',
      current: (hitRate * 100).toFixed(2) + '%',
      target: '> 80%',
      solution: 'Review cache key strategies, increase TTL for stable data'
    });
  }

  if (avgCacheTime > 50) {
    recommendations.push({
      priority: 'MEDIUM',
      issue: 'Slow cache response time',
      current: avgCacheTime.toFixed(2) + 'ms',
      target: '< 50ms',
      solution: 'Consider using local cache, optimize Redis configuration'
    });
  }

  const speedup = avgDirectTime / avgCacheTime;
  if (speedup < 5) {
    recommendations.push({
      priority: 'LOW',
      issue: 'Low cache speedup factor',
      current: speedup.toFixed(2) + 'x',
      target: '> 5x',
      solution: 'Cache more expensive operations, optimize cache storage'
    });
  }

  return recommendations;
}