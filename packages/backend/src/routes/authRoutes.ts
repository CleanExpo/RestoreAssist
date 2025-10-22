import { Router, Request, Response } from 'express';
import { authService } from '../services/authService';
import { authenticate, authorise } from '../middleware/authMiddleware';
import {
  authRateLimiter,
  passwordRateLimiter,
  refreshRateLimiter
} from '../middleware/rateLimitMiddleware';
import { LoginRequest, RefreshTokenRequest } from '../types';

export const authRoutes = Router();

// GET /api/auth/config - Validate OAuth configuration (public endpoint)
authRoutes.get('/config', (req: Request, res: Response) => {
  try {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check GOOGLE_CLIENT_ID
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      errors.push('GOOGLE_CLIENT_ID is not set. Set this environment variable to enable Google OAuth.');
    } else if (!clientId.endsWith('.apps.googleusercontent.com')) {
      errors.push('GOOGLE_CLIENT_ID has invalid format. Must end with .apps.googleusercontent.com');
    } else if (clientId.includes('YOUR_') || clientId.includes('placeholder')) {
      errors.push('GOOGLE_CLIENT_ID appears to be a placeholder. Replace with actual Client ID from Google Cloud Console.');
    }

    // Check GOOGLE_CLIENT_SECRET (don't expose value)
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientSecret) {
      errors.push('GOOGLE_CLIENT_SECRET is not set. Set this environment variable to enable OAuth token exchange.');
    } else if (clientSecret.length < 20) {
      errors.push('GOOGLE_CLIENT_SECRET appears invalid (too short). Verify in Google Cloud Console.');
    }

    // Check GOOGLE_REDIRECT_URI
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!redirectUri) {
      warnings.push('GOOGLE_REDIRECT_URI is not set. Using default: http://localhost:3001/api/integrations/google-drive/callback');
    }

    // Get allowed origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

    // Determine validity
    const isValid = errors.length === 0;

    res.json({
      client_id: clientId ? clientId.substring(0, 20) + '...' : undefined, // Partial ID for debugging
      is_valid: isValid,
      allowed_origins: allowedOrigins,
      errors,
      warnings,
      config_status: isValid ? 'ready' : 'misconfigured',
    });
  } catch (error) {
    console.error('Config validation error:', error);
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
    const user = authService.getUserByEmail(email);

    res.json({
      message: 'Login successful',
      tokens,
      user: {
        userId: user?.userId,
        email: user?.email,
        name: user?.name,
        role: user?.role,
        company: user?.company,
      },
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
    const { refreshToken }: RefreshTokenRequest = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Missing refresh token',
        message: 'Refresh token is required',
      });
    }

    // Refresh tokens
    const tokens = await authService.refreshAccessToken(refreshToken);

    res.json({
      message: 'Token refreshed successfully',
      tokens,
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
    const { refreshToken } = req.body;

    if (refreshToken) {
      authService.logout(refreshToken);
    }

    res.json({
      message: 'Logout successful',
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
authRoutes.get('/me', authenticate, (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'User not authenticated',
      });
    }

    // Get full user details
    const user = authService.getUserById(req.user.userId);

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
      const fullUser = authService.getUserById(user.userId);
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
authRoutes.get('/users', authenticate, authorise('admin'), (req: Request, res: Response) => {
  try {
    const users = authService.listUsers();

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
