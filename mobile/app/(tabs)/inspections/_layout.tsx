import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function InspectionsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Inspections' }} />
      <Stack.Screen name="new" options={{ title: 'New Inspection' }} />
      <Stack.Screen name="[id]" options={{ title: 'Inspection' }} />
    </Stack>
  );
}
