// Firebase Admin SDK Configuration (Server-side)
// Only used for token verification - optional if firebase-admin is not installed
let adminAuth: any = null;

// Lazy initialization function
async function initializeAdminAuth() {
  if (typeof window !== "undefined") {
    return null; // Client-side, return null
  }

  if (adminAuth !== null) {
    return adminAuth; // Already initialized
  }

  try {
    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getAuth } = await import("firebase-admin/auth");

    if (getApps().length === 0) {
      const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      let serviceAccount: any = undefined;

      if (serviceAccountKey) {
        try {
          serviceAccount = JSON.parse(serviceAccountKey);
        } catch (parseError) {
          console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY");
        }
      }

      if (serviceAccount && serviceAccount.private_key) {
        const adminApp = initializeApp({
          credential: cert(serviceAccount),
          projectId:
            serviceAccount.project_id ||
            process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
            "restore-assist",
        });
        adminAuth = getAuth(adminApp);
      } else {
        const projectId =
          process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "restore-assist";
        const adminApp = initializeApp({ projectId });
        adminAuth = getAuth(adminApp);
      }
    } else {
      const apps = getApps();
      adminAuth = getAuth(apps[0]);
    }
  } catch (error: any) {
    // If firebase-admin is not installed, this is expected
    if (error.code === "MODULE_NOT_FOUND") {
      console.warn(
        "⚠️  firebase-admin not installed. Token verification will be skipped.",
      );
    } else {
      console.warn("Firebase Admin initialization error:", error.message);
    }
    adminAuth = null;
  }

  return adminAuth;
}

/**
 * Get the initialized Firebase Admin Auth instance.
 *
 * **Returns `null`** — and does not throw — when:
 *   - firebase-admin is not installed (dev/staging without the dep)
 *   - FIREBASE_SERVICE_ACCOUNT_KEY is unparseable or missing AND no
 *     ADC environment is present
 *   - Any other init error (logged as a warning)
 *
 * RA-1310: every caller MUST check `if (adminAuth)` and degrade
 * gracefully. The only caller as of 2026-04-21 is
 * `app/api/auth/google-signin/route.ts`, which returns HTTP 503 when
 * this helper returns null. If you add a new caller, apply the same
 * pattern — don't let cold-start failure yield a raw 500.
 */
export async function getAdminAuth() {
  return await initializeAdminAuth();
}

// Export adminAuth for backward compatibility (will be null if not initialized)
export { adminAuth };
