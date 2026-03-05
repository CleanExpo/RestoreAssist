# OWASP ZAP Security Scanning

OWASP ZAP (Zed Attack Proxy) is an open-source web application security scanner that helps identify vulnerabilities.

## What is ZAP?

ZAP performs two types of scans:

**Passive Scan** (Safe):
- Analyzes HTTP traffic
- No attacks on the application
- Can run on production
- Fast execution (minutes)

**Active Scan** (Caution):
- Actively attacks the application
- Tests for vulnerabilities by sending malicious payloads
- Should ONLY run on test/staging environments
- Slower execution (30+ minutes)

## Quick Start

### Prerequisites

Docker must be installed:
```bash
docker --version
```

### Running Baseline Scan (Passive)

```bash
# Start your application
cd apps/backend && uv run uvicorn src.api.main:app &
cd apps/web && pnpm start &

# Run ZAP baseline scan
docker run -v $(pwd):/zap/wrk/:rw -t ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py \
  -t http://host.docker.internal:3000 \
  -c .zap/baseline-scan.yaml \
  -r reports/zap-baseline.html

# View report
open reports/zap-baseline.html
```

### Running Full Scan (Active)

⚠️ **WARNING**: Only run on test/staging environments!

```bash
# Start your test application
cd apps/backend && uv run uvicorn src.api.main:app &
cd apps/web && pnpm start &

# Run ZAP full scan
docker run -v $(pwd):/zap/wrk/:rw -t ghcr.io/zaproxy/zaproxy:stable \
  zap-full-scan.py \
  -t http://host.docker.internal:3000 \
  -c .zap/full-scan.yaml \
  -r reports/zap-full-scan.html

# View report
open reports/zap-full-scan.html
```

## Configuration Files

### `rules.tsv`
Defines which vulnerabilities to check and their severity levels:
- **FAIL**: Build fails if found (SQL injection, XSS, etc.)
- **WARN**: Report as warning (missing headers, weak ciphers)
- **INFO**: Report for information (version disclosure)
- **IGNORE**: Skip this check

### `baseline-scan.yaml`
Configuration for passive baseline scans:
- Spider settings
- Passive scan rules
- Report generation
- Context definitions

### `full-scan.yaml`
Configuration for active comprehensive scans:
- Active scan policies
- Attack intensity
- Scan duration limits
- All baseline settings plus active testing

## Understanding Reports

### Severity Levels

- 🔴 **High**: Critical vulnerabilities (SQL injection, XSS, command injection)
- 🟠 **Medium**: Serious issues (CSRF, session fixation)
- 🟡 **Low**: Minor issues (information disclosure)
- 🔵 **Informational**: Best practice recommendations

### Common Findings

#### SQL Injection
**Risk**: High
**Fix**: Use parameterized queries, ORM, input validation

#### Cross-Site Scripting (XSS)
**Risk**: High
**Fix**: Sanitize user input, use Content Security Policy, escape output

#### Missing Security Headers
**Risk**: Medium
**Fix**: Add CSP, X-Frame-Options, HSTS headers

#### Cookie Security
**Risk**: Medium
**Fix**: Set HttpOnly, Secure, SameSite flags on cookies

## CI/CD Integration

ZAP scans run automatically in CI:

**Weekly Schedule**:
- Baseline scan: Every Sunday at 00:00 UTC
- Full scan: Every Sunday at 02:00 UTC (staging only)

**Manual Trigger**:
- GitHub Actions → "Security Testing" → "Run workflow"

See `.github/workflows/performance-testing.yml`

## Best Practices

### Before Scanning

1. **Test Environment**: Run active scans on staging/test only
2. **Authentication**: Configure test credentials if needed
3. **Baseline First**: Always run baseline before full scan
4. **Warm Up**: Let application fully start before scanning

### During Scanning

1. **Monitor**: Watch application logs for errors
2. **Resources**: Ensure adequate CPU/memory for scanning
3. **Timing**: Avoid scanning during peak usage times
4. **Throttling**: Use delay settings to avoid overwhelming the app

### After Scanning

1. **Review**: Analyze all findings, especially High/Medium
2. **Validate**: Confirm vulnerabilities aren't false positives
3. **Prioritize**: Fix High severity issues first
4. **Retest**: Run scan again after fixes
5. **Track**: Document findings and remediation

## Troubleshooting

### Scan Times Out
- Increase `maxDuration` in YAML config
- Reduce spider depth/children
- Check application is running and responsive

### High False Positive Rate
- Tune rules in `rules.tsv`
- Adjust scan policies in YAML config
- Add exclusions for known safe endpoints

### Docker Connection Issues
- Use `host.docker.internal` instead of `localhost`
- Check firewall rules
- Ensure Docker has network access

### Application Crashes During Scan
- Reduce scan intensity
- Increase `delayInMs` in config
- Check application logs for root cause
- Scale up resources if needed

## Security Policy Integration

ZAP findings should feed into your security process:

1. **Triage**: Review new findings weekly
2. **Tickets**: Create issues for confirmed vulnerabilities
3. **SLAs**: Fix based on severity:
   - High: 7 days
   - Medium: 30 days
   - Low: 90 days
4. **Regression**: Add security tests for fixed issues
5. **Metrics**: Track findings over time

## Additional Resources

- [OWASP ZAP Documentation](https://www.zaproxy.org/docs/)
- [OWASP ZAP Docker](https://www.zaproxy.org/docs/docker/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [ZAP Automation Framework](https://www.zaproxy.org/docs/desktop/addons/automation-framework/)
- [ZAP API](https://www.zaproxy.org/docs/api/)
