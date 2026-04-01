import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';
import { useAppStore } from '@/lib/store';

interface SyncStatusBarProps {
  submitting?: boolean;
  error?: string | null;
}

export default function SyncStatusBar({ submitting, error }: SyncStatusBarProps) {
  const isOnline = useAppStore((s) => s.isOnline);

  if (error) {
    return (
      <View style={styles.errorBar}>
        <Text style={styles.errorText} numberOfLines={1}>
          {error}
        </Text>
      </View>
    );
  }

  if (submitting) {
    return (
      <View style={styles.submittingBar}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={styles.submittingText}>Submitting...</Text>
      </View>
    );
  }

  if (!isOnline) {
    return (
      <View style={styles.offlineBar}>
        <Text style={styles.offlineText}>Offline</Text>
      </View>
    );
  }

  return (
    <View style={styles.onlineBar}>
      <View style={styles.greenDot} />
      <Text style={styles.onlineText}>Online</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  onlineBar: {
    height: 28,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  onlineText: {
    fontSize: 11,
    color: colors.success,
    fontWeight: '600',
  },
  offlineBar: {
    height: 28,
    backgroundColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  submittingBar: {
    height: 28,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  submittingText: {
    fontSize: 11,
    color: colors.accent,
    fontWeight: '600',
  },
  errorBar: {
    height: 28,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  errorText: {
    fontSize: 11,
    color: colors.error,
    fontWeight: '600',
  },
});
