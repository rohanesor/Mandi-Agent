import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { FONTS } from '../constants/theme';

const AnimatedView = Animated.createAnimatedComponent(View);

function useMinDuration(visible: boolean, minMs = 800) {
  const [show, setShow] = useState(visible);
  useEffect(() => {
    if (visible) {
      setShow(true);
      return;
    }
    const t = setTimeout(() => setShow(false), minMs);
    return () => clearTimeout(t);
  }, [minMs, visible]);
  return show;
}

export default function AgriculturalLoader({ visible = true }: { visible?: boolean }) {
  const show = useMinDuration(visible, 800);
  const textY = useSharedValue(20);
  const dots = useSharedValue(0);
  const sunX = useSharedValue(0);

  useEffect(() => {
    textY.value = withSpring(0);
    dots.value = withRepeat(withSequence(withTiming(1, { duration: 500 }), withTiming(2, { duration: 500 }), withTiming(3, { duration: 500 })), -1, false);
  }, [dots, textY]);

  useEffect(() => {
    sunX.value = withRepeat(withTiming(1, { duration: 3000 }), -1, true);
  }, [sunX]);

  const textStyle = useAnimatedStyle(() => ({ transform: [{ translateY: textY.value }] }));
  const dotCount = Math.round(dots.value);

  if (!show) return null;

  return (
    <View style={styles.container}>
      <View style={styles.bg} />
      <View style={styles.stars}>
        {[...Array(12)].map((_, i) => (
          <View key={`s-${i}`} style={[styles.star, { left: `${(i * 8) % 100}%`, top: `${(i * 7) % 30}%` }]} />
        ))}
      </View>
      <Animated.View style={[styles.sunContainer, { left: sunX }]}>
        <View style={styles.sun} />
        <View style={styles.rays}>
          {[...Array(8)].map((_, i) => (
            <View key={`ray-${i}`} style={[styles.ray, { transform: [{ rotate: `${i * 45}deg` }] }]} />
          ))}
        </View>
      </Animated.View>
      <View style={styles.crops}>
        {[...Array(6)].map((_, i) => (
          <View key={`crop-${i}`} style={[styles.crop, { left: `${8 + i * 17}%` }]}>
            <View style={styles.stem} />
            <View style={[styles.leaf, styles.leafLeft]} />
            <View style={[styles.leaf, styles.leafRight]} />
          </View>
        ))}
      </View>
      <AnimatedView style={[styles.textWrap, textStyle]}>
        <Text style={styles.text}>AI सोच रहा है{'.'.repeat(dotCount)}</Text>
      </AnimatedView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0D2B1F',
    justifyContent: 'flex-end',
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0D2B1F',
  },
  stars: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.3,
  },
  star: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  sunContainer: {
    position: 'absolute',
    top: '30%',
    width: 40,
    height: 40,
    marginLeft: 24,
  },
  sun: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FCD34D',
  },
  rays: {
    position: 'absolute',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ray: {
    position: 'absolute',
    width: 2,
    height: 15,
    backgroundColor: '#FED7AA',
    top: -7,
  },
  crops: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    height: 80,
  },
  crop: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
  },
  stem: {
    width: 2,
    height: 40,
    backgroundColor: '#74C69D',
  },
  leaf: {
    position: 'absolute',
    width: 12,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#40916C',
  },
  leafLeft: {
    top: 10,
    left: -10,
    transform: [{ rotate: '-20deg' }],
  },
  leafRight: {
    top: 18,
    right: -10,
    transform: [{ rotate: '20deg' }],
  },
  textWrap: {
    paddingBottom: 30,
    alignItems: 'center',
  },
  text: {
    color: '#74C69D',
    fontFamily: FONTS.bodyMed,
    fontSize: 16,
  },
});
