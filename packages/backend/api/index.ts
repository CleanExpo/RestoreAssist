// Vercel serverless function entry point
// Import the compiled Express app from dist
// Using require() since dist outputs CommonJS modules
const app = require('../dist/index').default || require('../dist/index');

export default app;
