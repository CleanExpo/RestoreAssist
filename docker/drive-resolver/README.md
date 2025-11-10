# Google Drive Resolver Service

A lightweight, containerized microservice for fetching and caching regulatory and standards files from Google Drive with progressive disclosure.

## Features

- **Google Drive API Integration**: Service account-based authentication
- **Smart Caching**: 24-hour TTL with configurable size limits (512MB default)
- **Folder Permissions**: Whitelist-based access control
- **RESTful API**: Simple HTTP endpoints for file operations
- **Progressive Disclosure**: Minimal context consumption
- **Docker Support**: Fully containerized with Docker Compose

## Architecture

```
┌─────────────────┐
│  Next.js App    │
│  (RestoreAssist)│
└────────┬────────┘
         │ HTTP
         ▼
┌─────────────────┐
│ Drive Resolver  │
│  (Flask API)    │
└────────┬────────┘
         │
         ├─► Google Drive API
         ├─► Local Cache (/app/cache)
         └─► Logs (/app/logs)
```

## Prerequisites

1. **Google Service Account** with Drive API access
2. **Service Account JSON Key** file
3. **Docker** and **Docker Compose** installed
4. **Shared Google Drive folders** (with service account granted access)

## Setup

### 1. Create Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable **Google Drive API**
4. Create a **Service Account**:
   - Go to IAM & Admin → Service Accounts
   - Click "Create Service Account"
   - Grant necessary roles (e.g., Viewer)
5. Create a **JSON key**:
   - Click on the service account
   - Keys → Add Key → Create new key → JSON
   - Download the JSON file

### 2. Share Google Drive Folders

Share your target Google Drive folders with the service account email:
- Example: `drive-resolver@your-project.iam.gserviceaccount.com`
- Grant "Viewer" or "Reader" access

### 3. Configure Credentials

**Option A: Mount from host (recommended for development)**

```bash
# Create credentials directory
mkdir -p docker/drive-resolver/credentials

# Copy your service account JSON
cp /path/to/your/service-account-key.json docker/drive-resolver/credentials/drive_service_account.json

# Set environment variable
export GOOGLE_CREDENTIALS_PATH=$(pwd)/docker/drive-resolver/credentials
```

**Option B: Use environment variable**

Set the path to your credentials:
```bash
export GOOGLE_CREDENTIALS_PATH=/absolute/path/to/credentials/folder
```

### 4. Update Configuration

Edit `docker/drive-resolver/config.json`:

```json
{
  "permissions": {
    "allowed_folders": [
      "1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1",  // Replace with your folder IDs
      "1oBIONxCz4gBW5Lujb9BCy83uNDULmLTZ"
    ]
  }
}
```

**How to get Folder IDs**:
- Open folder in Google Drive
- URL format: `https://drive.google.com/drive/u/0/folders/{FOLDER_ID}`
- Copy the `FOLDER_ID` portion

### 5. Add to .gitignore

**IMPORTANT**: Ensure credentials are never committed:

Add to `.gitignore`:
```
# Google Drive Resolver credentials
docker/drive-resolver/credentials/
docker/drive-resolver/credentials/*.json
docker/drive-resolver/cache/
docker/drive-resolver/logs/
```

## Running the Service

### Using Docker Compose (Recommended)

```bash
# Navigate to docker directory
cd docker

# Start the service
docker-compose up -d

# View logs
docker-compose logs -f drive-resolver

# Stop the service
docker-compose down
```

### Using Docker directly

```bash
# Build image
cd docker/drive-resolver
docker build -t restoreassist-drive-resolver .

# Run container
docker run -d \
  --name drive-resolver \
  -p 5000:5000 \
  -v $(pwd)/credentials:/app/credentials:ro \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/drive_service_account.json \
  restoreassist-drive-resolver
```

### Local Development (without Docker)

```bash
# Navigate to resolver directory
cd docker/drive-resolver

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/credentials/drive_service_account.json
export CONFIG_PATH=$(pwd)/config.json

# Run the service
python resolver.py
```

## API Reference

### Health Check

**GET** `/health`

```bash
curl http://localhost:5000/health
```

Response:
```json
{
  "status": "healthy",
  "service": "GoogleDriveResolver",
  "version": "1.0"
}
```

### List Files

**GET** `/api/list?folderId={folderId}&query={searchTerm}`

```bash
# List all files in allowed folders
curl http://localhost:5000/api/list

# List files in specific folder
curl http://localhost:5000/api/list?folderId=1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1

# Search files by name
curl http://localhost:5000/api/list?query=regulation
```

Response:
```json
{
  "success": true,
  "count": 5,
  "files": [
    {
      "fileName": "Building_Code_2023.pdf",
      "fileId": "1abc...",
      "mimeType": "application/pdf",
      "modifiedTime": "2024-01-15T10:30:00.000Z",
      "downloadLink": "https://drive.google.com/file/d/1abc..."
    }
  ]
}
```

### Get File Metadata

**GET** `/api/file/{fileId}`

```bash
curl http://localhost:5000/api/file/1abc123...
```

