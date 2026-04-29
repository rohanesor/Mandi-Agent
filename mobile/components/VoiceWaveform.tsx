import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SPRING } from '../constants/theme';

type Props = {
  isRecording: boolean;
  amplitude: number;
  isPlaying: boolean;
  progress: number;
};

const BAR_COUNT = 60;
const BAR_W = 3;
const GAP = 2;
const TOTAL_W = BAR_COUNT * (BAR_W + GAP);
const AnimatedView = Animated.createAnimatedComponent(View);

function WaveBar({
  target,
  played,
}: {
  target: number;
  played: boolean;
}) {
  const h = useSharedValue(6);
  useEffect(() => {
    h.value = withSpring(target, SPRING.snappy);
  }, [h, target]);
  const style = useAnimatedStyle(() => ({
    height: h.value,
    opacity: played ? 1 : 0.35,
  }));
  return (
    <AnimatedView style={[styles.bar, style]}>
      <LinearGradient colors={['#F59E0B', '#74C69D']} style={StyleSheet.absoluteFill} />
    </AnimatedView>
  );
}

export default function VoiceWaveform({ isRecording, amplitude, isPlaying, progress }: Props) {
  const [bars, setBars] = useState<number[]>(Array.from({ length: BAR_COUNT }, () => 6));
  const playX = useSharedValue(0);
  const precomputed = useMemo(() => Array.from({ length: BAR_COUNT }, (_, i) => 8 + (Math.sin(i * 0.45) + 1) * 16), []);

  useEffect(() => {
    const t = setInterval(() => {
      setBars((prev) =>
        prev.map((p, i) => {
          if (isRecording) {
            const rand = 0.6 + Math.random() * 0.8;
            const next = Math.max(4, Math.min(60, amplitude * rand * 60));
            return 0.7 * p + 0.3 * next;
          }
          if (isPlaying) return precomputed[i];
          const wave = 6 + Math.abs(Math.sin(Date.now() / 450 * 2 + i * 0.3)) * 10;
          return 0.7 * p + 0.3 * wave;
        })
      );
    }, 90);
    return () => clearInterval(t);
  }, [amplitude, isPlaying, isRecording, precomputed]);

  useEffect(() => {
    playX.value = withTiming(progress * TOTAL_W, { duration: 100 });
  }, [playX, progress]);

  const playheadStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: playX.value }],
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {bars.map((h, i) => (
          <WaveBar
            key={`bar-${i}`}
            target={h}
            played={isPlaying ? i <= Math.floor(progress * BAR_COUNT) : true}
          />
        ))}
      </View>
      {isPlaying ? <AnimatedView style={[styles.playhead, playheadStyle]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: TOTAL_W,
    height: 64,
    justifyContent: 'center',
    position: 'relative',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 60,
  },
  bar: {
    width: BAR_W,
    marginRight: GAP,
    borderRadius: 3,
    overflow: 'hidden',
    minHeight: 4,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#FFFFFF',
  },
});
