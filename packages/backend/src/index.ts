import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { reportRoutes } from './routes/reportRoutes';
import { adminRoutes } from './routes/adminRoutes';
import { exportRoutes } from './routes/exportRoutes';
import { authRoutes } from './routes/authRoutes';
import { integrationsRoutes } from './routes/integrationsRoutes';
import { googleDriveRoutes } from './routes/googleDriveRoutes';
import { skillsRoutes } from './routes/skillsRoutes';
import { authService } from './services/authService';
import { servicem8Service } from './services/integrations/servicem8Service';
import { googleDriveService } from './services/integrations/googleDriveService';
import { skillsService } from './services/skillsService';
import { errorHandler } from './middleware/errorHandler';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173']
}));
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/integrations/google-drive', googleDriveRoutes);
app.use('/api/skills', skillsRoutes);

// Error handling
app.use(errorHandler);

app.listen(PORT, async () => {
  console.log(`🚀 RestoreAssist Backend running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔧 Admin stats: http://localhost:${PORT}/api/admin/stats`);

  // Initialize default users
  await authService.initializeDefaultUsers();

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
    console.log(`⚠️  Anthropic Skills service initializing...`);
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
});
