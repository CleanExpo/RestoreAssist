// Vercel serverless function entry point
// This file is executed by Vercel's Node.js runtime

// Set production mode before loading app
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const path = require('path');
const fs = require('fs');

// Diagnostic function to check file system
function getDiagnostics() {
  const distPath = path.join(__dirname, '..', 'dist');
  const distIndexPath = path.join(distPath, 'index.js');

  let distContents = 'N/A';
  if (fs.existsSync(distPath)) {
    try {
      distContents = fs.readdirSync(distPath).join(', ');
    } catch (e) {
      distContents = `Error reading: ${e.message}`;
    }
  }

  return {
    nodeVersion: process.version,
    platform: process.platform,
    cwd: process.cwd(),
    dirname: __dirname,
    distPath,
    distIndexPath,
    hasDistFolder: fs.existsSync(distPath),
    hasIndexFile: fs.existsSync(distIndexPath),
    distContents,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      hasJwtSecret: !!process.env.JWT_SECRET
    }
  };
}

let app;
let loadError;

try {
  console.log('🚀 Loading Express app for Vercel serverless...');
  const diagnostics = getDiagnostics();
  console.log('📊 Diagnostics:', JSON.stringify(diagnostics, null, 2));

  const distPath = path.join(__dirname, '..', 'dist', 'index');
  console.log('📂 Attempting to load from:', distPath);

  // Load the compiled Express app from dist
  const appModule = require(distPath);
  app = appModule.default || appModule;

  if (!app) {
    throw new Error('Express app not found in module exports');
  }

  console.log('✅ Express app loaded successfully');
} catch (error) {
  console.error('❌ FATAL: Failed to load Express app:', error.message);
  console.error('Stack trace:', error.stack);
  loadError = error;
}

// Always export a valid handler function
module.exports = (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // If app loaded successfully, use it
  if (app) {
    return app(req, res);
  }

  // Otherwise, return diagnostic error
  res.status(500).json({
    error: 'Server initialization failed',
    message: loadError ? loadError.message : 'Unknown error',
    timestamp: new Date().toISOString(),
    path: req.url,
    diagnostics: getDiagnostics(),
    stack: process.env.NODE_ENV !== 'production' ? (loadError ? loadError.stack : undefined) : undefined,
    hint: 'Check build logs and ensure TypeScript compiled to dist/ folder'
  });
};
