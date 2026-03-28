import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '@/lib/store/auth-store';
import { useInspectionStore } from '@/lib/store/inspection-store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  const initDB = useInspectionStore((s) => s.initDB);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    async function boot() {
      await initDB();
      await initialize();
      await SplashScreen.hideAsync();
    }
    boot();
  }, []);

  if (isLoading) return null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}