// Vercel serverless function entry point for all API routes
// This file handles all /api/* requests and forwards them to the Express backend

module.exports = async (req, res) => {
  const path = require('path');

  try {
    // Import the compiled Express app from backend dist
    const appPath = path.join(__dirname, '..', 'packages', 'backend', 'dist', 'index.js');

    // Dynamically import the Express app
    const appModule = require(appPath);

    // Handle both default and named exports
    const app = appModule.default || appModule;

    // Pass the request to Express
    return app(req, res);
  } catch (error) {
    console.error('Failed to load Express app:', error);
    console.error('Attempted path:', path.join(__dirname, '..', 'packages', 'backend', 'dist', 'index.js'));
    console.error('__dirname:', __dirname);

    return res.status(500).json({
      error: 'Server initialization failed',
      message: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      cwd: process.cwd(),
      dirname: __dirname
    });
  }
};
