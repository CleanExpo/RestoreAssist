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
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBz8AI-2dLK4z36II9CnLaUj_exVSv3sz4",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "restore-assist.firebaseapp.com",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "restore-assist",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "restore-assist.firebasestorage.app",
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "901429819918",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:901429819918:web:adb4f3ec75be15a1345a5f",
      measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-WNRVB9K2X8"
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
