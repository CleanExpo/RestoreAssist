#!/bin/bash

# Stripe Webhook Security Test Script
# Tests that webhook security is properly implemented

set -e

BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
WEBHOOK_ENDPOINT="$BACKEND_URL/api/stripe/webhook"

echo "🔒 Testing Stripe Webhook Security"
echo "=================================="
echo "Endpoint: $WEBHOOK_ENDPOINT"
echo ""

# Test 1: Missing signature header
echo "Test 1: Missing stripe-signature header"
echo "----------------------------------------"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{"type":"checkout.session.completed"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "400" ]; then
  echo "✅ PASS: Rejected with HTTP 400"
  echo "   Response: $BODY"
else
  echo "❌ FAIL: Expected HTTP 400, got $HTTP_CODE"
  echo "   Response: $BODY"
  exit 1
fi
echo ""

# Test 2: Invalid signature
echo "Test 2: Invalid stripe-signature"
echo "---------------------------------"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=1234567890,v1=invalid_signature" \
  -d '{"type":"checkout.session.completed"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "500" ]; then
  echo "✅ PASS: Rejected with HTTP $HTTP_CODE"
  echo "   Response: $BODY"
else
  echo "❌ FAIL: Expected HTTP 400 or 500, got $HTTP_CODE"
  echo "   Response: $BODY"
  exit 1
fi
echo ""

# Test 3: Empty body with signature
echo "Test 3: Empty body with signature"
echo "----------------------------------"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=1234567890,v1=test" \
  -d '')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "500" ]; then
  echo "✅ PASS: Rejected with HTTP $HTTP_CODE"
  echo "   Response: $BODY"
else
  echo "❌ FAIL: Expected HTTP 400 or 500, got $HTTP_CODE"
  echo "   Response: $BODY"
  exit 1
fi
echo ""

# Test 4: Malformed JSON
echo "Test 4: Malformed JSON with signature"
echo "--------------------------------------"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=1234567890,v1=test" \
  -d '{invalid json}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "500" ]; then
  echo "✅ PASS: Rejected with HTTP $HTTP_CODE"
  echo "   Response: $BODY"
else
  echo "❌ FAIL: Expected HTTP 400 or 500, got $HTTP_CODE"
  echo "   Response: $BODY"
  exit 1
fi
echo ""

echo "=================================="
echo "✅ All security tests passed!"
echo ""
echo "Note: These tests verify that the webhook endpoint properly"
echo "rejects invalid requests. To test valid webhooks, use:"
echo ""
echo "  stripe listen --forward-to $WEBHOOK_ENDPOINT"
echo "  stripe trigger checkout.session.completed"
echo ""
echo "See STRIPE_WEBHOOK_TESTING.md for detailed instructions."
