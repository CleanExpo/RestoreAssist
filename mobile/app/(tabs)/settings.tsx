import { View, Text, ScrollView, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, shadows } from '@/constants/theme';
import { useAppStore } from '@/lib/store';

const API_ENDPOINT =
  process.env.EXPO_PUBLIC_API_BASE ?? 'https://restoreassist.com.au';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

interface RowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
  dot?: string;
}

function SettingsRow({ icon, label, value, mono, valueColor, dot }: RowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIconWrap}>
        <Ionicons name={icon} size={18} color={colors.muted} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.rowValueRow}>
          {dot && (
            <View style={[styles.dot, { backgroundColor: dot }]} />
          )}
          <Text
            style={[
              styles.rowValue,
              mono && { fontFamily: MONO, fontSize: 12 },
              valueColor ? { color: valueColor } : null,
            ]}
            numberOfLines={1}
          >
            {value}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const isOnline = useAppStore((s) => s.isOnline);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* App branding block */}
      <View style={[styles.brandCard, shadows.card]}>
        <View style={styles.brandIconWrap}>
          <Ionicons name="water" size={28} color={colors.accent} />
        </View>
        <View style={styles.brandText}>
          <Text style={styles.brandName}>RestoreAssist</Text>
          <Text style={styles.brandVersion}>Mobile v1.0.0</Text>
        </View>
        <View style={styles.pilotBadge}>
          <Text style={styles.pilotBadgeText}>PILOT</Text>
        </View>
      </View>

      {/* Application section */}
      <Text style={styles.sectionTitle}>Application</Text>
      <View style={[styles.sectionCard, shadows.card]}>
        <SettingsRow
          icon="server-outline"
          label="API Endpoint"
          value={API_ENDPOINT}
          mono
        />
        <View style={styles.rowDivider} />
        <SettingsRow
          icon="wifi-outline"
          label="Network Status"
          value={isOnline ? 'Online' : 'Offline'}
          dot={isOnline ? colors.success : colors.error}
          valueColor={isOnline ? colors.success : colors.error}
        />
        <View style={styles.rowDivider} />
        <SettingsRow
          icon="phone-portrait-outline"
          label="Platform"
          value={Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web'}
        />
      </View>

      {/* Programme section */}
      <Text style={styles.sectionTitle}>Programme</Text>
      <View style={[styles.sectionCard, shadows.card]}>
        <SettingsRow
          icon="layers-outline"
          label="Phase"
          value="NIR Pilot Phase 2"
          valueColor={colors.accent}
        />
        <View style={styles.rowDivider} />
        <SettingsRow
          icon="shield-checkmark-outline"
          label="Standard"
          value="IICRC S500 / S520 / S700"
        />
        <View style={styles.rowDivider} />
        <SettingsRow
          icon="location-outline"
          label="Region"
          value="Australia"
        />
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
    paddingBottom: spacing.xl,
  },
  brandCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  brandIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    flex: 1,
  },
  brandName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  brandVersion: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  pilotBadge: {
    backgroundColor: colors.muted + '22',
    borderWidth: 1,
    borderColor: colors.muted + '60',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pilotBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 1,
  },
  sectionTitle: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    gap: spacing.md,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
  },
  rowValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.md + 36 + spacing.md,
  },
});
