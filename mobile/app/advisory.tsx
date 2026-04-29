import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { hapticHeavy, hapticLight } from '../utils/haptics';
import { router } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { useAnimatedAdvisory } from '../hooks';
import { COLORS, FONTS, SPRING } from '../constants/theme';
import { useT } from '../utils/useT';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedText = Animated.createAnimatedComponent(Text);

// Removed hardcoded constants

// Removed hardcoded constant

function ListeningScene({ amplitude, onStop }: { amplitude: number; onStop: () => void }) {
  const { t } = useT();
  const micScale = useSharedValue(1);
  const micRotate = useSharedValue(-2);
  const statusPulse = useSharedValue(0.6);
  const [bars, setBars] = useState<number[]>(Array.from({ length: 30 }, () => 10));

  useEffect(() => {
    micScale.value = withRepeat(withSequence(withSpring(1.05, SPRING.gentle), withSpring(1, SPRING.gentle)), -1, false);
    micRotate.value = withRepeat(withSequence(withSpring(2, SPRING.gentle), withSpring(-2, SPRING.gentle)), -1, false);
    statusPulse.value = withRepeat(withSequence(withSpring(1, SPRING.gentle), withSpring(0.6, SPRING.gentle)), -1, false);
  }, [micRotate, micScale, statusPulse]);

  useEffect(() => {
    const barInterval = setInterval(() => {
      setBars((prev) => prev.map((_, i) => {
        const normalizedAmplitude = Math.max(0, Math.min(1, amplitude));
        const noise = Math.sin(Date.now() / 150 + i * 0.5) * 0.15 + 0.85;
        return 4 + Math.min(60, normalizedAmplitude * 60 * noise);
      }));
    }, 90);
    return () => clearInterval(barInterval);
  }, [amplitude]);

  const micStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }, { rotate: `${micRotate.value}deg` }],
  }));
  const statusStyle = useAnimatedStyle(() => ({ opacity: statusPulse.value }));

  return (
    <View style={styles.stateFill}>
      <View style={styles.ringsContainer}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={`ring-${i}`} style={[styles.ring, { borderWidth: 2, borderColor: COLORS.harvest, opacity: 0.3 - i * 0.05 }]} />
        ))}
      </View>

      <AnimatedView style={[styles.micContainer, micStyle]}>
        <View style={styles.micBody}>
          <View style={styles.micTop} />
          <View style={styles.micBase} />
        </View>
      </AnimatedView>

      <View style={styles.waveWrap}>
        <View style={styles.waveRow}>
          {bars.map((h, i) => (
            <View key={`bar-${i}`} style={[styles.waveBar, { height: Math.max(4, h) }]} />
          ))}
        </View>
        <AnimatedText style={[styles.listenText, statusStyle]}>{t('listening')}</AnimatedText>
      </View>

      <AnimatedPressable
        style={styles.stopBtn}
        onPressIn={() => runOnJS(onStop)()}
        onPressOut={async () => { hapticHeavy(); }}
      >
        <View style={styles.stopSquare} />
      </AnimatedPressable>
    </View>
  );
}

