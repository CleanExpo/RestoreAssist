import { View, Text, ScrollView, Platform, StyleSheet } from 'react-native';
import { colors, spacing } from '@/constants/theme';
import { useAppStore } from '@/lib/store';

const API_ENDPOINT =
  process.env.EXPO_PUBLIC_API_BASE ?? 'https://restoreassist.com.au';

export default function SettingsScreen() {
  const isOnline = useAppStore((s) => s.isOnline);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Application</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.rowValue}>RestoreAssist Mobile v1.0.0</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>API Endpoint</Text>
          <Text style={styles.rowValueMono} numberOfLines={1}>
            {API_ENDPOINT}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Network Status</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isOnline ? colors.success : colors.error },
              ]}
            />
            <Text style={styles.rowValue}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>
      </View>

      {/* Programme */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Programme</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Phase</Text>
          <Text style={styles.rowValue}>NIR Pilot Phase 2</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  row: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  rowValue: {
    color: colors.text,
    fontSize: 15,
  },
  rowValueMono: {
    color: colors.text,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
});
