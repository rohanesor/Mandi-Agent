import { useCallback, useRef } from 'react';
import { Pressable, Platform, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

interface HoverCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  scale?: number;
  style?: any;
  disabled?: boolean;
}

export default function HoverCard({ children, onPress, scale = 1.02, style, disabled }: HoverCardProps) {
  const isHovered = useRef(false);

  // Always create shared values so hooks aren't conditional
  const animScale = useSharedValue(1);
  const animElevation = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    // Apply hover effect only on web, but still run the animation
    if (Platform.OS !== 'web') return {};
    return {
      transform: [{ scale: animScale.value }],
      elevation: animElevation.value,
      shadowOpacity: Platform.OS === 'web' ? (animElevation.value > 0 ? 0.15 : 0) : 0,
      shadowRadius: animElevation.value * 2,
      shadowOffset: { width: 0, height: animElevation.value },
    };
  });

  const handlePointerEnter = useCallback(() => {
    if (Platform.OS !== 'web') return;
    isHovered.current = true;
    animScale.value = withSpring(scale, { damping: 15, stiffness: 200 });
    animElevation.value = withSpring(4, { damping: 15, stiffness: 200 });
  }, [scale]);

  const handlePointerLeave = useCallback(() => {
    if (Platform.OS !== 'web') return;
    isHovered.current = false;
    animScale.value = withSpring(1, { damping: 15, stiffness: 200 });
    animElevation.value = withSpring(0, { damping: 15, stiffness: 200 });
  }, []);

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        style={styles.pressable}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
});
