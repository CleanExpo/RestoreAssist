import { Router, Request, Response } from 'express';
import { authService } from '../services/authService';
import { authenticate, authorise } from '../middleware/authMiddleware';
import { LoginRequest, RefreshTokenRequest } from '../types';

export const authRoutes = Router();

// POST /api/auth/login - Login user
authRoutes.post('/login', async (req: Request, res: Response) => {
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
authRoutes.post('/refresh', async (req: Request, res: Response) => {
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
authRoutes.post('/register', authenticate, authorise('admin'), async (req: Request, res: Response) => {
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
authRoutes.post('/change-password', authenticate, async (req: Request, res: Response) => {
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
