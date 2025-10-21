// Load environment variables first
import './config/env';

// Initialize Sentry BEFORE any other imports for proper instrumentation
import { Sentry } from './instrument';

import express from 'express';
import cors from 'cors';
import { reportRoutes } from './routes/reportRoutes';
import { adminRoutes } from './routes/adminRoutes';
import { exportRoutes } from './routes/exportRoutes';
import { authRoutes } from './routes/authRoutes';
import { integrationsRoutes } from './routes/integrationsRoutes';
import { googleDriveRoutes } from './routes/googleDriveRoutes';
import { skillsRoutes } from './routes/skillsRoutes';
import { trialAuthRoutes } from './routes/trialAuthRoutes';
import stripeRoutes from './routes/stripeRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';
// import { ascoraRoutes } from './routes/ascoraRoutes'; // TODO: Fix initialisation
import { authService } from './services/authService';
import { googleAuthService } from './services/googleAuthService';
import { paymentVerificationService } from './services/paymentVerification';
import { servicem8Service } from './services/integrations/servicem8Service';
import { googleDriveService } from './services/integrations/googleDriveService';
import { skillsService } from './services/skillsService';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
}));
app.options('*', cors()); // Enable pre-flight for all routes
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/trial-auth', trialAuthRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/integrations/google-drive', googleDriveRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/subscription', subscriptionRoutes);
// app.use('/api/organizations/:orgId/ascora', ascoraRoutes); // TODO: Fix initialisation

// Sentry error handling - MUST be before custom error handler
Sentry.setupExpressErrorHandler(app);

// Custom error handling
app.use(errorHandler);

