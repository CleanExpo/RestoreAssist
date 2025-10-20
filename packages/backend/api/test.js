// Simple test endpoint for Vercel deployment verification
// This endpoint has minimal dependencies to isolate deployment issues

module.exports = (req, res) => {
  try {
    // Check if basic execution works
    const timestamp = new Date().toISOString();

    // Check environment variables (without exposing secrets)
    const envCheck = {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
      hasDatabase: !!process.env.DB_HOST || !!process.env.SUPABASE_URL,
      usePostgres: process.env.USE_POSTGRES === 'true',
    };

    res.status(200).json({
      status: 'ok',
      message: 'Vercel serverless function is working correctly',
      timestamp,
      runtime: {
        platform: process.platform,
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
      },
      environment: envCheck,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Test endpoint failed',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};
