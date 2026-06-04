# RestoreAssist Tutorial Video Project

## Architecture

**Renderer:** Remotion programmatic API (Node.js)  
**Resolution:** 1920x1080 @ 30fps  
**Style:** Code-generated UI simulations with mouse cursor, click ripples, annotations  

## Video Catalog

### 1. DashboardWalkthrough (30s)
- **Purpose:** Show the main dashboard layout
- **Scenes:**
  1. Login → Dashboard transition (0:00-0:04)
  2. Sidebar navigation highlight (0:04-0:09)
  3. Stats cards overview (0:09-0:14)
  4. Recent inspections list (0:14-0:20)
  5. Quick actions toolbar (0:20-0:25)
  6. Notification bell & profile (0:25-0:30)

### 2. CreateInspection (40s)
- **Purpose:** Full flow from dashboard to creating an inspection
- **Scenes:**
  1. Click "New Inspection" button (0:00-0:05)
  2. Client selection dropdown → select "Mrs Jane Smith" (0:05-0:12)
  3. Property address auto-fill (0:12-0:17)
  4. Select hazard type "Water Damage" (0:17-0:22)
  5. Insurance type "Building" (0:22-0:27)
  6. Add description (0:27-0:32)
  7. Save & go to inspection (0:32-0:37)
  8. Inspection page loads (0:37-0:40)

### 3. ReportBuilder (35s)
- **Purpose:** Building the professional report from inspection data
- **Scenes:**
  1. Open inspection → click "Generate Report" (0:00-0:06)
  2. Report builder loads with sections (0:06-0:11)
  3. Add photos to report (0:11-0:17)
  4. AI-powered scope generation (0:17-0:23)
  5. Cost estimation section (0:23-0:28)
  6. Preview & download PDF (0:28-0:35)

### 4. ClientPortal (30s)
- **Purpose:** Sharing with clients
- **Scenes:**
  1. Report → click "Share" (0:00-0:05)
  2. Generate public link (0:05-0:10)
  3. Client portal sign-in page (0:10-0:15)
  4. Client views report (0:15-0:22)
  5. Download PDF & approve (0:22-0:30)

## Mock Data

```
Client: Mrs Jane Smith
Property: 42 Example Street, Sydney NSW 2000
Hazard: Water Damage (Category 1)
Insurance: Building
Total Cost: $4,850.00
Status: In Progress
```

## Technical Implementation

Using Remotion's `renderMedia` API programmatically from Node.js.
All UI is code-generated using styled divs (not screenshots) for:
- Consistent styling
- Smooth animations
- Easy maintenance
- Mouse cursor tracking

## Build Command

```bash
node remotion/render-all.js
```

Output: `public/videos/tutorial-*.mp4`
