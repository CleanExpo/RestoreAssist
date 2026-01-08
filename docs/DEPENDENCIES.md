# RestoreAssist Dependencies Reference

Complete list of all npm dependencies with versions and purposes.

## Core Dependencies

### Framework & Runtime
- **next**: 15.0.0 - Next.js framework (DO NOT upgrade to 16.x - breaks next-auth)
- **react**: 19.2.0 - React library (compatible with Next.js 15.0.0)
- **react-dom**: 19.2.0 - React DOM library

### Authentication & Sessions
- **next-auth**: ^4.24.11 - NextAuth.js for authentication
- **@auth/prisma-adapter**: ^2.11.0 - Prisma adapter for NextAuth

### Database & ORM
- **@prisma/client**: ^6.1.0 - Prisma ORM client
- **prisma**: ^6.1.0 - Prisma CLI (dev dependency)
- **pg**: ^8.16.3 - PostgreSQL client

### Payments
- **stripe**: ^19.1.0 - Stripe SDK
- **@stripe/stripe-js**: ^8.1.0 - Stripe.js library

### AI & LLM Services
- **@anthropic-ai/sdk**: ^0.67.0 - Claude API
- **@google/generative-ai**: ^0.21.0 - Google Generative AI
- **openai**: ^4.104.0 - OpenAI API

### Cloud & Storage
- **@supabase/supabase-js**: ^2.86.0 - Supabase client
- **firebase**: ^12.7.0 - Firebase SDK
- **firebase-admin**: ^13.6.0 - Firebase Admin SDK
- **cloudinary**: ^2.8.0 - Cloudinary image management
- **googleapis**: ^166.0.0 - Google APIs client

### UI Components & Styling
- **@radix-ui/***: 1.x-2.x - Accessible UI components
- **tailwindcss**: ^4.1.9 - Utility-first CSS framework
- **@tailwindcss/typography**: ^0.5.19 - Typography plugin
- **tailwind-merge**: ^2.5.5 - Merge Tailwind classes
- **tailwindcss-animate**: ^1.0.7 - Animation plugin
- **class-variance-authority**: ^0.7.1 - Component variants
- **clsx**: ^2.1.1 - Class name utilities

### UI Libraries
- **lucide-react**: ^0.454.0 - Icon library
- **sonner**: ^1.7.4 - Toast notifications
- **framer-motion**: ^12.23.24 - Animation library
- **embla-carousel-react**: 8.5.1 - Carousel component
- **recharts**: ^3.3.0 - Charts library
- **react-hot-toast**: ^2.6.0 - Toast notifications
- **react-markdown**: ^10.1.0 - Markdown renderer
- **react-resizable-panels**: ^2.1.7 - Resizable panels
- **vaul**: ^0.9.9 - Drawer component

### Form Handling
- **react-hook-form**: ^7.60.0 - Form state management
- **@hookform/resolvers**: ^3.10.0 - Zod/Yup resolvers
- **zod**: 3.25.76 - Schema validation

### File Processing
- **pdf-lib**: ^1.17.1 - PDF manipulation
- **pdf-parse**: ^2.4.5 - PDF text extraction
- **pdfjs-dist**: ^5.4.394 - PDF.js distribution
- **jspdf**: ^3.0.4 - PDF generation
- **html2canvas**: ^1.4.1 - HTML to canvas
- **mammoth**: ^1.11.0 - DOCX parsing
- **exceljs**: ^4.4.0 - Excel file handling

### Utilities & Helpers
- **dotenv**: ^17.2.3 - Environment variables
- **date-fns**: 4.1.0 - Date utilities
- **next-themes**: ^0.4.6 - Theme switching
- **input-otp**: 1.4.1 - OTP input component
- **react-day-picker**: 9.8.0 - Date picker
- **cmdk**: 1.0.4 - Command palette
- **canvas-confetti**: ^1.9.4 - Confetti animation

### Security & Cryptography
- **bcryptjs**: ^3.0.2 - Password hashing
- **jsonwebtoken**: ^9.0.2 - JWT handling

### Email
- **nodemailer**: ^7.0.10 - Email sending (compatible with next-auth 4.24.11)

### Browser Automation
- **puppeteer**: ^24.33.0 - Headless browser

### Analytics
- **@vercel/analytics**: 1.3.1 - Vercel analytics

## Dev Dependencies

### Type Definitions
- **@types/react**: ^19 - React types
- **@types/react-dom**: ^19 - React DOM types
- **@types/node**: ^22 - Node.js types
- **@types/jspdf**: ^1.3.3 - jsPDF types

### TypeScript & Linting
- **typescript**: ^5 - TypeScript compiler

### CSS Preprocessing
- **postcss**: ^8.5 - CSS post-processor
- **@tailwindcss/postcss**: ^4.1.9 - Tailwind postcss plugin
- **autoprefixer**: ^10.4.20 - CSS autoprefixer

### Misc
- **tw-animate-css**: 1.3.3 - Tailwind animation styles
- **pend**: ^1.2.0 - Promise pending utility

## Version Constraints

### Critical - DO NOT UPGRADE
- **Next.js 15.0.0** - Upgrading to 16.x breaks next-auth 4.24.11
- **React 19.2.0** - Compatible with Next.js 15.0.0 only
- **nodemailer 7.0.10** - Compatible with next-auth 4.24.11

### Peer Dependency Notes
- Install with `npm install --force` due to next-auth peer dependency warnings
- `.npmrc` contains `legacy-peer-deps=true`

## Update Frequency

- Check for security updates: `npm audit`
- Check for updates: `npm outdated`
- Update safe packages: `npm update`
- Upgrade major versions: Test thoroughly before upgrading

---

**Last Updated**: 2026-01-08
