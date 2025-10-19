// Vercel serverless function entry point
// This file is executed by Vercel's Node.js runtime
const path = require('path');

// Load the compiled Express app from dist
const app = require(path.join(__dirname, '..', 'dist', 'index'));

// Export the Express app for Vercel serverless
module.exports = app.default || app;
