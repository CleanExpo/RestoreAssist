# Export Functionality Documentation

RestoreAssist now supports **professional document export** in DOCX and PDF formats with optional email delivery.

---

## ✨ Features

### 📄 Export Formats

**1. DOCX (Microsoft Word)**
- Professional formatting with headings and tables
- Itemized cost estimate table
- Scope of work numbered list
- Compliance notes
- Authority to proceed document
- Fully editable in Microsoft Word

**2. PDF (Portable Document Format)**
- Print-ready professional layout
- Formatted tables and lists
- Page breaks and pagination
- Non-editable final document
- Universal compatibility

### 📧 Email Delivery

- Automatic email delivery to client/insurer
- PDF or DOCX attachment
- Professional email template
- SMTP configuration support
- Gmail, Outlook, custom SMTP servers

### ⏱️ File Management

- Temporary file storage (24-hour expiration)
- Secure download URLs
- Automatic cleanup
- File size tracking

---

## 🚀 API Usage

### **Export Report Endpoint**

**POST** `/api/reports/:id/export`

Export a damage assessment report to DOCX or PDF format.

#### **Request Body**

```json
{
  "format": "docx",  // or "pdf"
  "email": "client@example.com",  // optional
  "includeCharts": false,  // optional, future feature
  "includeBranding": true  // optional, defaults to true
}
```

#### **Response**

```json
{
  "downloadUrl": "http://localhost:3001/api/exports/report_RPT-123_123_Main_St_1697234567890.docx",
  "fileName": "report_RPT-123_123_Main_St_1697234567890.docx",
  "fileSize": 45678,
  "expiresIn": 86400,
  "emailSent": true
}
```

#### **Example: Export to DOCX**

```bash
curl -X POST http://localhost:3001/api/reports/RPT-123/export \
  -H "Content-Type: application/json" \
  -d '{
    "format": "docx"
  }'
```

#### **Example: Export to PDF with Email**

```bash
curl -X POST http://localhost:3001/api/reports/RPT-123/export \
  -H "Content-Type: application/json" \
  -d '{
    "format": "pdf",
    "email": "client@example.com"
  }'
```

---

### **Download Exported File**

**GET** `/api/exports/:fileName`

Download an exported file.

#### **Example**

```bash
curl -O http://localhost:3001/api/exports/report_RPT-123_123_Main_St_1697234567890.pdf
```

#### **Response Headers**

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="report_RPT-123_123_Main_St_1697234567890.pdf"
```

---

## 📊 DOCX Export Format

### **Document Structure**

```
┌─────────────────────────────────────┐
│  DAMAGE ASSESSMENT REPORT           │  (Title, centered)
├─────────────────────────────────────┤
│  Report ID: RPT-123-456             │
│  Generated: 2025-10-18 10:30 AM     │
├─────────────────────────────────────┤
│  PROPERTY INFORMATION               │  (Heading 2)
│  Address: 123 Main St               │
│  State: NSW                         │
│  Damage Type: Water                 │
├─────────────────────────────────────┤
│  CLIENT INFORMATION (if available)  │
│  Client Name: John Smith            │
│  Insurance: NRMA                    │
│  Claim Number: CLM-123              │
├─────────────────────────────────────┤
│  ASSESSMENT SUMMARY                 │
│  [Full summary text]                │
├─────────────────────────────────────┤
│  SCOPE OF WORK                      │
│  1. Emergency water extraction      │
│  2. Remove affected drywall         │
│  3. Dry structure...                │
├─────────────────────────────────────┤
│  ITEMIZED ESTIMATE                  │  (Table)
│  ┌──────────┬────┬──────┬──────┐  │
│  │ Desc     │ Qty│ Unit │Total │  │
│  ├──────────┼────┼──────┼──────┤  │
│  │ Item 1   │ 1  │$450 │$450  │  │
│  └──────────┴────┴──────┴──────┘  │
│  Total Cost: $8,750.00 AUD         │
├─────────────────────────────────────┤
│  COMPLIANCE NOTES                   │
│  • NCC 2022 compliance...           │
│  • NSW Building Code...             │
├─────────────────────────────────────┤
│  AUTHORITY TO PROCEED               │
│  [ATP document text]                │
├─────────────────────────────────────┤
│  Generated by RestoreAssist AI      │  (Footer)
│  using claude-opus-4-20250514       │
└─────────────────────────────────────┘
```

---

## 📄 PDF Export Format

### **Document Layout**

- **Page size**: A4 (210mm × 297mm)
- **Margins**: 50pt all sides
- **Fonts**:
  - Headings: Helvetica-Bold 16pt, 24pt
  - Body: Helvetica 10pt
  - Footer: Helvetica-Oblique 8pt

### **Sections**

1. **Title Page**
   - Report title (24pt, bold, centered)
   - Report metadata (ID, date)

2. **Property & Client Info**
   - Address, state, damage type
   - Client, insurance, claim number (if available)

3. **Summary**
   - Justified text alignment
   - Professional paragraph formatting

4. **Scope of Work**
   - Numbered list
   - Clear spacing

5. **Itemized Estimate**
   - Professional table with borders
   - Right-aligned numbers
   - Bold total row

6. **Compliance Notes**
   - Bullet points
   - Clear formatting

7. **Authority to Proceed**
   - Justified text
   - Professional layout

8. **Footer**
   - Centered, italicized
   - Model information

---

## 📧 Email Configuration

### **Environment Variables**

Add to `.env.local`:

```bash
# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false  # true for port 465
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM="RestoreAssist" <noreply@restoreassist.com>
```

### **Gmail Setup**

1. Enable 2-Factor Authentication
2. Generate App Password:
   - Go to Google Account Settings
   - Security → 2-Step Verification → App passwords
   - Select "Mail" and "Other (Custom name)"
   - Copy the 16-character password
3. Use app password in `SMTP_PASS`

### **Email Template**

```html
Subject: Damage Assessment Report - RPT-123-456

