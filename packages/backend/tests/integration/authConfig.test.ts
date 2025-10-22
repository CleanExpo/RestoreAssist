/**
 * Integration Tests: GET /api/auth/config
 *
 * Tests for OAuth configuration validation endpoint
 *
 * Coverage:
 * - Valid configuration response
 * - Missing GOOGLE_CLIENT_ID
 * - Missing GOOGLE_CLIENT_SECRET
 * - Invalid CLIENT_ID format
 * - Response structure validation
 *
 * @module tests/integration/authConfig.test
 */

import { describe, it, expect, beforeAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Application } from 'express';
import { authRoutes } from '../../src/routes/authRoutes';

describe('GET /api/auth/config', () => {
  let app: Application;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create Express app with auth routes
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
  });

  afterEach(() => {
    // Restore original environment after each test
    process.env = { ...originalEnv };
  });

  it('should return valid config when all environment variables are set correctly', async () => {
    // Set valid environment variables (MOCK VALUES FOR TESTING)
    process.env.GOOGLE_CLIENT_ID = '123456789012-mock1234567890abcdefghijklmno.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'MOCK-test-secret-not-real-1234567890';
    process.env.ALLOWED_ORIGINS = 'http://localhost:5173,http://localhost:3000';

    const response = await request(app)
      .get('/api/auth/config')
      .expect('Content-Type', /json/)
      .expect(200);

    // Verify response structure
    expect(response.body).toHaveProperty('client_id');
    expect(response.body).toHaveProperty('is_valid');
    expect(response.body).toHaveProperty('allowed_origins');
    expect(response.body).toHaveProperty('errors');
    expect(response.body).toHaveProperty('warnings');
    expect(response.body).toHaveProperty('config_status');

    // Verify config is valid
    expect(response.body.is_valid).toBe(true);
    expect(response.body.config_status).toBe('ready');
    expect(response.body.errors).toHaveLength(0);

    // Verify Client ID is truncated for security
    expect(response.body.client_id).toMatch(/^123456789012-mock123.../);
    expect(response.body.client_id.length).toBeLessThan(50); // Truncated

    // Verify allowed origins
    expect(response.body.allowed_origins).toEqual([
      'http://localhost:5173',
      'http://localhost:3000',
    ]);
  });

  it('should return error when GOOGLE_CLIENT_ID is missing', async () => {
    // Remove GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = 'MOCK-test-secret-not-real-1234567890';

    const response = await request(app)
      .get('/api/auth/config')
      .expect('Content-Type', /json/)
      .expect(200);

    // Verify config is invalid
    expect(response.body.is_valid).toBe(false);
    expect(response.body.config_status).toBe('misconfigured');
    expect(response.body.errors).toHaveLength(1);
    expect(response.body.errors[0]).toContain('GOOGLE_CLIENT_ID is not set');
  });

  it('should return error when GOOGLE_CLIENT_SECRET is missing', async () => {
    // Set CLIENT_ID but remove SECRET
    process.env.GOOGLE_CLIENT_ID = '123456789012-mock1234567890abcdefghijklmno.apps.googleusercontent.com';
    delete process.env.GOOGLE_CLIENT_SECRET;

    const response = await request(app)
      .get('/api/auth/config')
      .expect('Content-Type', /json/)
      .expect(200);

    // Verify config is invalid
    expect(response.body.is_valid).toBe(false);
    expect(response.body.config_status).toBe('misconfigured');
    expect(response.body.errors).toHaveLength(1);
    expect(response.body.errors[0]).toContain('GOOGLE_CLIENT_SECRET is not set');
  });

  it('should return error when GOOGLE_CLIENT_ID has invalid format', async () => {
    // Set invalid CLIENT_ID format
    process.env.GOOGLE_CLIENT_ID = 'invalid-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'MOCK-test-secret-not-real-1234567890';

    const response = await request(app)
      .get('/api/auth/config')
      .expect('Content-Type', /json/)
      .expect(200);

    // Verify config is invalid
    expect(response.body.is_valid).toBe(false);
    expect(response.body.config_status).toBe('misconfigured');
    expect(response.body.errors.length).toBeGreaterThan(0);
    expect(response.body.errors[0]).toContain('GOOGLE_CLIENT_ID has invalid format');
  });

  it('should detect placeholder Client IDs', async () => {
    // Set placeholder CLIENT_ID that passes format check
    // (uses valid format but contains 'placeholder' keyword)
    process.env.GOOGLE_CLIENT_ID = '123456789012-placeholder.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'MOCK-test-secret-not-real-1234567890';

    const response = await request(app)
      .get('/api/auth/config')
      .expect('Content-Type', /json/)
      .expect(200);

    // Verify config is invalid
    expect(response.body.is_valid).toBe(false);
    expect(response.body.config_status).toBe('misconfigured');
    expect(response.body.errors.length).toBeGreaterThan(0);
    expect(response.body.errors[0]).toContain('placeholder');
  });

  it('should return error when GOOGLE_CLIENT_SECRET is too short', async () => {
    // Set valid CLIENT_ID but short SECRET
    process.env.GOOGLE_CLIENT_ID = '123456789012-mock1234567890abcdefghijklmno.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'tooshort';

    const response = await request(app)
      .get('/api/auth/config')
      .expect('Content-Type', /json/)
      .expect(200);

    // Verify config is invalid
    expect(response.body.is_valid).toBe(false);
    expect(response.body.config_status).toBe('misconfigured');
    expect(response.body.errors.length).toBeGreaterThan(0);
    expect(response.body.errors[0]).toContain('GOOGLE_CLIENT_SECRET appears invalid');
  });

  it('should handle missing ALLOWED_ORIGINS gracefully', async () => {
    // Set valid credentials but no ALLOWED_ORIGINS
    process.env.GOOGLE_CLIENT_ID = '123456789012-mock1234567890abcdefghijklmno.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'MOCK-test-secret-not-real-1234567890';
    delete process.env.ALLOWED_ORIGINS;

    const response = await request(app)
      .get('/api/auth/config')
      .expect('Content-Type', /json/)
      .expect(200);

    // Should still be valid (ALLOWED_ORIGINS is optional)
    expect(response.body.is_valid).toBe(true);
    expect(response.body.allowed_origins).toEqual([]);
  });

  it('should handle server errors gracefully', async () => {
    // Set environment to trigger potential errors
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const response = await request(app)
      .get('/api/auth/config')
      .expect('Content-Type', /json/)
      .expect(200); // Endpoint should not crash

    // Should return invalid config, not 500 error
    expect(response.body.is_valid).toBe(false);
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  it('should accumulate multiple errors when multiple configs are missing', async () => {
    // Remove both required credentials
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const response = await request(app)
      .get('/api/auth/config')
      .expect('Content-Type', /json/)
      .expect(200);

    // Should have errors for both CLIENT_ID and SECRET
    expect(response.body.is_valid).toBe(false);
    expect(response.body.errors).toHaveLength(2); // Reports both errors
    expect(response.body.errors[0]).toContain('GOOGLE_CLIENT_ID');
    expect(response.body.errors[1]).toContain('GOOGLE_CLIENT_SECRET');
  });

  it('should not expose full Client Secret in response', async () => {
    // Set valid credentials
    process.env.GOOGLE_CLIENT_ID = '123456789012-mock1234567890abcdefghijklmno.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'MOCK-very-secret-value-test-only-1234';

    const response = await request(app)
      .get('/api/auth/config')
      .expect('Content-Type', /json/)
      .expect(200);

    // Response should NOT include client_secret
    expect(response.body).not.toHaveProperty('client_secret');
    expect(JSON.stringify(response.body)).not.toContain('MOCK-very-secret');
  });

  it('should parse ALLOWED_ORIGINS comma-separated list correctly', async () => {
    // Set valid credentials with multiple origins
    process.env.GOOGLE_CLIENT_ID = '123456789012-mock1234567890abcdefghijklmno.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'MOCK-test-secret-not-real-1234567890';
    process.env.ALLOWED_ORIGINS = 'http://localhost:5173,http://localhost:3000,https://example.com';

    const response = await request(app)
      .get('/api/auth/config')
      .expect('Content-Type', /json/)
      .expect(200);

    // Verify origins are parsed correctly
    expect(response.body.allowed_origins).toEqual([
      'http://localhost:5173',
      'http://localhost:3000',
      'https://example.com',
    ]);
  });
});
