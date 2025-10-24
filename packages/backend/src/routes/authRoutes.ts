import { Router, Request, Response } from 'express';
import { authService } from '../services/authService';
import { authenticate, authorise } from '../middleware/authMiddleware';
import { setTokenCookies, clearTokenCookies } from '../middleware/auth';
import {
  authRateLimiter,
  passwordRateLimiter,
  refreshRateLimiter
} from '../middleware/rateLimitMiddleware';
import { LoginRequest, RefreshTokenRequest } from '../types';

export const authRoutes = Router();

// GET /api/auth/config - Return simplified auth config (public endpoint)
// Google OAuth has been removed - only email/password authentication is supported
authRoutes.get('/config', (req: Request, res: Response) => {
  try {
    // Get allowed origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

    res.json({
      auth_method: 'email_password',
      is_valid: true,
      allowed_origins: allowedOrigins,
      config_status: 'ready',
      message: 'Email/password authentication is enabled',
    });
  } catch (error) {
    console.error('Config error:', error);
    res.status(500).json({
      error: 'Configuration check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/auth/login - Login user
authRoutes.post('/login', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password }: LoginRequest = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Email and password are required',
      });
    }

    // Authenticate user
    const tokens = await authService.login(email, password);

    // Get user details
    const user = await authService.getUserByEmail(email);

    // Set httpOnly cookies (Phase 1: also return tokens for backward compatibility)
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    res.json({
      message: 'Login successful',
      tokens, // Still return tokens for localStorage fallback
      user: {
        userId: user?.userId,
        email: user?.email,
        name: user?.name,
        role: user?.role,
        company: user?.company,
      },
      cookiesSet: true, // Inform frontend that cookies are available
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({
      error: 'Authentication failed',
      message: error instanceof Error ? error.message : 'Invalid credentials',
    });
  }
});

// POST /api/auth/refresh - Refresh access token
authRoutes.post('/refresh', refreshRateLimiter, async (req: Request, res: Response) => {
  try {
    // Phase 1: Check both cookie and body for refresh token
    let refreshToken: string | undefined = req.cookies?.refresh_token;

    // Fallback to body if not in cookie
    if (!refreshToken) {
      const body: RefreshTokenRequest = req.body;
      refreshToken = body.refreshToken;
    }

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Missing refresh token',
        message: 'Refresh token is required',
      });
    }

    // Refresh tokens
    const tokens = await authService.refreshAccessToken(refreshToken);

    // Set new cookies
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    res.json({
      message: 'Token refreshed successfully',
      tokens, // Still return for backward compatibility
      cookiesSet: true,
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      error: 'Token refresh failed',
      message: error instanceof Error ? error.message : 'Invalid refresh token',
    });
  }
});

// POST /api/auth/logout - Logout user
authRoutes.post('/logout', authenticate, (req: Request, res: Response) => {
  try {
    // Phase 1: Check both cookie and body for refresh token
    let refreshToken: string | undefined = req.cookies?.refresh_token;

    // Fallback to body if not in cookie
    if (!refreshToken) {
      refreshToken = req.body.refreshToken;
    }

    if (refreshToken) {
      authService.logout(refreshToken);
    }

    // Clear httpOnly cookies
    clearTokenCookies(res);

    res.json({
      message: 'Logout successful',
      cookiesCleared: true,
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/auth/me - Get current user
authRoutes.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'User not authenticated',
      });
    }

    // Get full user details
    const user = await authService.getUserById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    res.json({
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
      company: user.company,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/auth/register - Register new user (admin only)
authRoutes.post('/register', authRateLimiter, authenticate, authorise('admin'), async (req: Request, res: Response) => {
  try {
    const { email, password, name, role, company } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Email, password, and name are required',
      });
    }

    // Register user
    const user = await authService.registerUser(email, password, name, role || 'user');

    // Update company if provided
    if (company) {
      const fullUser = await authService.getUserById(user.userId);
      if (fullUser) {
        fullUser.company = company;
      }
    }

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        company,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({
      error: 'Registration failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/auth/change-password - Change user password
authRoutes.post('/change-password', passwordRateLimiter, authenticate, async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Old password and new password are required',
      });
    }

    if (!req.user) {
      return res.status(401).json({
        error: 'User not authenticated',
      });
    }

    await authService.changePassword(req.user.userId, oldPassword, newPassword);

    res.json({
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(400).json({
      error: 'Password change failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/auth/users - List all users (admin only)
authRoutes.get('/users', authenticate, authorise('admin'), async (req: Request, res: Response) => {
  try {
    const users = await authService.listUsers();

    res.json({
      users,
      count: users.length,
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({
      error: 'Failed to list users',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// DELETE /api/auth/users/:userId - Delete user (admin only)
authRoutes.delete('/users/:userId', authenticate, authorise('admin'), (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Don't allow deleting yourself
    if (req.user?.userId === userId) {
      return res.status(400).json({
        error: 'Cannot delete your own account',
      });
    }

    const deleted = authService.deleteUser(userId);

    if (!deleted) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    res.json({
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      error: 'Failed to delete user',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// DELETE /api/auth/delete-account - Delete own account
authRoutes.delete('/delete-account', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'User not authenticated',
      });
    }

    const userId = req.user.userId;

    // Log account deletion
    console.log(`⚠️  Account deletion requested for user: ${userId}`);

    // Delete the user account
    const deleted = authService.deleteUser(userId);

    if (!deleted) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    console.log(`✅ Account deleted successfully: ${userId}`);

    res.json({
      message: 'Account deleted successfully',
      success: true,
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      error: 'Failed to delete account',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/auth/test-mode-access-attempt - Log test mode access attempt (public endpoint)
authRoutes.post('/test-mode-access-attempt', (req: Request, res: Response) => {
  try {
    const { email, errorCode } = req.body;

    if (!email || !errorCode) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Email and errorCode are required',
      });
    }

    // Get IP address and user agent from request
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Log the attempt
    authService.logTestModeAccessAttempt(email, errorCode, ipAddress, userAgent);

    res.json({
      message: 'Access attempt logged successfully',
      logged: true,
    });
  } catch (error) {
    console.error('Test mode access attempt logging error:', error);
    res.status(500).json({
      error: 'Failed to log access attempt',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/auth/test-mode-attempts - Get test mode access attempts (admin only)
authRoutes.get('/test-mode-attempts', authenticate, authorise('admin'), async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const email = req.query.email as string;

    const attempts = email
      ? await authService.getTestModeAccessAttemptsByEmail(email)
      : await authService.getTestModeAccessAttempts(limit);

    res.json({
      attempts,
      count: attempts.length,
    });
  } catch (error) {
    console.error('Get test mode attempts error:', error);
    res.status(500).json({
      error: 'Failed to retrieve access attempts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
