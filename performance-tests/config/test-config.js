// Performance Test Configuration
export const TEST_CONFIG = {
  // Base URL for API tests
  BASE_URL: process.env.API_URL || 'http://localhost:3001',

  // Load test stages
  stages: {
    warmup: { duration: '30s', target: 10 },
    load: { duration: '2m', target: 100 },
    spike: { duration: '30s', target: 200 },
    cooldown: { duration: '1m', target: 0 }
  },

  // Performance thresholds
  thresholds: {
    // API endpoint thresholds
    http_req_duration: {
      auth: 'p(95)<500',      // Auth endpoints < 500ms
      report: 'p(95)<15000',   // Report generation < 15s
      checkout: 'p(95)<1000',  // Stripe checkout < 1s
      webhook: 'p(95)<2000',   // Webhook processing < 2s
      default: 'p(95)<1000'    // Default endpoints < 1s
    },

    // Database query thresholds (ms)
    db_query_duration: {
      trial_activation: 50,
      report_retrieval: 100,
      fraud_detection: 200,
      user_lookup: 30
    },

    // Frontend performance budgets
    frontend: {
      bundle_size_kb: 500,
      page_load_time_ms: 3000,
      lcp_ms: 2500,
      fid_ms: 100,
      cls: 0.1
    },

    // Request rate thresholds
    request_rate: {
      auth: 100,        // 100 req/s
      report: 10,       // 10 req/s
      general: 50       // 50 req/s
    }
  },

  // Test data
  test_users: [
    { email: 'perf_test_1@test.com', password: 'TestPass123!' },
    { email: 'perf_test_2@test.com', password: 'TestPass123!' },
    { email: 'perf_test_3@test.com', password: 'TestPass123!' },
    { email: 'perf_test_4@test.com', password: 'TestPass123!' },
    { email: 'perf_test_5@test.com', password: 'TestPass123!' }
  ],

  // Virtual user distribution
  scenarios: {
    authentication: { weight: 30 },  // 30% of users
    report_generation: { weight: 20 }, // 20% of users
    checkout_flow: { weight: 10 },    // 10% of users
    api_calls: { weight: 40 }         // 40% of users
  }
};

// Helper functions
export function getRandomUser() {
  const users = TEST_CONFIG.test_users;
  return users[Math.floor(Math.random() * users.length)];
}

export function checkThreshold(metric, value, category = 'default') {
  const threshold = TEST_CONFIG.thresholds[metric];
  if (!threshold) return true;

  const limit = threshold[category] || threshold.default || threshold;
  if (typeof limit === 'number') {
    return value <= limit;
  }

  // Parse p(95)<value format
  const match = limit.match(/p\((\d+)\)<(\d+)/);
  if (match) {
    return value <= parseInt(match[2]);
  }

  return true;
}