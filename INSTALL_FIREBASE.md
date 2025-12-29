# Install Firebase Package

The `firebase` package is required for Google authentication to work.

## Quick Install

Run this command in your terminal:

```bash
npm install firebase
```

## After Installation

1. Restart your development server:
   ```bash
   npm run dev
   ```

2. The Google sign-in button on the signup page will now work properly.

## What This Package Does

- `firebase` - Client-side Firebase SDK for authentication
- Used for Google sign-in popup and user authentication

## Note

The code is designed to work even if the package isn't installed (it will show a clear error message), but you need to install it for Google authentication to actually function.

