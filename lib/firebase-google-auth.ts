// Firebase Google Authentication Helper (Client-side)
'use client'

import { getAuth } from './firebase'

export interface GoogleAuthUser {
  id: string
  email: string | null
  name: string | null
  image: string | null
  role?: string
}

/**
 * Sign in with Google using Firebase
 * Creates user in database if doesn't exist, otherwise logs them in
 * This is a client-side function that calls an API to create/update user in DB
 */
export async function signInWithGoogleFirebase(): Promise<GoogleAuthUser> {
  // Dynamically import Firebase auth functions
  const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth')
  const auth = await getAuth()
  
  const provider = new GoogleAuthProvider()
  const result = await signInWithPopup(auth, provider)
  const firebaseUser = result.user

  if (!firebaseUser.email) {
    throw new Error('Google account does not have an email address')
  }

  // Get ID token to send to server
  const idToken = await firebaseUser.getIdToken()

  // Create or update user in database via API
  const response = await fetch('/api/auth/google-signin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      email: firebaseUser.email,
      name: firebaseUser.displayName || firebaseUser.email.split('@')[0] || 'User',
      image: firebaseUser.photoURL,
      firebaseUid: firebaseUser.uid,
      emailVerified: firebaseUser.emailVerified,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || 'Failed to create/update user in database')
  }

  const dbUser = await response.json()

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    image: dbUser.image,
    role: dbUser.role,
  }
}

