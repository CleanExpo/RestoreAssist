// Vercel serverless function entry point (root-level)
// This delegates to the backend package's serverless function
const path = require('path');

// Load the compiled Express app from backend package
const app = require(path.join(__dirname, '..', 'packages', 'backend', 'dist', 'index'));

// Export the Express app for Vercel serverless
module.exports = app.default || app;
