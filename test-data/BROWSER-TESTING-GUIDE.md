# NIR System Browser Testing Guide
## Complete Step-by-Step Testing Instructions for Browser Testing

---

## 🎯 Overview

This guide provides comprehensive browser testing instructions for the National Inspection Report (NIR) system. All test data is provided for easy copy-paste into the browser interface.

**Testing Environment:** Browser-based UI at `/dashboard/reports/new`

---

## 📋 Prerequisites

1. ✅ User account created and logged in
2. ✅ Database migrations completed (`npx prisma migrate dev`)
3. ✅ Anthropic API key configured in integrations
4. ✅ Browser: Chrome, Firefox, Safari, or Edge (latest version)

---

## 🧪 Test Scenario 1: Category 1, Class 1 - Clean Water, Minimal Damage

### **Scenario Description**
Quick response clean water leak, minimal affected area, modern building (no compliance concerns).

### **Step 1: Navigate to Report Creation**
1. Open browser and navigate to: `http://localhost:3000/dashboard/reports/new` (or your deployment URL)
2. Verify the "Initial Data Entry" form loads

### **Step 2: Fill Client & Property Information**

**Copy and paste these values:**

```
Client Name: John Smith
Client Contact Details: 0412345678, john.smith@email.com
Property Address: 123 Main Street
Property Postcode: 2000
Claim Reference Number: CLM-2024-001
Incident Date: 2024-01-15
Technician Attendance Date: 2024-01-15
Technician Name: Mike Johnson
```

**Building Details:**
```
Building Age: 2010
Structure Type: Residential - Single Storey
Access Notes: Key under mat, owner present
```

**Hazard Profile:**
```
Methamphetamine Screen: NEGATIVE
Biological Mould Detected: (unchecked)
```

### **Step 3: Fill Technician Field Report**

**Copy this text into the Technician Field Report textarea:**

```
Attended property at 2:30 PM. Found water leak from burst pipe in kitchen. Water is clean, no contamination visible. Affected area limited to kitchen floor approximately 2m x 2m. Carpet is wet but not saturated. No structural damage observed. Property built in 2010, no asbestos concerns. Electrical outlets checked, no water ingress. Immediate extraction commenced.
```

### **Step 4: Fill NIR Inspection Data**

#### **Environmental Data Section:**
```
Temperature (°F): 22
Humidity (%): 55
Air Circulation: ✓ (check the checkbox)
```
*Note: Dew Point will auto-calculate to approximately 12.5°F*

#### **Add Moisture Readings:**

**Reading 1:**
- Click "Add" button after filling:
  - Location: `Kitchen Floor - Center`
  - Surface: `Carpet`
  - Moisture (%): `45`
  - Depth: `Surface`

**Reading 2:**
- Click "Add" button after filling:
  - Location: `Kitchen Floor - Under Sink`
  - Surface: `Carpet`
  - Moisture (%): `38`
  - Depth: `Surface`

#### **Add Affected Areas:**

**Area 1:**
- Click "Add" button after filling:
  - Room/Zone: `Kitchen`
  - Square Footage: `40`
  - Water Source: `Clean Water`
  - Time Since Loss (hrs): `2`

#### **Select Scope Items:**
Check the following checkboxes:
- ☑ Extract Standing Water
- ☑ Install Air Movers
- ☑ Dry Out Structure

#### **Add Photos (Optional for Testing):**
- Click "Add Photo" and upload at least one image (or skip for quick testing)

### **Step 5: Submit and Verify**

