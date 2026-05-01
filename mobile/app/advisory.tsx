import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
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
import { useAppStore, selectSessionHistory } from '../store';
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

function ProcessingScene({ orbsLit }: { orbsLit: number[]; completedStages: string[] }) {
  const { t } = useT();
  const processingMessages = [
    t('processing'),
    'AI विश्लेषण कर रहा है...',
    'सलाह तैयार हो रही है...',
  ];
  const orbEmojis = ['📊', '🛰️', '🌦️', '🏪', '🌾', '💰', '⚠️', '🤖'];

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
        {orbEmojis.map((emoji, i) => (
          <View key={`orb-${i}`} style={[styles.orb, { opacity: orbsLit[i] || 0.25 }]}>
            <Text style={styles.orbEmoji}>{emoji}</Text>
          </View>
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

// ─── DECISION CONFIG ──────────────────────────────────────────────────────────
const DECISION_CONFIG: Record<string, {
  emoji: string; color: string; bgColors: [string, string];
  labelEn: string; labelHi: string; actionEmoji: string; actionLabel: string;
}> = {
  harvest_now: {
    emoji: '🌾', color: '#EF4444', bgColors: ['#1a0505', '#0D2B1F'],
    labelEn: 'SELL NOW', labelHi: 'अभी बेचें',
    actionEmoji: '🚛', actionLabel: 'Book Truck',
  },
  redirect: {
    emoji: '🗺️', color: '#3B82F6', bgColors: ['#0C1B33', '#0D2B1F'],
    labelEn: 'GO TO OTHER MANDI', labelHi: 'दूसरी मंडी जाएं',
    actionEmoji: '🗺️', actionLabel: 'Get Directions',
  },
  hold_3_days: {
    emoji: '⏳', color: '#F59E0B', bgColors: ['#1a1505', '#0D2B1F'],
    labelEn: 'WAIT 3 DAYS', labelHi: '3 दिन रुकें',
    actionEmoji: '📅', actionLabel: 'Set Reminder',
  },
  hold_5_days: {
    emoji: '⏳', color: '#F59E0B', bgColors: ['#1a1505', '#0D2B1F'],
    labelEn: 'WAIT 5 DAYS', labelHi: '5 दिन रुकें',
    actionEmoji: '📅', actionLabel: 'Set Reminder',
  },
  hold_7_days: {
    emoji: '⏳', color: '#F59E0B', bgColors: ['#1a1505', '#0D2B1F'],
    labelEn: 'WAIT 7 DAYS', labelHi: '7 दिन रुकें',
    actionEmoji: '📅', actionLabel: 'Set Reminder',
  },
};

const DEFAULT_CONFIG = DECISION_CONFIG.hold_5_days;

function ResultScene({
  decision,
  forecastPrice,
  spoilageRisk,
  fullText,
  fullTextLocal,
  crop,
  priceCounterValue,
  spoilageBarWidth,
}: {
  decision: string;
  forecastPrice: number;
  spoilageRisk: number;
  fullText: string;
  fullTextLocal?: string;
  crop?: string;
  priceCounterValue: number;
  spoilageBarWidth: number;
}) {
  const { t } = useT();
  const config = DECISION_CONFIG[decision] || DEFAULT_CONFIG;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // ── Auto-speak on mount ──
  useEffect(() => {
    const textToSpeak = fullTextLocal || fullText;
    if (!textToSpeak) return;

    // Determine language code
    const langCode = fullTextLocal
      ? (fullTextLocal.match(/[\u0900-\u097F]/) ? 'hi-IN'   // Hindi
         : fullTextLocal.match(/[\u0C80-\u0CFF]/) ? 'kn-IN' // Kannada
         : fullTextLocal.match(/[\u0C00-\u0C7F]/) ? 'te-IN' // Telugu
         : 'hi-IN')
      : 'en-IN';

    const timer = setTimeout(() => {
      setIsSpeaking(true);
      Speech.speak(textToSpeak, {
        language: langCode,
        rate: 0.85,
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }, 600);

    return () => {
      clearTimeout(timer);
      Speech.stop();
    };
  }, [fullText, fullTextLocal]);

  const toggleSpeak = () => {
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
    } else {
      const textToSpeak = fullTextLocal || fullText;
      setIsSpeaking(true);
      Speech.speak(textToSpeak, {
        language: 'hi-IN',
        rate: 0.85,
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
      });
    }
  };

  const shareWhatsApp = () => {
    const msg = `Mandi Advisory:\n${fullText}\nForecast: ₹${forecastPrice}/kg\nSpoilage Risk: ${spoilageRisk}%`;
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  };

  // Animations
  const heroScale = useSharedValue(0.6);
  const priceScale = useSharedValue(0);
  const speakerPulse = useSharedValue(1);

  useEffect(() => {
    heroScale.value = withSequence(
      withSpring(1.1, SPRING.bouncy),
      withSpring(1, SPRING.gentle)
    );
    priceScale.value = withDelay(400, withSpring(1, SPRING.bouncy));
    speakerPulse.value = withRepeat(
      withSequence(withSpring(1.15, SPRING.gentle), withSpring(1, SPRING.gentle)),
      -1, true
    );
  }, [heroScale, priceScale, speakerPulse]);

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heroScale.value }],
  }));
  const priceStyle = useAnimatedStyle(() => ({
    transform: [{ scale: priceScale.value }],
    opacity: priceScale.value,
  }));
  const speakerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: isSpeaking ? speakerPulse.value : 1 }],
  }));

  const spoilColor = spoilageRisk > 60 ? '#EF4444' : spoilageRisk > 30 ? '#F59E0B' : '#52B788';

  return (
    <ScrollView contentContainerStyle={rs.wrap}>
      <LinearGradient colors={config.bgColors} style={StyleSheet.absoluteFill} />

      {/* ── LAYER 1: Hero visual (no text needed) ── */}
      <Animated.View style={[rs.heroBlock, heroStyle]}>
        <View style={[rs.heroBg, { backgroundColor: config.color + '20' }]}>
          <Text style={rs.heroEmoji}>{config.emoji}</Text>
        </View>
        <View style={[rs.heroBadge, { backgroundColor: config.color }]}>
          <Text style={rs.heroBadgeText}>{config.labelEn}</Text>
        </View>
        <Text style={rs.heroHindi}>{config.labelHi}</Text>
        {crop && <Text style={rs.heroCrop}>{crop}</Text>}
      </Animated.View>

      {/* ── LAYER 2: Big number + visual gauge ── */}
      <Animated.View style={[rs.numbersRow, priceStyle]}>
        <View style={rs.numberCard}>
          <Text style={rs.numberIcon}>💰</Text>
          <Text style={[rs.bigNumber, { color: config.color }]}>₹{priceCounterValue}</Text>
          <Text style={rs.numberSub}>/kg forecast</Text>
        </View>
        <View style={rs.numberCard}>
          <Text style={rs.numberIcon}>{spoilageRisk > 50 ? '⚠️' : '✅'}</Text>
          <Text style={[rs.bigNumber, { color: spoilColor }]}>{spoilageRisk}%</Text>
          <Text style={rs.numberSub}>spoilage risk</Text>
          <View style={rs.miniBar}>
            <View style={[rs.miniFill, { width: `${Math.min(spoilageBarWidth, 100)}%`, backgroundColor: spoilColor }]} />
          </View>
        </View>
      </Animated.View>

      {/* ── LAYER 3: Audio speaker (primary interaction) ── */}
      <View style={rs.audioSection}>
        <AnimatedPressable style={[rs.speakerBtn, speakerStyle]} onPress={toggleSpeak}>
          <LinearGradient
            colors={isSpeaking ? [config.color, config.color + 'CC'] : [COLORS.forest, COLORS.canopy]}
            style={rs.speakerGrad}
          >
            <Text style={rs.speakerIcon}>{isSpeaking ? '🔊' : '🔈'}</Text>
            <Text style={rs.speakerLabel}>
              {isSpeaking ? 'Playing...' : 'Play Advisory'}
            </Text>
          </LinearGradient>
        </AnimatedPressable>
        {isSpeaking && (
          <View style={rs.soundWave}>
            {[1,2,3,4,5,4,3,2,1].map((h, i) => (
              <View key={i} style={[rs.soundBar, { height: h * 6 }]} />
            ))}
          </View>
        )}
      </View>

      {/* ── LAYER 4: Expandable text (for literate users) ── */}
      <Pressable style={rs.detailToggle} onPress={() => setShowDetails(!showDetails)}>
        <Text style={rs.detailToggleText}>
          {showDetails ? '▲ Hide details' : '▼ Read full advisory'}
        </Text>
      </Pressable>
      {showDetails && (
        <View style={rs.detailCard}>
          <Text style={rs.detailText}>{fullText}</Text>
          {fullTextLocal && fullTextLocal !== fullText && (
            <Text style={[rs.detailText, { marginTop: 12, color: COLORS.sprout }]}>
              {fullTextLocal}
            </Text>
          )}
        </View>
      )}

      {/* ── LAYER 5: Smart action buttons ── */}
      <View style={rs.actions}>
        <AnimatedPressable
          style={rs.primaryAction}
          onPress={() => {
            hapticHeavy();
            if (decision === 'harvest_now') router.replace('/(tabs)/cooperative');
            else if (decision === 'redirect') router.replace('/(tabs)/prices');
            else router.replace('/(tabs)/farm');
          }}
        >
          <LinearGradient colors={[config.color, config.color + 'CC']} style={rs.actionGrad}>
            <Text style={rs.actionIcon}>{config.actionEmoji}</Text>
            <Text style={rs.actionText}>{config.actionLabel}</Text>
          </LinearGradient>
        </AnimatedPressable>

        <View style={rs.secondaryRow}>
          <Pressable style={rs.secondaryAction} onPress={shareWhatsApp}>
            <Text style={rs.secondaryIcon}>💬</Text>
            <Text style={rs.secondaryText}>WhatsApp</Text>
          </Pressable>
          <Pressable style={rs.secondaryAction} onPress={() => { hapticLight(); router.replace('/advisory'); }}>
            <Text style={rs.secondaryIcon}>🔁</Text>
            <Text style={rs.secondaryText}>Ask Again</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const rs = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 60, minHeight: '100%' },

  // Hero
  heroBlock: { alignItems: 'center', marginBottom: 28 },
  heroBg: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  heroEmoji: { fontSize: 56 },
  heroBadge: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 999 },
  heroBadgeText: { color: '#fff', fontFamily: FONTS.bold, fontSize: 22, letterSpacing: 1 },
  heroHindi: { color: '#9CA3AF', fontFamily: FONTS.body, fontSize: 16, marginTop: 8 },
  heroCrop: { color: COLORS.sprout, fontFamily: FONTS.medium, fontSize: 14, marginTop: 4 },

  // Numbers
  numbersRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  numberCard: { flex: 1, backgroundColor: COLORS.forest, borderRadius: 20, padding: 20, alignItems: 'center' },
  numberIcon: { fontSize: 28, marginBottom: 8 },
  bigNumber: { fontFamily: FONTS.mono, fontSize: 36 },
  numberSub: { color: '#6B7280', fontFamily: FONTS.body, fontSize: 11, marginTop: 4 },
  miniBar: { width: '100%', height: 6, backgroundColor: '#1F2937', borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  miniFill: { height: '100%', borderRadius: 3 },

  // Audio
  audioSection: { alignItems: 'center', marginBottom: 20 },
  speakerBtn: { borderRadius: 20, overflow: 'hidden', width: '100%' },
  speakerGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 12, borderRadius: 20 },
  speakerIcon: { fontSize: 28 },
  speakerLabel: { color: '#fff', fontFamily: FONTS.bold, fontSize: 16 },
  soundWave: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 10 },
  soundBar: { width: 4, backgroundColor: COLORS.harvest, borderRadius: 2 },

  // Details toggle
  detailToggle: { alignItems: 'center', paddingVertical: 10 },
  detailToggleText: { color: '#6B7280', fontFamily: FONTS.body, fontSize: 13 },
  detailCard: { backgroundColor: COLORS.forest, borderRadius: 16, padding: 16, marginBottom: 20 },
  detailText: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 15, lineHeight: 24 },

  // Actions
  actions: { marginTop: 8 },
  primaryAction: { borderRadius: 18, overflow: 'hidden', marginBottom: 12 },
  actionGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 10 },
  actionIcon: { fontSize: 22 },
  actionText: { color: '#fff', fontFamily: FONTS.bold, fontSize: 17 },
  secondaryRow: { flexDirection: 'row', gap: 12 },
  secondaryAction: { flex: 1, backgroundColor: COLORS.forest, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.canopy },
  secondaryIcon: { fontSize: 20, marginBottom: 4 },
  secondaryText: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 13 },
});


