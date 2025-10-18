# JWT Authentication Documentation

## Overview

RestoreAssist backend uses JWT (JSON Web Tokens) for stateless authentication and authorization. The system implements both access tokens (short-lived) and refresh tokens (long-lived) for secure session management.

## Features

- **JWT-based authentication** - Stateless token-based authentication
- **Dual token system** - Access tokens (15 minutes) + Refresh tokens (7 days)
- **Role-based access control (RBAC)** - Support for admin, user, and viewer roles
- **Password hashing** - bcrypt with salt rounds for secure password storage
- **In-memory user storage** - Can be replaced with database in production
- **Default users** - Auto-created admin and demo users for development

## Architecture

### Components

1. **authService.ts** - Core authentication logic
   - User registration and management
   - Password hashing and verification
   - JWT token generation and verification
   - Token refresh mechanism

2. **authMiddleware.ts** - Request authentication and authorization
   - `authenticate()` - Validates JWT tokens
   - `authorize(...roles)` - Role-based access control
   - `optionalAuth()` - Non-failing authentication for public endpoints

3. **authRoutes.ts** - Authentication API endpoints
   - Login, logout, register
   - Token refresh
   - User management
   - Password change

## API Endpoints

### Public Endpoints

#### POST /api/auth/login
Login with email and password to receive JWT tokens.

**Request:**
```json
{
  "email": "admin@restoreassist.com",
  "password": "admin123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900
  },
  "user": {
    "userId": "user-1234567890-abc123",
    "email": "admin@restoreassist.com",
    "name": "Admin User",
    "role": "admin"
  }
}
```

**Status Codes:**
- `200` - Login successful
- `400` - Missing required fields
- `401` - Invalid credentials

---

#### POST /api/auth/refresh
Refresh access token using refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "message": "Token refreshed successfully",
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900
  }
}
```

**Status Codes:**
- `200` - Token refreshed
- `400` - Missing refresh token
- `401` - Invalid or expired refresh token

---

### Protected Endpoints (Require Authentication)

All protected endpoints require the `Authorization` header:
```
Authorization: Bearer <accessToken>
```

#### GET /api/auth/me
Get current authenticated user details.

**Response:**
```json
{
  "userId": "user-1234567890-abc123",
  "email": "admin@restoreassist.com",
  "name": "Admin User",
  "role": "admin",
  "company": "RestoreAssist Inc",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "lastLogin": "2025-01-15T14:45:00.000Z"
}
```

**Status Codes:**
- `200` - User found
- `401` - Not authenticated
- `404` - User not found

---

#### POST /api/auth/logout
Logout user by invalidating refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "message": "Logout successful"
}
```

**Status Codes:**
- `200` - Logout successful
- `401` - Not authenticated
- `500` - Logout failed

---

#### POST /api/auth/change-password
Change user password.

**Request:**
```json
{
  "oldPassword": "currentPassword123",
  "newPassword": "newSecurePassword456"
}
```

**Response:**
```json
{
  "message": "Password changed successfully"
}
```

**Status Codes:**
- `200` - Password changed
- `400` - Missing fields or invalid current password
- `401` - Not authenticated

---

### Admin-Only Endpoints (Require Admin Role)

#### POST /api/auth/register
Register new user (admin only).

**Request:**
```json
{
  "email": "newuser@example.com",
  "password": "securePassword123",
  "name": "New User",
  "role": "user",
  "company": "Example Corp"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "user": {
    "userId": "user-1234567890-xyz789",
    "email": "newuser@example.com",
    "name": "New User",
    "role": "user",
    "company": "Example Corp"
  }
}
```

**Status Codes:**
- `201` - User created
- `400` - Missing fields or user already exists
- `401` - Not authenticated
- `403` - Not authorized (requires admin role)

---

#### GET /api/auth/users
List all users (admin only).

