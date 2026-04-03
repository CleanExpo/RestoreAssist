<<<<<<< HEAD
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>RestoreAssist</Text>
      <Text style={styles.subtitle}>Field App</Text>
      <TouchableOpacity style={styles.button} onPress={() => router.push('/inspections')}>
        <Text style={styles.buttonText}>View Inspections</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050505' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#8A6B4E', marginBottom: 32 },
  button: { backgroundColor: '#1C2E47', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
=======
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/(tabs)/inspections" />;
}
>>>>>>> feat/ra-384-mobile-scaffold
