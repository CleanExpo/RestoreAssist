import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, Spacing } from '@/constants/theme';

export default function JobsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Jobs</Text>
      <Text style={styles.subtitle}>Active restoration jobs will appear here</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.light.surface },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.light.text },
  subtitle: { fontSize: FontSize.sm, color: Colors.light.textSecondary, marginTop: Spacing.sm },
});