function ProcessingScene({ orbsLit, completedStages }: { orbsLit: number[]; completedStages: string[] }) {
  const { t } = useT();
  const processingMessages = [
    t('processing'),
    'AI विश्लेषण कर रहा है... · AI is analyzing...',
    'सलाह तैयार हो रही है... · Advisory is generating...',
  ];
  const orbitLabels = ['Mandi', 'ISRO', 'Weather', 'e-NAM', 'KVK', 'Price', 'Risk', 'AI'];
  
  const msgY = useSharedValue(0);
  const msgOpacity = useSharedValue(1);
  const dotScale = useSharedValue(1);
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    dotScale.value = withRepeat(withSequence(withSpring(1.2, SPRING.gentle), withSpring(1, SPRING.gentle)), -1, false);
    const msgInterval = setInterval(() => {
      msgY.value = withSequence(withSpring(-30, SPRING.gentle), withSpring(0, SPRING.gentle));
      msgOpacity.value = withSequence(withSpring(0, SPRING.gentle), withSpring(1, SPRING.gentle));
      setMsgIdx((p) => (p + 1) % processingMessages.length);
    }, 1500);
    return () => clearInterval(msgInterval);
  }, [dotScale, msgOpacity, msgY]);

  const msgStyle = useAnimatedStyle(() => ({
    opacity: msgOpacity.value,
    transform: [{ translateY: msgY.value }],
  }));
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dotScale.value }] }));

  return (
    <View style={styles.stateFill}>
      <LinearGradient colors={[COLORS.forest, '#0D2B1F']} style={StyleSheet.absoluteFill} />
      
      <View style={styles.orbsContainer}>
        {orbitLabels.map((label, i) => (
          <View key={`orb-${i}`} style={[styles.orb, { backgroundColor: i % 2 === 0 ? COLORS.harvest : COLORS.leaf, opacity: orbsLit[i] || 0.3 }]}>
            <Text style={styles.orbText}>{i + 1}</Text>
          </View>
        ))}
      </View>

      <View style={styles.orbLabels}>
        {orbitLabels.map((label, i) => (
          <Text key={`l-${label}`} style={[styles.orbLabelText, completedStages.includes(label.toLowerCase().replace(' ', '_')) && styles.orbLabelLit]}>
            {label} · {i + 1}
          </Text>
        ))}
      </View>

      <AnimatedText style={[styles.processingText, msgStyle]}>{processingMessages[msgIdx]}</AnimatedText>

      <View style={styles.claudePill}>
        <AnimatedView style={[styles.dot, dotStyle]} />
        <Text style={styles.claudeText}>Mandi AI · Analysis</Text>
      </View>
    </View>
  );
}

function ResultScene({
  decision,
  forecastPrice,
  spoilageRisk,
  fullText,
  priceCounterValue,
  spoilageBarWidth,
}: {
  decision: string;
  forecastPrice: number;
  spoilageRisk: number;
  fullText: string;
  priceCounterValue: number;
  spoilageBarWidth: number;
}) {
  const { t } = useT();
  const badgeScale = useSharedValue(0);
  const primaryScale = useSharedValue(1);
  const secondaryScale = useSharedValue(1);
  const playhead = useSharedValue(0);

  useEffect(() => {
    badgeScale.value = withSequence(withSpring(1.08, SPRING.bouncy), withSpring(1, SPRING.gentle));
    playhead.value = withRepeat(withSequence(withSpring(1, { duration: 2000 }), withSpring(0, { duration: 0 })), -1, false);
  }, [badgeScale, playhead]);

  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: badgeScale.value }] }));
  const primaryBtnStyle = useAnimatedStyle(() => ({ transform: [{ scale: primaryScale.value }] }));
  const secondaryBtnStyle = useAnimatedStyle(() => ({ transform: [{ scale: secondaryScale.value }] }));
  const playheadStyle = useAnimatedStyle(() => ({ left: `${interpolate(playhead.value, [0, 1], [0, 95])}%` }));

  const bg = decision === 'harvest_now' ? [COLORS.night, COLORS.night] : decision === 'redirect' ? ['#0C1B33', '#0C1B33'] : [COLORS.forest, '#451A03'];

  const decisionColors: Record<string, string> = {
    harvest_now: '#EF4444',
    redirect: '#3B82F6',
    hold_5_days: COLORS.harvest,
    hold_3_days: COLORS.harvest,
    hold_7_days: COLORS.harvest,
  };

  const getDecisionLabel = () => {
    switch (decision) {
      case 'harvest_now': return t('harvestNow');
      case 'redirect': return t('redirect');
      case 'hold_5_days': return `${t('hold')} 5`;
      case 'hold_3_days': return `${t('hold')} 3`;
      case 'hold_7_days': return `${t('hold')} 7`;
      default: return `${t('hold')} 5`;
    }
  };

  const decColor = decisionColors[decision] || COLORS.harvest;

  return (
    <ScrollView contentContainerStyle={styles.resultWrap}>
      <LinearGradient colors={bg as [string, string]} style={StyleSheet.absoluteFill} />
      
      <View style={styles.resultHeader}>
        <Animated.View style={[styles.badgeContainer, badgeStyle]}>
          <View style={[styles.badge, { backgroundColor: decColor }]}>
            <Text style={styles.badgeText}>{getDecisionLabel()}</Text>
          </View>
        </Animated.View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('forecastPrice')}</Text>
            <Text style={styles.statValue}>₹{priceCounterValue}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('spoilageRisk')}</Text>
            <View style={styles.riskBar}>
              <View style={[styles.riskFill, { width: `${spoilageBarWidth}%`, backgroundColor: spoilageRisk > 50 ? '#EF4444' : COLORS.sprout }]} />
            </View>
            <Text style={styles.statValue}>{spoilageRisk}%</Text>
          </View>
        </View>

        <View style={styles.advisoryCard}>
          <View style={styles.playheadTrack}>
            <View style={[styles.playhead, playheadStyle]} />
          </View>
          <Text style={styles.advisoryText}>{fullText}</Text>
        </View>
      </View>

      <View style={styles.actionButtons}>
        <AnimatedPressable
          style={[styles.primaryBtn, primaryBtnStyle]}
          onPressIn={() => { primaryScale.value = withSpring(0.96, SPRING.snappy); }}
          onPressOut={async () => {
            primaryScale.value = withSpring(1, SPRING.gentle);
            hapticHeavy();
            router.replace('/(tabs)/farm');
          }}
        >
          <Text style={styles.primaryText}>{t('viewMyFarm')}</Text>
        </AnimatedPressable>

        <AnimatedPressable
          style={[styles.secondaryBtn, secondaryBtnStyle]}
          onPressIn={() => { secondaryScale.value = withSpring(0.96, SPRING.snappy); }}
          onPressOut={async () => {
            secondaryScale.value = withSpring(1, SPRING.gentle);
            hapticLight();
            router.replace('/advisory');
          }}
        >
          <Text style={styles.secondaryText}>{t('askAnother')}</Text>
        </AnimatedPressable>
      </View>
    </ScrollView>
  );
}

