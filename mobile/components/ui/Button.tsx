import React, { useState } from 'react';
import {
  Pressable,
  PressableProps,
  StyleSheet,
  ActivityIndicator,
  View,
  Text,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'onPress'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label: string;
  onPress: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  icon?: string; // MaterialCommunityIcons name
  iconPosition?: 'left' | 'right';
  hapticFeedback?: boolean;
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  // Size variants
  smButton: {
    height: 32,
    paddingHorizontal: Spacing.md,
  },
  mdButton: {
    height: 44,
    paddingHorizontal: Spacing.lg,
  },
  lgButton: {
    height: 56,
    paddingHorizontal: Spacing.xl,
  },
  // Color variants
  primaryButton: {
    backgroundColor: '#0066CC',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  dangerButton: {
    backgroundColor: Colors.light.danger,
  },
  ghostButton: {
    backgroundColor: 'transparent',
  },
  disabledButton: {
    opacity: 0.5,
  },
  pressedButton: {
    opacity: 0.7,
  },
  text: {
    fontWeight: '600',
  },
  smText: {
    fontSize: FontSize.sm,
  },
  mdText: {
    fontSize: FontSize.md,
  },
  lgText: {
    fontSize: FontSize.md,
  },
  primaryText: {
    color: '#FFFFFF',
  },
  secondaryText: {
    color: Colors.light.text,
  },
  dangerText: {
    color: '#FFFFFF',
  },
  ghostText: {
    color: Colors.light.text,
  },
  icon: {
    width: 20,
    height: 20,
  },
});

export const Button = React.forwardRef<View, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      label,
      onPress,
      loading = false,
      disabled = false,
      icon,
      iconPosition = 'left',
      hapticFeedback = true,
      ...pressableProps
    },
    ref
  ) => {
    const [isPressed, setIsPressed] = useState(false);

    const handlePress = async () => {
      if (!loading && !disabled) {
        if (hapticFeedback) {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        await onPress();
      }
    };

    const getButtonStyle = (): ViewStyle[] => {
      const result: ViewStyle[] = [styles.button];

      // Size
      if (size === 'sm') result.push(styles.smButton);
      else if (size === 'md') result.push(styles.mdButton);
      else if (size === 'lg') result.push(styles.lgButton);

      // Variant
      if (variant === 'primary') result.push(styles.primaryButton);
      else if (variant === 'secondary') result.push(styles.secondaryButton);
      else if (variant === 'danger') result.push(styles.dangerButton);
      else if (variant === 'ghost') result.push(styles.ghostButton);

      // Disabled
      if (disabled || loading) result.push(styles.disabledButton);

      // Pressed state
      if (isPressed && !disabled && !loading) {
        result.push(styles.pressedButton);
      }

      return result;
    };

    const getTextStyle = (): TextStyle[] => {
      const result: TextStyle[] = [styles.text];

      // Size
      if (size === 'sm') result.push(styles.smText);
      else if (size === 'md') result.push(styles.mdText);
      else if (size === 'lg') result.push(styles.lgText);

      // Variant
      if (variant === 'primary') result.push(styles.primaryText);
      else if (variant === 'secondary') result.push(styles.secondaryText);
      else if (variant === 'danger') result.push(styles.dangerText);
      else if (variant === 'ghost') result.push(styles.ghostText);

      return result;
    };

    const getIconColor = () => {
      if (variant === 'primary' || variant === 'danger') return '#FFFFFF';
      return Colors.light.text;
    };

    const iconSize = size === 'sm' ? 16 : size === 'md' ? 18 : 20;
    const iconName = icon as React.ComponentProps<typeof MaterialCommunityIcons>['name'] | undefined;

    return (
      <Pressable
        ref={ref}
        style={getButtonStyle()}
        onPress={handlePress}
        onPressIn={() => !disabled && !loading && setIsPressed(true)}
        onPressOut={() => setIsPressed(false)}
        disabled={disabled || loading}
        hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        {...pressableProps}
      >
        {iconName && iconPosition === 'left' && !loading && (
          <MaterialCommunityIcons
            name={iconName}
            size={iconSize}
            color={getIconColor()}
            style={styles.icon}
          />
        )}

        {loading ? (
          <ActivityIndicator
            size="small"
            color={getIconColor()}
          />
        ) : (
          <Text style={getTextStyle()}>{label}</Text>
        )}

        {iconName && iconPosition === 'right' && !loading && (
          <MaterialCommunityIcons
            name={iconName}
            size={iconSize}
            color={getIconColor()}
            style={styles.icon}
          />
        )}
      </Pressable>
    );
  }
);

Button.displayName = 'Button';
