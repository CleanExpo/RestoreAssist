import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/constants/theme';
import { useAppStore } from '@/lib/store';

export default function NetworkBanner() {
  const isOnline = useAppStore((s) => s.isOnline);

  if (isOnline) return null;

  return (
    <View style={styles.banner}>
      <Ionicons name="cloud-offline" size={14} color={colors.bg} />
      <Text style={styles.text}>OFFLINE — data entry is limited</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    height: 38,
    backgroundColor: colors.warning,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.bg,
    letterSpacing: 0.5,
  },
});
