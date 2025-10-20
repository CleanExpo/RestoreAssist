// Vercel serverless function entry point
// This file is executed by Vercel's Node.js runtime

// Set production mode before loading app
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const path = require('path');

try {
  // Load the compiled Express app from dist
  const app = require(path.join(__dirname, '..', 'dist', 'index'));

  // Export the Express app for Vercel serverless
  module.exports = app.default || app;
} catch (error) {
  console.error('Failed to load Express app:', error);

  // Export an error handler
  module.exports = (req, res) => {
    res.status(500).json({
      error: 'Server initialization failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  };
}
