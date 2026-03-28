import React from 'react';
import {
  View,
  ViewProps,
  StyleSheet,
  Text,
  Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

export type CardPadding = 'sm' | 'md' | 'lg';

interface CardHeaderProps {
  title: string;
  action?: {
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    onPress: () => void;
    label?: string;
  };
}

interface CardProps extends ViewProps {
  padding?: CardPadding;
  elevation?: number;
  header?: CardHeaderProps;
  children: React.ReactNode;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.background,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: 'hidden',
  },
  // Elevation/shadow
  elevation1: {
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  elevation2: {
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  elevation3: {
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  // Padding variants
  smPadding: {
    padding: Spacing.md,
  },
  mdPadding: {
    padding: Spacing.lg,
  },
  lgPadding: {
    padding: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.light.text,
    flex: 1,
  },
  headerAction: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  content: {
    // Content receives padding based on card prop
  },
});

export const Card = React.forwardRef<View, CardProps>(
  (
    {
      padding = 'md',
      elevation = 1,
      header,
      children,
      style,
      ...viewProps
    },
    ref
  ) => {
    const getPaddingStyle = () => {
      if (padding === 'sm') return styles.smPadding;
      if (padding === 'md') return styles.mdPadding;
      if (padding === 'lg') return styles.lgPadding;
      return styles.mdPadding;
    };

    const getElevationStyle = () => {
      if (elevation === 1) return styles.elevation1;
      if (elevation === 2) return styles.elevation2;
      if (elevation === 3) return styles.elevation3;
      return styles.elevation1;
    };

    return (
      <View
        ref={ref}
        style={[
          styles.card,
          getElevationStyle(),
          style,
        ]}
        {...viewProps}
      >
        {header && (
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{header.title}</Text>
            {header.action && (
              <Pressable
                style={({ pressed }) => [
                  styles.headerAction,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={header.action.onPress}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                accessible
                accessibilityLabel={header.action.label || 'Card action'}
              >
                <MaterialCommunityIcons
                  name={header.action.icon}
                  size={24}
                  color={Colors.light.accent}
                />
              </Pressable>
            )}
          </View>
        )}
        <View style={[getPaddingStyle(), styles.content]}>
          {children}
        </View>
      </View>
    );
  }
);

Card.displayName = 'Card';