1. Click **"Save & Continue"** button
2. Wait for analysis to complete (you'll see "Analyzing technician report..." message)
3. After analysis completes, you should see **"Report Analysis Summary"** section

### **Step 6: Select Report Type**

1. Click the **"Basic Report"** button
2. System should:
   - Create inspection record
   - Save all NIR data
   - Submit for processing
   - Generate report

### **Step 7: Verify Results**

**Expected Classification:**
- Category: **1** (Clean Water)
- Class: **1** (Minimal damage)

**Expected Scope Items:**
- Extract Standing Water
- Install Air Movers
- Dry Out Structure

**Expected Compliance:**
- ❌ No Asbestos Assessment (building 2010)
- ❌ No Lead Assessment (building 2010)
- ✅ Electrical Assessment (water ingress check)
- ❌ No Mould Testing (< 3 days)

**Expected Report:**
- Report should reference IICRC S500
- Report should include verification checklist
- Report should be generated in < 5 minutes

---

## 🧪 Test Scenario 2: Category 2, Class 2 - Grey Water, Moderate Damage

### **Scenario Description**
Washing machine overflow, multiple rooms affected, moderate damage.

### **Test Data:**

**Client & Property:**
```
Client Name: Sarah Williams
Client Contact Details: 0423456789, sarah.w@email.com
Property Address: 456 Oak Avenue
Property Postcode: 3000
Claim Reference Number: CLM-2024-002
Incident Date: 2024-01-14
Technician Attendance Date: 2024-01-15
Technician Name: David Chen
Building Age: 1995
Structure Type: Residential - Two Storey
Access Notes: Side gate unlocked
Methamphetamine Screen: NEGATIVE
Biological Mould Detected: (unchecked)
```

**Technician Field Report:**
```
Washing machine overflow occurred approximately 18 hours ago. Grey water with detergent has affected laundry, hallway, and part of living room. Total affected area approximately 60 square meters. Carpet is saturated in laundry area. Some water has migrated under baseboards. Property built in 1995. No visible mould growth yet but conditions are favorable. Electrical safety check required.
```

**NIR Environmental Data:**
```
Temperature (°F): 24
Humidity (%): 68
Air Circulation: (unchecked)
```

**Moisture Readings:**
1. Location: `Laundry - Floor Center`, Surface: `Carpet`, Moisture: `78`, Depth: `Subsurface`
2. Location: `Hallway - Near Laundry`, Surface: `Carpet`, Moisture: `65`, Depth: `Surface`
3. Location: `Living Room - Entry`, Surface: `Carpet`, Moisture: `52`, Depth: `Surface`
4. Location: `Laundry - Baseboard`, Surface: `Drywall`, Moisture: `45`, Depth: `Surface`

**Affected Areas:**
1. Room/Zone: `Laundry`, Square Footage: `25`, Water Source: `Grey Water`, Time Since Loss: `18`
2. Room/Zone: `Hallway`, Square Footage: `20`, Water Source: `Grey Water`, Time Since Loss: `18`
3. Room/Zone: `Living Room`, Square Footage: `15`, Water Source: `Grey Water`, Time Since Loss: `18`

**Scope Items:**
- ☑ Extract Standing Water
- ☑ Remove Carpet
- ☑ Sanitize Materials
- ☑ Install Dehumidification
- ☑ Install Air Movers
- ☑ Apply Antimicrobial
- ☑ Dry Out Structure

**Expected Results:**
- Category: **2** (Grey Water)
- Class: **2** (Moderate damage)
- Scope should include sanitization and antimicrobial treatment
- Cost estimate should be higher than Scenario 1

---

## 🧪 Test Scenario 3: Category 3, Class 3 - Black Water, Extensive Damage with Compliance Requirements

### **Scenario Description**
Sewage backup, extensive damage, pre-1990 building requiring asbestos assessment.

### **Test Data:**

**Client & Property:**
```
Client Name: Robert Thompson
Client Contact Details: 0434567890, robert.t@email.com
Property Address: 789 Elm Street
Property Postcode: 4000
Claim Reference Number: CLM-2024-003
Incident Date: 2024-01-10
Technician Attendance Date: 2024-01-12
Technician Name: Lisa Anderson
Building Age: 1985
Structure Type: Residential - Single Storey
Access Notes: Rear door code: 1234
Methamphetamine Screen: NEGATIVE
Biological Mould Detected: ✓ (checked)
Biological Mould Category: CAT 2
```

**Technician Field Report:**
```
Sewage backup from main line occurred 48 hours ago. Black water has extensively affected ground floor including bathroom, kitchen, and living areas. Total affected area approximately 150 square meters. Carpet is heavily saturated and contaminated. Water has wicked up drywall approximately 30cm. Property built in 1985 - ASBESTOS ASSESSMENT REQUIRED. Visible mould growth in bathroom area. Electrical outlets may be compromised. Structural integrity assessment needed. Strong sewage odor present. PPE required for all personnel.
```

**NIR Environmental Data:**
```
Temperature (°F): 26
Humidity (%): 75
Air Circulation: (unchecked)
```

**Moisture Readings:**
1. Location: `Bathroom - Floor`, Surface: `Tile`, Moisture: `95`, Depth: `Subsurface`
2. Location: `Bathroom - Drywall Base`, Surface: `Drywall`, Moisture: `88`, Depth: `Subsurface`
3. Location: `Kitchen - Floor`, Surface: `Carpet`, Moisture: `92`, Depth: `Subsurface`
4. Location: `Living Room - Floor`, Surface: `Carpet`, Moisture: `75`, Depth: `Subsurface`
5. Location: `Kitchen - Drywall`, Surface: `Drywall`, Moisture: `65`, Depth: `Subsurface`

**Affected Areas:**
1. Room/Zone: `Bathroom`, Square Footage: `30`, Water Source: `Black Water`, Time Since Loss: `48`
2. Room/Zone: `Kitchen`, Square Footage: `50`, Water Source: `Black Water`, Time Since Loss: `48`
3. Room/Zone: `Living Room`, Square Footage: `70`, Water Source: `Black Water`, Time Since Loss: `48`

**Scope Items:**
- ☑ Extract Standing Water
- ☑ Remove Carpet
- ☑ Demolish Drywall
- ☑ Sanitize Materials
- ☑ Install Dehumidification
- ☑ Install Air Movers
- ☑ Apply Antimicrobial
- ☑ Containment Setup
- ☑ PPE Required
- ☑ Dry Out Structure

**Expected Results:**
- Category: **3** (Black Water)
- Class: **3** (Extensive damage)
- ✅ **Asbestos Assessment Required** (building 1985, pre-1990)
- ✅ **Mould Testing Required** (>48 hours)
- ✅ **Electrical Assessment Required** (water ingress)
- ✅ Containment and PPE in scope
- ✅ Higher cost estimates
- ✅ Report should reference WHS Regulations 2011 for asbestos

---

## 🧪 Test Scenario 4: Category 2, Class 4 - Deeply Held Moisture

### **Scenario Description**
Dishwasher leak with water trapped in hard-to-dry materials (concrete, hardwood).

### **Test Data:**

**Client & Property:**
```
Client Name: Emma Davis
Client Contact Details: 0445678901, emma.d@email.com
Property Address: 321 Pine Road
Property Postcode: 5000
Claim Reference Number: CLM-2024-004
Incident Date: 2024-01-13
Technician Attendance Date: 2024-01-14
Technician Name: James Wilson
Building Age: 2005
Structure Type: Residential - Single Storey
Access Notes: Front door, owner will be present
Methamphetamine Screen: NEGATIVE
Biological Mould Detected: (unchecked)
```

**Technician Field Report:**
```
Dishwasher leak discovered 24 hours ago. Grey water has affected kitchen and adjacent dining area. Water has penetrated under cabinets and into subfloor. Concrete slab shows moisture. Hardwood flooring affected. Total area approximately 45 square meters. Property built in 2005. No visible contamination but water has been standing. Requires specialized drying approach.
```

**NIR Environmental Data:**
```
Temperature (°F): 23
Humidity (%): 62
Air Circulation: ✓ (checked)
```

**Moisture Readings:**
1. Location: `Kitchen - Under Cabinet`, Surface: `Concrete`, Moisture: `85`, Depth: `Subsurface`
2. Location: `Kitchen - Subfloor`, Surface: `Concrete`, Moisture: `78`, Depth: `Subsurface`
3. Location: `Dining Room - Hardwood`, Surface: `Hardwood`, Moisture: `68`, Depth: `Subsurface`
4. Location: `Kitchen - Baseboard`, Surface: `Drywall`, Moisture: `55`, Depth: `Subsurface`

**Affected Areas:**
1. Room/Zone: `Kitchen`, Square Footage: `30`, Water Source: `Grey Water`, Time Since Loss: `24`
2. Room/Zone: `Dining Room`, Square Footage: `15`, Water Source: `Grey Water`, Time Since Loss: `24`

**Scope Items:**
- ☑ Extract Standing Water
- ☑ Install Dehumidification
- ☑ Install Air Movers
- ☑ Dry Out Structure

**Expected Results:**
- Category: **2** (Grey Water)
- Class: **4** (Deeply held moisture)
- Specialized drying approach required
- Subsurface moisture readings should trigger Class 4

---

## 🧪 Test Scenario 5: Category 1, Class 2 - Quick Response

### **Scenario Description**
Hot water system leak, clean water, quick response time.

### **Test Data:**

**Client & Property:**
```
Client Name: Michael Brown
Client Contact Details: 0456789012, michael.b@email.com
Property Address: 654 Maple Drive
Property Postcode: 6000
Claim Reference Number: CLM-2024-005
Incident Date: 2024-01-16
Technician Attendance Date: 2024-01-16
Technician Name: Amanda Taylor
Building Age: 2015
Structure Type: Residential - Two Storey
Access Notes: Garage door remote required
Methamphetamine Screen: NEGATIVE
Biological Mould Detected: (unchecked)
```

**Technician Field Report:**
```
Hot water system leak detected this morning. Clean water has affected laundry and hallway. Approximately 35 square meters affected. Carpet is wet but not saturated. No contamination. Property built in 2015. Quick response time, minimal damage expected.
```

**NIR Environmental Data:**
```
Temperature (°F): 25
Humidity (%): 58
Air Circulation: ✓ (checked)
```

**Moisture Readings:**
1. Location: `Laundry - Floor`, Surface: `Carpet`, Moisture: `55`, Depth: `Surface`
2. Location: `Hallway - Near Laundry`, Surface: `Carpet`, Moisture: `48`, Depth: `Surface`

**Affected Areas:**
1. Room/Zone: `Laundry`, Square Footage: `20`, Water Source: `Clean Water`, Time Since Loss: `4`
2. Room/Zone: `Hallway`, Square Footage: `15`, Water Source: `Clean Water`, Time Since Loss: `4`

**Scope Items:**
- ☑ Extract Standing Water
- ☑ Install Air Movers
- ☑ Dry Out Structure

**Expected Results:**
- Category: **1** (Clean Water)
- Class: **2** (Moderate evaporation load)
- Quick response scenario
- Lower cost estimates

---

## ✅ Verification Checklist for All Scenarios

After generating each report, verify:

### **1. Data Collection**
- [ ] All form fields saved correctly
- [ ] NIR data (environmental, moisture, areas) saved
- [ ] Photos uploaded (if provided)
- [ ] Scope items selected correctly

### **2. Classification**
- [ ] Category matches expected (1, 2, or 3)
- [ ] Class matches expected (1, 2, 3, or 4)
- [ ] Justification provided
- [ ] Standard reference included (IICRC S500)

### **3. Scope Determination**
- [ ] Scope items automatically determined
- [ ] Scope items appropriate for damage type
- [ ] Justifications provided for each scope item

### **4. Cost Estimation**
- [ ] Cost estimates generated
- [ ] Costs within reasonable range
- [ ] Breakdown by category (Equipment, Labor, Materials)
- [ ] Contingency included (10-15%)

### **5. Compliance Requirements**
- [ ] Asbestos assessment flagged for pre-1990 buildings
- [ ] Lead assessment flagged for pre-1970 buildings
- [ ] Electrical assessment flagged for water ingress
- [ ] Mould testing flagged for >3 days

### **6. Report Generation**
- [ ] Basic Report generated successfully
- [ ] Report includes all entered data
- [ ] Report references IICRC S500
- [ ] Report references WHS Regulations 2011 (where applicable)
- [ ] Report references NCC (where applicable)
- [ ] Report references AS/NZS 3000 (where applicable)
- [ ] Verification checklist included
- [ ] No placeholder text ("N/A", "Not provided")
- [ ] Report generated in < 5 minutes

### **7. Report Formats**
- [ ] PDF report downloadable
- [ ] JSON report downloadable
- [ ] Excel report downloadable (if ExcelJS installed)
- [ ] All formats include verification checklist

---

## 🔍 Browser Testing Tips

### **Form Validation Testing**
1. Try submitting without required fields
2. Verify error messages appear
3. Test field format validation (numbers, dates, etc.)

### **NIR Data Entry Testing**
1. Test adding multiple moisture readings
2. Test removing moisture readings
3. Test adding multiple affected areas
4. Test scope item selection/deselection
5. Test photo upload (multiple photos)
6. Test photo removal

### **Workflow Testing**
1. Test "Save & Continue" button
2. Test analysis completion
3. Test report type selection (Basic vs Enhanced)
4. Test report generation
5. Test navigation between stages

### **Error Handling Testing**
1. Test with invalid data (negative numbers, etc.)
2. Test with missing required fields
3. Test network errors (disconnect internet)
4. Test API errors (invalid report ID)

### **Performance Testing**
1. Measure form load time
2. Measure analysis completion time
3. Measure report generation time (should be < 5 minutes)
4. Test with large datasets (many moisture readings, areas)

---

## 📊 Expected Compliance Triggers Matrix

| Building Age | Asbestos | Lead | Mould Test | Electrical |
|------------|----------|------|------------|------------|
| Pre-1970   | ✅ Yes   | ✅ Yes | If >3 days | If water ingress |
| 1970-1989  | ✅ Yes   | ❌ No | If >3 days | If water ingress |
| 1990+      | ❌ No    | ❌ No | If >3 days | If water ingress |

**Mould Testing Trigger:** Time since loss > 72 hours (3 days)

**Electrical Assessment Trigger:** Any water ingress reported

---

## 🐛 Common Issues & Troubleshooting

### **Issue: Analysis not completing**
- **Check:** Anthropic API key configured
- **Check:** Network connection
- **Check:** Browser console for errors

### **Issue: NIR data not saving**
- **Check:** All required fields filled
- **Check:** Browser console for validation errors
- **Check:** Network tab for API errors

### **Issue: Classification not matching expected**
- **Check:** Moisture readings are correct
- **Check:** Water source is correct
- **Check:** Affected area square footage
- **Check:** Time since loss

### **Issue: Report generation fails**
- **Check:** Inspection status is COMPLETED
- **Check:** All required data present
- **Check:** Anthropic API key configured
- **Check:** Browser console for errors

### **Issue: Excel export not working**
- **Check:** ExcelJS installed (`npm install exceljs`)
- **Check:** Browser allows file downloads
- **Check:** File size limits

---

## 📝 Test Data Quick Reference

### **Surface Types (Dropdown Options):**
- Drywall
- Wood
- Carpet
- Concrete
- Tile
- Vinyl
- Hardwood
- Particle Board
- Plaster
- Other

### **Water Sources (Dropdown Options):**
- Clean Water
- Grey Water
- Black Water

### **Scope Items (Checkboxes):**
- Remove Carpet
- Sanitize Materials
- Install Dehumidification
- Install Air Movers
- Extract Standing Water
- Demolish Drywall
- Apply Antimicrobial
- Dry Out Structure
- Containment Setup
- PPE Required
- Mould Remediation
- Structural Repair
- Electrical Safety
- Waste Disposal
- Monitoring
- Verification
- Other

---

## 🎯 Success Criteria

A test is successful when:

1. ✅ All data entered correctly saves
2. ✅ Classification matches expected category and class
3. ✅ Scope items automatically determined
4. ✅ Cost estimates generated
5. ✅ Compliance requirements correctly flagged
6. ✅ Report generates successfully
7. ✅ Report includes verification checklist
8. ✅ Report references appropriate standards
9. ✅ Report uses only actual data (no placeholders)
10. ✅ Report generation completes in < 5 minutes

---

## 📞 Support

If you encounter issues during testing:

1. Check browser console (F12) for errors
2. Check network tab for failed API calls
3. Verify all prerequisites are met
4. Check database connection
5. Verify API keys are configured

---

**Last Updated:** January 2025
**Version:** 1.0
**Status:** Ready for Browser Testing