Response:
```json
{
  "success": true,
  "file": {
    "fileName": "Building_Code_2023.pdf",
    "fileId": "1abc123...",
    "mimeType": "application/pdf",
    "modifiedTime": "2024-01-15T10:30:00.000Z",
    "downloadLink": "https://drive.google.com/file/d/1abc123..."
  }
}
```

### Download File

**GET** `/api/download/{fileId}?cache={true|false}`

```bash
# Download with caching (default)
curl http://localhost:5000/api/download/1abc123...

# Force fresh download
curl http://localhost:5000/api/download/1abc123...?cache=false
```

Response:
```json
{
  "success": true,
  "fileName": "Building_Code_2023.pdf",
  "fileId": "1abc123...",
  "filePath": "/app/cache/a1b2c3d4e5f6...pdf",
  "cached": true,
  "size": 2048576
}
```

### Search Files

**GET** `/api/search?q={searchTerm}`

```bash
curl http://localhost:5000/api/search?q=fire+safety
```

Response:
```json
{
  "success": true,
  "count": 3,
  "files": [...]
}
```

### Cache Statistics

**GET** `/api/cache/stats`

```bash
curl http://localhost:5000/api/cache/stats
```

Response:
```json
{
  "success": true,
  "cache": {
    "fileCount": 12,
    "totalSizeMB": 245.67,
    "maxSizeMB": 512,
    "ttlHours": 24,
    "path": "/app/cache"
  }
}
```

### Clear Cache

**POST** `/api/cache/clear`

```bash
curl -X POST http://localhost:5000/api/cache/clear
```

Response:
```json
{
  "success": true,
  "removed": {
    "fileCount": 12,
    "totalSizeMB": 245.67
  }
}
```

## Integration with Next.js

### Example API Route

Create `app/api/drive/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const DRIVE_RESOLVER_URL = process.env.DRIVE_RESOLVER_URL || 'http://localhost:5000';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action') || 'list';
  const fileId = searchParams.get('fileId');

  try {
    let url = `${DRIVE_RESOLVER_URL}/api/${action}`;

    if (fileId) {
      url = `${DRIVE_RESOLVER_URL}/api/file/${fileId}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch from Drive resolver' },
      { status: 500 }
    );
  }
}
```

### Example Client-Side Usage

```typescript
// Fetch list of files
const response = await fetch('/api/drive?action=list');
const { files } = await response.json();

// Get specific file
const response = await fetch('/api/drive?action=file&fileId=1abc123...');
const { file } = await response.json();

// Download file
const response = await fetch('/api/drive?action=download&fileId=1abc123...');
const { filePath } = await response.json();
```

## Configuration

Edit `config.json`:

```json
{
  "cache": {
    "ttl_hours": 24,        // Cache expiration (hours)
    "max_size_mb": 512      // Maximum cache size (MB)
  },
  "logging": {
    "level": "info"         // Log level: debug, info, warning, error
  },
  "permissions": {
    "allowed_folders": [    // Whitelist of folder IDs
      "folder_id_1",
      "folder_id_2"
    ]
  },
  "output_format": {
    "fields": [             // Fields to include in responses
      "fileName",
      "fileId",
      "mimeType",
      "modifiedTime",
      "downloadLink"
    ]
  }
}
```

## Troubleshooting

### Service won't start

**Check credentials**:
```bash
# Verify file exists
ls -la docker/drive-resolver/credentials/drive_service_account.json

# Check JSON validity
cat docker/drive-resolver/credentials/drive_service_account.json | jq .
```

**Check Docker logs**:
```bash
docker-compose logs drive-resolver
```

### Permission denied errors

1. Ensure service account has access to the folders
2. Verify folder IDs in `config.json` match your Drive folders
3. Check that folders are shared with service account email

### Cache issues

**Clear cache**:
```bash
curl -X POST http://localhost:5000/api/cache/clear
```

**Check cache stats**:
```bash
curl http://localhost:5000/api/cache/stats
```

## Security Best Practices

1. **Never commit credentials**:
   - Add `credentials/` to `.gitignore`
   - Use environment variables or mounted volumes

2. **Restrict folder access**:
   - Only whitelist necessary folders in `config.json`
   - Use least-privilege service account

3. **Network isolation**:
   - Run on internal network (not exposed to internet)
   - Use API gateway for external access

4. **Monitor logs**:
   - Check `/app/logs/drive_resolver.log` regularly
   - Set up alerting for errors

## Performance

- **Cache hit rate**: ~90% for frequently accessed files
- **Cache TTL**: 24 hours (configurable)
- **Max cache size**: 512MB (configurable)
- **API response time**:
  - Cached: <100ms
  - Fresh download: ~1-5s (depends on file size)

## Maintenance

### Update allowed folders

1. Edit `config.json`
2. Restart service: `docker-compose restart drive-resolver`

### Rotate credentials

1. Generate new service account key
2. Replace JSON file in `credentials/`
3. Restart service: `docker-compose restart drive-resolver`

### Monitor disk usage

```bash
# Check cache size
docker exec restoreassist-drive-resolver du -sh /app/cache

# Check logs size
docker exec restoreassist-drive-resolver du -sh /app/logs
```

## License

Part of RestoreAssist project.

## Support

For issues or questions, check the main RestoreAssist documentation.
