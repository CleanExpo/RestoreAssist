import http from 'k6/http';
import { check, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { TEST_CONFIG } from '../config/test-config.js';

// Custom metrics for database queries
const trialActivationDuration = new Trend('db_trial_activation_duration');
const reportRetrievalDuration = new Trend('db_report_retrieval_duration');
const fraudDetectionDuration = new Trend('db_fraud_detection_duration');
const userLookupDuration = new Trend('db_user_lookup_duration');
const queryErrorRate = new Rate('db_query_errors');

export let options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp up
    { duration: '2m', target: 100 },  // Stay at 100 concurrent queries
    { duration: '30s', target: 0 }    // Ramp down
  ],
  thresholds: {
    'db_trial_activation_duration': ['p(95)<50'],    // < 50ms target
    'db_report_retrieval_duration': ['p(95)<100'],   // < 100ms target
    'db_fraud_detection_duration': ['p(95)<200'],    // < 200ms target
    'db_user_lookup_duration': ['p(95)<30'],         // < 30ms target
    'db_query_errors': ['rate<0.01']                 // < 1% error rate
  }
};

export function setup() {
  // Setup test data
  const setupUrl = `${TEST_CONFIG.BASE_URL}/api/test/setup-performance-data`;
  const res = http.post(setupUrl, JSON.stringify({
    users: 1000,
    reports: 10000,
    transactions: 50000
  }), {
    headers: { 'Content-Type': 'application/json' }
  });

  if (res.status !== 200) {
    console.error('Failed to setup test data:', res.body);
  }

  return { testDataCreated: res.status === 200 };
}

export default function(data) {
  const baseUrl = TEST_CONFIG.BASE_URL;
  const headers = {
    'Content-Type': 'application/json',
    'X-Performance-Test': 'true'
  };

  group('Trial Activation Queries', () => {
    const startTime = Date.now();
    const res = http.post(`${baseUrl}/api/test/db/trial-activation`,
      JSON.stringify({
        userId: Math.floor(Math.random() * 1000) + 1,
        trialDays: 30
      }),
      { headers }
    );
    const duration = Date.now() - startTime;

    check(res, {
      'Trial activation query successful': (r) => r.status === 200,
      'Trial activation < 50ms': (r) => duration < 50
    });

    trialActivationDuration.add(duration);
    queryErrorRate.add(res.status !== 200);

    if (res.status === 200 && res.json('queryTime')) {
      console.log(`Trial activation query time: ${res.json('queryTime')}ms`);
    }
  });

  group('Report Retrieval with Covering Index', () => {
    const startTime = Date.now();
    const res = http.get(`${baseUrl}/api/test/db/reports`, {
      params: {
        userId: Math.floor(Math.random() * 1000) + 1,
        status: 'completed',
        limit: 10
      },
      headers
    });
    const duration = Date.now() - startTime;

    check(res, {
      'Report retrieval successful': (r) => r.status === 200,
      'Report retrieval < 100ms': (r) => duration < 100,
      'Using covering index': (r) => r.json('usingIndex') === true
    });

    reportRetrievalDuration.add(duration);
    queryErrorRate.add(res.status !== 200);
  });

  group('Fraud Detection CTE Query', () => {
    const startTime = Date.now();
    const res = http.post(`${baseUrl}/api/test/db/fraud-detection`,
      JSON.stringify({
        userId: Math.floor(Math.random() * 1000) + 1,
        timeWindow: '24h'
      }),
      { headers }
    );
    const duration = Date.now() - startTime;

    check(res, {
      'Fraud detection successful': (r) => r.status === 200,
      'Fraud detection < 200ms': (r) => duration < 200,
      'CTE optimization working': (r) => r.json('cteOptimized') === true
    });

    fraudDetectionDuration.add(duration);
    queryErrorRate.add(res.status !== 200);
  });

  group('User Lookup with Email Index', () => {
    const startTime = Date.now();
    const email = `user_${Math.floor(Math.random() * 1000)}@test.com`;
    const res = http.get(`${baseUrl}/api/test/db/user-lookup`, {
      params: { email },
      headers
    });
    const duration = Date.now() - startTime;

    check(res, {
      'User lookup successful': (r) => r.status === 200,
      'User lookup < 30ms': (r) => duration < 30,
      'Using email index': (r) => r.json('usingEmailIndex') === true
    });

    userLookupDuration.add(duration);
    queryErrorRate.add(res.status !== 200);
  });

  group('N+1 Query Detection', () => {
    const res = http.get(`${baseUrl}/api/test/db/n-plus-one-check`, {
      headers
    });

    check(res, {
      'No N+1 queries detected': (r) => r.json('n1QueriesFound') === 0,
      'Query count optimal': (r) => r.json('queryCount') <= 3
    });

    if (res.json('n1QueriesFound') > 0) {
      console.warn('N+1 queries detected:', res.json('details'));
    }
  });
}

export function teardown(data) {
  // Clean up test data
  if (data.testDataCreated) {
    const cleanupUrl = `${TEST_CONFIG.BASE_URL}/api/test/cleanup-performance-data`;
    http.post(cleanupUrl);
  }

  // Generate performance summary
  console.log('\n=== Database Performance Summary ===');
  console.log('Trial Activation: Target < 50ms');
  console.log('Report Retrieval: Target < 100ms');
  console.log('Fraud Detection: Target < 200ms');
  console.log('User Lookup: Target < 30ms');
}