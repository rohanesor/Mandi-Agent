import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { FONTS, SPRING } from '../constants/theme';

type Decision = 'harvest_now' | 'hold_3_days' | 'hold_7_days' | 'redirect_mandi';
type Size = 'sm' | 'md' | 'lg';

const AnimatedView = Animated.createAnimatedComponent(Animated.View);

const decisionConfig: Record<Decision, { bg: string; text: string; icon: string }> = {
  harvest_now: { bg: '#16A34A', text: 'HARVEST NOW', icon: '🌾' },
  hold_3_days: { bg: '#F59E0B', text: 'HOLD 3 DAYS', icon: '⏳' },
  hold_7_days: { bg: '#D97706', text: 'HOLD 7 DAYS', icon: '⏳' },
  redirect_mandi: { bg: '#2563EB', text: 'REDIRECT', icon: '🚛' },
};

const sizeConfig: Record<Size, { h: number; pad: number; fs: number }> = {
  sm: { h: 32, pad: 10, fs: 11 },
  md: { h: 44, pad: 14, fs: 12 },
  lg: { h: 56, pad: 18, fs: 14 },
};

export default function HarvestBadge({ decision, size }: { decision: Decision; size: Size }) {
  const scale = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(1.12, { duration: 80 });
    scale.value = withSequence(withTiming(1.12, { duration: 80 }), withSpring(1, SPRING.bouncy));
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 240 }), withTiming(0, { duration: 240 })), 2, false);
  }, [glow, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    shadowOpacity: glow.value * 0.55,
    shadowRadius: glow.value * 20,
    shadowColor: '#FFFFFF',
    elevation: glow.value * 8,
  }));

  const cfg = decisionConfig[decision];
  const sz = sizeConfig[size];

  return (
    <AnimatedView style={[styles.badge, { backgroundColor: cfg.bg, height: sz.h, borderRadius: sz.h / 2, paddingHorizontal: sz.pad }, animatedStyle]}>
      <Text style={[styles.text, { fontSize: sz.fs }]}>
        {cfg.icon} {cfg.text}
      </Text>
    </AnimatedView>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  text: {
    color: 'white',
    fontFamily: FONTS.display,
    textTransform: 'uppercase',
  },
});
