import express, { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { googleAuthService } from '../services/googleAuthService';
import { freeTrialService } from '../services/freeTrialService';
import { db } from '../db/connection';
import { trialAuthRateLimiter } from '../middleware/rateLimitMiddleware';

const router = express.Router();

// =====================================================
// Security Configuration
// =====================================================

// Store OAuth state parameters temporarily (in production, use Redis or database)
const oauthStateStore = new Map<string, {
  timestamp: number;
  ipAddress: string;
  userAgent: string;
  fingerprintHash?: string;
  deviceData?: any;
}>();

// Clean up old state entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const fiveMinutesAgo = now - (5 * 60 * 1000);

  for (const [state, data] of oauthStateStore.entries()) {
    if (data.timestamp < fiveMinutesAgo) {
      oauthStateStore.delete(state);
    }
  }
}, 5 * 60 * 1000);

// Validate redirect URI
function isValidRedirectUri(uri: string): boolean {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  const productionUrl = 'https://restoreassist.app';

  // Always allow production URL
  if (uri.startsWith(productionUrl)) {
    return true;
  }

  // Check against allowed origins
  return allowedOrigins.some(origin => uri.startsWith(origin));
}

// Generate secure state parameter
function generateSecureState(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Validate Google ID token signature and claims
async function validateGoogleToken(idToken: string): Promise<boolean> {
  try {
    const googleUser = await googleAuthService.verifyGoogleToken(idToken);
    if (!googleUser) {
      return false;
    }

    // Additional validation
    if (!googleUser.email_verified) {
      console.warn('⚠️ Google account email not verified');
      return false;
    }

    // Check token expiration (Google tokens are valid for 1 hour)
    // This is handled by Google's library, but we can add additional checks here

    return true;
  } catch (error) {
    console.error('Google token validation error:', error);
    return false;
  }
}

// =====================================================
// POST /api/google-oauth/login
// Google OAuth login with CSRF protection
// =====================================================

router.post('/login', trialAuthRateLimiter, async (req: Request, res: Response) => {
  const attemptId = uuidv4();
  const attemptIpAddress = req.body.ipAddress || req.ip || 'unknown';
  const attemptUserAgent = req.body.userAgent || req.headers['user-agent'] || 'unknown';

  try {
    const {
      idToken,
      state,
      fingerprintHash,
      deviceData,
      ipAddress,
      userAgent
    } = req.body;

    // Validate required fields
    if (!idToken) {
      return res.status(400).json({
        error: 'Google ID token is required',
        code: 'MISSING_TOKEN'
      });
    }

    // Validate state parameter if provided (CSRF protection)
    if (state) {
      const stateData = oauthStateStore.get(state);

      if (!stateData) {
        console.warn(`⚠️ Invalid OAuth state parameter: ${state}`);
        return res.status(403).json({
          error: 'Invalid state parameter - possible CSRF attack',
          code: 'INVALID_STATE'
        });
      }

      // Clean up used state
      oauthStateStore.delete(state);

      // Validate state hasn't expired (5 minutes)
      const stateAge = Date.now() - stateData.timestamp;
      if (stateAge > 5 * 60 * 1000) {
        console.warn(`⚠️ Expired OAuth state parameter: ${state}`);
        return res.status(403).json({
          error: 'State parameter expired',
          code: 'STATE_EXPIRED'
        });
      }

      // Optional: Validate IP address matches (can be disabled for mobile/VPN users)
      if (process.env.STRICT_IP_VALIDATION === 'true' && stateData.ipAddress !== attemptIpAddress) {
        console.warn(`⚠️ IP address mismatch for state ${state}: ${stateData.ipAddress} !== ${attemptIpAddress}`);
        // Don't block, just log for monitoring
      }
    }

    // Create initial auth attempt record
    if (process.env.USE_POSTGRES === 'true') {
      await db.none(
        `INSERT INTO auth_attempts
         (attempt_id, ip_address, user_agent, oauth_provider, success, retry_count, attempted_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [attemptId, attemptIpAddress, attemptUserAgent, 'google', false, 0]
      );
    }

    console.log(`🔐 Google OAuth attempt started: ${attemptId} from IP ${attemptIpAddress}`);

    // Validate Google token
    const isValidToken = await validateGoogleToken(idToken);
    if (!isValidToken) {
      // Update auth attempt with error
      if (process.env.USE_POSTGRES === 'true') {
        await db.none(
          `UPDATE auth_attempts
           SET oauth_error_code = $1, oauth_error_message = $2, success = $3
           WHERE attempt_id = $4`,
          ['invalid_token', 'Invalid or expired Google token', false, attemptId]
        );
      }

      console.log(`❌ Google OAuth failed: ${attemptId} - Invalid token`);

      return res.status(401).json({
        error: 'Invalid Google authentication token',
        code: 'INVALID_TOKEN'
      });
    }

    // Handle Google login through secure service
    const result = await googleAuthService.handleGoogleLogin(
      idToken,
      ipAddress || req.ip,
      userAgent || req.headers['user-agent']
    );

    if (!result.success) {
      // Update auth attempt with error
      if (process.env.USE_POSTGRES === 'true') {
        await db.none(
          `UPDATE auth_attempts
           SET oauth_error_code = $1, oauth_error_message = $2, success = $3
           WHERE attempt_id = $4`,
          ['google_auth_failed', result.error || 'Google authentication failed', false, attemptId]
        );
      }

      console.log(`❌ Google OAuth failed: ${attemptId} - ${result.error}`);

      return res.status(400).json({
        error: result.error || 'Google authentication failed',
        code: 'AUTH_FAILED'
      });
    }

    // Update auth attempt with success
    if (process.env.USE_POSTGRES === 'true') {
      await db.none(
        `UPDATE auth_attempts
         SET user_email = $1, oauth_provider = $2, success = $3
         WHERE attempt_id = $4`,
        [result.user!.email, 'google', true, attemptId]
      );
    }

    console.log(`✅ Google OAuth successful: ${attemptId} - ${result.user!.email}`);

    // Activate trial if fingerprint data provided
    let trialActivation = null;
    if (fingerprintHash && deviceData) {
      try {
        trialActivation = await freeTrialService.activateTrial({
          userId: result.user!.userId,
          fingerprintHash,
          deviceData,
          ipAddress: ipAddress || req.ip,
          userAgent: userAgent || req.headers['user-agent'],
        });

        if (!trialActivation.success) {
          console.warn(`⚠️  Trial denied for user ${result.user!.userId}: ${trialActivation.denialReason}`);
        }
      } catch (trialError) {
        console.error('Trial activation error during Google OAuth:', trialError);
        console.warn('⚠️  Trial activation failed but login succeeded');
      }
    }

    // Return success response with tokens
    res.json({
      success: true,
      user: {
        userId: result.user!.userId,
        email: result.user!.email,
        name: result.user!.name,
        pictureUrl: result.user!.pictureUrl,
        emailVerified: true,
      },
      tokens: result.tokens,
      sessionToken: result.session!.sessionToken,
      trial: trialActivation?.success ? {
        tokenId: trialActivation.tokenId,
        reportsRemaining: trialActivation.reportsRemaining,
        expiresAt: trialActivation.expiresAt,
      } : null,
    });
  } catch (error) {
    console.error('Google OAuth error:', error);

    // Update auth attempt with exception error
    try {
      if (process.env.USE_POSTGRES === 'true') {
        await db.none(
          `UPDATE auth_attempts
           SET oauth_error_code = $1, oauth_error_message = $2, success = $3
           WHERE attempt_id = $4`,
          [
            'server_error',
            error instanceof Error ? error.message : 'Internal server error',
            false,
            attemptId
          ]
        );
      }
    } catch (dbError) {
      console.error('Failed to update auth attempt:', dbError);
    }

    res.status(500).json({
      error: 'Google authentication failed. Please try again.',
      code: 'SERVER_ERROR'
    });
  }
});

// =====================================================
// GET /api/google-oauth/state
// Generate secure state parameter for OAuth flow
// =====================================================

router.get('/state', trialAuthRateLimiter, (req: Request, res: Response) => {
  try {
    const state = generateSecureState();
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Store state with metadata
    oauthStateStore.set(state, {
      timestamp: Date.now(),
      ipAddress,
      userAgent
    });

    console.log(`🔐 Generated OAuth state: ${state} for IP ${ipAddress}`);

    res.json({
      state,
      expiresIn: 300 // 5 minutes
    });
  } catch (error) {
    console.error('State generation error:', error);
    res.status(500).json({
      error: 'Failed to generate state parameter',
      code: 'STATE_GENERATION_FAILED'
    });
  }
});

// =====================================================
// GET /api/google-oauth/config
// Get Google OAuth configuration (client-side use)
// =====================================================

router.get('/config', (req: Request, res: Response) => {
  try {
    const isConfigured = googleAuthService.isConfigured();
    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (!isConfigured || !clientId) {
      return res.status(503).json({
        configured: false,
        error: 'Google OAuth not configured',
        code: 'NOT_CONFIGURED'
      });
    }

    // Never expose the client secret!
    res.json({
      configured: true,
      clientId,
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'https://restoreassist.app',
      scopes: ['email', 'profile'],
      // Additional security headers
      responseType: 'id_token',
      prompt: 'select_account',
      includeGrantedScopes: true
    });
  } catch (error) {
    console.error('Config error:', error);
    res.status(500).json({
      error: 'Failed to retrieve OAuth configuration',
      code: 'CONFIG_ERROR'
    });
  }
});

// =====================================================
// POST /api/google-oauth/validate-redirect
// Validate redirect URI for security
// =====================================================

router.post('/validate-redirect', (req: Request, res: Response) => {
  try {
    const { redirectUri } = req.body;

    if (!redirectUri) {
      return res.status(400).json({
        valid: false,
        error: 'Redirect URI is required',
        code: 'MISSING_REDIRECT_URI'
      });
    }

    const isValid = isValidRedirectUri(redirectUri);

    if (!isValid) {
      console.warn(`⚠️ Invalid redirect URI attempted: ${redirectUri}`);
    }

    res.json({
      valid: isValid,
      redirectUri: isValid ? redirectUri : null
    });
  } catch (error) {
    console.error('Redirect validation error:', error);
    res.status(500).json({
      valid: false,
      error: 'Failed to validate redirect URI',
      code: 'VALIDATION_ERROR'
    });
  }
});

// =====================================================
// GET /api/google-oauth/health
// Health check endpoint
// =====================================================

router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    configured: googleAuthService.isConfigured(),
    stateStoreSize: oauthStateStore.size
  });
});

export { router as googleOAuthRoutes };