**Response:**
```json
{
  "users": [
    {
      "userId": "user-1234567890-abc123",
      "email": "admin@restoreassist.com",
      "password": "[REDACTED]",
      "name": "Admin User",
      "role": "admin",
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

**Status Codes:**
- `200` - Users listed
- `401` - Not authenticated
- `403` - Not authorized (requires admin role)
- `500` - Failed to list users

---

#### DELETE /api/auth/users/:userId
Delete user by ID (admin only). Cannot delete your own account.

**Response:**
```json
{
  "message": "User deleted successfully"
}
```

**Status Codes:**
- `200` - User deleted
- `400` - Cannot delete own account
- `401` - Not authenticated
- `403` - Not authorized (requires admin role)
- `404` - User not found

---

## User Roles

### admin
- Full access to all endpoints
- Can manage users (create, list, delete)
- Can access admin statistics and cleanup endpoints
- Can perform all report operations

### user
- Can create, read, update, and delete reports
- Can export reports
- Can change own password
- Cannot access admin endpoints
- Cannot manage other users

### viewer
- Can only read reports and statistics
- Cannot create, update, or delete reports
- Cannot access admin endpoints
- Cannot manage users

## Default Users

The system automatically creates default users on first startup:

### Admin User
- **Email:** admin@restoreassist.com
- **Password:** admin123
- **Role:** admin
- **Use for:** Development and testing admin features

### Demo User
- **Email:** demo@restoreassist.com
- **Password:** demo123
- **Role:** user
- **Use for:** Testing regular user functionality

**IMPORTANT:** Change these passwords in production!

## Environment Variables

Add these to your `.env.local` file:

```bash
# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
```

### Configuration Options

- **JWT_SECRET** - Secret key for signing access tokens (required)
- **JWT_REFRESH_SECRET** - Secret key for signing refresh tokens (required)
- **JWT_EXPIRY** - Access token expiration time (default: 15m)
  - Format: `<number><unit>` where unit is s (seconds), m (minutes), h (hours), d (days)
  - Examples: `15m`, `1h`, `30s`, `7d`
- **JWT_REFRESH_EXPIRY** - Refresh token expiration time (default: 7d)

**Security Best Practices:**
- Use long, random strings for JWT secrets (at least 32 characters)
- Never commit secrets to version control
- Use different secrets for development and production
- Rotate secrets periodically in production

## Usage Examples

### 1. Login Flow

```javascript
// Login
const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@restoreassist.com',
    password: 'admin123'
  })
});

const { tokens, user } = await loginResponse.json();

// Store tokens
localStorage.setItem('accessToken', tokens.accessToken);
localStorage.setItem('refreshToken', tokens.refreshToken);
```

### 2. Making Authenticated Requests

```javascript
// Get current user
const accessToken = localStorage.getItem('accessToken');

const userResponse = await fetch('http://localhost:3001/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const user = await userResponse.json();
```

### 3. Token Refresh Flow

```javascript
// Refresh access token when it expires
const refreshToken = localStorage.getItem('refreshToken');

const refreshResponse = await fetch('http://localhost:3001/api/auth/refresh', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refreshToken })
});

const { tokens } = await refreshResponse.json();

// Update stored tokens
localStorage.setItem('accessToken', tokens.accessToken);
localStorage.setItem('refreshToken', tokens.refreshToken);
```

### 4. Logout

```javascript
const refreshToken = localStorage.getItem('refreshToken');
const accessToken = localStorage.getItem('accessToken');

await fetch('http://localhost:3001/api/auth/logout', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ refreshToken })
});

// Clear stored tokens
localStorage.removeItem('accessToken');
localStorage.removeItem('refreshToken');
```

### 5. Creating a New User (Admin Only)

```javascript
const accessToken = localStorage.getItem('accessToken');

const registerResponse = await fetch('http://localhost:3001/api/auth/register', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'newuser@example.com',
    password: 'securePassword123',
    name: 'New User',
    role: 'user',
    company: 'Example Corp'
  })
});

