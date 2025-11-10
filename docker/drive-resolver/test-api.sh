#!/bin/bash
# Google Drive Resolver - API Test Script

BASE_URL="http://localhost:5000"

echo "==================================="
echo "Google Drive Resolver API Tests"
echo "==================================="
echo ""

# Test 1: Health check
echo "Test 1: Health Check"
echo "-----------------------------------"
curl -s "$BASE_URL/health" | python -m json.tool
echo ""
echo ""

# Test 2: List files
echo "Test 2: List All Files"
echo "-----------------------------------"
curl -s "$BASE_URL/api/list" | python -m json.tool
echo ""
echo ""

# Test 3: Search files
echo "Test 3: Search Files (query='code')"
echo "-----------------------------------"
curl -s "$BASE_URL/api/list?query=code" | python -m json.tool
echo ""
echo ""

# Test 4: Cache stats
echo "Test 4: Cache Statistics"
echo "-----------------------------------"
curl -s "$BASE_URL/api/cache/stats" | python -m json.tool
echo ""
echo ""

# Test 5: Get file metadata (requires file ID)
if [ ! -z "$1" ]; then
    echo "Test 5: Get File Metadata (ID: $1)"
    echo "-----------------------------------"
    curl -s "$BASE_URL/api/file/$1" | python -m json.tool
    echo ""
    echo ""

    echo "Test 6: Download File (ID: $1)"
    echo "-----------------------------------"
    curl -s "$BASE_URL/api/download/$1" | python -m json.tool
    echo ""
    echo ""
else
    echo "Test 5 & 6: Skipped (no file ID provided)"
    echo "Usage: ./test-api.sh <file_id>"
    echo ""
fi

echo "==================================="
echo "Tests Complete"
echo "==================================="
