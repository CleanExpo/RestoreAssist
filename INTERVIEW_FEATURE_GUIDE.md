# Guided Interview Feature - Complete Guide

## 🎯 Overview

The Guided Interview feature has been significantly enhanced to provide a next-level user experience with smooth animations, intelligent auto-population, and seamless integration with the report creation workflow.

## ✨ Key Features Implemented

### 1. **Next-Level UI/UX**
- **Smooth Animations**: Fade-in and slide transitions between questions
- **Interactive Answer Options**: Hover effects, selection indicators, and visual feedback
- **Enhanced Question Cards**: Gradient backgrounds, shadow effects, and better typography
- **Progress Indicators**: Animated progress bars with smooth transitions
- **Loading States**: Beautiful animated spinners with contextual messages
- **Dark Mode Support**: Full dark mode compatibility throughout

### 2. **Auto-Population to New Report**
- **Smart Redirect**: Interview completion redirects to `/dashboard/reports/new` (not existing reports)
- **Field Mapping**: Intelligent mapping from interview answers to report fields
- **Data Transformation**: Proper formatting for dates, categories, and special fields
- **Visual Feedback**: Success banner showing auto-populated fields count

### 3. **Enhanced Question Flow**
- **One Question at a Time**: Clean, focused question presentation
- **Standards References**: Inline display of IICRC/NCC/AS standards
- **Auto-Population Preview**: Shows which fields will be filled before answering
- **Confidence Indicators**: Visual confidence scores for auto-populated fields

### 4. **Field Mapping Intelligence**
- **Water Category Mapping**: Automatically maps clean/grey/black water to Category 1/2/3
- **Source Mapping**: Transforms answer values to readable descriptions
- **Date Formatting**: Converts dates to YYYY-MM-DD format
- **Context-Aware Transformers**: Uses previous answers for derived values

## 🚀 How It Works

### Interview Flow

1. **Start Interview**
   - Navigate to `/dashboard/interviews/new`
   - Select job type, postcode, and experience level
   - Click "Start Interview"

2. **Answer Questions**
   - Questions appear one at a time
   - Each question shows:
     - Standards references (IICRC, NCC, AS, etc.)
     - Auto-population preview
     - Answer options with helper text
   - Select an answer and click "Continue"

3. **Progress Tracking**
   - Real-time progress percentage
   - Questions answered counter
   - Tier indicator
   - Estimated time remaining

4. **Completion**
   - Review summary page showing:
     - Fields merged count
     - New fields added
     - Average confidence
     - Form completion percentage
   - Click "Create New Report with Auto-Populated Data"

5. **Report Creation**
   - Redirects to `/dashboard/reports/new`
   - Form is pre-filled with interview data
   - Success banner confirms data loaded
   - Review and complete remaining fields

## 📋 Field Mappings

### Interview Field → Report Field Mapping

| Interview Field ID | Report Field Name | Transformation |
|-------------------|-------------------|----------------|
| `sourceOfWater` | `sourceOfWater` | Maps clean_water/grey_water/black_water to readable descriptions |
| `waterCategory` | `waterCategory` | Maps to "Category 1/2/3" format |
| `waterClass` | `waterClass` | Direct mapping |
| `propertyAddress` | `propertyAddress` | Direct mapping |
| `propertyPostcode` | `propertyPostcode` | Direct mapping |
| `clientName` | `clientName` | Direct mapping |
| `clientContactDetails` | `clientContactDetails` | Direct mapping |
| `incidentDate` | `incidentDate` | Date formatting (YYYY-MM-DD) |
| `technicianAttendanceDate` | `technicianAttendanceDate` | Date formatting (YYYY-MM-DD) |
| `affectedArea` | `affectedArea` | Direct mapping |
| `buildingAge` | `buildingAge` | Direct mapping |
| `structureType` | `structureType` | Direct mapping |

## 🧪 Testing Guide

### Test Scenario 1: Complete Interview Flow

1. **Start Interview**
   ```
   Navigate to: /dashboard/interviews/new
   - Select Job Type: WATER_DAMAGE
   - Enter Postcode: 4000
   - Select Experience Level: experienced
   - Click "Start Interview"
   ```

2. **Answer Questions**
   - Answer all 15 questions
   - Observe:
     - Smooth transitions between questions
     - Auto-population preview cards
     - Progress indicators updating
     - Standards references displayed

3. **Complete Interview**
   - Review the summary page
   - Verify field counts match
   - Click "Create New Report with Auto-Populated Data"

