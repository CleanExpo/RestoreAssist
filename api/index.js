// Vercel serverless function entry point for all API routes
// This file handles all /api/* requests and forwards them to the Express backend

const path = require('path');
const Module = require('module');
const fs = require('fs');

// Cache the Express app instance to avoid reloading on every request
let cachedApp = null;
let loadError = null;

module.exports = async (req, res) => {
  try {
    // Load the Express app once and cache it
    if (!cachedApp && !loadError) {
      console.log('[VERCEL] Loading Express app for serverless execution...');
      console.log('[VERCEL] __dirname:', __dirname);
      console.log('[VERCEL] cwd:', process.cwd());

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

      console.log('[VERCEL] Module paths configured');

      // Import the compiled Express app from backend dist
      const appPath = path.join(__dirname, '..', 'packages', 'backend', 'dist', 'index.js');
      console.log('[VERCEL] Loading app from:', appPath);

      // Verify file exists
      if (!fs.existsSync(appPath)) {
        throw new Error(`App file not found at ${appPath}`);
      }

      // Check if routes directory exists
      const routesPath = path.join(__dirname, '..', 'packages', 'backend', 'dist', 'routes');
      if (fs.existsSync(routesPath)) {
        const routeFiles = fs.readdirSync(routesPath);
        console.log('[VERCEL] Found route files:', routeFiles.join(', '));
      } else {
        console.warn('[VERCEL] Routes directory not found at:', routesPath);
      }

      // Dynamically import the Express app
      const appModule = require(appPath);

      // Handle both default and named exports
      cachedApp = appModule.default || appModule;

      console.log('[VERCEL] Express app loaded successfully');
      console.log('[VERCEL] App type:', typeof cachedApp);
      console.log('[VERCEL] App is function:', typeof cachedApp === 'function');

      // Verify app has routes by checking stack
      if (cachedApp._router && cachedApp._router.stack) {
        const routeCount = cachedApp._router.stack.filter(r => r.route).length;
        const layerCount = cachedApp._router.stack.length;
        console.log('[VERCEL] Express app has', layerCount, 'middleware layers,', routeCount, 'routes');
      }
    }

    if (loadError) {
      throw loadError;
    }

    // Express app is already a request handler (req, res) => void
    // Just call it directly
    return cachedApp(req, res);
  } catch (error) {
    console.error('[VERCEL] Failed to load Express app:', error);
    console.error('[VERCEL] Error stack:', error.stack);
    console.error('[VERCEL] __dirname:', __dirname);
    console.error('[VERCEL] cwd:', process.cwd());

    // Cache the error to avoid retrying on every request
    loadError = error;

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
