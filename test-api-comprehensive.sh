#!/bin/bash

# RestoreAssist Comprehensive API Test Script
# Tests all critical endpoints with proper error handling

set +e  # Don't exit on errors, we want to report them

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

API_URL="http://localhost:3001"
PASSED=0
FAILED=0

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}RestoreAssist API Integration Tests${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Test 1: Backend Health
echo -e "${YELLOW}Test 1: Backend Health Check${NC}"
HEALTH=$(curl -s -m 5 "$API_URL/api/health" 2>/dev/null)
if echo "$HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ PASSED${NC}: Backend health endpoint\n"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC}: Backend health endpoint - Response: $HEALTH\n"
    ((FAILED++))
fi

# Test 2: Admin Health
echo -e "${YELLOW}Test 2: Admin Health Check${NC}"
ADMIN_HEALTH=$(curl -s -m 5 "$API_URL/api/admin/health" 2>/dev/null)
if echo "$ADMIN_HEALTH" | grep -q "status"; then
    echo -e "${GREEN}✅ PASSED${NC}: Admin health endpoint\n"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC}: Admin health endpoint\n"
    ((FAILED++))
fi

# Test 3: Authentication
echo -e "${YELLOW}Test 3: User Authentication${NC}"
LOGIN_RESPONSE=$(curl -s -m 10 -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@restoreassist.com","password":"admin123"}' 2>/dev/null)

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | sed 's/"accessToken":"//;s/"$//')

if [ -n "$TOKEN" ]; then
    echo -e "${GREEN}✅ PASSED${NC}: Authentication successful"
    echo -e "${BLUE}   Token: ${TOKEN:0:30}...${NC}\n"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC}: Authentication failed\n"
    ((FAILED++))
    echo "Cannot continue without authentication"
    exit 1
fi

# Test 4: Get Current User
echo -e "${YELLOW}Test 4: Get Current User${NC}"
USER_RESPONSE=$(curl -s -m 5 "$API_URL/api/auth/me" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null)

if echo "$USER_RESPONSE" | grep -q "admin@restoreassist.com"; then
    echo -e "${GREEN}✅ PASSED${NC}: Get current user\n"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC}: Get current user\n"
    ((FAILED++))
fi

# Test 5: Report Statistics
echo -e "${YELLOW}Test 5: Report Statistics${NC}"
STATS=$(curl -s -m 5 "$API_URL/api/reports/stats" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null)

if echo "$STATS" | grep -q "totalReports"; then
    TOTAL=$(echo "$STATS" | grep -o '"totalReports":[0-9]*' | grep -o '[0-9]*')
    echo -e "${GREEN}✅ PASSED${NC}: Report statistics"
    echo -e "${BLUE}   Total reports: $TOTAL${NC}\n"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC}: Report statistics\n"
    ((FAILED++))
fi

# Test 6: Admin Statistics
echo -e "${YELLOW}Test 6: Admin Statistics${NC}"
ADMIN_STATS=$(curl -s -m 5 "$API_URL/api/admin/stats" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null)

if echo "$ADMIN_STATS" | grep -q "totalReports"; then
    echo -e "${GREEN}✅ PASSED${NC}: Admin statistics\n"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC}: Admin statistics\n"
    ((FAILED++))
fi

# Test 7: List Reports
echo -e "${YELLOW}Test 7: List Reports (Pagination)${NC}"
LIST=$(curl -s -m 5 "$API_URL/api/reports?page=1&limit=10" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null)

if echo "$LIST" | grep -q "data"; then
    echo -e "${GREEN}✅ PASSED${NC}: List reports endpoint\n"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC}: List reports endpoint\n"
    ((FAILED++))
fi

# Test 8: AI Report Generation (CRITICAL)
echo -e "${YELLOW}Test 8: AI Report Generation (CRITICAL TEST)${NC}"
echo -e "${BLUE}   Generating damage report with Claude AI...${NC}"
REPORT=$(curl -s -m 45 -X POST "$API_URL/api/reports" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "propertyAddress": "456 Test Avenue, Melbourne VIC 3000",
        "clientName": "Integration Test Client",
        "clientEmail": "test@example.com",
        "clientPhone": "0400000000",
        "damageType": "water",
        "damageDescription": "Water damage from burst pipe in kitchen",
        "affectedAreas": ["Kitchen", "Living Room"],
        "severity": "moderate",
        "state": "VIC"
    }' 2>/dev/null)

REPORT_ID=$(echo "$REPORT" | grep -o '"reportId":"[^"]*"' | sed 's/"reportId":"//;s/"$//')

if [ -n "$REPORT_ID" ]; then
    SUMMARY_LENGTH=$(echo "$REPORT" | grep -o '"summary":"[^"]*"' | wc -c)
    echo -e "${GREEN}✅ PASSED${NC}: AI report generation"
    echo -e "${BLUE}   Report ID: $REPORT_ID${NC}"
    echo -e "${BLUE}   Summary length: $SUMMARY_LENGTH characters${NC}\n"
    ((PASSED++))

    # Test 9: Retrieve the generated report
    echo -e "${YELLOW}Test 9: Retrieve Report by ID${NC}"
    GET_REPORT=$(curl -s -m 5 "$API_URL/api/reports/$REPORT_ID" \
        -H "Authorization: Bearer $TOKEN" 2>/dev/null)

    if echo "$GET_REPORT" | grep -q "$REPORT_ID"; then
        echo -e "${GREEN}✅ PASSED${NC}: Retrieve report by ID\n"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAILED${NC}: Retrieve report by ID\n"
        ((FAILED++))
    fi
else
    echo -e "${RED}❌ FAILED${NC}: AI report generation\n"
    ((FAILED++))
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
    echo ""
    echo "Backend:  http://localhost:3001"
    echo "Frontend: http://localhost:5175"
    echo ""
    echo "Login: admin@restoreassist.com / admin123"
    exit 0
else
    echo -e "${RED}⚠️  Some tests failed. Please review the errors above.${NC}"
    exit 1
fi
