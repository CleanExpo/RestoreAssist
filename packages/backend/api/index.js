// Vercel serverless function entry point
// This file loads the compiled Express app and exports it for Vercel

// For ES modules exported from TypeScript (export default app)
module.exports = async (req, res) => {
  const path = require('path');

  try {
    // Import the compiled Express app
    const appPath = path.join(__dirname, '..', 'dist', 'index.js');
    const appModule = require(appPath);

    // Handle both default and named exports
    const app = appModule.default || appModule;

    // Pass the request to Express
    return app(req, res);
  } catch (error) {
    console.error('Failed to load Express app:', error);
    return res.status(500).json({
      error: 'Server initialization failed',
      message: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
};