<h2>Damage Assessment Report</h2>
<p>Please find attached your damage assessment report.</p>

<ul>
  <li><strong>Property:</strong> 123 Main St, Sydney NSW</li>
  <li><strong>Damage Type:</strong> Water</li>
  <li><strong>Total Cost:</strong> $8,750.00 AUD</li>
</ul>

<p>If you have any questions, please contact us.</p>
<p><em>Generated by RestoreAssist</em></p>

[Attached: report_RPT-123_123_Main_St_1697234567890.pdf]
```

---

## 🗂️ File Management

### **File Naming Convention**

```
report_{REPORT_ID}_{SANITIZED_ADDRESS}_{TIMESTAMP}.{FORMAT}
```

**Example**:
```
report_RPT-1697234567890-abc123_123_Main_St_Sydney_NSW_2_1697234567890.docx
```

### **Storage Location**

```
packages/backend/exports/
├── report_RPT-123_1697234567890.docx
├── report_RPT-124_1697234568000.pdf
└── report_RPT-125_1697234569000.pdf
```

### **Automatic Cleanup**

- Files expire after **24 hours**
- Automatic deletion via setTimeout
- No manual cleanup required

---

## 🔒 Security

### **File Name Validation**

- Only alphanumeric, underscores, hyphens, dots allowed
- No path traversal (`../`) attempts
- Must end with `.docx` or `.pdf`
- Regex validation: `/^[a-zA-Z0-9_\-\.]+$/`

### **Email Validation**

- Standard email regex
- Format: `user@domain.com`
- Prevents injection attacks

### **File Access**

- Direct file path validation
- No directory listing
- Temporary URLs expire
- No public directory browsing

---

## 📊 Response Codes

| Code | Status | Description |
|------|--------|-------------|
| 200 | OK | Export successful |
| 400 | Bad Request | Invalid format or email |
| 404 | Not Found | Report not found |
| 500 | Internal Error | Export or email failed |

---

## 🧪 Testing

### **Test DOCX Export**

```bash
# 1. Create a test report (use actual report ID from your system)
REPORT_ID="RPT-1697234567890-abc123"

# 2. Export to DOCX
curl -X POST http://localhost:3001/api/reports/$REPORT_ID/export \
  -H "Content-Type: application/json" \
  -d '{"format": "docx"}' \
  -o response.json

# 3. Get download URL from response
DOWNLOAD_URL=$(cat response.json | grep -o '"downloadUrl":"[^"]*' | cut -d'"' -f4)

# 4. Download the file
curl -O "$DOWNLOAD_URL"
```

### **Test PDF Export**

```bash
curl -X POST http://localhost:3001/api/reports/$REPORT_ID/export \
  -H "Content-Type: application/json" \
  -d '{"format": "pdf"}'
```

### **Test Email Delivery**

```bash
curl -X POST http://localhost:3001/api/reports/$REPORT_ID/export \
  -H "Content-Type: application/json" \
  -d '{
    "format": "pdf",
    "email": "your_email@example.com"
  }'
```

---

## 🛠️ Troubleshooting

### **Export Fails**

**Error**: `Failed to export report`

**Solutions**:
1. Check report exists: `GET /api/reports/:id`
2. Verify dependencies installed: `npm list docx pdfkit`
3. Check disk space for exports directory
4. Review server logs for detailed error

### **Email Not Sent**

**Error**: `emailSent: false`

**Solutions**:
1. Verify SMTP credentials in `.env.local`
2. Check SMTP host and port are correct
3. Enable "Less secure app access" (Gmail) or use App Password
4. Check firewall/antivirus blocking port 587/465
5. Review email logs in server console

### **File Not Found**

**Error**: `File not found or expired`

**Solutions**:
1. Check file hasn't expired (24 hours)
2. Verify download URL is correct
3. Check exports directory exists
4. Ensure file wasn't manually deleted

---

## 📚 Dependencies

- **docx** (^8.5.0) - DOCX generation
- **pdfkit** (^0.15.0) - PDF generation
- **nodemailer** (^6.9.0) - Email delivery
- **@types/pdfkit** - TypeScript types
- **@types/nodemailer** - TypeScript types

---

## 🔮 Future Enhancements

### **Planned Features**

- [ ] Charts and graphs in exports
- [ ] Custom branding (logo, colors)
- [ ] Multiple export templates
- [ ] Batch export (multiple reports)
- [ ] Export to Excel (XLSX)
- [ ] Cloud storage (S3, Google Drive)
- [ ] Digital signatures
- [ ] Export scheduling
- [ ] Custom email templates
- [ ] Export history tracking

---

## 📝 Example Integration

### **Frontend Integration**

```typescript
// Export report to PDF
async function exportReportToPDF(reportId: string, email?: string) {
  const response = await fetch(`/api/reports/${reportId}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'pdf',
      email,
    }),
  });

  const result = await response.json();

  // Download file
  window.open(result.downloadUrl, '_blank');

  return result;
}

// Export and email to client
await exportReportToPDF('RPT-123', 'client@example.com');
```

---

## ✅ Summary

RestoreAssist now includes **professional export functionality** with:

✅ DOCX export with full formatting
✅ PDF export with professional layout
✅ Email delivery with attachments
✅ Automatic file cleanup (24 hours)
✅ Secure file handling
✅ Production-ready implementation

**New Endpoints**:
- `POST /api/reports/:id/export`
- `GET /api/exports/:fileName`

The export system is fully functional and ready for production use! 🚀
