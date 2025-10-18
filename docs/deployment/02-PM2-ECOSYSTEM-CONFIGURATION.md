# PM2 Ecosystem Configuration - RestoreAssist

Complete production-grade PM2 process manager configuration for RestoreAssist deployment.

---

## Overview

PM2 manages Node.js processes in production with features including:
- Automatic restarts on crashes
- Zero-downtime reloads
- Clustering for performance
- Log management and rotation
- Memory/CPU monitoring
- Health checks and alerts

---

## Prerequisites

- Node.js 20+ installed
- PM2 installed globally: `npm install -g pm2`
- RestoreAssist built and ready to deploy
- Environment variables configured

---

## 1. PM2 Ecosystem Configuration File

### Location
Create at project root: `ecosystem.config.js`

### Complete Configuration

```javascript
module.exports = {
  apps: [
    {
      // Backend API Server
      name: 'restoreassist-backend',
      script: './packages/backend/dist/server.js',
      cwd: './packages/backend',
      instances: 2, // Use 2 instances for load balancing
      exec_mode: 'cluster',

      // Environment variables
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        USE_POSTGRES: 'true',
        LOG_LEVEL: 'info'
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3001,
        USE_POSTGRES: 'true',
        LOG_LEVEL: 'debug'
      },

      // Auto-restart configuration
      watch: false, // Don't watch in production
      max_memory_restart: '500M', // Restart if memory exceeds 500MB
      min_uptime: '10s', // Consider app online after 10s
      max_restarts: 10, // Max restart attempts
      restart_delay: 4000, // Wait 4s between restarts

      // Exponential backoff restart delay
      exp_backoff_restart_delay: 100,

      // Logging
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true, // Prefix logs with timestamp
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Process management
      kill_timeout: 5000, // Time to wait before force kill (5s)
      wait_ready: true, // Wait for 'ready' event
      listen_timeout: 10000, // Timeout for 'ready' event
      shutdown_with_message: true,

      // Health checks
      health_check_interval: 30000, // Check every 30s
      health_check_grace_period: 10000, // Grace period 10s

      // Advanced features
      autorestart: true,
      vizion: false, // Disable git metadata
      post_update: ['npm install', 'npm run build'],

      // Source map support
      source_map_support: true,

      // Crash detection
      min_crash_time: 5000, // Min time before considering crash

      // Instance variables (available as env vars)
      instance_var: 'INSTANCE_ID'
    },

    {
      // Frontend Static Server (Nginx alternative)
      name: 'restoreassist-frontend',
      script: 'npx',
      args: 'serve -s dist -l 5173',
      cwd: './packages/frontend',
      instances: 1,
      exec_mode: 'fork', // Single instance for static files

      env_production: {
        NODE_ENV: 'production'
      },
      env_staging: {
        NODE_ENV: 'staging'
      },

      // Auto-restart configuration
      watch: false,
      max_memory_restart: '200M',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,

      // Logging
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_file: './logs/frontend-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Process management
      kill_timeout: 3000,
      autorestart: true,
      vizion: false
    }
  ],

  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['production-server-1.example.com', 'production-server-2.example.com'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/restoreassist.git',
      path: '/var/www/restoreassist',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt-get update && apt-get install -y git',
      'post-setup': 'npm install && npm run build',
      env: {
        NODE_ENV: 'production'
      }
    },

    staging: {
      user: 'deploy',
      host: 'staging-server.example.com',
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/restoreassist.git',
      path: '/var/www/restoreassist-staging',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env staging',
      env: {
        NODE_ENV: 'staging'
      }
    }
  }
};
```

---

## 2. Process Management Commands

### Starting Applications

```bash
# Start all apps with production environment
pm2 start ecosystem.config.js --env production

# Start specific app
pm2 start ecosystem.config.js --only restoreassist-backend --env production

# Start with staging environment
pm2 start ecosystem.config.js --env staging
```

### Stopping Applications

```bash
# Stop all apps
pm2 stop all

# Stop specific app
pm2 stop restoreassist-backend

# Stop and delete from PM2 list
pm2 delete restoreassist-backend
pm2 delete all
```

### Restarting Applications

```bash
# Restart all apps
pm2 restart all

# Restart specific app
pm2 restart restoreassist-backend

# Graceful reload (zero-downtime for cluster mode)
pm2 reload all
pm2 reload restoreassist-backend

# Restart with new environment
pm2 restart ecosystem.config.js --env production --update-env
```

