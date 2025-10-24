# Performance Testing Suite

Comprehensive performance testing suite for RestoreAssist application covering database, API, frontend, and cache layers.

## Quick Start

### Prerequisites
```bash
# Install k6
brew install k6  # macOS
# or
choco install k6  # Windows
# or
sudo apt-get install k6  # Linux

# Install dependencies
cd performance-tests
npm install
```

### Run All Tests
```bash
npm run test:all
```

### Individual Test Suites

#### Database Performance
```bash
npm run test:db
# or with custom parameters
k6 run --vus 50 --duration 5m database/query-performance.test.js
```

#### API Load Testing
```bash
npm run test:api
# or specific scenarios
npm run test:smoke   # Quick validation
npm run test:load    # Standard load
npm run test:stress  # Stress testing
npm run test:spike   # Spike testing
npm run test:soak    # Long duration
```

#### Frontend Performance
```bash
npm run test:frontend
# Runs Lighthouse audits on all pages
```

#### Cache Effectiveness
```bash
npm run test:cache
# Tests all cache layers
```

## Test Scenarios

### Smoke Test
- **Purpose**: Quick validation that system is functioning
- **Load**: 1 VU, 30 seconds
- **Use**: After deployments, before full tests

### Load Test
- **Purpose**: Test normal expected load
- **Load**: 100 VUs, 5 minutes
- **Target**: 100 req/s for auth endpoints

### Stress Test
- **Purpose**: Find breaking point
- **Load**: 200 VUs, 10 minutes
- **Target**: Identify maximum capacity

### Spike Test
- **Purpose**: Test sudden traffic spikes
- **Load**: 1000 VUs, 2 minutes
- **Target**: Verify auto-scaling

### Soak Test
- **Purpose**: Test for memory leaks, degradation
- **Load**: 50 VUs, 2 hours
- **Target**: Stable performance over time

## Performance Targets

### Database Queries
| Query | Target P95 |
|-------|------------|
| Trial Activation | < 50ms |
| Report Retrieval | < 100ms |
| Fraud Detection | < 200ms |
| User Lookup | < 30ms |

### API Endpoints
| Endpoint | Target P95 | Target RPS |
|----------|------------|------------|
| Authentication | < 500ms | 100 req/s |
| Report Generation | < 15s | 10 req/s |
| Stripe Checkout | < 1s | 20 req/s |
| Webhook Processing | < 2s | 50 req/s |

### Frontend Performance
| Metric | Target |
|--------|--------|
| Bundle Size | < 500KB |
| LCP | < 2.5s |
| FID | < 100ms |
| CLS | < 0.1 |
| Page Load | < 3s |

### Cache Effectiveness
| Layer | Target Hit Rate |
|-------|----------------|
| Browser | > 80% |
| CDN | > 85% |
| Redis | > 80% |
| Database | > 70% |

## Monitoring Production

### Start Monitoring Stack
```bash
npm run monitor:start
# Access Grafana at http://localhost:3000
# Access Prometheus at http://localhost:9090
```

### Stop Monitoring
```bash
npm run monitor:stop
```

## Results

Test results are saved to `performance-tests/results/`:
- `db-performance.json` - Database query metrics
- `api-load-test.json` - API endpoint performance
- `frontend-performance.json` - Lighthouse audit results
- `cache-effectiveness.json` - Cache layer metrics

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run Performance Tests
  run: |
    cd performance-tests
    npm install
    npm run test:smoke

- name: Check Performance Budget
  run: |
    node scripts/check-performance-budget.js
```

### Jenkins
```groovy
stage('Performance Tests') {
    steps {
        sh 'cd performance-tests && npm run test:smoke'
    }
    post {
        always {
            archiveArtifacts artifacts: 'performance-tests/results/*.json'
        }
    }
}
```

## Troubleshooting

### Common Issues

1. **k6 not found**
   ```bash
   # Install k6 globally
   npm install -g k6
   ```

2. **Chrome not found (Lighthouse)**
   ```bash
   # Install Chrome or set CHROME_PATH
   export CHROME_PATH=/path/to/chrome
   ```

3. **Connection refused**
   ```bash
   # Ensure services are running
   docker-compose up -d
   ```

4. **Out of memory**
   ```bash
   # Increase Node memory limit
   export NODE_OPTIONS="--max-old-space-size=4096"
   ```

## Custom Tests

### Adding New Test
1. Create test file in appropriate directory
2. Import test configuration
3. Define scenarios and thresholds
4. Add to package.json scripts

Example:
```javascript
import http from 'k6/http';
import { check } from 'k6';
import { TEST_CONFIG } from '../config/test-config.js';

export let options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '2m', target: 10 },
    { duration: '1m', target: 0 }
  ],
  thresholds: {
    http_req_duration: ['p(95)<500']
  }
};

export default function() {
  const res = http.get(`${TEST_CONFIG.BASE_URL}/api/health`);
  check(res, {
    'status is 200': (r) => r.status === 200
  });
}
```

## Reporting

### Generate HTML Report
```bash
npm run report:generate
# Opens performance-report.html in browser
```

### Send to DataDog
```bash
k6 run --out datadog api/endpoint-load.test.js
```

### Export to InfluxDB
```bash
k6 run --out influxdb=http://localhost:8086/k6 api/endpoint-load.test.js
```

## Best Practices

1. **Warm up period**: Include gradual ramp-up
2. **Think time**: Add realistic delays between requests
3. **Test data**: Use production-like data volumes
4. **Environment**: Test in production-equivalent setup
5. **Baseline**: Establish performance baseline before changes
6. **Regular testing**: Run tests on schedule (nightly/weekly)
7. **Version control**: Track test scripts with application code
8. **Documentation**: Document test scenarios and results

## Support

For issues or questions:
1. Check test logs in `performance-tests/logs/`
2. Review monitoring dashboards
3. Contact DevOps team

---

Last Updated: October 2024