export default function AdvisoryScreen() {
  const { t } = useT();
  const animatedAdvisory = useAnimatedAdvisory();
  const { recording, pipeline, advisory, animationValues, actions } = animatedAdvisory;

  const micScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: animationValues.micScale.value as number }],
  }));
  const sonarOpacityStyle = useAnimatedStyle(() => ({
    opacity: animationValues.sonarOpacity.value as number,
  }));

  const [displayState, setDisplayState] = useState<'idle' | 'listening' | 'processing' | 'result'>('idle');

  useEffect(() => {
    if (pipeline.isProcessing) {
      setDisplayState('processing');
    } else if (advisory.advisory) {
      setDisplayState('result');
    } else if (recording.isRecording) {
      setDisplayState('listening');
    } else {
      setDisplayState('idle');
    }
  }, [pipeline.isProcessing, advisory.advisory, recording.isRecording]);

  useEffect(() => {
    const hasCompletedGuardrail = pipeline.completedStages.includes('guardrail_approved');
    if (hasCompletedGuardrail && advisory.advisory) {
      setDisplayState('result');
    }
  }, [pipeline.completedStages, advisory.advisory]);

  const handleMicPress = async () => { await actions.handleMicPress(); };
  const handleMicRelease = async () => { await actions.handleMicRelease(); };

  const orbsLitArray = animationValues.orbsLit.map((orb) => orb.value as number);
  const completedStageNames = pipeline.completedStages.map((stage) => {
    switch (stage) {
      case 'data_fetched': return 'mandi';
      case 'rag_retrieved': return 'isro';
      case 'price_predicted': return 'weather';
      case 'advisory_generated': return 'enam';
      case 'guardrail_approved': return 'price';
      default: return stage;
    }
  });

  return (
    <View style={styles.container}>
      {displayState === 'listening' && <ListeningScene amplitude={recording.amplitude} onStop={handleMicRelease} />}
      {displayState === 'processing' && <ProcessingScene orbsLit={orbsLitArray} completedStages={completedStageNames} />}
      {displayState === 'result' && advisory.advisory && (
        <ResultScene
          decision={advisory.advisory.decision}
          forecastPrice={advisory.advisory.forecast_price}
          spoilageRisk={advisory.advisory.spoilage_risk_pct}
          fullText={advisory.advisory.full_text_english}
          priceCounterValue={animationValues.priceCounterValue.value as number}
          spoilageBarWidth={animationValues.spoilageBarWidth.value as number}
        />
      )}

      {displayState === 'idle' && (
        <View style={styles.idleContainer}>
          <LinearGradient colors={[COLORS.forest, '#0D2B1F']} style={StyleSheet.absoluteFill} />
          <AnimatedView style={[styles.voiceSectionIdle, micScaleStyle]}>
            <View style={styles.sonarRings}>
              <AnimatedView style={[styles.sonarRing, sonarOpacityStyle]} />
              <AnimatedView style={[styles.sonarRing, styles.sonarRing2, sonarOpacityStyle]} />
            </View>
            <AnimatedPressable style={styles.micButton} onPressIn={handleMicPress} onPressOut={handleMicRelease}>
              <LinearGradient colors={[COLORS.harvest, '#D97706']} style={styles.micGradient}>
                <Text style={styles.micIcon}>🎤</Text>
              </LinearGradient>
            </AnimatedPressable>
            <Text style={styles.idleLabel}>{t('speakBtn')}</Text>
          </AnimatedView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D2B1F' },
  stateFill: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D2B1F' },
  ringsContainer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 200, height: 200, borderRadius: 100 },
  micContainer: { marginTop: -40, alignItems: 'center' },
  micBody: { alignItems: 'center' },
  micTop: { width: 60, height: 90, backgroundColor: COLORS.terracotta, borderRadius: 20 },
  micBase: { width: 80, height: 8, backgroundColor: COLORS.soil, borderRadius: 4, marginTop: 4 },
  waveWrap: { position: 'absolute', bottom: 130, width: '100%', alignItems: 'center' },
  waveRow: { flexDirection: 'row', alignItems: 'flex-end', height: 62 },
  waveBar: { width: 3, marginHorizontal: 1, borderRadius: 3, backgroundColor: COLORS.harvest },
  listenText: { marginTop: 12, color: COLORS.white, fontFamily: FONTS.medium, fontSize: 18 },
  stopBtn: { position: 'absolute', bottom: 40, width: 64, height: 64, borderRadius: 32, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 22, height: 22, backgroundColor: '#FFFFFF', borderRadius: 3 },
  orbsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: 200, gap: 16 },
  orb: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  orbText: { color: '#FFF', fontFamily: FONTS.bold, fontSize: 14 },
  orbLabels: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 20 },
  orbLabelText: { color: '#FFFFFF', fontSize: 9, fontFamily: FONTS.body, opacity: 0.9 },
  orbLabelLit: { color: COLORS.grain, opacity: 1 },
  processingText: { position: 'absolute', top: '58%', color: COLORS.sprout, fontFamily: FONTS.medium, fontSize: 16 },
  claudePill: { position: 'absolute', bottom: 36, backgroundColor: COLORS.forest, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.harvest },
  claudeText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  resultWrap: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 60 },
  resultHeader: { alignItems: 'center' },
  badgeContainer: { alignItems: 'center', marginBottom: 24 },
  badge: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  badgeText: { color: '#FFFFFF', fontFamily: FONTS.bold, fontSize: 20 },
  badgeHi: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 14, marginTop: 8 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: COLORS.forest, borderRadius: 16, padding: 16, alignItems: 'center' },
  statLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, textAlign: 'center', marginBottom: 8 },
  statValue: { color: COLORS.white, fontFamily: FONTS.mono, fontSize: 24 },
  riskBar: { width: '100%', height: 6, backgroundColor: COLORS.night, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  riskFill: { height: '100%', borderRadius: 3 },
  advisoryCard: { backgroundColor: COLORS.forest, borderRadius: 16, padding: 16, width: '100%' },
  playheadTrack: { height: 4, backgroundColor: COLORS.night, borderRadius: 2, marginBottom: 12, overflow: 'hidden' },
  playhead: { position: 'absolute', width: 8, height: 4, backgroundColor: COLORS.harvest, borderRadius: 2 },
  advisoryText: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 15, lineHeight: 24 },
  actionButtons: { marginTop: 24, gap: 12 },
  primaryBtn: { backgroundColor: COLORS.harvest, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: COLORS.night, fontFamily: FONTS.bold, fontSize: 16 },
  secondaryBtn: { backgroundColor: COLORS.forest, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.canopy },
  secondaryText: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 16 },
  idleContainer: { flex: 1 },
  voiceSectionIdle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sonarRings: { position: 'absolute', width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  sonarRing: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: COLORS.harvest },
  sonarRing2: { width: 180, height: 180, borderRadius: 90 },
  micButton: { width: 80, height: 80, borderRadius: 40, overflow: 'hidden' },
  micGradient: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  micIcon: { fontSize: 32 },
  idleLabel: { position: 'absolute', bottom: 100, color: COLORS.sprout, fontFamily: FONTS.medium, fontSize: 18 },
});
