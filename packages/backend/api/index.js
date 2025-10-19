// Vercel serverless function entry point
// This file is executed by Vercel's Node.js runtime
const app = require('../dist/index');

// Export the Express app for Vercel
module.exports = app.default || app;
