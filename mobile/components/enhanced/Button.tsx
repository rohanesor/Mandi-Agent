import { Pressable, Text, ViewStyle, PressableStateCallbackType } from 'react-native';
import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../../constants/designSystem';

export interface ButtonProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  onPress,
  disabled = false,
  loading = false,
  style,
}: ButtonProps) {
  const getSizeStyle = () => {
    switch (size) {
      case 'sm':
        return {
          height: 32,
          paddingHorizontal: SPACING.md,
          ...TYPOGRAPHY.body,
        };
      case 'lg':
        return {
          height: 48,
          paddingHorizontal: SPACING.xl,
          ...TYPOGRAPHY.bodyLarge,
        };
      default: // 'md'
        return {
          height: 40,
          paddingHorizontal: SPACING.lg,
          ...TYPOGRAPHY.body,
        };
    }
  };

  const getVariantStyle = () => {
    switch (variant) {
      case 'secondary':
        return {
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderColor: COLORS.primary.main,
        };
      case 'tertiary':
        return {
          backgroundColor: 'transparent',
          borderWidth: 0,
        };
      case 'danger':
        return {
          backgroundColor: COLORS.accent.warning,
        };
      default: // 'primary'
        return {
          backgroundColor: COLORS.accent.orange,
        };
    }
  };

  const getTextColor = () => {
    if (variant === 'secondary' || variant === 'tertiary') {
      return COLORS.primary.main;
    }
    return COLORS.neutral.white;
  };

  const getTextWeight = () => {
    return variant === 'secondary' ? '600' : '500';
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }: PressableStateCallbackType) => [
        {
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: BORDER_RADIUS.sm,
          opacity: pressed && !disabled ? 0.8 : disabled ? 0.5 : 1,
        },
        getSizeStyle(),
        getVariantStyle(),
        style,
      ]}
    >
      <Text
        style={{
          color: getTextColor(),
          fontWeight: getTextWeight(),
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
