import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "@/constants/theme";
import { useAppStore } from "@/lib/store";

interface SyncStatusBarProps {
  submitting?: boolean;
  error?: string | null;
}

export default function SyncStatusBar({
  submitting,
  error,
}: SyncStatusBarProps) {
  const isOnline = useAppStore((s) => s.isOnline);

  if (error) {
    return (
      <View style={[styles.bar, styles.errorBar]}>
        <Ionicons name="alert-circle" size={14} color={colors.error} />
        <Text style={[styles.text, styles.errorText]} numberOfLines={1}>
          {error}
        </Text>
      </View>
    );
  }

  if (submitting) {
    return (
      <View style={[styles.bar, styles.submittingBar]}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={[styles.text, styles.submittingText]}>
          Submitting to server...
        </Text>
      </View>
    );
  }

  if (!isOnline) {
    return (
      <View style={[styles.bar, styles.offlineBar]}>
        <View style={[styles.dot, { backgroundColor: colors.warning }]} />
        <Text style={[styles.text, styles.offlineText]}>Offline</Text>
      </View>
    );
  }

  return (
    <View style={[styles.bar, styles.onlineBar]}>
      <View style={[styles.dot, { backgroundColor: colors.success }]} />
      <Text style={[styles.text, styles.onlineText]}>Online</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    marginBottom: spacing.sm,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  onlineBar: {
    backgroundColor: colors.successDim,
  },
  onlineText: {
    color: colors.success,
  },
  offlineBar: {
    backgroundColor: colors.warningDim,
  },
  offlineText: {
    color: colors.warning,
  },
  submittingBar: {
    backgroundColor: colors.accentDim,
  },
  submittingText: {
    color: colors.accent,
  },
  errorBar: {
    backgroundColor: colors.errorDim,
  },
  errorText: {
    color: colors.error,
    flex: 1,
  },
});
