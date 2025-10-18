# Google Drive Integration Documentation

## Overview

RestoreAssist integrates with Google Drive for cloud storage of exported reports. This OAuth 2.0-based integration enables users to save DOCX and PDF reports directly to their Google Drive account.

## Features

- **OAuth 2.0 Authentication** - Secure user authorization flow
- **File Upload** - Upload exported reports (DOCX/PDF) to Drive
- **Folder Management** - Create and organize folders
- **File Sharing** - Share files with users or make public
- **Auto-Export** - Automatically save reports to Drive on export
- **Integration Tracking** - Track upload history and statistics

## Configuration

### Google Cloud Setup

1. **Create Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create new project: "RestoreAssist"

2. **Enable Google Drive API**
   - Navigate to "APIs & Services" → "Library"
   - Search for "Google Drive API"
   - Click "Enable"

3. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client ID"
   - Application type: "Web application"
   - Authorized redirect URIs: `http://localhost:3001/api/integrations/google-drive/callback`
   - Copy Client ID and Client Secret

### Environment Variables

Add to `.env.local`:

```bash
# Google Drive Integration
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3001/api/integrations/google-drive/callback
```

**Production:**
- Update redirect URI to production domain
- Store credentials securely (e.g., AWS Secrets Manager)

## OAuth 2.0 Flow

### 1. Check Status

```bash
GET /api/integrations/google-drive/status
```

**Response:**
```json
{
  "enabled": true,
  "authenticated": false
}
```

### 2. Get Authorization URL

```bash
GET /api/integrations/google-drive/auth
```

**Response:**
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "message": "Redirect user to this URL to authorize Google Drive access"
}
```

### 3. User Authorizes
- Redirect user to `authUrl`
- User grants permissions
- Google redirects to callback URL

### 4. Callback Handling
```
GET /api/integrations/google-drive/callback?code=AUTH_CODE&state=USER_ID
```

- Exchanges code for tokens
- Stores tokens for user
- Redirects to frontend

## API Endpoints

### Save Report to Drive

**POST /api/integrations/google-drive/reports/:reportId/save**

Save and upload report to Google Drive.

**Request:**
```json
{
  "format": "pdf",
  "folderId": "optional_drive_folder_id",
  "share": {
    "type": "anyone",
    "role": "reader"
  }
}
```

**Response:**
```json
{
  "success": true,
  "file": {
    "id": "1AbC...XyZ",
    "name": "RestoreAssist_Report_2025-01-16.pdf",
    "webViewLink": "https://drive.google.com/file/d/...",
    "createdTime": "2025-01-16T10:00:00Z"
  },
  "message": "Report saved to Google Drive successfully"
}
```

### Create Folder

**POST /api/integrations/google-drive/folders**

```json
{
  "folderName": "RestoreAssist Reports",
  "parentFolderId": "optional_parent_folder_id"
}
```

### List Files

**GET /api/integrations/google-drive/files?folderId=XXX&pageSize=10**

### Share File

**POST /api/integrations/google-drive/files/:fileId/share**

```json
{
  "type": "anyone",
  "role": "reader"
}
```

### Revoke Access

**POST /api/integrations/google-drive/revoke**

## Usage Example

```javascript
// 1. Get auth URL
const authResponse = await fetch('/api/integrations/google-drive/auth', {
  headers: { 'Authorization': `Bearer ${accessToken}` }
});
const { authUrl } = await authResponse.json();

// 2. Redirect user to Google
window.location.href = authUrl;

// 3. After authorization, save report
const saveResponse = await fetch(
  `/api/integrations/google-drive/reports/${reportId}/save`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      format: 'pdf',
      share: {
        type: 'anyone',
        role': 'reader'
      }
    })
  }
);

const { file } = await saveResponse.json();
console.log('Saved to Drive:', file.webViewLink);
```

## Scopes Required

- `https://www.googleapis.com/auth/drive.file` - Access files created by app
- `https://www.googleapis.com/auth/drive.metadata.readonly` - Read metadata
- `https://www.googleapis.com/auth/userinfo.email` - User email

## Storage

Currently uses in-memory storage for:
- User OAuth tokens
- Upload records

**For production:**

```sql
CREATE TABLE google_drive_auth (
  user_id VARCHAR(255) PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expiry_date BIGINT,
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE drive_file_records (
  record_id VARCHAR(255) PRIMARY KEY,
  report_id VARCHAR(255) NOT NULL,
  drive_file_id VARCHAR(255) NOT NULL,
  file_name VARCHAR(512) NOT NULL,
  file_url TEXT NOT NULL,
  format VARCHAR(10) NOT NULL,
  uploaded_at TIMESTAMP NOT NULL,
  uploaded_by VARCHAR(255) NOT NULL,
  FOREIGN KEY (report_id) REFERENCES reports(report_id),
  FOREIGN KEY (uploaded_by) REFERENCES users(user_id)
);
```

## Security

- Tokens stored securely per user
- Offline access for token refresh
- Credentials never exposed to frontend
- File access limited to app-created files
- OAuth consent screen shows permissions

## Troubleshooting

**"Drive integration disabled"**
- Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
- Restart server

**"User not authenticated"**
- User must complete OAuth flow
- Check /status endpoint

**"Invalid grant" error**
- Refresh token expired
- Re-authorize user

## Future Enhancements

- Batch uploads
- Folder templates
- Team Drive support
- File versioning
- Automatic backup schedules
