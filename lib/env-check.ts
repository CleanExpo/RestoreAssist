// Environment variable validation
export function validateEnvironment() {
  const requiredEnvVars = [
    'DATABASE_URL',
    'NEXTAUTH_SECRET',
    'NEXTAUTH_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET'
  ]

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars)
    return false
  }

  console.log('✅ All required environment variables are set')
  return true
}

// Check if we're in development mode
if (process.env.NODE_ENV === 'development') {
  validateEnvironment()
}
