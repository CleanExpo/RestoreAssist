import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';
import { useAppStore } from '@/lib/store';

export default function NetworkBanner() {
  const isOnline = useAppStore((s) => s.isOnline);

  if (isOnline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>You are offline — data entry is limited</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    height: 36,
    backgroundColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.bg,
  },
});
