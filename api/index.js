// Vercel serverless function entry point for all API routes
// This file handles all /api/* requests and forwards them to the Express backend

const path = require('path');
const Module = require('module');

// Cache the Express app instance to avoid reloading on every request
let cachedApp = null;

module.exports = async (req, res) => {
  try {
    // Load the Express app once and cache it
    if (!cachedApp) {
      console.log('Loading Express app for serverless execution...');
      console.log('__dirname:', __dirname);
      console.log('cwd:', process.cwd());

      // Add backend node_modules to the module search paths
      const backendNodeModules = path.join(__dirname, '..', 'packages', 'backend', 'node_modules');
      const rootNodeModules = path.join(__dirname, '..', 'node_modules');

      // Ensure module can find dependencies from backend's node_modules
      if (!Module.globalPaths.includes(backendNodeModules)) {
        Module.globalPaths.push(backendNodeModules);
      }
      if (!Module.globalPaths.includes(rootNodeModules)) {
        Module.globalPaths.push(rootNodeModules);
      }

      console.log('Module paths configured');

      // Import the compiled Express app from backend dist
      const appPath = path.join(__dirname, '..', 'packages', 'backend', 'dist', 'index.js');
      console.log('Loading app from:', appPath);

      // Dynamically import the Express app
      const appModule = require(appPath);

      // Handle both default and named exports
      cachedApp = appModule.default || appModule;

      console.log('Express app loaded successfully');
      console.log('App type:', typeof cachedApp);
      console.log('App is function:', typeof cachedApp === 'function');
    }

    // Express app is already a request handler (req, res) => void
    // Just call it directly
    return cachedApp(req, res);
  } catch (error) {
    console.error('Failed to load Express app:', error);
    console.error('Error stack:', error.stack);
    console.error('__dirname:', __dirname);
    console.error('cwd:', process.cwd());

    return res.status(500).json({
      error: 'Server initialization failed',
      message: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      cwd: process.cwd(),
      dirname: __dirname,
      nodePath: process.env.NODE_PATH,
      nodeVersion: process.version
    });
  }
};