// ── CROP OPTIONS ────────────────────────────────────────────────────────────
const CROPS = [
  { label: '🍅 Tomato', value: 'Tomato' },
  { label: '🧅 Onion', value: 'Onion' },
  { label: '🥔 Potato', value: 'Potato' },
  { label: '🌶️ Chilli', value: 'Chilli' },
  { label: '🍆 Brinjal', value: 'Brinjal' },
  { label: '🌽 Maize', value: 'Maize' },
];
const QTY_OPTIONS = ['10', '20', '40', '60', '80', '100'];

// ── CROP CONTEXT BAR ─────────────────────────────────────────────────────────
function CropContextBar({
  selectedCrop, setSelectedCrop,
  selectedQty, setSelectedQty,
}: {
  selectedCrop: string; setSelectedCrop: (c: string) => void;
  selectedQty: string; setSelectedQty: (q: string) => void;
}) {
  const [showCrops, setShowCrops] = useState(false);
  const [showQty, setShowQty] = useState(false);
  const cropLabel = CROPS.find(c => c.value === selectedCrop)?.label || '🌾 Select Crop';

  return (
    <View style={cb.wrap}>
      {/* Crop selector */}
      <TouchableOpacity style={cb.chip} onPress={() => { setShowCrops(!showCrops); setShowQty(false); }}>
        <Text style={cb.chipText}>{cropLabel}</Text>
        <Text style={cb.arrow}>{showCrops ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {/* Qty selector */}
      <TouchableOpacity style={cb.chip} onPress={() => { setShowQty(!showQty); setShowCrops(false); }}>
        <Text style={cb.chipText}>{selectedQty} qtl</Text>
        <Text style={cb.arrow}>{showQty ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {showCrops && (
        <View style={cb.dropdown}>
          {CROPS.map(c => (
            <TouchableOpacity key={c.value} style={[cb.option, selectedCrop === c.value && cb.optionActive]}
              onPress={() => { setSelectedCrop(c.value); setShowCrops(false); }}>
              <Text style={cb.optionText}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {showQty && (
        <View style={[cb.dropdown, { left: 140 }]}>
          {QTY_OPTIONS.map(q => (
            <TouchableOpacity key={q} style={[cb.option, selectedQty === q && cb.optionActive]}
              onPress={() => { setSelectedQty(q); setShowQty(false); }}>
              <Text style={cb.optionText}>{q} quintal</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const cb = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 16, zIndex: 99 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F3A2A', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, gap: 6, borderWidth: 1, borderColor: '#2D6A4F' },
  chipText: { color: '#FFFFFF', fontFamily: 'System', fontSize: 14 },
  arrow: { color: '#9CA3AF', fontSize: 10 },
  dropdown: { position: 'absolute', top: 44, left: 0, backgroundColor: '#1A3828', borderRadius: 12,
    borderWidth: 1, borderColor: '#2D6A4F', zIndex: 999, minWidth: 160 },
  option: { paddingHorizontal: 16, paddingVertical: 12 },
  optionActive: { backgroundColor: '#166534' },
  optionText: { color: '#FFFFFF', fontFamily: 'System', fontSize: 14 },
});

// ── ADVISORY HISTORY SHEET ───────────────────────────────────────────────────
const DEC_ICON: Record<string, string> = {
  harvest_now: '🌾', redirect: '🗺️',
  hold_3_days: '⏳', hold_5_days: '⏳', hold_7_days: '⏳',
};
const DEC_COLOR: Record<string, string> = {
  harvest_now: '#EF4444', redirect: '#3B82F6',
  hold_3_days: '#F59E0B', hold_5_days: '#F59E0B', hold_7_days: '#F59E0B',
};

function AdvisoryHistorySheet({ onClose }: { onClose: () => void }) {
  const sessionHistory = useAppStore(selectSessionHistory);

  return (
    <View style={hs.overlay}>
      <View style={hs.sheet}>
        <View style={hs.header}>
          <Text style={hs.title}>📋 History · इतिहास</Text>
          <TouchableOpacity onPress={onClose}><Text style={hs.close}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {sessionHistory.length === 0 ? (
            <Text style={hs.empty}>No advisories yet.
Speak to get your first one.</Text>
          ) : (
            (sessionHistory as any[]).map((session: any, idx: number) => {
              const adv = session?.advisory;
              if (!adv) return null;
              const dec = adv.decision || 'hold_5_days';
              const icon = DEC_ICON[dec] || '⏳';
              const color = DEC_COLOR[dec] || '#F59E0B';
              const date = session.created_at
                ? new Date(session.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                : '';
              return (
                <View key={idx} style={hs.row}>
                  <View style={[hs.iconWrap, { backgroundColor: color + '22' }]}>
                    <Text style={hs.icon}>{icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={hs.crop}>{adv.crop || 'Crop'} · <Text style={[hs.dec, { color }]}>{dec.replace(/_/g,' ').toUpperCase()}</Text></Text>
                    <Text style={hs.meta}>₹{Math.round(adv.forecast_price || 0)}/kg · {date}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const hs = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000BB', zIndex: 200, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#0D2B1F', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '70%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { color: '#FFFFFF', fontFamily: 'System', fontSize: 17, fontWeight: '700' },
  close: { color: '#9CA3AF', fontSize: 20 },
  empty: { color: '#6B7280', fontFamily: 'System', fontSize: 14, textAlign: 'center', marginTop: 40, lineHeight: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#1F3A2A' },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 20 },
  crop: { color: '#FFFFFF', fontFamily: 'System', fontSize: 14, fontWeight: '600' },
  dec: { fontWeight: '700', fontSize: 12 },
  meta: { color: '#9CA3AF', fontFamily: 'System', fontSize: 12, marginTop: 2 },
});

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
  const [selectedCrop, setSelectedCrop] = useState('');
  const [selectedQty, setSelectedQty] = useState('40');
  const [showTextInput, setShowTextInput] = useState(false);
  const [textQuery, setTextQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const handleTextSubmit = async () => {
    if (!textQuery.trim()) return;
    setShowTextInput(false);
    setDisplayState('processing');
    try {
      await actions.handleMicRelease();
    } catch {
      setDisplayState('idle');
    }
  };

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
          fullTextLocal={advisory.advisory.full_text_local}
          crop={advisory.advisory.crop}
          priceCounterValue={animationValues.priceCounterValue.value as number}
          spoilageBarWidth={animationValues.spoilageBarWidth.value as number}
        />
      )}

      {displayState === 'idle' && (
        <View style={styles.idleContainer}>
          <LinearGradient colors={[COLORS.forest, '#0D2B1F']} style={StyleSheet.absoluteFill} />

          {/* Header row */}
          <View style={styles.idleHeader}>
            <Text style={styles.idleHeaderTitle}>🌾 Advisory</Text>
            <TouchableOpacity onPress={() => setShowHistory(true)}>
              <Text style={styles.historyBtn}>📋 History</Text>
            </TouchableOpacity>
          </View>

          {/* Crop context bar */}
          <CropContextBar
            selectedCrop={selectedCrop} setSelectedCrop={setSelectedCrop}
            selectedQty={selectedQty} setSelectedQty={setSelectedQty}
          />

          {/* Context hint */}
          {selectedCrop !== '' && (
            <View style={styles.contextHint}>
              <Text style={styles.contextHintText}>
                🎯 Speaking about: {selectedCrop} · {selectedQty} qtl
              </Text>
            </View>
          )}

          {/* Mic section */}
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
          </AnimatedView>
          <View style={styles.idleLabelsWrap}>
            <Text style={styles.idleLabel}>{t('speakBtn')}</Text>
            <Text style={styles.idleHint}>💡 "Mera tamatar kab bechunga?"</Text>
          </View>

          {/* Text fallback */}
          <View style={styles.textFallbackWrap}>
            <Text style={styles.textFallbackOr}>— या टाइप करें / or type —</Text>
            {showTextInput ? (
              <View style={styles.textInputRow}>
                <TextInput
                  style={styles.textInput}
                  value={textQuery}
                  onChangeText={setTextQuery}
                  placeholder="Type your question..."
                  placeholderTextColor="#6B7280"
                  multiline
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.textSendBtn, !textQuery.trim() && { opacity: 0.4 }]}
                  disabled={!textQuery.trim()}
                  onPress={handleTextSubmit}
                >
                  <Text style={styles.textSendIcon}>➤</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setShowTextInput(true)} style={styles.textFallbackBtn}>
                <Text style={styles.textFallbackBtnText}>💬 Type instead · टाइप करें</Text>
              </TouchableOpacity>
            )}
          </View>

          {showHistory && <AdvisoryHistorySheet onClose={() => setShowHistory(false)} />}
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
  orbsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: 240, gap: 14 },
  orb: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1F3A2A', borderWidth: 1.5, borderColor: '#2D6A4F' },
  orbEmoji: { fontSize: 20 },
  processingText: { position: 'absolute', top: '62%', color: COLORS.sprout, fontFamily: FONTS.medium, fontSize: 16, textAlign: 'center', paddingHorizontal: 24 },
  claudePill: { position: 'absolute', bottom: 40, backgroundColor: COLORS.forest, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#2D6A4F' },
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
  voiceSectionIdle: { flex: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 90 },
  sonarRings: { position: 'absolute', width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  sonarRing: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: COLORS.harvest },
  sonarRing2: { width: 180, height: 180, borderRadius: 90 },
  micButton: { width: 80, height: 80, borderRadius: 40, overflow: 'hidden' },
  micGradient: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  micIcon: { fontSize: 32 },
  idleLabel: { color: COLORS.sprout, fontFamily: FONTS.medium, fontSize: 18 },
  idleHint: { marginTop: 8, color: '#6B7280', fontFamily: FONTS.body, fontSize: 12, fontStyle: 'italic' },
  idleLabelsWrap: { alignItems: 'center', marginBottom: 16 },
  idleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12 },
  idleHeaderTitle: { color: '#FFFFFF', fontFamily: FONTS.bold, fontSize: 20 },
  historyBtn: { color: COLORS.harvest, fontFamily: FONTS.medium, fontSize: 14 },
  contextHint: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#1F3A2A', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  contextHintText: { color: COLORS.sprout, fontFamily: FONTS.body, fontSize: 12 },
  textFallbackWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#0D2B1FEE' },
  textFallbackOr: { color: '#6B7280', fontFamily: FONTS.body, fontSize: 11, textAlign: 'center', marginBottom: 8 },
  textFallbackBtn: { backgroundColor: '#1F3A2A', borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2D6A4F' },
  textFallbackBtnText: { color: '#FFFFFF', fontFamily: FONTS.medium, fontSize: 14 },
  textInputRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  textInput: { flex: 1, backgroundColor: '#1F3A2A', borderRadius: 14, borderWidth: 1, borderColor: '#2D6A4F', color: '#FFFFFF', fontFamily: FONTS.body, fontSize: 14, padding: 12, maxHeight: 100 },
  textSendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.harvest, alignItems: 'center', justifyContent: 'center' },
  textSendIcon: { color: '#000', fontSize: 18 },
});
