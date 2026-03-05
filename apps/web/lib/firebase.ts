// Firebase Client Configuration
// Uses dynamic imports to avoid build-time errors if firebase is not installed

let firebaseApp: any = null
let firebaseAuth: any = null

async function initializeFirebase() {
  if (firebaseApp && firebaseAuth) {
    return { app: firebaseApp, auth: firebaseAuth }
  }

  try {
    const firebaseAppModule = await import('firebase/app')
    const firebaseAuthModule = await import('firebase/auth')
    
    const { initializeApp, getApps } = firebaseAppModule
    const { getAuth } = firebaseAuthModule

    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    }

    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
      throw new Error(
        'Firebase configuration is incomplete. Set NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID environment variables.'
      )
    }

    if (getApps().length === 0) {
      firebaseApp = initializeApp(firebaseConfig)
    } else {
      firebaseApp = getApps()[0]
    }

    firebaseAuth = getAuth(firebaseApp)
    return { app: firebaseApp, auth: firebaseAuth }
  } catch (error: any) {
    if (error.code === 'MODULE_NOT_FOUND' || error.message?.includes('Cannot find module')) {
      const errorMsg = 'Firebase package is not installed. Please run: npm install firebase'
      console.error('❌', errorMsg)
      throw new Error(errorMsg)
    }
    throw error
  }
}

// Export auth getter (lazy initialization)
export async function getAuth() {
  const { auth } = await initializeFirebase()
  return auth
}

// Export app getter
export async function getApp() {
  const { app } = await initializeFirebase()
  return app
}

export default firebaseApp
