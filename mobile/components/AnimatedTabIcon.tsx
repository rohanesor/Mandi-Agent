import { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

interface AnimatedTabIconProps {
  focused: boolean;
  icon: React.ReactNode;
}

export default function AnimatedTabIcon({ focused, icon }: AnimatedTabIconProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.15 : 1, { damping: 10, stiffness: 200 });
  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      {icon}
    </Animated.View>
  );
}
