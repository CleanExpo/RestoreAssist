# RestoreAssist

[![Build Status](https://img.shields.io/github/workflow/status/restoreassist/restoreassist/CI)](https://github.com/restoreassist/restoreassist/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2-blue.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

## Overview

RestoreAssist is an AI-powered disaster restoration documentation platform that streamlines the creation of comprehensive restoration reports for insurance claims and project management. Built with cutting-edge AI technology powered by Claude from Anthropic, RestoreAssist transforms the traditionally time-consuming process of creating restoration documentation into a streamlined, efficient workflow.

## Features

### Core Features
- **AI-Powered Report Generation**: Leverage Claude AI to generate detailed restoration reports
- **Australian Standards Compliance**: Built-in compliance with Australian building codes and regulations
- **Multi-Damage Type Support**: Water, fire, storm, flood, mould, biohazard, and impact damage
- **Comprehensive Estimating**: Itemised cost estimates with labour and materials breakdown
- **Professional Documentation**: Generate authority to proceed documents and compliance notes

### Technical Features
- **Modern Architecture**: Microservices-based architecture with separate frontend and backend
- **Real-time Processing**: WebSocket support for real-time updates
- **Secure Authentication**: JWT-based authentication with refresh tokens
- **Google OAuth Integration**: Seamless sign-in with Google accounts
- **Stripe Payment Integration**: Subscription management and payment processing
- **Email Notifications**: SMTP, SendGrid, and Resend support
- **Error Monitoring**: Sentry integration for production error tracking
- **Database Flexibility**: Support for PostgreSQL with Prisma ORM
- **CRM Integrations**: ServiceM8 and Ascora CRM support

## Technology Stack

- **Frontend**: React 18.2, TypeScript 5.3, Vite, TailwindCSS 4.1, Radix UI
- **Backend**: Node.js 20+, Express.js, TypeScript, Prisma ORM
- **Database**: PostgreSQL with Prisma Accelerate
- **AI**: Anthropic Claude SDK
- **Authentication**: JWT, Google OAuth
- **Payments**: Stripe
- **Email**: SMTP/SendGrid/Resend/AWS SES
- **Monitoring**: Sentry
- **Testing**: Playwright, Jest

## Quick Start

Clone the repository and install dependencies:

```bash
git clone https://github.com/your-org/restoreassist.git
cd restoreassist
npm install
```

Copy and configure environment variables:

```bash
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
# Edit the .env files with your configuration
```

Start development servers:

```bash
npm run dev
# Frontend: http://localhost:5173
# Backend: http://localhost:3001
```

## Documentation

- [Frontend Documentation](packages/frontend/README.md)
- [Backend Documentation](packages/backend/README.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Environment Variables](ENV_VARIABLES.md)

## Project Structure

```
restoreassist/
├── packages/
│   ├── frontend/          # React frontend application
│   ├── backend/           # Express backend API
│   └── sdk/               # Shared SDK package
├── agents/                # Claude agent configurations
├── .claude/               # Claude-specific settings
├── ui/                    # UI component library (shadcn)
├── docs/                  # Additional documentation
└── tests/                 # E2E tests
```

## Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/your-org/restoreassist/issues)
- **Email Support**: support@restoreassist.com.au

## Licence

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**RestoreAssist** - Transforming disaster restoration documentation with AI

Copyright © 2025 RestoreAssist. All rights reserved.
