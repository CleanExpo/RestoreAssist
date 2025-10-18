#!/bin/bash

# RestoreAssist API Connection Test Script
# Tests all critical API endpoints to verify the system is working

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# API Base URL
API_URL="http://localhost:3001"

# Test counters
PASSED=0
FAILED=0

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}RestoreAssist API Connection Tests${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Function to print test result
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ PASSED${NC}: $2"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAILED${NC}: $2"
        echo -e "${RED}   Error: $3${NC}"
        ((FAILED++))
    fi
    echo ""
}

# Test 1: Backend Health Endpoint
echo -e "${YELLOW}Test 1: Backend Health Check${NC}"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health" 2>&1)
if [ "$RESPONSE" = "200" ]; then
    print_result 0 "Backend health endpoint"
else
    print_result 1 "Backend health endpoint" "HTTP $RESPONSE - Backend may not be running"
fi

# Test 2: Admin Health Endpoint
echo -e "${YELLOW}Test 2: Admin Health Check${NC}"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/admin/health" 2>&1)
if [ "$RESPONSE" = "200" ]; then
    print_result 0 "Admin health endpoint"
else
    print_result 1 "Admin health endpoint" "HTTP $RESPONSE"
fi

# Test 3: Authentication/Login
echo -e "${YELLOW}Test 3: Authentication (Login)${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@restoreassist.com","password":"admin123"}' 2>&1)

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | sed 's/"accessToken":"//;s/"$//')

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    print_result 0 "User authentication"
    echo -e "${BLUE}   Token obtained: ${TOKEN:0:20}...${NC}\n"
else
    print_result 1 "User authentication" "No token received. Response: $LOGIN_RESPONSE"
    echo -e "${RED}Cannot continue with remaining tests without authentication${NC}"
    exit 1
fi

# Test 4: Get Current User
echo -e "${YELLOW}Test 4: Get Current User${NC}"
USER_RESPONSE=$(curl -s -X GET "$API_URL/api/auth/me" \
    -H "Authorization: Bearer $TOKEN" 2>&1)

USER_EMAIL=$(echo "$USER_RESPONSE" | grep -o '"email":"[^"]*"' | sed 's/"email":"//;s/"$//')

if [ "$USER_EMAIL" = "admin@restoreassist.com" ]; then
    print_result 0 "Get current user"
else
    print_result 1 "Get current user" "Expected admin@restoreassist.com, got: $USER_EMAIL"
fi

# Test 5: Get Statistics
echo -e "${YELLOW}Test 5: Get Report Statistics${NC}"
STATS_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/reports/stats" \
    -H "Authorization: Bearer $TOKEN" 2>&1)

if [ "$STATS_RESPONSE" = "200" ]; then
    print_result 0 "Report statistics endpoint"
else
    print_result 1 "Report statistics endpoint" "HTTP $STATS_RESPONSE"
fi

# Test 6: Get Admin Statistics
echo -e "${YELLOW}Test 6: Get Admin Statistics${NC}"
ADMIN_STATS_RESPONSE=$(curl -s "$API_URL/api/admin/stats" \
    -H "Authorization: Bearer $TOKEN" 2>&1)

TOTAL_REPORTS=$(echo "$ADMIN_STATS_RESPONSE" | grep -o '"totalReports":[0-9]*' | sed 's/"totalReports"://')

if [ -n "$TOTAL_REPORTS" ]; then
    print_result 0 "Admin statistics endpoint"
    echo -e "${BLUE}   Total reports in system: $TOTAL_REPORTS${NC}\n"
else
    print_result 1 "Admin statistics endpoint" "Could not retrieve statistics"
fi

# Test 7: Create Report (THE CRITICAL TEST)
echo -e "${YELLOW}Test 7: Create AI-Generated Report (CRITICAL TEST)${NC}"
echo -e "${BLUE}   This tests the Anthropic API integration...${NC}"

REPORT_RESPONSE=$(curl -s -X POST "$API_URL/api/reports" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "propertyAddress": "123 Test Street, Sydney NSW 2000",
        "clientName": "Test Client",
        "clientEmail": "test@example.com",
        "clientPhone": "0400000000",
        "damageType": "water",
        "damageDescription": "Water leak from ceiling in living room, affecting carpet and drywall",
        "affectedAreas": ["Living Room", "Ceiling"],
        "severity": "moderate",
        "timestamp": "2025-01-18T10:00:00Z",
        "state": "NSW"
    }' 2>&1)

REPORT_ID=$(echo "$REPORT_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"$//')

if [ -n "$REPORT_ID" ] && [ "$REPORT_ID" != "null" ]; then
    # Check if the report has AI-generated content
    SUMMARY=$(echo "$REPORT_RESPONSE" | grep -o '"summary":"[^"]*"' | sed 's/"summary":"//;s/"$//')

    if [ -n "$SUMMARY" ] && [ "$SUMMARY" != "null" ] && [ ${#SUMMARY} -gt 50 ]; then
        print_result 0 "AI report generation (Anthropic API)"
        echo -e "${BLUE}   Report ID: $REPORT_ID${NC}"
        echo -e "${BLUE}   Summary length: ${#SUMMARY} characters${NC}\n"
    else
        print_result 1 "AI report generation" "Report created but summary is missing or too short. Check ANTHROPIC_API_KEY"
    fi
else
    print_result 1 "AI report generation" "Failed to create report. Response: ${REPORT_RESPONSE:0:200}"
fi

# Test 8: Retrieve Created Report
if [ -n "$REPORT_ID" ] && [ "$REPORT_ID" != "null" ]; then
    echo -e "${YELLOW}Test 8: Retrieve Report by ID${NC}"
    GET_REPORT_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/reports/$REPORT_ID" \
        -H "Authorization: Bearer $TOKEN" 2>&1)

    if [ "$GET_REPORT_RESPONSE" = "200" ]; then
        print_result 0 "Retrieve report by ID"
    else
        print_result 1 "Retrieve report by ID" "HTTP $GET_REPORT_RESPONSE"
    fi
fi

# Test 9: List Reports
echo -e "${YELLOW}Test 9: List All Reports (Paginated)${NC}"
LIST_RESPONSE=$(curl -s "$API_URL/api/reports?page=1&limit=10" \
    -H "Authorization: Bearer $TOKEN" 2>&1)

REPORTS_COUNT=$(echo "$LIST_RESPONSE" | grep -o '"data":\[' | wc -l)

if [ "$REPORTS_COUNT" -ge 1 ]; then
    print_result 0 "List reports (pagination)"
else
    print_result 1 "List reports (pagination)" "No reports found in response"
fi

# Final Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed! RestoreAssist is fully operational.${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Some tests failed. Check the errors above.${NC}"
    echo ""
    echo -e "${YELLOW}Common issues:${NC}"
    echo -e "  - Backend not running: npm run dev in packages/backend"
    echo -e "  - Missing .env.local: Copy from .env.example and add ANTHROPIC_API_KEY"
    echo -e "  - Invalid API key: Check ANTHROPIC_API_KEY in packages/backend/.env.local"
    echo -e "  - Database issues: Check database connection settings"
    exit 1
fi
