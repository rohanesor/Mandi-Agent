import { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { COLORS } from '../constants/theme';

const GRASS_BLADES = 7;
const WIND_PARTICLES = 10;

interface GrassBladeProps {
  index: number;
  height: number;
}

function GrassBlade({ index, height }: GrassBladeProps) {
  const sway = useSharedValue(0);

  useEffect(() => {
    const duration = 1200 + Math.random() * 800;
    sway.value = withRepeat(
      withSequence(
        withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: sway.value * 3 },
      { rotate: `${sway.value * 4}deg` },
    ],
  }));

  const width = 2 + Math.random() * 2;
  const left = (index / GRASS_BLADES) * 100;
  const opacity = 0.08 + Math.random() * 0.06;

  return (
    <Animated.View
      style={[
        styles.grassBlade,
        {
          left: `${left}%`,
          width,
          height,
          opacity,
          backgroundColor: COLORS.sprout,
          borderBottomLeftRadius: width,
          borderBottomRightRadius: width,
        },
        animatedStyle,
      ]}
    />
  );
}

function WindParticle() {
  const progress = useSharedValue(0);
  const yPos = Math.random() * 80 + 10;
  const size = 2 + Math.random() * 3;
  const speed = 3000 + Math.random() * 4000;

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: speed, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 120 - 10 }, { translateY: Math.sin(progress.value * Math.PI * 2) * 5 }],
    opacity: 0.3 * (1 - Math.abs(progress.value - 0.5) * 2),
  }));

  return (
    <Animated.View
      style={[
        styles.windParticle,
        { width: size, height: size, top: `${yPos}%`, borderRadius: size / 2, backgroundColor: COLORS.white },
        animatedStyle,
      ]}
    />
  );
}

export default function AnimatedBackground({ children }: { children: React.ReactNode }) {
  const bladeHeights = Array.from({ length: GRASS_BLADES }, () => 60 + Math.random() * 80);

  return (
    <View style={styles.container}>
      {children}
      <View style={styles.overlay} pointerEvents="none">
        {bladeHeights.map((height, i) => (
          <GrassBlade key={`grass-${i}`} index={i} height={height} />
        ))}
        {Array.from({ length: WIND_PARTICLES }).map((_, i) => (
          <WindParticle key={`wind-${i}`} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  grassBlade: {
    position: 'absolute',
    bottom: 0,
  },
  windParticle: {
    position: 'absolute',
    left: 0,
  },
});