4. **Verify Auto-Population**
   - Check `/dashboard/reports/new` page
   - Verify success banner appears
   - Check form fields are pre-filled:
     - Property Address
     - Postcode
     - Water Category
     - Source of Water
     - Other answered fields

### Test Scenario 2: Field Mapping Verification

1. **Answer Water Source Question**
   - Select "Clean water (supply line burst, roof leak)"
   - Verify `sourceOfWater` and `waterCategory` are mapped correctly

2. **Check Auto-Population Preview**
   - Before answering, verify preview shows:
     - `sourceOfWater` field
     - `waterCategory` field (95% confidence)

3. **Complete Interview**
   - Finish all questions
   - Verify summary shows correct field counts

4. **Check Report Form**
   - Navigate to new report page
   - Verify fields are populated with correct values

### Test Scenario 3: UI/UX Testing

1. **Visual Feedback**
   - Hover over answer options → Should show hover effects
   - Select an answer → Should show selection indicator
   - Click "Continue" → Should show loading state

2. **Animations**
   - Transition between questions → Should fade/slide smoothly
   - Progress bar → Should animate smoothly
   - Loading spinner → Should animate continuously

3. **Dark Mode**
   - Toggle dark mode
   - Verify all components adapt correctly
   - Check contrast and readability

### Test Scenario 4: Error Handling

1. **Network Errors**
   - Simulate network failure
   - Verify error messages appear
   - Check retry functionality

2. **Validation Errors**
   - Try submitting without selecting an answer
   - Verify button is disabled
   - Check error messages

3. **Session Recovery**
   - Start interview
   - Close browser
   - Reopen with sessionId in URL
   - Verify interview resumes correctly

## 🎨 UI Components Enhanced

### QuestionCard
- **Enhanced Layout**: Question number badge, better spacing
- **Answer Options**: Interactive cards with hover effects
- **Auto-Population Preview**: Gradient cards showing field mappings
- **Progress Indicator**: Animated progress bar at bottom

### GuidedInterviewPanel
- **Two-Column Layout**: Question on left, context sidebar on right
- **Progress Header**: Gradient card with tier indicator
- **Snapshot Metrics**: Quick stats in sidebar
- **Standards Coverage**: Visual display of standards touched

### BottomActionBar
- **Enhanced Buttons**: Gradient buttons with hover effects
- **Smooth Transitions**: Scale animations on click
- **Better Spacing**: Improved mobile responsiveness

### InterviewCompletionSummary
- **Enhanced Cards**: Better color coding and spacing
- **Action Buttons**: Larger, more prominent buttons
- **Field Display**: Better categorization and formatting

## 🔧 Technical Details

### Field Mapping Engine
- Uses `AnswerMappingEngine` for field transformations
- Supports direct mapping, transformers, and context-aware values
- Confidence scoring for each mapped field

### Data Flow
1. User answers question → `handleAnswer` called
2. Field mappings processed → Values transformed
3. Auto-populated fields updated → Stored in state
4. Next question determined → Skip logic applied
5. State updated → UI transitions smoothly

### Report Integration
1. Interview completes → `handleSubmitData` called
2. Fields converted → `convertInterviewFieldsToReportData`
3. Data encoded → URL params created
4. Redirect → `/dashboard/reports/new?interviewData=...`
5. Page loads → Data parsed and form populated

## 📊 Performance Optimizations

- **Debounced API Calls**: Prevents excessive requests
- **Optimistic Updates**: Immediate UI feedback
- **Lazy Loading**: Questions loaded as needed
- **Memoization**: Callbacks memoized to prevent re-renders

## 🐛 Known Issues & Solutions

### Issue: Interview stuck on "Starting interview..."
**Solution**: Fixed with initialization guards and refs

### Issue: Infinite API calls
**Solution**: Fixed with proper dependency management

### Issue: Fields not auto-populating
**Solution**: Enhanced field mapping with better transformations

## 🎯 Next Steps (Future Enhancements)

1. **Advanced Skip Logic**: More complex conditional flows
2. **Question Dependencies**: Questions that depend on previous answers
3. **Multi-Language Support**: Internationalization
4. **Voice Input**: Speech-to-text for answers
5. **Offline Support**: Work offline and sync later

## 📝 Notes

- All interview data is stored in the database
- Sessions can be resumed using the `sessionId` in URL
- Auto-populated fields have confidence scores
- Field mappings are extensible via question templates

---

**Last Updated**: January 27, 2026
**Version**: 2.0