// Initialise services (for both serverless and local) - with error handling
(async () => {
  console.log('🔍 [INIT] Starting server initialization...');
  try {
    console.log('🔍 [INIT] Calling initializeDefaultUsers()...');
    await authService.initializeDefaultUsers();
    console.log('✅ Default users initialized successfully');
    const userCount = authService.getUserCount();
    console.log(`🔍 [INIT] Total users in system: ${userCount}`);
  } catch (error) {
    console.error('⚠️ Failed to initialize default users:', error);
    // Continue anyway - don't crash the app
  }

  // For local development - start server AFTER user initialization
  if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
      console.log(`🚀 RestoreAssist Backend running on http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔧 Admin stats: http://localhost:${PORT}/api/admin/stats`);

  // Check ServiceM8 integration status
  if (servicem8Service.isEnabled()) {
    console.log(`✅ ServiceM8 integration enabled`);
  } else {
    console.log(`⚠️  ServiceM8 integration disabled (configure SERVICEM8_API_KEY and SERVICEM8_DOMAIN)`);
  }

  // Check Google Drive integration status
  if (googleDriveService.isEnabled()) {
    console.log(`✅ Google Drive integration enabled`);
  } else {
    console.log(`⚠️  Google Drive integration disabled (configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)`);
  }

  // Check Skills service status
  if (skillsService.isReady()) {
    const stats = skillsService.getSkillStats();
    console.log(`✅ Anthropic Skills service ready (${stats.enabledSkills}/${stats.totalSkills} skills enabled)`);
  } else {
    console.log(`⚠️  Anthropic Skills service initialising...`);
  }

  // Check Google Auth service status
  if (googleAuthService.isConfigured()) {
    console.log(`✅ Google OAuth integration enabled`);
  } else {
    console.log(`⚠️  Google OAuth integration disabled (configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)`);
  }

  // Check Payment Verification service status
  if (paymentVerificationService.isConfigured()) {
    console.log(`✅ Stripe payment verification enabled`);
  } else {
    console.log(`⚠️  Stripe payment verification disabled (configure STRIPE_SECRET_KEY)`);
  }

  console.log(`\n📋 API Endpoints:`);
  console.log(`\n🔐 Authentication:`);
  console.log(`   POST   /api/auth/login                 # Login user`);
  console.log(`   POST   /api/auth/refresh               # Refresh access token`);
  console.log(`   POST   /api/auth/logout                # Logout user`);
  console.log(`   GET    /api/auth/me                    # Get current user`);
  console.log(`   POST   /api/auth/register              # Register user (admin only)`);
  console.log(`   POST   /api/auth/change-password       # Change password`);
  console.log(`   GET    /api/auth/users                 # List users (admin only)`);
  console.log(`   DELETE /api/auth/users/:userId         # Delete user (admin only)`);
  console.log(`\n📝 Reports:`);
  console.log(`   POST   /api/reports                    # Create report`);
  console.log(`   GET    /api/reports                    # List reports (paginated)`);
  console.log(`   GET    /api/reports/:id                # Get single report`);
  console.log(`   PATCH  /api/reports/:id                # Update report`);
  console.log(`   DELETE /api/reports/:id                # Delete report`);
  console.log(`   POST   /api/reports/:id/export         # Export report (DOCX/PDF)`);
  console.log(`   GET    /api/reports/stats              # Statistics`);
  console.log(`   DELETE /api/reports/cleanup/old        # Cleanup old reports`);
  console.log(`\n📄 Exports:`);
  console.log(`   GET    /api/exports/:fileName          # Download exported file`);
  console.log(`\n⚙️  Admin:`);
  console.log(`   GET    /api/admin/stats                # Admin stats`);
  console.log(`   POST   /api/admin/cleanup              # Admin cleanup`);
  console.log(`   GET    /api/admin/health               # Health check`);
  console.log(`\n🔗 Integrations:`);
  console.log(`   GET    /api/integrations               # List all integrations`);
  console.log(`\n🔗 ServiceM8:`);
  console.log(`   GET    /api/integrations/servicem8/status      # ServiceM8 status`);
  console.log(`   GET    /api/integrations/servicem8/jobs        # List ServiceM8 jobs`);
  console.log(`   POST   /api/integrations/servicem8/jobs/:id/sync  # Sync report to job`);
  console.log(`   GET    /api/integrations/servicem8/stats       # Integration stats`);
  console.log(`\n☁️  Google Drive:`);
  console.log(`   GET    /api/integrations/google-drive/status  # Google Drive status`);
  console.log(`   GET    /api/integrations/google-drive/auth    # Get OAuth URL`);
  console.log(`   POST   /api/integrations/google-drive/reports/:id/save  # Save report to Drive`);
  console.log(`   GET    /api/integrations/google-drive/files   # List Drive files`);
  console.log(`   GET    /api/integrations/google-drive/stats   # Drive stats`);
  console.log(`\n🎯 Skills:`);
  console.log(`   GET    /api/skills                     # List all skills`);
  console.log(`   GET    /api/skills/stats               # Skill statistics (admin)`);
  console.log(`   GET    /api/skills/:skillName          # Get skill metadata`);
  console.log(`   PATCH  /api/skills/:skillName/enable   # Enable/disable skill (admin)`);
  console.log(`   GET    /api/skills/health/status       # Skills health check`);
  console.log(`\n🎟️  Free Trial Auth:`);
  console.log(`   POST   /api/trial-auth/google-login    # Google OAuth login`);
  console.log(`   POST   /api/trial-auth/refresh-token   # Refresh access token`);
  console.log(`   POST   /api/trial-auth/logout          # Logout user`);
  console.log(`   GET    /api/trial-auth/me              # Get current user`);
  console.log(`   POST   /api/trial-auth/activate-trial  # Activate free trial`);
  console.log(`   GET    /api/trial-auth/trial-status    # Get trial status`);
  console.log(`   POST   /api/trial-auth/verify-payment  # Verify payment method`);
  console.log(`   GET    /api/trial-auth/health          # Health check`);
    // console.log(`\n🔗 Ascora CRM: (TODO: Fix initialisation)`);
    // console.log(`   POST   /api/organizations/:orgId/ascora/connect         # Connect to Ascora`);
    });
  }
})();

// Export for Vercel serverless
export default app;
