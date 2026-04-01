import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  LayoutAnimation,
  StyleSheet,
  UIManager,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, shadows } from '@/constants/theme';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface SectionCardProps {
  title: string;
  badge?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export default function SectionCard({
  title,
  badge,
  children,
  defaultOpen = false,
}: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((prev) => !prev);
  }

  return (
    <View style={[styles.outer, shadows.card]}>
      {/* Left accent bar — spans full card height */}
      <View style={[styles.accentBar, open && styles.accentBarOpen]} />

      {/* Card content column */}
      <View style={styles.inner}>
        <Pressable
          onPress={toggle}
          style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
          accessibilityRole="button"
          accessibilityLabel={`${title} section, ${open ? 'expanded' : 'collapsed'}`}
          android_ripple={{ color: colors.accentPress, borderless: false }}
        >
          <Text style={styles.title}>{title}</Text>

          {badge !== undefined && badge > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}

          <View style={styles.spacer} />

          <Ionicons
            name={open ? 'chevron-down' : 'chevron-forward'}
            size={18}
            color={open ? colors.accent : colors.textSecondary}
          />
        </Pressable>

        {open && (
          <>
            <View style={styles.divider} />
            <View style={styles.body}>{children}</View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  accentBar: {
    width: 4,
    backgroundColor: colors.muted,
    opacity: 0.5,
  },
  accentBarOpen: {
    backgroundColor: colors.accent,
    opacity: 1,
  },
  inner: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 60,
    backgroundColor: colors.cardHeader,
  },
  headerPressed: {
    backgroundColor: colors.accentDim,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  badge: {
    backgroundColor: colors.muted,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: spacing.sm,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  spacer: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
});
