#!/bin/bash

# RestoreAssist Backend Deployment Script
# This script deploys the backend to Vercel

echo "🚀 RestoreAssist Backend Deployment"
echo "===================================="
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
    echo "✅ Vercel CLI installed"
fi

# Navigate to backend directory
cd packages/backend

echo "📦 Building backend..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi

echo ""
echo "🚀 Deploying to Vercel..."
echo ""
echo "⚠️  IMPORTANT: When prompted:"
echo "  - Link to existing project? → YES (if you have restore-assist-backend)"
echo "  - Project name? → restore-assist-backend"
echo ""

vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Test backend: curl https://restore-assist-backend.vercel.app/api/health"
echo "2. Hard refresh frontend: Ctrl+Shift+R"
echo "3. Try signing in at https://restoreassist.app"
echo ""
