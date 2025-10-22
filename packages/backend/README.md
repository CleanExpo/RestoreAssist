# RestoreAssist Backend

Express.js backend API for RestoreAssist disaster restoration documentation platform.

## Technology Stack

- **Node.js 20+** - JavaScript runtime
- **Express.js** - Web application framework
- **TypeScript** - Type-safe development
- **Prisma ORM** - Database toolkit
- **PostgreSQL** - Relational database
- **JWT** - Authentication tokens
- **Anthropic SDK** - Claude AI integration
- **Stripe SDK** - Payment processing
- **AWS SES** - Email service
- **Sharp** - Image processing
- **Sentry** - Error monitoring

## Setup Instructions

### Prerequisites

- Node.js 20.0.0 or higher
- npm 10.0.0 or higher
- PostgreSQL 14+ (optional, for production setup)

### Installation

1. Navigate to the backend directory:
   ```bash
   cd packages/backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Configure environment variables in `.env`

5. Set up database:
   ```bash
   # Generate Prisma client
   npm run db:generate
   
   # Run migrations
   npm run db:migrate
   
   # Seed database (optional)
   npm run db:seed
   ```

## Available Scripts

### Development
```bash
npm run dev           # Start development server with nodemon
npm run dev:debug     # Start with debugging enabled
```

### Build & Production
```bash
npm run build         # Build TypeScript to JavaScript
npm run start         # Start production server
```

### Database
```bash
npm run db:generate   # Generate Prisma client
npm run db:migrate    # Run database migrations
npm run db:push       # Push schema changes (dev only)
npm run db:seed       # Seed database with sample data
npm run db:studio     # Open Prisma Studio GUI
```

### Testing
```bash
npm run test          # Run unit tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage
```

### Code Quality
```bash
npm run lint          # Run ESLint
npm run lint:fix      # Fix linting errors
npm run format        # Format with Prettier
npm run type-check    # Run TypeScript checks
```

## API Documentation

### Authentication Endpoints

- **POST /api/auth/login** - User login with email/password
- **GET /api/auth/google** - Google OAuth login
- **POST /api/auth/refresh** - Refresh access token
- **POST /api/auth/logout** - Logout user

### Report Endpoints

- **GET /api/reports** - List all reports (with pagination)
- **GET /api/reports/:id** - Get specific report
- **POST /api/reports** - Create new report
- **PUT /api/reports/:id** - Update existing report
- **DELETE /api/reports/:id** - Delete report

### Integration Endpoints

- **POST /api/integrations/ascora/sync** - Sync with Ascora CRM
- **POST /api/integrations/servicem8/sync** - Sync with ServiceM8
- **POST /api/integrations/google-drive/upload** - Upload to Google Drive

### Webhook Endpoints

- **POST /api/webhooks/stripe** - Stripe payment webhooks

## Database Schema

### Core Tables

- **reports** - Restoration reports
- **organizations** - Company accounts
- **organization_members** - User-organization relationships
- **ascora_integrations** - Ascora CRM integration settings
- **ascora_jobs** - Synced Ascora jobs
- **ascora_customers** - Synced Ascora customers

### Enums

- **DamageType**: Water, Fire, Storm, Flood, Mould, Biohazard, Impact, Other
- **AustralianState**: NSW, VIC, QLD, WA, SA, TAS, ACT, NT

## Security Features

- Password hashing with bcrypt
- JWT tokens with expiration
- SQL injection prevention via Prisma
- Input validation and sanitisation
- Rate limiting
- CORS protection
- Environment variable validation
- Secure cookie handling

## Email Configuration

### Providers Supported
- SMTP (Gmail, Outlook, custom)
- SendGrid
- Resend
- AWS SES

## Stripe Integration

### Subscription Products
- Free Trial (7 days)
- Monthly Plan ($99/month)
- Yearly Plan ($990/year)

## Monitoring

### Sentry Configuration
Error tracking and performance monitoring with Sentry

### Health Check
GET /api/health endpoint for monitoring service health

## Support

For issues or questions, contact: support@restoreassist.com.au
