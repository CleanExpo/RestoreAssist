#!/bin/bash
# Quick RestoreAssist API Test

echo "=========================================="
echo "RestoreAssist Quick API Tests"
echo "=========================================="
echo ""

# Test 1: Backend Health
echo "Test 1: Backend Health"
HEALTH=$(curl -s -m 5 http://localhost:3001/api/health)
if echo "$HEALTH" | grep -q "healthy"; then
    echo "✅ PASSED - Backend is healthy"
else
    echo "❌ FAILED - Backend not responding"
    exit 1
fi
echo ""

# Test 2: Login
echo "Test 2: Authentication"
TOKEN=$(curl -s -m 10 -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@restoreassist.com","password":"admin123"}' \
    | grep -o '"accessToken":"[^"]*"' | sed 's/"accessToken":"//;s/"$//')

if [ -n "$TOKEN" ]; then
    echo "✅ PASSED - Login successful, token obtained"
else
    echo "❌ FAILED - Login failed"
    exit 1
fi
echo ""

# Test 3: Admin Stats
echo "Test 3: Admin Stats"
STATS=$(curl -s -m 5 http://localhost:3001/api/admin/stats \
    -H "Authorization: Bearer $TOKEN")
if echo "$STATS" | grep -q "totalReports"; then
    echo "✅ PASSED - Admin stats endpoint working"
else
    echo "❌ FAILED - Admin stats failed"
    exit 1
fi
echo ""

# Test 4: Report Stats
echo "Test 4: Report Statistics"
REPORT_STATS=$(curl -s -m 5 http://localhost:3001/api/reports/stats \
    -H "Authorization: Bearer $TOKEN")
if echo "$REPORT_STATS" | grep -q "totalReports"; then
    echo "✅ PASSED - Report stats endpoint working"
else
    echo "❌ FAILED - Report stats failed"
    exit 1
fi
echo ""

# Test 5: Frontend
echo "Test 5: Frontend Web Server"
FRONTEND=$(curl -s -m 5 http://localhost:5175 | grep -o "<title>.*</title>")
if echo "$FRONTEND" | grep -q "RestoreAssist"; then
    echo "✅ PASSED - Frontend serving HTML"
else
    echo "❌ FAILED - Frontend not responding"
    exit 1
fi
echo ""

echo "=========================================="
echo "✅ All Quick Tests Passed!"
echo "=========================================="
echo ""
echo "Backend:  http://localhost:3001"
echo "Frontend: http://localhost:5175"
echo ""
echo "Login: admin@restoreassist.com / admin123"
