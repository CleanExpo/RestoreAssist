import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInspectionStore } from '@/lib/store/inspection-store';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
  CategoryColors,
  ClassColors,
} from '@/constants/theme';
import { Inspection, SyncStatus } from '@/shared/types';

type FilterStatus = 'All' | 'Drafts' | 'In Progress' | 'Completed' | 'Synced';

interface FilterTabProps {
  label: FilterStatus;
  isActive: boolean;
  onPress: () => void;
}

const FilterTab: React.FC<FilterTabProps> = ({ label, isActive, onPress }) => {
  return (
    <TouchableOpacity
      style={[styles.filterTab, isActive && styles.filterTabActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.filterTabText,
          isActive && styles.filterTabTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

interface InspectionCardProps {
  inspection: Inspection;
  onPress: (id: string) => void;
}

const InspectionCard: React.FC<InspectionCardProps> = ({ inspection, onPress }) => {
  const categoryColor = inspection.category
    ? CategoryColors[inspection.category]
    : CategoryColors.CAT_1;
  const classColor = inspection.damageClass
    ? ClassColors[inspection.damageClass]
    : ClassColors.CLASS_1;

  const getSyncStatusColor = () => {
    switch (inspection.syncStatus) {
      case 'synced':
        return '#4CAF50'; // green
      case 'local':
        return '#FFC107'; // yellow
      case 'error':
        return '#F44336'; // red
      default:
        return '#999999';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(inspection.id)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleSection}>
          <Text style={styles.cardAddress} numberOfLines={1}>
            {inspection.propertyAddress}
          </Text>
          <Text style={styles.cardDate}>{formatDate(inspection.createdAt)}</Text>
        </View>
        <View
          style={[
            styles.syncStatusDot,
            { backgroundColor: getSyncStatusColor() },
          ]}
        />
      </View>

      <View style={styles.cardBadgesRow}>
        {inspection.category && (
          <View style={[styles.badge, { backgroundColor: categoryColor }]}>
            <Text style={styles.badgeText}>
              {inspection.category}
            </Text>
          </View>
        )}
        {inspection.damageClass && (
          <View style={[styles.badge, { backgroundColor: classColor }]}>
            <Text style={styles.badgeText}>
              CLASS {inspection.damageClass}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.cardMetadata}>
        <View style={styles.metadataItem}>
          <Text style={styles.metadataText}>{inspection.jobId}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default function InspectionsScreen() {
  const router = useRouter();
  const { inspections, loadInspections, isLoading } = useInspectionStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('All');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadInspections();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadInspections();
    } finally {
      setRefreshing(false);
    }
  }, [loadInspections]);

  const getFilterForInspection = (inspection: Inspection): FilterStatus => {
    if (inspection.syncStatus === 'synced') return 'Synced';
    if (inspection.status === 'COMPLETED') return 'Completed';
    if (inspection.status === 'IN_PROGRESS') return 'In Progress';
    return 'Drafts';
  };

  const filteredInspections = useMemo(() => {
    let filtered = inspections;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (inspection) =>
          inspection.propertyAddress.toLowerCase().includes(query) ||
          inspection.jobId.toLowerCase().includes(query)
      );
    }

    // Filter by status tab
    if (activeFilter !== 'All') {
      filtered = filtered.filter((inspection) => {
        const status = getFilterForInspection(inspection);
        return status === activeFilter;
      });
    }

    return filtered;
  }, [inspections, searchQuery, activeFilter]);

  const handleCardPress = (inspectionId: string) => {
    Alert.alert(
      'Inspection Detail',
      'Detail view coming in next sprint',
      [{ text: 'OK' }]
    );
  };

  const handleNewInspection = () => {
    router.push('/inspections/new' as any);
  };

  const renderEmptyState = () => (
    <View style={styles.emptyStateContainer}>
      <Text style={styles.emptyStateIcon}>📋</Text>
      <Text style={styles.emptyStateTitle}>
        {searchQuery.trim() ? 'No inspections found' : 'No inspections yet'}
      </Text>
      <Text style={styles.emptyStateDescription}>
        {searchQuery.trim()
          ? 'Try a different search term'
          : 'Create a new inspection to get started'}
      </Text>
      {!searchQuery.trim() && (
        <TouchableOpacity
          style={styles.emptyStateButton}
          onPress={handleNewInspection}
        >
          <Text style={styles.emptyStateButtonText}>Create Inspection</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.light.background} />

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by address or job #"
          placeholderTextColor="#999999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <FlatList
          data={['All', 'Drafts', 'In Progress', 'Completed', 'Synced'] as const}
          renderItem={({ item }) => (
            <FilterTab
              label={item}
              isActive={activeFilter === item}
              onPress={() => setActiveFilter(item)}
            />
          )}
          keyExtractor={(item) => item}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContentContainer}
        />
      </View>

      {/* Main Content */}
      {isLoading && !refreshing && inspections.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.accent} />
          <Text style={styles.loadingText}>Loading inspections...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredInspections}
          renderItem={({ item }) => (
            <InspectionCard
              inspection={item}
              onPress={handleCardPress}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.light.accent}
            />
          }
        />
      )}

      {/* FAB - New Inspection */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleNewInspection}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },

  /* Search Bar Styles */
  searchContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.light.background,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  searchInput: {
    height: 48,
    backgroundColor: '#F5F5F5',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.light.text,
  },

  /* Filter Tabs Styles */
  filterContainer: {
    backgroundColor: Colors.light.background,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingVertical: Spacing.sm,
  },
  filterContentContainer: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  filterTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: '#F0F0F0',
    minHeight: 44,
    justifyContent: 'center',
  },
  filterTabActive: {
    backgroundColor: Colors.light.primary,
  },
  filterTabText: {
    fontSize: FontSize.sm,
    color: '#666666',
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  /* Card Styles */
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: Colors.light.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: Spacing.md,
    marginBottom: Spacing.md,
    minHeight: 140,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  cardTitleSection: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  cardAddress: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: Spacing.xs,
  },
  cardDate: {
    fontSize: FontSize.sm,
    color: '#999999',
  },
  syncStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },

  /* Badges */
  cardBadgesRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  /* Metadata */
  cardMetadata: {
    flexDirection: 'row',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metadataText: {
    fontSize: FontSize.xs,
    color: '#666666',
  },

  /* Empty State */
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    minHeight: 300,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: Spacing.md,
  },
  emptyStateTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptyStateDescription: {
    fontSize: FontSize.md,
    color: '#999999',
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  emptyStateButton: {
    backgroundColor: Colors.light.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  emptyStateButtonText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },

  /* Loading State */
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSize.md,
    color: '#999999',
  },

  /* FAB */
  fab: {
    position: 'absolute',
    bottom: Spacing.lg,
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 28,
    fontWeight: '300',
    color: '#FFFFFF',
  },
});
