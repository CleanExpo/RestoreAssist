import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
<<<<<<< HEAD
=======
import { colors } from '@/constants/theme';
>>>>>>> feat/ra-384-mobile-scaffold

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
<<<<<<< HEAD
          headerStyle: { backgroundColor: '#050505' },
          headerTintColor: '#ffffff',
          contentStyle: { backgroundColor: '#050505' },
        }}
      />
=======
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
>>>>>>> feat/ra-384-mobile-scaffold
    </>
  );
}
