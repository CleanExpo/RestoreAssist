# RestoreAssist Testing Guide - Single Scenario
## Step-by-Step Testing with Verified Calculations

This guide walks you through testing the complete RestoreAssist workflow using the single scenario test data with 100% accurate calculations.

---

## 🎯 PRE-TEST SETUP

### Step 1: Configure Pricing (REQUIRED FIRST)

1. Navigate to **Dashboard → Settings → Pricing Configuration**
2. Copy the pricing configuration from `SINGLE_SCENARIO_TEST_DATA.md`
3. Fill in ALL fields exactly as shown:
   - `dehumidifierLGRDailyRate`: **45.00**
   - `dehumidifierDesiccantDailyRate`: **65.00**
   - `airMoverAxialDailyRate`: **25.00**
   - `airMoverCentrifugalDailyRate`: **35.00**
   - `injectionDryingSystemDailyRate`: **150.00**
   - (Fill in all other fields as shown)
4. Click **"Save Configuration"**
5. **Verify**: All rates are saved correctly

**⚠️ CRITICAL**: Equipment costs are calculated from these rates. If rates are wrong, calculations will be wrong!

---

## 📋 PHASE 1: INITIAL DATA ENTRY

### Step 2: Create New Report

1. Navigate to **Dashboard → Reports → New Report**
2. Fill in the form using data from `SINGLE_SCENARIO_TEST_DATA.md`:

   **Client Information**:
   - Client Name: `John and Sarah Mitchell`
   - Client Contact: `Phone: 0412 345 678, Email: john.mitchell@email.com`
   - Property Address: `42 River Street`
   - Postcode: `4000`
   - Claim Reference: `INS-2025-001234`

   **Incident Information**:
   - Incident Date: `2025-12-02` (or today's date)
   - Technician Attendance Date: `2025-12-02` (or today's date)
   - Technician Name: `Michael Chen`

   **Technician Report**: Copy the full report from test data

3. Click **"Save & Continue"**
4. **Expected**: Report created, redirected to Equipment Tools Selection

---

## 🔧 PHASE 2: EQUIPMENT TOOLS SELECTION

### Step 3: Drying Potential Assessment

1. You should see the **Drying Potential** step
2. Enter the psychrometric data:
   - Water Class: `2`
   - Temperature: `25` °C
   - Humidity: `60` %
   - System Type: `Closed`
3. **Expected Results**:
   - Drying Index: **33.6**
   - Status: "FAIR"
   - Recommendation: "Slow evaporation. Action: Add air movement and monitor closely."
4. **Note**: If you use 22°C / 65% humidity, you'll get Drying Index: 26 (POOR). 
   For FAIR status, use 25°C / 60% humidity as shown above.
5. Click **"Next: Scope Areas"**

---

### Step 4: Scope Areas

1. Add the three areas from test data:

   **Area 1 - Kitchen**:
   - Name: `Kitchen`
   - Length: `4.5` m
   - Width: `3.5` m
   - Height: `2.7` m
   - Wet %: `85`%

   **Area 2 - Dining Room**:
   - Name: `Dining Room`
   - Length: `5.0` m
   - Width: `3.6` m
   - Height: `2.7` m
   - Wet %: `90`%

   **Area 3 - Lounge Room**:
   - Name: `Lounge Room`
   - Length: `4.0` m
   - Width: `3.0` m
   - Height: `2.7` m
   - Wet %: `40`%

2. **Verify Calculations** (shown in left panel):
   - Total Volume: ~123.5 m³
   - Total Affected Area: ~34.4 m²
   - Water Removal Target: ~215-225 L/Day
   - Air Movers Required: ~3-4 units

3. Click **"Next: Select Equipment"**

---

### Step 5: Equipment Selection

1. **Verify Pricing Rates** (check each equipment card):
   - All LGR dehumidifiers should show: **$45.00/day**
   - All air movers should show: **$25.00/day**
   - If rates are different, pricing config is not loaded correctly!

2. **Select Equipment** (use quantities from test data):
   - **LGR 55L/Day**: Click `+` button **1 time** (quantity: 1)
   - **LGR 85L/Day**: Click `+` button **2 times** (quantity: 2)
   - **Air Mover 1500 CFM**: Click `+` button **8 times** (quantity: 8)
   - **Air Mover 2500 CFM**: Click `+` button **5 times** (quantity: 5)

3. **Set Duration**: Change days to `4`

4. **Verify Calculations** (in left panel - "Estimated Consumption"):
   - **Daily Cost**: Should show **$460.00**
   - **Total Cost**: Should show **$1,840.00** (4 days × $460)
   - **Total Amps**: Should show **41.0A**
   - **Water Removal**: Should show **225 / 1235 L/Day** (equipment capacity vs target)
   - **Air Movement**: Should show **16 / 3 Units** (exceeds target)

5. **Check Browser Console** (F12 → Console tab):
   - Should see: `[Pricing Config] Loaded pricing configuration: { dehumidifierLGRDailyRate: 45, ... }`
   - Should see: `[Pricing Config] Equipment lgr-85 (dehumidifierLGRDailyRate): $45/day`
   - Should see similar logs for each equipment type

6. Click **"Save & Complete"**

---

## ✅ VERIFICATION CHECKLIST

After completing equipment selection, verify ALL calculations match:

### Equipment Costs
- [ ] LGR 55L (1 unit): 1 × $45 = $45/day ✅
- [ ] LGR 85L (2 units): 2 × $45 = $90/day ✅
- [ ] Air Mover 1500 (8 units): 8 × $25 = $200/day ✅
- [ ] Air Mover 2500 (5 units): 5 × $25 = $125/day ✅
- [ ] **Total Daily Cost**: $460.00 ✅
- [ ] **Total Cost (4 days)**: $1,840.00 ✅

### Technical Specifications
- [ ] **Total Amps**: 41.0A ✅
- [ ] **Dehumidification Capacity**: 225 L/Day ✅
- [ ] **Water Removal Target**: 1235 L/Day ✅
- [ ] **Total Airflow**: 24,500 CFM (16 units) ✅
- [ ] **Air Movers Required**: 3 units ✅

### Pricing Configuration
- [ ] All LGR dehumidifiers show: $45.00/day ✅
- [ ] All air movers show: $25.00/day ✅
- [ ] No hardcoded rates visible ✅
- [ ] Console shows pricing config rates ✅

---

## 🐛 TROUBLESHOOTING

### Problem: Equipment rates don't match pricing config

**Solution**:
1. Check pricing configuration is saved: Dashboard → Settings → Pricing Configuration
2. Refresh the page
3. Check browser console for pricing config logs
4. Verify pricing config API returns correct rates

### Problem: Calculations don't match expected values

**Solution**:
1. Verify equipment quantities are correct
2. Verify duration is set to 5 days
3. Check pricing config rates match test data
4. Check browser console for errors

### Problem: Pricing config not loading

**Solution**:
1. Check browser console for API errors
2. Verify you're logged in
3. Check network tab for `/api/pricing-config` request
4. Try refreshing the page

---

## 📊 EXPECTED RESULTS SUMMARY

| Metric | Expected Value | Verify |
|--------|---------------|--------|
| Daily Equipment Cost | $460.00 | ✅ |
| Total Equipment Cost (4 days) | $1,840.00 | ✅ |
| Total Amps | 41.0A | ✅ |
| Dehumidification Capacity | 225 L/Day | ✅ |
| Water Removal Target | 1235 L/Day | ✅ |
| Air Movement | 16 units (24,500 CFM) | ✅ |
| Air Movers Required | 3 units | ✅ |
| LGR Daily Rate | $45.00/day | ✅ |
| Air Mover Daily Rate | $25.00/day | ✅ |

---

## 🎯 NEXT STEPS

After equipment selection is verified:

1. Continue with **Tier 1 Questions** (if applicable)
2. Complete **Report Analysis**
3. Generate **Inspection Report**
4. Verify equipment costs appear correctly in generated report

---

## 📝 NOTES

- All calculations are based on pricing configuration rates
- If any calculation doesn't match, check pricing config first
- Browser console logs help debug pricing config issues
- Equipment rates should NEVER be hardcoded - always from pricing config

---

## ✅ TEST COMPLETE

If all calculations match the expected values, the pricing configuration system is working correctly! 🎉
