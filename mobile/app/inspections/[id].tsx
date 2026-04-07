import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api/client";
import type { Inspection } from "@/shared/types";

export default function InspectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.inspections
      .get(id)
      .then((res) => setInspection(res.inspection))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#00F5FF" />;
  if (!inspection)
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Not found.</Text>
      </View>
    );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>{inspection.propertyAddress}</Text>
      <Text style={styles.label}>
        Status: <Text style={styles.value}>{inspection.status}</Text>
      </Text>
      <Text style={styles.label}>
        Inspection #:{" "}
        <Text style={styles.value}>{inspection.inspectionNumber}</Text>
      </Text>
      <Text style={styles.label}>
        Technician:{" "}
        <Text style={styles.value}>{inspection.technicianName ?? "—"}</Text>
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505", padding: 16 },
  heading: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 16,
  },
  label: { color: "#8A6B4E", fontSize: 14, marginBottom: 8 },
  value: { color: "#ffffff" },
  text: { color: "#ffffff", textAlign: "center", marginTop: 48 },
});