### Reloading Configuration

```bash
# Reload ecosystem config
pm2 reload ecosystem.config.js --env production

# Start or reload (idempotent)
pm2 startOrReload ecosystem.config.js --env production
```

---

## 3. Monitoring and Logs

### Real-time Monitoring

```bash
# Dashboard with metrics
pm2 monit

# List all processes
pm2 list
pm2 ls

# Detailed process info
pm2 show restoreassist-backend

# Process metrics
pm2 describe restoreassist-backend
```

### Log Management

```bash
# View logs in real-time
pm2 logs

# View specific app logs
pm2 logs restoreassist-backend

# View last N lines
pm2 logs --lines 100

# View only errors
pm2 logs --err

# Clear all logs
pm2 flush

# Reload all logs
pm2 reloadLogs
```

### Log Rotation Setup

```bash
# Install PM2 log rotate module
pm2 install pm2-logrotate

# Configure rotation
pm2 set pm2-logrotate:max_size 10M          # Rotate when 10MB
pm2 set pm2-logrotate:retain 30             # Keep 30 files
pm2 set pm2-logrotate:compress true         # Compress rotated logs
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD # Date format
pm2 set pm2-logrotate:rotateModule true     # Rotate PM2 module logs
pm2 set pm2-logrotate:workerInterval 30     # Check every 30 seconds
pm2 set pm2-logrotate:rotateInterval '0 0 * * *' # Daily at midnight
```

---

## 4. Startup and Persistence

### Save Process List

```bash
# Save current process list
pm2 save

# Save and freeze process list
pm2 save --force
```

### Auto-start on Server Reboot

```bash
# Generate startup script (run as root or with sudo)
pm2 startup

# For systemd (Ubuntu/Debian/CentOS 7+)
pm2 startup systemd -u deploy --hp /home/deploy

# For other init systems
pm2 startup upstart -u deploy --hp /home/deploy  # Ubuntu 14.04
pm2 startup launchd -u deploy --hp /home/deploy  # macOS
pm2 startup rcd -u deploy --hp /home/deploy      # FreeBSD

# After running startup command, save process list
pm2 save

# Disable startup script
pm2 unstartup systemd
```

### Startup Script Verification

```bash
# Check startup script status
systemctl status pm2-deploy

# Test startup manually
sudo systemctl start pm2-deploy
sudo systemctl stop pm2-deploy

# View startup logs
journalctl -u pm2-deploy -f
```

---

## 5. Health Checks and Monitoring

### Built-in Health Checks

PM2 automatically monitors:
- Process uptime
- Memory usage
- CPU usage
- Restart count
- Event loop latency

### Custom Health Check Endpoint

Create health check script: `scripts/health-check.js`

```javascript
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/health',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    console.log('✅ Backend healthy');
    process.exit(0);
  } else {
    console.error(`❌ Backend unhealthy: HTTP ${res.statusCode}`);
    process.exit(1);
  }
});

req.on('error', (error) => {
  console.error('❌ Backend unreachable:', error.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('❌ Backend timeout');
  req.destroy();
  process.exit(1);
});

req.end();
```

### Automated Health Monitoring

Add to crontab: `crontab -e`

```bash
# Check backend health every 5 minutes
*/5 * * * * /usr/bin/node /var/www/restoreassist/scripts/health-check.js >> /var/log/restoreassist-health.log 2>&1

# Restart if unhealthy (more aggressive)
*/5 * * * * /usr/bin/node /var/www/restoreassist/scripts/health-check.js || pm2 restart restoreassist-backend
```

---

## 6. Clustering and Load Balancing

### Cluster Mode Benefits

- Automatic load balancing across CPU cores
- Zero-downtime reloads
- Increased throughput
- Fault tolerance (one instance crashes, others continue)

### Cluster Configuration

```javascript
// In ecosystem.config.js
{
  name: 'restoreassist-backend',
  instances: 'max', // Use all CPU cores
  exec_mode: 'cluster'
}

// Or specific number
{
  instances: 4, // Use 4 instances
  exec_mode: 'cluster'
}
```

### Scaling Commands

```bash
# Scale to specific number of instances
pm2 scale restoreassist-backend 4

# Scale up by N instances
pm2 scale restoreassist-backend +2

# Scale down by N instances
pm2 scale restoreassist-backend -1

# Reset to ecosystem config
pm2 reload ecosystem.config.js
```

