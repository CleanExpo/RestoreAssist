import { useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/lib/store';
import { api } from '@/lib/api/client';

export default function InspectionsScreen() {
  const router = useRouter();
  const { inspections, setInspections } = useAppStore();

  useEffect(() => {
    api.inspections.list().then((res) => setInspections(res.inspections)).catch(console.error);
  }, [setInspections]);

  return (
    <View style={styles.container}>
      <FlatList
        data={inspections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => router.push(`/inspections/${item.id}`)}>
            <Text style={styles.title}>{item.propertyAddress}</Text>
            <Text style={styles.sub}>{item.status}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No inspections found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  row: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#1C2E47' },
  title: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  sub: { color: '#8A6B4E', fontSize: 13, marginTop: 4 },
  empty: { color: '#666', textAlign: 'center', marginTop: 48 },
});
