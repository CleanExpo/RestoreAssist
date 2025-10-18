import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { reportRoutes } from './routes/reportRoutes';
import { adminRoutes } from './routes/adminRoutes';
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

app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 RestoreAssist Backend running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔧 Admin stats: http://localhost:${PORT}/api/admin/stats`);
  console.log(`\n📋 API Endpoints:`);
  console.log(`   POST   /api/reports                    # Create report`);
  console.log(`   GET    /api/reports                    # List reports (paginated)`);
  console.log(`   GET    /api/reports/:id                # Get single report`);
  console.log(`   PATCH  /api/reports/:id                # Update report`);
  console.log(`   DELETE /api/reports/:id                # Delete report`);
  console.log(`   GET    /api/reports/stats              # Statistics`);
  console.log(`   DELETE /api/reports/cleanup/old        # Cleanup old reports`);
  console.log(`   GET    /api/admin/stats                # Admin stats`);
  console.log(`   POST   /api/admin/cleanup              # Admin cleanup`);
  console.log(`   GET    /api/admin/health               # Health check`);
});