### Load Balancing Strategy

PM2 uses **round-robin** by default. For custom load balancing:

```javascript
// In ecosystem.config.js
{
  instance_var: 'INSTANCE_ID',
  increment_var: 'PORT', // Each instance gets unique port
  env: {
    PORT: 3001 // Base port, PM2 increments (3001, 3002, 3003...)
  }
}
```

---

## 7. Memory and CPU Management

### Memory Limits

```javascript
// In ecosystem.config.js
{
  max_memory_restart: '500M', // Restart if exceeds 500MB
  // or
  max_memory_restart: '1G' // Restart if exceeds 1GB
}
```

### CPU Affinity

```bash
# Bind process to specific CPU cores
pm2 start app.js --cpu-affinity 0,1,2,3

# Or in ecosystem.config.js (Linux only)
{
  exec_mode: 'cluster',
  instances: 4,
  node_args: '--cpu-prof' // Enable CPU profiling
}
```

### Memory Leak Detection

```bash
# Monitor memory usage
pm2 monit

# Get memory snapshot
pm2 describe restoreassist-backend | grep memory

# Heap dump (requires heapdump module)
pm2 trigger restoreassist-backend heapdump
```

---

## 8. Environment Management

### Environment-Specific Configs

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'restoreassist-backend',
    script: './dist/server.js',

    // Development
    env_development: {
      NODE_ENV: 'development',
      PORT: 3001,
      USE_POSTGRES: 'false',
      LOG_LEVEL: 'debug'
    },

    // Staging
    env_staging: {
      NODE_ENV: 'staging',
      PORT: 3001,
      USE_POSTGRES: 'true',
      DATABASE_URL: process.env.STAGING_DATABASE_URL,
      LOG_LEVEL: 'debug'
    },

    // Production
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
      USE_POSTGRES: 'true',
      DATABASE_URL: process.env.PRODUCTION_DATABASE_URL,
      LOG_LEVEL: 'info'
    }
  }]
};
```

### Switching Environments

```bash
# Start with specific environment
pm2 start ecosystem.config.js --env production
pm2 start ecosystem.config.js --env staging
pm2 start ecosystem.config.js --env development

# Restart with new environment
pm2 restart ecosystem.config.js --env production --update-env

# Update environment variables without restart
pm2 env <process_id>
```

---

## 9. Advanced Features

### Graceful Shutdown

```javascript
// In your server.js
process.on('SIGINT', async () => {
  console.log('🛑 Graceful shutdown initiated...');

  // Close server
  await server.close();

  // Close database connections
  await db.disconnect();

  // Close other resources
  await redis.quit();

  console.log('✅ Graceful shutdown complete');
  process.exit(0);
});

// PM2 ready signal
if (process.send) {
  process.send('ready');
}
```

### Process Events

```javascript
// ecosystem.config.js
{
  name: 'restoreassist-backend',

  // Lifecycle scripts
  pre_start: 'node scripts/pre-start.js',
  post_start: 'node scripts/post-start.js',
  pre_stop: 'node scripts/pre-stop.js',
  post_stop: 'node scripts/post-stop.js',

  // Wait for ready signal
  wait_ready: true,
  listen_timeout: 10000
}
```

### PM2 Modules

```bash
# Install useful modules
pm2 install pm2-logrotate        # Log rotation
pm2 install pm2-server-monit     # Server monitoring
pm2 install pm2-auto-pull        # Auto git pull
pm2 install @pm2/io             # PM2 Plus integration

# List installed modules
pm2 module:list

# Update modules
pm2 module:update pm2-logrotate

# Uninstall modules
pm2 module:uninstall pm2-logrotate
```

---

## 10. Deployment Workflows

### Initial Deployment

```bash
#!/bin/bash
# deploy-initial.sh

set -e

echo "🚀 Initial RestoreAssist Deployment"

# 1. Pull latest code
cd /var/www/restoreassist
git pull origin main

# 2. Install dependencies
npm install

# 3. Build application
npm run build

# 4. Start with PM2
pm2 start ecosystem.config.js --env production

# 5. Save process list
pm2 save

# 6. Setup startup script
pm2 startup systemd -u deploy --hp /home/deploy

echo "✅ Initial deployment complete"
pm2 status
```

### Standard Deployment

```bash
#!/bin/bash
# deploy.sh

