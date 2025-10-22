import express, { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { googleAuthService } from '../services/googleAuthService';
import { freeTrialService } from '../services/freeTrialService';
import { paymentVerificationService } from '../services/paymentVerification';
import { db } from '../db/connection';
import { UserPayload } from '../types';
import {
  trialAuthRateLimiter,
  refreshRateLimiter,
  apiRateLimiter
} from '../middleware/rateLimitMiddleware';

const router = express.Router();

// =====================================================
// Middleware: Authenticate JWT
// =====================================================

interface AuthRequest extends Request {
  user?: UserPayload;
}

const authenticateJWT = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  // Normalize header to string (Express can return string[])
  const headerValue = authHeader ? (Array.isArray(authHeader) ? authHeader[0] : authHeader) : undefined;
  const token = headerValue?.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const decoded = googleAuthService.verifyAccessToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }

  req.user = {
    userId: decoded.userId,
    email: decoded.email,
    name: decoded.name || '',
    role: 'user' as any
  };
  next();
};

// =====================================================
// POST /api/trial-auth/google-login
// Complete Google OAuth login flow
// =====================================================

router.post('/google-login', trialAuthRateLimiter, async (req: Request, res: Response) => {
  const attemptId = uuidv4();
  const attemptIpAddress = req.body.ipAddress || req.ip || 'unknown';
  const attemptUserAgent = req.body.userAgent || req.headers['user-agent'] || 'unknown';

  try {
    const { idToken, ipAddress, userAgent } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'Google ID token required' });
    }

    // Create initial auth attempt record
    await db.none(
      `INSERT INTO auth_attempts
       (attempt_id, ip_address, user_agent, success, retry_count, attempted_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [attemptId, attemptIpAddress, attemptUserAgent, false, 0]
    );

    console.log(`🔐 Auth attempt started: ${attemptId} from IP ${attemptIpAddress}`);

    // Handle Google login
    const result = await googleAuthService.handleGoogleLogin(
      idToken,
      ipAddress || req.ip,
      userAgent || req.headers['user-agent']
    );

    if (!result.success) {
      // Update auth attempt with error
      await db.none(
        `UPDATE auth_attempts
         SET oauth_error_code = $1, oauth_error_message = $2, success = $3
         WHERE attempt_id = $4`,
        [result.error || 'unknown_error', result.error || 'Login failed', false, attemptId]
      );

      console.log(`❌ Auth failed: ${attemptId} - ${result.error}`);

      return res.status(401).json({ error: result.error });
    }

    // Update auth attempt with success
    await db.none(
      `UPDATE auth_attempts
       SET user_email = $1, success = $2
       WHERE attempt_id = $3`,
      [result.user!.email, true, attemptId]
    );

    console.log(`✅ Auth successful: ${attemptId} - ${result.user!.email}`);

    res.json({
      success: true,
      user: {
        userId: result.user!.userId,
        email: result.user!.email,
        name: result.user!.name,
        pictureUrl: result.user!.pictureUrl,
        emailVerified: result.user!.emailVerified,
      },
      tokens: result.tokens,
      sessionToken: result.session!.sessionToken,
    });
  } catch (error) {
    console.error('Google login error:', error);

    // Update auth attempt with exception error
    try {
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
    } catch (dbError) {
      console.error('Failed to update auth attempt:', dbError);
    }

    res.status(500).json({ error: 'Login failed' });
  }
});

// =====================================================
// POST /api/trial-auth/refresh-token
// Refresh access token using refresh token
// =====================================================

router.post('/refresh-token', refreshRateLimiter, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const tokens = await googleAuthService.refreshAccessToken(refreshToken);
    if (!tokens) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    res.json({ success: true, tokens });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// =====================================================
// POST /api/trial-auth/logout
// Logout user (invalidate session)
// =====================================================

router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      return res.status(400).json({ error: 'Session token required' });
    }

    const success = await googleAuthService.invalidateSession(sessionToken);

    res.json({ success });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// =====================================================
// GET /api/trial-auth/me
// Get current user info (requires JWT)
// =====================================================

router.get('/me', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const user = await googleAuthService.getUserById(req.user!.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      userId: user.userId,
      email: user.email,
      name: user.name,
      pictureUrl: user.pictureUrl,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// =====================================================
// POST /api/trial-auth/activate-trial
// Activate free trial (requires JWT)
// =====================================================

router.post('/activate-trial', apiRateLimiter, authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const { fingerprintHash, deviceData, ipAddress, userAgent } = req.body;

    if (!fingerprintHash || !deviceData) {
      return res.status(400).json({ error: 'Device fingerprint required' });
    }

    const result = await freeTrialService.activateTrial({
      userId: req.user!.userId,
      fingerprintHash,
      deviceData,
      ipAddress: ipAddress || req.ip,
      userAgent: userAgent || req.headers['user-agent'],
    });

    if (!result.success) {
      return res.status(403).json({
        success: false,
        error: result.denialReason,
        fraudFlags: result.fraudFlags,
      });
    }

    res.json({
      success: true,
      tokenId: result.tokenId,
      reportsRemaining: result.reportsRemaining,
      expiresAt: result.expiresAt,
      fraudFlags: result.fraudFlags,
    });
  } catch (error) {
    console.error('Activate trial error:', error);
    res.status(500).json({ error: 'Failed to activate trial' });
  }
});

// =====================================================
// GET /api/trial-auth/trial-status
// Get current trial status (requires JWT)
// =====================================================

router.get('/trial-status', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const token = await freeTrialService.getTrialStatus(req.user!.userId);

    if (!token) {
      return res.json({
        hasActiveTrial: false,
        message: 'No active trial found',
      });
    }

    res.json({
      hasActiveTrial: true,
      tokenId: token.tokenId,
      status: token.status,
      reportsRemaining: token.reportsRemaining,
      activatedAt: token.activatedAt,
      expiresAt: token.expiresAt,
    });
  } catch (error) {
    console.error('Get trial status error:', error);
    res.status(500).json({ error: 'Failed to get trial status' });
  }
});

// =====================================================
// POST /api/trial-auth/verify-payment
// Verify payment method without charging (requires JWT)
// =====================================================

router.post('/verify-payment', authenticateJWT, async (req: AuthRequest, res: Response) => {
  try {
    const { paymentMethodId } = req.body;

    if (!paymentMethodId) {
      return res.status(400).json({ error: 'Payment method ID required' });
    }

    const result = await paymentVerificationService.verifyCard({
      userId: req.user!.userId,
      paymentMethodId,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        requiresAction: result.requiresAction,
        clientSecret: result.clientSecret,
      });
    }

    res.json({
      success: true,
      verification: {
        verificationId: result.verification!.verificationId,
        cardLast4: result.verification!.cardLast4,
        cardBrand: result.verification!.cardBrand,
        verificationStatus: result.verification!.verificationStatus,
      },
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// =====================================================
// GET /api/trial-auth/health
// Health check endpoint
// =====================================================

router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      googleAuth: googleAuthService.isConfigured(),
      paymentVerification: paymentVerificationService.isConfigured(),
    },
  });
});

export { router as trialAuthRoutes };
