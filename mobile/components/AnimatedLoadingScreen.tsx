import { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSpring,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { COLORS, FONTS } from '../constants/theme';

const WHEAT = ['🌾', '🌾', '🌾'];

function BouncingWheat({ index, delay }: { index: number; delay: number }) {
  const translateY = useSharedValue(0);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    const timer = setTimeout(() => {
      translateY.value = withRepeat(
        withSequence(
          withSpring(-8, { damping: 3, stiffness: 150 }),
          withSpring(0, { damping: 3, stiffness: 150 }),
        ),
        -1,
        true,
      );
      scale.value = withRepeat(
        withSequence(
          withSpring(1.1, { damping: 3, stiffness: 150 }),
          withSpring(0.9, { damping: 3, stiffness: 150 }),
        ),
        -1,
        true,
      );
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.Text style={[styles.wheat, animatedStyle]}>
      {WHEAT[index]}
    </Animated.Text>
  );
}

interface Props {
  onLoaded: () => void;
  minimumDuration?: number;
}

export default function AnimatedLoadingScreen({ onLoaded, minimumDuration = 2500 }: Props) {
  const [progress, setProgress] = useState(0);
  const titleOpacity = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(20);
  const containerOpacity = useSharedValue(1);

  useEffect(() => {
    // Animate title in
    titleOpacity.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.ease) });

    // Animate subtitle in after delay
    const subTimer = setTimeout(() => {
      subtitleOpacity.value = withTiming(1, { duration: 600 });
      subtitleTranslateY.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.ease) });
    }, 400);

    // Simulate progress
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(elapsed / minimumDuration, 1);
      setProgress(pct);
      if (pct >= 1) {
        clearInterval(interval);
      }
    }, 50);

    // Wait minimum duration then crossfade out
    const doneTimer = setTimeout(() => {
      containerOpacity.value = withTiming(0, { duration: 400 }, () => {
        runOnJS(onLoaded)();
      });
    }, minimumDuration);

    return () => {
      clearTimeout(subTimer);
      clearTimeout(doneTimer);
      clearInterval(interval);
      cancelAnimation(titleOpacity);
      cancelAnimation(subtitleOpacity);
      cancelAnimation(subtitleTranslateY);
      cancelAnimation(containerOpacity);
    };
  }, []);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
  }));

  const subtitleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      <View style={styles.wheatRow}>
        {WHEAT.map((_, i) => (
          <BouncingWheat key={i} index={i} delay={i * 200} />
        ))}
      </View>

      <Animated.Text style={[styles.title, titleAnimatedStyle]}>
        Mandi Agent
      </Animated.Text>

      <Animated.Text style={[styles.subtitle, subtitleAnimatedStyle]}>
        आपका खेत, आपकी कमाई
      </Animated.Text>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <Text style={styles.loadingText}>Loading...</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.night,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  wheatRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  wheat: {
    fontSize: 40,
  },
  title: {
    fontFamily: FONTS.display,
    fontSize: 32,
    color: COLORS.white,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.sprout,
    marginBottom: 32,
  },
  progressBar: {
    width: 200,
    height: 4,
    backgroundColor: COLORS.forest,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.harvest,
    borderRadius: 2,
  },
  loadingText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.muted,
  },
});
