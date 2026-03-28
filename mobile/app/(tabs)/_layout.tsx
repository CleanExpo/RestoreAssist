import { Tabs } from 'expo-router';
import { View, Platform } from 'react-native';
import { Colors, Spacing } from '@/constants/theme';

// Simple icon components (replace with lucide-react-native in production)
function TabIcon({ name, color }: { name: string; color: string }) {
  const icons: Record<string, string> = {
    dashboard: '🏠',
    inspections: '🔍',
    reports: '📋',
    settings: '⚙️',
  };
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View><Text style={{ fontSize: 22 }}>{icons[name] || '📱'}</Text></View>
    </View>
  );
}

import { Text } from 'react-native';
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: Colors.light.primary },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: Colors.light.accent,
        tabBarInactiveTintColor: Colors.light.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.light.background,
          borderTopColor: Colors.light.border,
          paddingBottom: Platform.OS === 'ios' ? Spacing.lg : Spacing.sm,
          paddingTop: Spacing.sm,
          height: Platform.OS === 'ios' ? 88 : 64,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          headerTitle: 'RestoreAssist',
          tabBarIcon: ({ color }) => <TabIcon name="dashboard" color={color} />,
        }}
      />
      <Tabs.Screen
        name="inspections"
        options={{
          title: 'Inspections',
          headerTitle: 'Inspections',
          tabBarIcon: ({ color }) => <TabIcon name="inspections" color={color} />,
        }}
      />      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          headerTitle: 'Reports',
          tabBarIcon: ({ color }) => <TabIcon name="reports" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerTitle: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon name="settings" color={color} />,
        }}
      />
    </Tabs>
  );
}