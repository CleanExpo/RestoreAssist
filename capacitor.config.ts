import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.restoreassist.app",
  appName: "RestoreAssist",
  server: {
    // Server-hosted WebView — loads the production URL directly.
    // No static export needed; SSR API routes stay intact on the server.
    //
    // Why hardcoded: `npx cap sync ios` does NOT set NODE_ENV when
    // copying capacitor.config into the iOS Xcode project. The
    // conditional shipped to App Store reviewers as `localhost:3000`
    // and produced a black screen on iPad Air during App Review for
    // build 1.0(2). Build 1.0(3) was archived locally on a Mac with
    // a manual edit that was never committed; this commit makes the
    // fix permanent so future CI-built TestFlight uploads stop
    // regressing.
    //
    // For local dev: run `next dev` on :3000 and `npx cap run ios`
    // against a Simulator that talks to host loopback. See
    // docs/MOBILE_RELEASE_RUNBOOK.md for the dev-loop pattern.
    url: "https://restoreassist.app",
    cleartext: false,
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#050505",
      showSpinner: true,
      spinnerColor: "#00F5FF",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#050505",
    },
    // Native social-login plugin. 1.0.4 enables Google alongside Apple
    // (1.0.3 was Apple-only because the loop fix was urgent and we
    // wanted the smallest possible change for review).
    //
    // Apple guideline 4.8 still applies; we satisfy it because Apple
    // Sign-In is offered as a peer option (not below or smaller than
    // Google in the UI). The capgo plugin presents Google's native
    // sign-in sheet (no SFVC), so the same WKWebView cookie-jar fix
    // shipped for Apple in 1.0.3 covers Google in 1.0.4 too.
    //
    // The iOS clientId is the Google iOS-type OAuth client provisioned
    // in Google Cloud Console (project=restoreassist, "RestoreAssist
    // iOS"). The reversed-client-ID URL scheme lives in Info.plist.
    SocialLogin: {
      providers: {
        apple: true,
        google: true,
      },
    },
  },
  ios: {
    contentInset: "automatic",
    scrollEnabled: true,
    backgroundColor: "#050505",
  },
  android: {
    backgroundColor: "#050505",
    allowMixedContent: false,
  },
};

export default config;
