import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.restoreassist.app",
  appName: "RestoreAssist",
  server: {
    // Server-hosted WebView — loads the production URL directly.
    // No static export needed; SSR API routes stay intact on the server.
    url:
      process.env.NODE_ENV === "production"
        ? "https://restoreassist.com.au"
        : "http://localhost:3000",
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
