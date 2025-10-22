# RestoreAssist Deployment Guide

Comprehensive guide for deploying RestoreAssist to production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Preparation](#environment-preparation)
- [Database Setup](#database-setup)
- [Application Deployment](#application-deployment)
- [Docker Deployment](#docker-deployment)
- [Manual Deployment](#manual-deployment)
- [Nginx Configuration](#nginx-configuration)
- [SSL Certificate Setup](#ssl-certificate-setup)
- [Post-Deployment](#post-deployment)
- [Monitoring](#monitoring)

## Prerequisites

### Server Requirements
- **OS**: Ubuntu 20.04 LTS or newer
- **RAM**: Minimum 4GB (8GB recommended)
- **CPU**: 2+ cores
- **Storage**: 20GB+ available space
- **Network**: Public IP address
- **Domain**: Configured domain name

### Software Requirements
- Node.js 20 LTS
- PostgreSQL 14+
- Nginx
- PM2 (for process management)
- Git
- Docker (optional)

## Environment Preparation

### 1. Update System
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential
```

### 2. Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. Install PostgreSQL
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### 4. Install PM2
```bash
sudo npm install -g pm2
pm2 startup systemd
```

### 5. Install Nginx
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

## Database Setup

### 1. Create Database User
```sql
CREATE USER restoreassist WITH PASSWORD 'secure_password';
CREATE DATABASE restoreassist_prod OWNER restoreassist;
GRANT ALL PRIVILEGES ON DATABASE restoreassist_prod TO restoreassist;
```

### 2. Configure PostgreSQL
Edit postgresql.conf for production settings.

### 3. Run Migrations
```bash
cd packages/backend
NODE_ENV=production npm run db:migrate
```

## Application Deployment

### 1. Clone Repository
```bash
cd /var/www
sudo git clone https://github.com/your-org/restoreassist.git
cd restoreassist
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
- Copy .env.example files
- Configure production values
- Set secure secrets

### 4. Build Applications
```bash
npm run build
```

## Docker Deployment

### Using Docker Compose
```bash
docker-compose up -d
docker-compose logs -f
```

## Manual Deployment with PM2

### PM2 Configuration
```javascript
module.exports = {
  apps: [{
    name: 'restoreassist-backend',
    script: './packages/backend/dist/index.js',
    instances: 'max',
    exec_mode: 'cluster'
  }]
};
```

### Start Services
```bash
pm2 start ecosystem.config.js
pm2 save
```

## Nginx Configuration

### Site Configuration
```nginx
server {
    listen 80;
    server_name restoreassist.com.au;

    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/restoreassist /etc/nginx/sites-enabled/
sudo systemctl reload nginx
```

## SSL Certificate Setup

### Using Certbot
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d restoreassist.com.au
```

## Post-Deployment

### 1. Verify Services
- Check backend health: /api/health
- Check frontend access
- Verify database connectivity

### 2. Set Up Monitoring
- Configure PM2 monitoring
- Set up log rotation
- Enable Sentry error tracking

### 3. Configure Firewall
```bash
sudo ufw allow 22,80,443/tcp
sudo ufw enable
```

### 4. Set Up Backups
- Database backups with pg_dump
- Application backups
- Schedule with cron

## Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] SSL certificates installed
- [ ] Firewall configured
- [ ] Monitoring set up
- [ ] Backups configured
- [ ] Error tracking configured
- [ ] Rate limiting enabled
- [ ] CORS configured
- [ ] Security headers set
- [ ] Email service configured
- [ ] Payment processing configured

## Monitoring

### Application Monitoring
```bash
pm2 monit
pm2 logs
pm2 status
```

### System Monitoring
- CPU/Memory: htop
- Disk usage: df -h
- Network: netstat -tulpn

## Troubleshooting

### Common Issues

1. **Application Won't Start**
   - Check PM2 logs
   - Verify port availability
   - Check environment variables

2. **Database Connection Issues**
   - Verify PostgreSQL is running
   - Check connection string
   - Review database logs

3. **High Memory Usage**
   - Restart with memory limits
   - Check for memory leaks
   - Scale horizontally

## Support

For deployment assistance, contact: devops@restoreassist.com.au
