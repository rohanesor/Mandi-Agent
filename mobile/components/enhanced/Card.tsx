import React from 'react';
import { Pressable, ViewStyle } from 'react-native';
import { COLORS, PADDING, SHADOWS, BORDER_RADIUS } from '../../constants/designSystem';

export interface CardProps {
  variant?: 'default' | 'elevated' | 'outlined' | 'filled';
  highlight?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  accessible?: boolean;
  accessibilityLabel?: string;
}

export function Card({
  variant = 'default',
  highlight = false,
  children,
  style,
  onPress,
  accessible = onPress ? true : false,
  accessibilityLabel,
}: CardProps) {
  const getCardStyle = () => {
    const baseStyle: ViewStyle = {
      paddingHorizontal: PADDING.card,
      paddingVertical: PADDING.card,
      borderRadius: BORDER_RADIUS.md,
      ...SHADOWS.elevation1,
    };

    switch (variant) {
      case 'elevated':
        return {
          ...baseStyle,
          ...SHADOWS.elevation2,
          backgroundColor: COLORS.primary.main,
        };
      case 'outlined':
        return {
          ...baseStyle,
          backgroundColor: COLORS.neutral.white,
          borderWidth: 1,
          borderColor: COLORS.primary.main,
          shadowOpacity: 0,
        } as ViewStyle;
      case 'filled':
        return {
          ...baseStyle,
          backgroundColor: COLORS.accent.orange,
        };
      default: // 'default'
        return {
          ...baseStyle,
          backgroundColor: COLORS.primary.main,
        };
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onPress ? 'button' : 'none'}
      style={({ pressed }) => [
        getCardStyle(),
        highlight && {
          borderLeftWidth: 4,
          borderLeftColor: COLORS.accent.orange,
        },
        style,
        onPress && pressed && { opacity: 0.8 },
      ]}
    >
      {children}
    </Pressable>
  );
}
