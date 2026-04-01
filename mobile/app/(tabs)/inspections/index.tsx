import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, shadows } from '@/constants/theme';
import { useAppStore } from '@/lib/store';
import { api } from '@/lib/api/client';
import type { Inspection } from '@/shared/types';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: colors.muted,
  SUBMITTED: colors.accent,
  PROCESSING: colors.warning,
  CLASSIFIED: colors.accent,
  SCOPED: colors.accent,
  ESTIMATED: colors.accent,
  COMPLETED: colors.success,
  REJECTED: colors.error,
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  PROCESSING: 'Processing',
  CLASSIFIED: 'Classified',
  SCOPED: 'Scoped',
  ESTIMATED: 'Estimated',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
};

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export default function InspectionsListScreen() {
  const router = useRouter();
  const { inspections, setInspections, refreshCounter } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInspections = useCallback(async () => {
    try {
      setError(null);
      const { inspections: data } = await api.inspections.list();
      setInspections(data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load inspections');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setInspections]);

  useEffect(() => {
    fetchInspections();
  }, [fetchInspections, refreshCounter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchInspections();
  }, [fetchInspections]);

  const renderItem = ({ item }: { item: Inspection }) => {
    const statusColor = STATUS_COLORS[item.status] ?? colors.muted;
    return (
      <TouchableOpacity
        style={[styles.card, shadows.card]}
        onPress={() => router.push(`/(tabs)/inspections/${item.id}`)}
        activeOpacity={0.75}
      >
        {/* Left status accent */}
        <View style={[styles.cardAccent, { backgroundColor: statusColor }]} />

        <View style={styles.cardContent}>
          <View style={styles.cardRow}>
            <Text style={[styles.inspectionNum, { fontFamily: MONO }]}>
              #{item.inspectionNumber}
            </Text>
            <View style={[styles.statusPill, { borderColor: statusColor + '88' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {STATUS_LABELS[item.status] ?? item.status}
              </Text>
            </View>
          </View>

          <Text style={styles.address} numberOfLines={2}>
            {item.propertyAddress}
          </Text>

          <Text style={styles.date}>{formatDate(item.inspectionDate)}</Text>
        </View>

        <Ionicons
          name="chevron-forward"
          size={16}
          color={colors.border}
          style={styles.cardChevron}
        />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading inspections...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.screenHeader}>
        <View>
          <Text style={styles.screenTitle}>Inspections</Text>
          <Text style={styles.screenSubtitle}>
            {inspections.length > 0
              ? `${inspections.length} record${inspections.length !== 1 ? 's' : ''}`
              : 'NIR Pilot Phase 2'}
          </Text>
        </View>
      </View>

      {error && (
        <TouchableOpacity style={styles.errorBanner} onPress={fetchInspections}>
          <Ionicons name="cloud-offline-outline" size={15} color={colors.warning} />
          <Text style={styles.errorBannerText}>{error} — tap to retry</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={inspections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          inspections.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="clipboard-outline" size={40} color={colors.muted} />
            </View>
            <Text style={styles.emptyTitle}>No Inspections</Text>
            <Text style={styles.emptySubtitle}>
              Tap the + button to create{'\n'}your first field inspection
            </Text>
          </View>
        }
      />

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, shadows.fab]}
        onPress={() => router.push('/(tabs)/inspections/new')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={colors.bg} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.md,
    fontWeight: '500',
  },
  screenHeader: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningDim,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.warning + '30',
  },
  errorBannerText: {
    color: colors.warning,
    fontSize: 13,
    flex: 1,
    fontWeight: '600',
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: 120,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    alignItems: 'stretch',
  },
  cardAccent: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    padding: spacing.md,
    gap: 4,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  inspectionNum: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  address: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  date: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  cardChevron: {
    alignSelf: 'center',
    marginRight: spacing.md,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    paddingHorizontal: spacing.xl,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    fontWeight: '500',
  },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