set -e

echo "🚀 Deploying RestoreAssist"

# 1. Pull latest code
cd /var/www/restoreassist
git pull origin main

# 2. Install dependencies
npm install

# 3. Build application
npm run build

# 4. Reload PM2 (zero-downtime)
pm2 reload ecosystem.config.js --env production

# 5. Save process list
pm2 save

echo "✅ Deployment complete"
pm2 status
```

### Rollback Deployment

```bash
#!/bin/bash
# rollback.sh

set -e

echo "🔄 Rolling back RestoreAssist"

# 1. Get previous commit
cd /var/www/restoreassist
PREVIOUS_COMMIT=$(git rev-parse HEAD~1)

# 2. Checkout previous version
git checkout $PREVIOUS_COMMIT

# 3. Install dependencies
npm install

# 4. Build application
npm run build

# 5. Reload PM2
pm2 reload ecosystem.config.js --env production

# 6. Save process list
pm2 save

echo "✅ Rollback to $PREVIOUS_COMMIT complete"
pm2 status
```

---

## 11. Monitoring and Alerts

### PM2 Plus (Optional - Premium Service)

```bash
# Link to PM2 Plus
pm2 link <secret_key> <public_key>

# Features include:
# - Real-time dashboard
# - Custom metrics
# - Exception tracking
# - Transaction tracing
# - Alerting system
```

### Custom Monitoring Script

Create `scripts/monitor.js`:

```javascript
const pm2 = require('pm2');

pm2.connect((err) => {
  if (err) {
    console.error(err);
    process.exit(2);
  }

  setInterval(() => {
    pm2.list((err, processes) => {
      if (err) {
        console.error('Error fetching processes:', err);
        return;
      }

      processes.forEach((proc) => {
        const { name, pm2_env } = proc;
        const { status, restart_time, unstable_restarts, memory, cpu } = pm2_env;

        console.log(`
📊 ${name}:
  Status: ${status}
  Restarts: ${restart_time}
  Unstable Restarts: ${unstable_restarts}
  Memory: ${Math.round(memory / 1024 / 1024)}MB
  CPU: ${cpu}%
        `);

        // Alert if too many restarts
        if (unstable_restarts > 5) {
          console.error(`⚠️  ${name} has ${unstable_restarts} unstable restarts!`);
          // Send alert (email, Slack, etc.)
        }

        // Alert if high memory
        if (memory > 500 * 1024 * 1024) {
          console.error(`⚠️  ${name} using ${Math.round(memory / 1024 / 1024)}MB!`);
        }
      });
    });
  }, 60000); // Check every minute
});
```

Run monitoring:

```bash
# Run as background process
node scripts/monitor.js &

# Or as PM2 process
pm2 start scripts/monitor.js --name restoreassist-monitor
```

---

## 12. Troubleshooting

### Common Issues

#### Issue 1: Process Won't Start

```bash
# Check logs
pm2 logs restoreassist-backend --lines 50

# Check for port conflicts
netstat -tulpn | grep 3001
lsof -i :3001

# Verify environment variables
pm2 env 0

# Try starting manually
cd packages/backend
node dist/server.js
```

#### Issue 2: High Memory Usage

```bash
# Check memory usage
pm2 monit

# Reduce instances
pm2 scale restoreassist-backend 2

# Set memory limit
pm2 restart restoreassist-backend --max-memory-restart 400M

# Heap snapshot
pm2 trigger restoreassist-backend heapdump
```

#### Issue 3: Too Many Restarts

```bash
# Check restart count
pm2 show restoreassist-backend | grep restart

# View logs for errors
pm2 logs restoreassist-backend --err --lines 100

# Reset restart counter
pm2 reset restoreassist-backend

# Increase restart delay
# In ecosystem.config.js:
{
  restart_delay: 10000, // 10 seconds
  max_restarts: 5
}
```

#### Issue 4: PM2 Not Starting on Boot

```bash
# Verify startup script exists
systemctl status pm2-deploy

# Reinstall startup script
pm2 unstartup systemd
pm2 startup systemd -u deploy --hp /home/deploy
pm2 save

# Check systemd logs
journalctl -u pm2-deploy -f

# Manual start for debugging
sudo systemctl start pm2-deploy
```

#### Issue 5: Logs Not Rotating

```bash
# Check pm2-logrotate status
pm2 describe pm2-logrotate

