import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#050505' },
          headerTintColor: '#ffffff',
          contentStyle: { backgroundColor: '#050505' },
        }}
      />
    </>
  );
}
