import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/lib/store/auth-store';
import { useInspectionStore } from '@/lib/store/inspection-store';
import { Colors, Spacing, FontSize, BorderRadius, CategoryColors } from '@/constants/theme';

export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const byokConfig = useAuthStore((s) => s.byokConfig);
  const { inspections, loadInspections } = useInspectionStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadInspections();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInspections();
    setRefreshing(false);
  };

  const draftCount = inspections.filter((i) => i.status === 'DRAFT').length;
  const inProgressCount = inspections.filter((i) => i.status === 'IN_PROGRESS').length;
  const completedCount = inspections.filter((i) => i.status === 'COMPLETED').length;
  const pendingSyncCount = inspections.filter((i) => i.syncStatus === 'local').length;
  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Welcome */}
      <View style={styles.welcome}>
        <Text style={styles.greeting}>
          G'day, {user?.name?.split(' ')[0] || 'Technician'}
        </Text>
        <Text style={styles.date}>{new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      </View>

      {/* BYOK Status */}
      {!byokConfig && (
        <TouchableOpacity
          style={styles.byokWarning}
          onPress={() => router.push('/(tabs)/settings')}
        >
          <Text style={styles.byokWarningText}>
            AI not configured — tap to set up your API key
          </Text>
        </TouchableOpacity>
      )}

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderLeftColor: Colors.light.accent }]}>
          <Text style={styles.statNumber}>{draftCount}</Text>
          <Text style={styles.statLabel}>Drafts</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: Colors.light.warning }]}>
          <Text style={styles.statNumber}>{inProgressCount}</Text>
          <Text style={styles.statLabel}>In Progress</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: Colors.light.success }]}>
          <Text style={styles.statNumber}>{completedCount}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: pendingSyncCount > 0 ? Colors.light.danger : Colors.light.success }]}>
          <Text style={styles.statNumber}>{pendingSyncCount}</Text>
          <Text style={styles.statLabel}>Pending Sync</Text>
        </View>
      </View>
      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <TouchableOpacity
        style={styles.primaryAction}
        onPress={() => router.push('/(tabs)/inspections/new')}
      >
        <Text style={styles.primaryActionText}>New Inspection</Text>
        <Text style={styles.primaryActionSub}>Start a field inspection with camera and moisture readings</Text>
      </TouchableOpacity>

      {/* Recent Inspections */}
      <Text style={styles.sectionTitle}>Recent Inspections</Text>
      {inspections.slice(0, 5).map((inspection) => (
        <TouchableOpacity
          key={inspection.id}
          style={styles.inspectionCard}
          onPress={() => {
            useInspectionStore.getState().setCurrentInspection(inspection);
            router.push('/(tabs)/inspections');
          }}
        >
          <View style={styles.inspectionHeader}>
            <Text style={styles.inspectionAddress} numberOfLines={1}>
              {inspection.propertyAddress}
            </Text>
            <View style={[styles.statusBadge, {
              backgroundColor: inspection.status === 'COMPLETED' ? Colors.light.success + '20' :
                inspection.status === 'IN_PROGRESS' ? Colors.light.warning + '20' : Colors.light.accent + '20'
            }]}>
              <Text style={[styles.statusText, {
                color: inspection.status === 'COMPLETED' ? Colors.light.success :
                  inspection.status === 'IN_PROGRESS' ? Colors.light.warning : Colors.light.accent
              }]}>
                {inspection.status.replace('_', ' ')}
              </Text>
            </View>
          </View>
          {inspection.category && (
            <View style={styles.categoryRow}>
              <View style={[styles.categoryDot, { backgroundColor: CategoryColors[inspection.category] }]} />
              <Text style={styles.categoryText}>
                {inspection.category.replace('_', ' ')} {inspection.damageClass ? `/ ${inspection.damageClass.replace('_', ' ')}` : ''}
              </Text>
            </View>
          )}
          <Text style={styles.inspectionDate}>
            {new Date(inspection.updatedAt).toLocaleDateString('en-AU')}
            {inspection.syncStatus === 'local' ? ' • Not synced' : ''}
          </Text>
        </TouchableOpacity>
      ))}
      {inspections.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No inspections yet</Text>
          <Text style={styles.emptySubtext}>Tap "New Inspection" to get started</Text>
        </View>
      )}

      <View style={{ height: Spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.surface },
  welcome: { padding: Spacing.lg, paddingTop: Spacing.md },
  greeting: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.light.text },
  date: { fontSize: FontSize.sm, color: Colors.light.textSecondary, marginTop: 2 },
  byokWarning: { marginHorizontal: Spacing.lg, padding: Spacing.md, backgroundColor: Colors.light.warning + '15', borderRadius: BorderRadius.md, borderLeftWidth: 4, borderLeftColor: Colors.light.warning },
  byokWarningText: { color: Colors.light.warning, fontWeight: '600', fontSize: FontSize.sm },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginTop: Spacing.md },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: Colors.light.background, padding: Spacing.md, borderRadius: BorderRadius.md, borderLeftWidth: 4 },
  statNumber: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.light.text },
  statLabel: { fontSize: FontSize.xs, color: Colors.light.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.light.text, paddingHorizontal: Spacing.lg, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  primaryAction: { marginHorizontal: Spacing.lg, backgroundColor: Colors.light.accent, padding: Spacing.lg, borderRadius: BorderRadius.lg },
  primaryActionText: { color: '#FFFFFF', fontSize: FontSize.lg, fontWeight: '700' },
  primaryActionSub: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm, marginTop: 4 },
  inspectionCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, backgroundColor: Colors.light.background, padding: Spacing.md, borderRadius: BorderRadius.md },
  inspectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inspectionAddress: { fontSize: FontSize.md, fontWeight: '600', color: Colors.light.text, flex: 1, marginRight: Spacing.sm },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  statusText: { fontSize: FontSize.xs, fontWeight: '700' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.xs },
  categoryDot: { width: 8, height: 8, borderRadius: 4, marginRight: Spacing.xs },
  categoryText: { fontSize: FontSize.sm, color: Colors.light.textSecondary },
  inspectionDate: { fontSize: FontSize.xs, color: Colors.light.textMuted, marginTop: Spacing.xs },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyText: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.light.textSecondary },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.light.textMuted, marginTop: Spacing.xs },
});