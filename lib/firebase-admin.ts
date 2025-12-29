// Firebase Admin SDK Configuration (Server-side)
// Only used for token verification - optional if firebase-admin is not installed
let adminAuth: any = null

// Lazy initialization function
async function initializeAdminAuth() {
  if (typeof window !== 'undefined') {
    return null // Client-side, return null
  }

  if (adminAuth !== null) {
    return adminAuth // Already initialized
  }

  try {
    const firebaseAdmin = await import('firebase-admin')
    const { initializeApp, getApps, cert } = firebaseAdmin.app
    const { getAuth } = firebaseAdmin.auth

    if (getApps().length === 0) {
      const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      let serviceAccount: any = undefined

      if (serviceAccountKey) {
        try {
          serviceAccount = JSON.parse(serviceAccountKey)
        } catch (parseError) {
          console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY')
        }
      }

      if (serviceAccount && serviceAccount.private_key) {
        const adminApp = initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'restore-assist',
        })
        adminAuth = getAuth(adminApp)
        console.log('✅ Firebase Admin initialized with service account')
      } else {
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'restore-assist'
        const adminApp = initializeApp({ projectId })
        adminAuth = getAuth(adminApp)
        console.log('⚠️  Firebase Admin initialized with default credentials')
      }
    } else {
      const apps = getApps()
      adminAuth = getAuth(apps[0])
    }
  } catch (error: any) {
    // If firebase-admin is not installed, this is expected
    if (error.code === 'MODULE_NOT_FOUND') {
      console.warn('⚠️  firebase-admin not installed. Token verification will be skipped.')
    } else {
      console.warn('Firebase Admin initialization error:', error.message)
    }
    adminAuth = null
  }

  return adminAuth
}

// Export function to get admin auth (lazy initialization)
export async function getAdminAuth() {
  return await initializeAdminAuth()
}

// Export adminAuth for backward compatibility (will be null if not initialized)
export { adminAuth }
