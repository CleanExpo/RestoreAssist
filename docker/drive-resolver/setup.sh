#!/bin/bash
# Google Drive Resolver - Setup Script

set -e

echo "==================================="
echo "Google Drive Resolver Setup"
echo "==================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Create credentials directory
echo "📁 Creating credentials directory..."
mkdir -p credentials
echo "✅ Credentials directory created"
echo ""

# Check if credentials file exists
CREDS_FILE="credentials/drive_service_account.json"
if [ ! -f "$CREDS_FILE" ]; then
    echo "⚠️  Service account credentials not found!"
    echo ""
    echo "Please follow these steps:"
    echo "1. Go to https://console.cloud.google.com"
    echo "2. Create a service account with Drive API access"
    echo "3. Download the JSON key file"
    echo "4. Copy it to: $CREDS_FILE"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo "✅ Service account credentials found"
echo ""

# Validate JSON
if ! cat "$CREDS_FILE" | python -m json.tool > /dev/null 2>&1; then
    echo "❌ Credentials file is not valid JSON"
    exit 1
fi

echo "✅ Credentials file is valid JSON"
echo ""

# Extract service account email
SERVICE_EMAIL=$(cat "$CREDS_FILE" | python -c "import sys, json; print(json.load(sys.stdin)['client_email'])" 2>/dev/null || echo "unknown")
echo "📧 Service Account: $SERVICE_EMAIL"
echo ""

# Check config.json
if [ ! -f "config.json" ]; then
    echo "❌ config.json not found"
    exit 1
fi

echo "✅ Configuration file found"
echo ""

# Display allowed folders
echo "📂 Allowed Folders:"
cat config.json | python -c "import sys, json; folders = json.load(sys.stdin)['permissions']['allowed_folders']; print('\n'.join(['  - ' + f for f in folders]))"
echo ""

# Create .env file if it doesn't exist
if [ ! -f "../.env" ]; then
    echo "📝 Creating .env file..."
    echo "GOOGLE_CREDENTIALS_PATH=$(pwd)/credentials" > ../.env
    echo "✅ .env file created"
else
    echo "✅ .env file already exists"
fi
echo ""

# Build and start services
echo "🏗️  Building Docker image..."
cd ..
docker-compose build drive-resolver

echo ""
echo "🚀 Starting service..."
docker-compose up -d drive-resolver

echo ""
echo "⏳ Waiting for service to be healthy..."
sleep 5

# Test health endpoint
if curl -f http://localhost:5000/health > /dev/null 2>&1; then
    echo "✅ Service is healthy!"
    echo ""
    echo "==================================="
    echo "Setup Complete! 🎉"
    echo "==================================="
    echo ""
    echo "Service is running at: http://localhost:5000"
    echo ""
    echo "Next steps:"
    echo "1. Test the health endpoint:"
    echo "   curl http://localhost:5000/health"
    echo ""
    echo "2. List files:"
    echo "   curl http://localhost:5000/api/list"
    echo ""
    echo "3. View logs:"
    echo "   docker-compose logs -f drive-resolver"
    echo ""
    echo "4. Share your Google Drive folders with:"
    echo "   $SERVICE_EMAIL"
    echo ""
else
    echo "⚠️  Service may not be healthy yet"
    echo "Check logs with: docker-compose logs drive-resolver"
fi
