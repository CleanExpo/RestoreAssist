import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/constants/theme';
import { useAppStore } from '@/lib/store';
import { api } from '@/lib/api/client';
import type { Inspection } from '@/shared/types';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: colors.warning,
  SUBMITTED: colors.accent,
  PROCESSING: colors.accent,
  CLASSIFIED: colors.muted,
  SCOPED: colors.muted,
  ESTIMATED: colors.muted,
  COMPLETED: colors.success,
  REJECTED: colors.error,
};

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

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const renderItem = ({ item }: { item: Inspection }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(tabs)/inspections/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.inspectionNumber}>#{item.inspectionNumber}</Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: (STATUS_COLORS[item.status] ?? colors.muted) + '22' },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: STATUS_COLORS[item.status] ?? colors.muted },
            ]}
          >
            {item.status}
          </Text>
        </View>
      </View>
      <Text style={styles.address} numberOfLines={2}>
        {item.propertyAddress}
      </Text>
      <Text style={styles.date}>{formatDate(item.inspectionDate)}</Text>
    </TouchableOpacity>
  );

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
      {error && (
        <TouchableOpacity style={styles.errorBanner} onPress={fetchInspections}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
          <Text style={styles.errorBannerText}>
            {error} — tap to retry
          </Text>
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
            <Ionicons name="clipboard-outline" size={64} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>No Inspections</Text>
            <Text style={styles.emptySubtitle}>
              Tap the + button to create your first inspection
            </Text>
          </View>
        }
      />

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(tabs)/inspections/new')}
        activeOpacity={0.8}
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
    paddingHorizontal: spacing.lg,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  retryText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: 100, // room for FAB
  },
  emptyContainer: {
    flexGrow: 1,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  inspectionNumber: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  address: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  date: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning + '18',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  errorBannerText: {
    color: colors.warning,
    fontSize: 13,
    flex: 1,
  },
  fab: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
