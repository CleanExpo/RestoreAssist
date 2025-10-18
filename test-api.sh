#!/bin/bash
# RestoreAssist API Test Suite

BASE_URL="http://localhost:3001/api"

echo "=========================================="
echo "RestoreAssist API Test Suite"
echo "=========================================="
echo ""

# 1. Health Check
echo "1️⃣  Testing: GET /api/health"
curl -s $BASE_URL/health | json_pp
echo -e "\n"

# 2. Admin Health
echo "2️⃣  Testing: GET /api/admin/health"
curl -s $BASE_URL/admin/health | json_pp
echo -e "\n"

# 3. Admin Stats
echo "3️⃣  Testing: GET /api/admin/stats"
curl -s $BASE_URL/admin/stats | json_pp
echo -e "\n"

# 4. Report Stats (empty)
echo "4️⃣  Testing: GET /api/reports/stats"
curl -s $BASE_URL/reports/stats | json_pp
echo -e "\n"

# 5. List Reports (paginated, empty)
echo "5️⃣  Testing: GET /api/reports?page=1&limit=10"
curl -s "$BASE_URL/reports?page=1&limit=10" | json_pp
echo -e "\n"

# 6. Create Report
echo "6️⃣  Testing: POST /api/reports (Create Report)"
echo "⏳ Generating AI report (may take 10-15 seconds)..."
REPORT_ID=$(curl -s -X POST $BASE_URL/reports \
  -H "Content-Type: application/json" \
  -d '{
    "propertyAddress": "123 Main St, Sydney NSW 2000",
    "damageType": "water",
    "damageDescription": "Burst pipe in ceiling caused water damage to living room, affecting carpet and drywall",
    "state": "NSW",
    "clientName": "John Smith",
    "insuranceCompany": "NRMA Insurance",
    "claimNumber": "CLM-2024-12345"
  }' | json_pp | grep reportId | cut -d'"' -f4)

echo "✅ Report created: $REPORT_ID"
echo -e "\n"

# 7. Get Single Report
echo "7️⃣  Testing: GET /api/reports/:id"
curl -s $BASE_URL/reports/$REPORT_ID | json_pp
echo -e "\n"

# 8. Update Report
echo "8️⃣  Testing: PATCH /api/reports/:id"
curl -s -X PATCH $BASE_URL/reports/$REPORT_ID \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "UPDATED: This is an updated summary for testing purposes"
  }' | json_pp
echo -e "\n"

# 9. List Reports (now with data)
echo "9️⃣  Testing: GET /api/reports (with data)"
curl -s "$BASE_URL/reports?page=1&limit=10" | json_pp
echo -e "\n"

# 10. Report Stats (with data)
echo "🔟 Testing: GET /api/reports/stats (with data)"
curl -s $BASE_URL/reports/stats | json_pp
echo -e "\n"

# 11. Delete Report
echo "1️⃣1️⃣  Testing: DELETE /api/reports/:id"
curl -s -X DELETE $BASE_URL/reports/$REPORT_ID | json_pp
echo -e "\n"

# 12. Verify Deletion
echo "1️⃣2️⃣  Testing: GET /api/reports/:id (should fail)"
curl -s $BASE_URL/reports/$REPORT_ID
echo -e "\n\n"

echo "=========================================="
echo "✅ API Test Suite Complete!"
echo "=========================================="