const { user } = await registerResponse.json();
```

## Testing with cURL

### Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@restoreassist.com","password":"admin123"}'
```

### Get Current User
```bash
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Refresh Token
```bash
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```

### List Users (Admin)
```bash
curl http://localhost:3001/api/auth/users \
  -H "Authorization: Bearer YOUR_ADMIN_ACCESS_TOKEN"
```

## Error Handling

### Common Error Responses

**401 Unauthorized - Missing Token**
```json
{
  "error": "Authentication required",
  "message": "No authorization header provided"
}
```

**401 Unauthorized - Invalid Token**
```json
{
  "error": "Authentication failed",
  "message": "Invalid or expired token"
}
```

**403 Forbidden - Insufficient Permissions**
```json
{
  "error": "Forbidden",
  "message": "Access denied. Required role: admin"
}
```

**400 Bad Request - Missing Fields**
```json
{
  "error": "Missing required fields",
  "message": "Email and password are required"
}
```

## Security Considerations

### Token Storage
- **Access tokens** - Store in memory or sessionStorage (preferred for web apps)
- **Refresh tokens** - Store in httpOnly cookies (most secure) or localStorage
- Never expose tokens in URLs or logs

### Password Requirements
- Minimum length: 6 characters (increase in production)
- Hashed using bcrypt with 10 salt rounds
- Consider adding password complexity requirements

### Token Expiration
- Access tokens: 15 minutes (short-lived)
- Refresh tokens: 7 days (long-lived)
- Adjust based on security requirements

### HTTPS
- Always use HTTPS in production to prevent token interception
- JWT tokens are not encrypted, only signed

### Rate Limiting
- Consider implementing rate limiting on authentication endpoints
- Prevent brute force attacks on login

## Migration to Database

The current implementation uses in-memory storage. To migrate to a database:

1. Replace the `Map<string, User>` in authService.ts with database queries
2. Replace the `Set<string>` for refresh tokens with database table
3. Implement user table with columns: userId, email, password, name, role, company, createdAt, lastLogin
4. Implement refresh_tokens table with columns: token, userId, expiresAt, createdAt
5. Update all authService methods to use async database operations

Example database schema:

```sql
CREATE TABLE users (
  user_id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  company VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

CREATE TABLE refresh_tokens (
  token VARCHAR(512) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
```

## Protected Routes

All report routes now require authentication:

- `POST /api/reports` - Create report
- `GET /api/reports` - List reports
- `GET /api/reports/:id` - Get report
- `PATCH /api/reports/:id` - Update report
- `DELETE /api/reports/:id` - Delete report
- `POST /api/reports/:id/export` - Export report
- `GET /api/reports/stats` - Get statistics

Admin routes require both authentication and admin role:

- `DELETE /api/reports/cleanup/old` - Cleanup old reports
- `GET /api/admin/stats` - Admin statistics
- `POST /api/admin/cleanup` - Admin cleanup
- `GET /api/admin/health` - Health check (no auth required)

## Troubleshooting

### "Invalid or expired token" error
- Check if token has expired (access tokens expire after 15 minutes)
- Use refresh token to get new access token
- Verify JWT_SECRET matches between token generation and verification

### "No authorization header provided" error
- Ensure Authorization header is included: `Authorization: Bearer <token>`
- Check for typos in header name

### "Access denied. Required role: admin" error
- Endpoint requires admin role
- Login with admin user or use admin token

### Default users not created
- Check server startup logs for user creation messages
- Verify authService.initializeDefaultUsers() is called in index.ts

## Future Enhancements

- Email verification for new users
- Password reset via email
- Two-factor authentication (2FA)
- OAuth2/OpenID Connect integration
- Session management and revocation
- Audit logging for authentication events
- Account lockout after failed login attempts
- Password complexity requirements
- Token blacklisting for logout
