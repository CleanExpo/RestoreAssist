#!/bin/bash
# E2E Test Runner Script for RestoreAssist
# Runs Playwright tests and generates comprehensive reports

echo "======================================"
echo "RestoreAssist E2E Test Suite"
echo "Target Score: 65/100 | Current: 40/100"
echo "======================================"
echo ""

# Create results directory
mkdir -p tests/e2e-claude/results

# Run Playwright tests
echo "Running Playwright E2E tests..."
npx playwright test --reporter=list,json,html

# Check exit code
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ All tests passed!"
else
  echo ""
  echo "⚠️ Some tests failed. Check the report for details."
fi

echo ""
echo "Test report generated at: tests/e2e-claude/results/html-report"
echo "To view report: npm run test:e2e:report"
echo ""
