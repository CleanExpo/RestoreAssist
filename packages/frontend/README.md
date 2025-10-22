# RestoreAssist Frontend

React-based frontend application for RestoreAssist disaster restoration documentation platform.

## Technology Stack

- **React 18.2** - UI library
- **TypeScript 5.3** - Type-safe JavaScript
- **Vite** - Build tool and dev server
- **TailwindCSS 4.1** - Utility-first CSS
- **Radix UI** - Accessible component primitives
- **React Router Dom** - Client-side routing
- **React OAuth Google** - Google authentication
- **DOMPurify** - XSS protection
- **Sentry** - Error monitoring

## Setup Instructions

### Prerequisites

- Node.js 20.0.0 or higher
- npm 10.0.0 or higher

### Installation

1. Navigate to the frontend directory:
   ```bash
   cd packages/frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Configure environment variables in `.env`:
   ```
   VITE_API_URL=http://localhost:3001
   VITE_GOOGLE_CLIENT_ID=your_google_client_id
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key
   VITE_SENTRY_DSN=your_sentry_dsn
   ```

## Available Scripts

### Development
```bash
npm run dev           # Start development server (port 5173)
npm run dev:host     # Start with network access
```

### Build
```bash
npm run build         # Build for production
npm run preview       # Preview production build
```

### Testing
```bash
npm run test          # Run unit tests
npm run test:e2e      # Run E2E tests with Playwright
npm run test:coverage # Run tests with coverage
```

### Code Quality
```bash
npm run lint          # Run ESLint
npm run lint:fix      # Fix linting errors
npm run format        # Format with Prettier
npm run type-check    # Run TypeScript checks
```

## Project Structure

```
frontend/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── common/        # Common components (Button, Input, etc.)
│   │   ├── layout/        # Layout components (Header, Footer)
│   │   ├── reports/       # Report-related components
│   │   └── auth/          # Authentication components
│   ├── pages/             # Page components
│   │   ├── Dashboard.tsx  # Dashboard page
│   │   ├── Reports.tsx    # Reports listing
│   │   ├── Login.tsx      # Login page
│   │   └── Settings.tsx   # Settings page
│   ├── services/          # API services
│   │   ├── api.ts         # Base API configuration
│   │   ├── auth.ts        # Authentication service
│   │   └── reports.ts     # Reports service
│   ├── hooks/             # Custom React hooks
│   │   ├── useAuth.ts     # Authentication hook
│   │   ├── useReports.ts  # Reports data hook
│   │   └── useDebounce.ts # Debounce hook
│   ├── utils/             # Utility functions
│   │   ├── validation.ts  # Form validation
│   │   ├── formatting.ts  # Data formatting
│   │   └── sanitize.ts    # HTML sanitisation
│   ├── types/             # TypeScript types
│   │   ├── api.ts         # API response types
│   │   ├── models.ts      # Data models
│   │   └── components.ts  # Component props types
│   ├── config/            # Configuration
│   │   └── constants.ts   # App constants
│   ├── App.tsx            # Main app component
│   ├── main.tsx           # Entry point
│   └── index.css          # Global styles
├── public/                # Static assets
├── tests/                 # Test files
└── vite.config.ts         # Vite configuration
```

## Component Architecture

### Common Components
- **Button**: Reusable button with variants
- **Input**: Form input with validation
- **Modal**: Modal dialog component
- **Table**: Data table with sorting/filtering
- **Card**: Content card component

### Authentication Flow
1. User lands on login page
2. Google OAuth or email/password login
3. JWT token stored in secure cookie
4. Protected routes check authentication
5. Automatic token refresh

### State Management
- React Context for global state
- Custom hooks for data fetching
- Local state for component-specific data

## Security Features

### Content Security Policy (CSP)
```typescript
// Implemented in index.html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; script-src 'self' 'unsafe-inline';">
```

### XSS Protection
```typescript
// Using DOMPurify for user-generated content
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(dirtyHTML);
```

### Authentication Security
- JWT tokens with short expiry (15 minutes)
- Refresh tokens stored in httpOnly cookies
- CSRF protection on state-changing operations

## Styling Guidelines

### TailwindCSS Classes
```tsx
// Example component with Tailwind classes
<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
  Click Me
</button>
```

### Theme Configuration
- Colours: Blue primary, grey secondary
- Font: Inter for UI, Roboto Mono for code
- Spacing: 4px base unit
- Border radius: 8px default

## Testing Guidelines

### Unit Tests
```typescript
// Example test with React Testing Library
import { render, screen } from '@testing-library/react';
import Button from './Button';

test('renders button with text', () => {
  render(<Button>Click me</Button>);
  expect(screen.getByText('Click me')).toBeInTheDocument();
});
```

### E2E Tests
```typescript
// Example Playwright test
import { test, expect } from '@playwright/test';

test('user can login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');
});
```

## Performance Optimisation

- Code splitting with React.lazy()
- Image lazy loading
- Bundle size optimisation with Vite
- React.memo for expensive components
- Virtual scrolling for large lists

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Kill process on port 5173
   npx kill-port 5173
   ```

2. **Node modules issues**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Build failures**
   ```bash
   npm run type-check  # Check for TypeScript errors
   npm run lint        # Check for linting errors
   ```

## Contributing

1. Create a feature branch
2. Make your changes
3. Write/update tests
4. Run all checks: `npm run lint && npm run test && npm run build`
5. Submit a pull request

## Support

For issues or questions, contact: support@restoreassist.com.au
