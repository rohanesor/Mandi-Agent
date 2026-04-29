/**
 * HapticFeedback — Utility for tactile feedback across the app
 * Wraps expo-haptics with a clean API
 *
 * Usage:
 *   Haptic.trigger(Haptics.success)
 *   Haptic.impact()
 *   Haptic.selection()
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export const Haptic = {
  /** Light tap — for toggle switches, small buttons */
  light: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  /** Medium tap — for primary buttons, cards */
  medium: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },

  /** Heavy tap — for major actions, confirmations */
  heavy: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  },

  /** Success feedback — for completed actions, correct answers */
  success: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },

  /** Warning feedback — for alerts, cautions */
  warning: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },

  /** Error feedback — for failures, invalid actions */
  error: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },

  /** Selection tick — for scroll snaps, picker changes */
  selection: async () => {
    await Haptics.selectionAsync();
  },

  /** Impact — generic heavy feedback */
  impact: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  },
};

/**
 * HapticButton — Wrapper component that adds haptic feedback to any touchable
 */
import React from 'react';
import { TouchableOpacity, TouchableOpacityProps } from 'react-native';

interface HapticButtonProps extends TouchableOpacityProps {
  hapticType?: 'light' | 'medium' | 'heavy' | 'success';
}

export const HapticButton: React.FC<HapticButtonProps> = ({
  hapticType = 'medium',
  onPress,
  ...props
}) => {
  const handlePress: typeof onPress = async (event) => {
    if (hapticType === 'light') await Haptic.light();
    else if (hapticType === 'medium') await Haptic.medium();
    else if (hapticType === 'heavy') await Haptic.heavy();
    else if (hapticType === 'success') await Haptic.success();
    onPress?.(event);
  };

  return <TouchableOpacity onPress={handlePress} {...props} />;
};
