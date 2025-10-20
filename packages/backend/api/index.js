// Vercel serverless function entry point
// This file is executed by Vercel's Node.js runtime

// Set production mode before loading app
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const path = require('path');

let app;
let loadError;

try {
  console.log('🚀 Loading Express app for Vercel serverless...');
  console.log('📁 Current directory:', __dirname);
  console.log('📦 Node version:', process.version);
  console.log('🌍 Environment:', process.env.NODE_ENV);

  const distPath = path.join(__dirname, '..', 'dist', 'index');
  console.log('📂 Looking for app at:', distPath);

  // Load the compiled Express app from dist
  const appModule = require(distPath);
  app = appModule.default || appModule;

  if (!app) {
    throw new Error('Express app not found in module exports');
  }

  console.log('✅ Express app loaded successfully');

  // Export the Express app for Vercel serverless
  module.exports = app;
} catch (error) {
  console.error('❌ FATAL: Failed to load Express app:', error.message);
  console.error('Stack trace:', error.stack);

  loadError = error;

  // Export an error handler that provides diagnostic information
  module.exports = (req, res) => {
    // Set CORS headers for error responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    const isDevelopment = process.env.NODE_ENV === 'development';

    res.status(500).json({
      error: 'Server initialization failed',
      message: loadError.message,
      timestamp: new Date().toISOString(),
      path: req.url,
      diagnostics: {
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd(),
        hasDistFolder: require('fs').existsSync(path.join(__dirname, '..', 'dist')),
        hasIndexFile: require('fs').existsSync(path.join(__dirname, '..', 'dist', 'index.js')),
      },
      stack: isDevelopment ? loadError.stack : undefined,
      hint: 'Check build logs to ensure TypeScript compiled successfully'
    });
  };
}
