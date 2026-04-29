import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring } from 'react-native-reanimated';
import { FONTS, SPRING } from '../constants/theme';

type Props = {
  current: number;
  previous: number;
  size?: 'sm' | 'md' | 'lg';
};

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedText = Animated.createAnimatedComponent(Text);

export default function PriceChangeIndicator({ current, previous, size = 'md' }: Props) {
  const delta = current - previous;
  const pct = previous === 0 ? 0 : (delta / previous) * 100;
  const rising = delta > 0;
  const falling = delta < 0;
  const stable = delta === 0;
  const y = useSharedValue(0);
  const stableOpacity = useSharedValue(0.6);
  const bubbleX = useSharedValue(18);
  const bubbleOpacity = useSharedValue(0);

  useEffect(() => {
    bubbleX.value = withSpring(0, SPRING.gentle);
    bubbleOpacity.value = withSpring(1, SPRING.gentle);
    if (rising) {
      y.value = withSequence(
        withSpring(-6, SPRING.snappy), withSpring(0, SPRING.snappy),
        withSpring(-4, SPRING.snappy), withSpring(0, SPRING.snappy),
        withSpring(-2, SPRING.snappy), withSpring(0, SPRING.snappy)
      );
    } else if (falling) {
      y.value = withSequence(
        withSpring(6, SPRING.snappy), withSpring(0, SPRING.snappy),
        withSpring(4, SPRING.snappy), withSpring(0, SPRING.snappy),
        withSpring(2, SPRING.snappy), withSpring(0, SPRING.snappy)
      );
    } else {
      stableOpacity.value = withRepeat(
        withSequence(withSpring(1, SPRING.gentle), withSpring(0.6, SPRING.gentle)),
        -1,
        true
      );
    }
  }, [bubbleOpacity, bubbleX, falling, rising, stableOpacity, y]);

  const arrowStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const stableStyle = useAnimatedStyle(() => ({ opacity: stableOpacity.value }));
  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: bubbleX.value }],
    opacity: bubbleOpacity.value,
  }));

  const fontSize = size === 'sm' ? 12 : size === 'lg' ? 18 : 14;
  const color = rising ? '#52B788' : falling ? '#EF4444' : '#F59E0B';
  const icon = rising ? '↑' : falling ? '↓' : '→';
  const text = stable ? 'Stable' : `${delta > 0 ? '+' : '-'}₹${Math.abs(delta)} (${delta > 0 ? '+' : ''}${pct.toFixed(1)}%)`;

  return (
    <View style={styles.row}>
      <AnimatedText style={[styles.icon, { color, fontSize: fontSize + 2 }, arrowStyle, stable ? stableStyle : null]}>
        {icon}
      </AnimatedText>
      <Text style={[styles.text, { color, fontSize }]}>{text}</Text>
      <AnimatedView style={[styles.bubble, { backgroundColor: `${color}33` }, bubbleStyle]}>
        <Text style={[styles.bubbleText, { color }]}>{pct.toFixed(1)}%</Text>
      </AnimatedView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { fontFamily: FONTS.mono },
  text: { fontFamily: FONTS.mono },
  bubble: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  bubbleText: { fontFamily: FONTS.mono, fontSize: 10 },
});