# Reinstall pm2-logrotate
pm2 module:uninstall pm2-logrotate
pm2 install pm2-logrotate

# Configure rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true

# Manual log clear
pm2 flush
```

---

## 13. Performance Optimization

### Cluster Mode Best Practices

```javascript
// ecosystem.config.js
{
  instances: 'max', // Use all CPU cores
  exec_mode: 'cluster',

  // Optimize for performance
  max_memory_restart: '1G', // Higher limit for better performance
  min_uptime: '60s', // Longer uptime before considering stable

  // Node.js optimizations
  node_args: [
    '--max-old-space-size=2048', // Increase heap size
    '--optimize-for-size',        // Memory optimization
    '--gc-interval=100'           // Garbage collection interval
  ]
}
```

### Load Testing

```bash
# Install autocannon for load testing
npm install -g autocannon

# Test backend performance
autocannon -c 100 -d 30 http://localhost:3001/api/health

# Test with PM2 cluster
pm2 scale restoreassist-backend 4
autocannon -c 100 -d 30 http://localhost:3001/api/health
```

---

## 14. Security Best Practices

### Process User

```bash
# Run PM2 as non-root user
sudo useradd -m -s /bin/bash deploy
sudo su - deploy

# Install PM2 for deploy user
npm install -g pm2

# Setup startup as deploy user
pm2 startup systemd -u deploy --hp /home/deploy
```

### Environment Variable Security

```javascript
// ecosystem.config.js - DO NOT commit secrets
{
  env_production: {
    NODE_ENV: 'production',
    // Load from environment, not hardcoded
    DATABASE_URL: process.env.DATABASE_URL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    JWT_SECRET: process.env.JWT_SECRET
  }
}
```

Load secrets from file:

```bash
# Create secure env file
sudo nano /etc/restoreassist/production.env
# Set permissions
sudo chmod 600 /etc/restoreassist/production.env
sudo chown deploy:deploy /etc/restoreassist/production.env

# Load before starting PM2
source /etc/restoreassist/production.env
pm2 start ecosystem.config.js --env production
```

---

## 15. Success Criteria Checklist

### Pre-Deployment
- [ ] PM2 installed globally: `pm2 --version`
- [ ] ecosystem.config.js created and configured
- [ ] Log directories created with correct permissions
- [ ] Environment variables configured
- [ ] Application builds successfully
- [ ] Health check endpoint working

### Initial Setup
- [ ] Processes start successfully: `pm2 start ecosystem.config.js --env production`
- [ ] All apps show status "online": `pm2 list`
- [ ] Health checks passing
- [ ] Logs writing correctly: `pm2 logs`
- [ ] Process list saved: `pm2 save`
- [ ] Startup script configured: `pm2 startup`

### Production Readiness
- [ ] Cluster mode enabled with 2+ instances
- [ ] Memory limits configured appropriately
- [ ] Log rotation installed and configured
- [ ] Auto-restart on boot tested
- [ ] Graceful shutdown implemented
- [ ] Health monitoring in place
- [ ] Deployment scripts tested
- [ ] Rollback procedure verified

### Monitoring
- [ ] PM2 monitoring dashboard accessible: `pm2 monit`
- [ ] Logs accessible and rotating properly
- [ ] Process metrics being tracked
- [ ] Alert system configured (if applicable)
- [ ] Uptime monitored
- [ ] Resource usage within limits

---

## Quick Reference Commands

```bash
# Start
pm2 start ecosystem.config.js --env production

# Stop
pm2 stop all

# Restart (with downtime)
pm2 restart all

# Reload (zero-downtime)
pm2 reload all

# Logs
pm2 logs
pm2 logs restoreassist-backend --lines 100

# Monitoring
pm2 monit
pm2 list
pm2 show restoreassist-backend

# Save & Startup
pm2 save
pm2 startup systemd -u deploy --hp /home/deploy

# Scaling
pm2 scale restoreassist-backend 4

# Cleanup
pm2 delete all
pm2 flush
pm2 reset all
```

---

**Next Guide**: [03-ENVIRONMENT-VALIDATION.md](./03-ENVIRONMENT-VALIDATION.md) - Environment variable validation system

---

**PM2 Resources**:
- Official Docs: https://pm2.keymetrics.io/docs/usage/quick-start/
- PM2 Plus: https://pm2.io/
- GitHub: https://github.com/Unitech/pm2
