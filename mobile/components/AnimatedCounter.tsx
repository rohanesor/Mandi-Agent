import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { FONTS, SPRING } from '../constants/theme';

type Props = {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  fontSize?: number;
  color?: string;
};

export default function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  duration = 1200,
  fontSize = 24,
  color = 'white',
}: Props) {
  const progress = useSharedValue(0);
  const oldY = useSharedValue(0);
  const oldOpacity = useSharedValue(1);
  const newY = useSharedValue(14);
  const newOpacity = useSharedValue(0);

  const [displayValue, setDisplayValue] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    progress.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [duration, progress, value]);

  useEffect(() => {
    if (previous.current === value) return;
    setDisplayValue(previous.current);
    oldY.value = withSpring(-14, SPRING.gentle);
    oldOpacity.value = withSpring(0, SPRING.gentle);
    newY.value = withSpring(0, SPRING.gentle);
    newOpacity.value = withSpring(1, SPRING.gentle);
    const t = setTimeout(() => {
      previous.current = value;
      setDisplayValue(value);
      oldY.value = 0;
      oldOpacity.value = 1;
      newY.value = 14;
      newOpacity.value = 0;
    }, 220);
    return () => clearTimeout(t);
  }, [newOpacity, newY, oldOpacity, oldY, value]);

  const oldStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: oldY.value }],
    opacity: oldOpacity.value,
  }));
  const newStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: newY.value }],
    opacity: newOpacity.value,
  }));

  const baseStyle = useMemo(
    () => [styles.counter, { fontSize, color }],
    [color, fontSize]
  );

  return (
    <View style={styles.wrap}>
      <Text style={baseStyle}>
        {prefix}{displayValue}{suffix}
      </Text>
      {previous.current !== value && (
        <View style={StyleSheet.absoluteFill}>
          <Animated.Text style={[baseStyle, styles.overlay, oldStyle]}>
            {prefix}{previous.current}{suffix}
          </Animated.Text>
          <Animated.Text style={[baseStyle, styles.overlay, newStyle]}>
            {prefix}{value}{suffix}
          </Animated.Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 30,
    justifyContent: 'center',
  },
  counter: {
    fontFamily: FONTS.mono,
    padding: 0,
    includeFontPadding: false,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
