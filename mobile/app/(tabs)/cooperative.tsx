import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, Platform } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, SharedValue } from 'react-native-reanimated';
import { hapticHeavy, hapticLight } from '../../utils/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useBlockStatus, useJoinBundle } from '../../hooks';
import { useAppStore } from '../../store';
import { COLORS, FONTS, SPRING } from '../../constants/theme';
import { useT } from '../../utils/useT';
import { n8nService } from '../../services/n8nService';
import { Alert } from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedView = Animated.createAnimatedComponent(View);

type Farmer = {
  name: string;
  distance: string;
  crop: string;
  qty: string;
  status: 'confirmed' | 'pending' | 'invited';
  avatar: string;
  x: number;
  y: number;
  kind: 'user' | 'bundle' | 'other';
};

const mockFarmers: Farmer[] = [
  { name: 'You', distance: '', crop: 'Tomato', qty: '12q', status: 'confirmed', avatar: '👨‍🌾', x: 60, y: 80, kind: 'user' },
  { name: 'Ramesh', distance: '0.8km', crop: 'Tomato', qty: '8q', status: 'confirmed', avatar: '👨‍🌾', x: 140, y: 140, kind: 'bundle' },
  { name: 'Sunita', distance: '1.2km', crop: 'Tomato', qty: '15q', status: 'confirmed', avatar: '👩‍🌾', x: 200, y: 80, kind: 'bundle' },
  { name: 'Govind', distance: '2.1km', crop: 'Tomato', qty: '6q', status: 'pending', avatar: '👨‍🌾', x: 100, y: 200, kind: 'bundle' },
  { name: 'Lakshmi', distance: '3.4km', crop: 'Onion', qty: '20q', status: 'invited', avatar: '👩‍🌾', x: 280, y: 160, kind: 'other' },
];

function TimelineStep({ label, state, activePulse }: { label: string; state: 'done' | 'active' | 'pending'; activePulse: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ transform: [{ scale: state === 'active' ? activePulse.value : 1 }] }));
  return (
    <View style={styles.stepItem}>
      <AnimatedView style={[styles.stepCircle, state === 'done' ? styles.stepDone : state === 'active' ? styles.stepActive : styles.stepPending, style]}>
        {state === 'done' ? <Text style={styles.check}>✓</Text> : state === 'active' ? <View style={styles.spinDot} /> : null}
      </AnimatedView>
      <Text style={styles.stepLabel}>{label}</Text>
    </View>
  );
}

function Breakdown({ label, amount, style, color }: { label: string; amount: string; style: object; color: string }) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={styles.breakdownAmount}>{amount}</Text>
      <AnimatedView style={[styles.breakdownBar, { backgroundColor: color }, style as any]} />
    </View>
  );
}

export default function CooperativeScreen() {
  const { t } = useT();
  const { width } = useWindowDimensions();
  const activePulse = useSharedValue(1);
  const userPinPulse = useSharedValue(1);
  const shimmer = useSharedValue(0.6);
  const progress = useSharedValue(0);
  const joinScale = useSharedValue(1);
  const [quantity, setQuantity] = useState(8);
  const [saving, setSaving] = useState(0);
  const [members, setMembers] = useState(23);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  
  const [notified, setNotified] = useState(false);
  const [truckBooking, setTruckBooking] = useState(false);
  const [truckBooked, setTruckBooked] = useState(false);

  const bar1 = useSharedValue(0);
  const bar2 = useSharedValue(0);
  const bar3 = useSharedValue(0);

  const farmer = useAppStore((s) => s.farmer);
  const blockId = farmer?.block || null;
  const { blockStatus } = useBlockStatus(blockId);
  const { joinBundle } = useJoinBundle();

  useEffect(() => {
    shimmer.value = withRepeat(withSequence(withTiming(0.8, { duration: 1600 }), withTiming(0.6, { duration: 1600 })), -1, true);
    activePulse.value = withRepeat(withSequence(withSpring(1.3, SPRING.bouncy), withSpring(1, SPRING.gentle)), -1, true);
    progress.value = withTiming(0.46, { duration: 1500 });
    bar1.value = withTiming(67, { duration: 1200 });
    bar2.value = withTiming(22, { duration: 1200 });
    bar3.value = withTiming(11, { duration: 1200 });
    let s = 0;
    const t = setInterval(() => {
      s += 6;
      if (s >= 180) { s = 180; clearInterval(t); }
      setSaving(s);
    }, 40);
    return () => clearInterval(t);
  }, [activePulse, bar1, bar2, bar3, progress, shimmer]);

  useEffect(() => {
    if (blockStatus) {
      setMembers(blockStatus.active_intents);
    }
  }, [blockStatus]);

  const riverStyle = useAnimatedStyle(() => ({ opacity: shimmer.value }));
  const joinStyle = useAnimatedStyle(() => ({ transform: [{ scale: joinScale.value }] }));
  const bar1Style = useAnimatedStyle(() => ({ width: `${bar1.value}%` }));
  const bar2Style = useAnimatedStyle(() => ({ width: `${bar2.value}%` }));
  const bar3Style = useAnimatedStyle(() => ({ width: `${bar3.value}%` }));

  const membersBundle = mockFarmers.filter((f) => f.kind === 'bundle');
  const bundleTarget = blockStatus?.active_intents || 50;
  const progressValue = members / bundleTarget;

  const onJoin = async () => {
    joinScale.value = withSpring(0.96, SPRING.snappy);
    hapticHeavy();
    setJoining(true);

    if (blockStatus?.active_bundles && blockStatus.active_bundles.length > 0) {
      try {
        await joinBundle(blockStatus.active_bundles[0].bundle_id, quantity, new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString());
        setJoined(true);
        setMembers((v) => v + 1);
      } catch {
        setJoined(false);
      }
    } else {
      setTimeout(() => { setJoined(true); setMembers((v) => v + 1); }, 1500);
    }

    setTimeout(() => { joinScale.value = withSpring(1, SPRING.gentle); }, 120);
    setTimeout(() => { setJoining(false); }, 1500);

    userPinPulse.value = withRepeat(withSequence(withSpring(1.14, SPRING.bouncy), withSpring(1, SPRING.gentle)), 4, true);
  };

  const onBookTruck = async () => {
    hapticHeavy();
    setTruckBooking(true);

    try {
      const payload = {
        bundle_id: "BNDL-TRANSPORT-" + Math.random().toString(36).substr(2, 4).toUpperCase(),
        mandi: "Kolar Mandi",
        weight: (quantity * members / 10).toFixed(1) + " tons",
        driver_phone: "+916380221196" // Using your number for the test call
      };

      const result = await n8nService.triggerAutomation('truck_booking', payload);

      if (result.status === "success" || result.status_code === 200) {
        setTruckBooked(true);
        Alert.alert(
          "Call Initiated! 🚛",
          "Automated booking call is reaching the driver (Anand Transport) now.",
          [{ text: "Monitor Status" }]
        );
      } else {
        Alert.alert("Booking Status", `Webhook response: ${result.status || 'unknown'}`);
      }
    } catch (err: any) {
      Alert.alert("Booking Failed", err?.message || "Check backend connection for truck-booking workflow.");
    } finally {
      setTruckBooking(false);
    }
  };

  const onNotifyFarmers = async () => {
    hapticHeavy();
    setJoining(true);
    
    try {
      const phoneNum = "+916380221196"; 
      
      const payload = {
        bundle_id: "BNDL-" + Math.random().toString(36).substr(2, 6).toUpperCase(),
        crop: "Tomato",
        message: "Great news! Our tomato cooperative bundle is confirmed. You saved ₹180/quintal on transport.",
        language: "hi",
        farmer_phones: [phoneNum]
      };
      
      const result = await n8nService.triggerBundleNotification(payload);
      
      if (result.status === "success" || result.status_code === 200) {
        setNotified(true);
        Alert.alert(
          "Notifications Sent! 🚀",
          `Localized alerts sent to ${phoneNum}.\nNow you can book transport.`,
          [{ text: "Great!" }]
        );
      }
    } catch (err: any) {
      Alert.alert("Process Failed", "Check n8n Executions or terminal for bridge logs.");
    } finally {
      setJoining(false);
    }
  };

  const progressDegrees = progressValue * 360;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.mapSection}>
          <View style={styles.mapBackground}>
            <View style={styles.gridLines}>
              {[1, 2, 3, 4].map((i) => <View key={`h-${i}`} style={[styles.gridH, { top: 70 * i }]} />)}
              {[1, 2, 3, 4].map((i) => <View key={`v-${i}`} style={[styles.gridV, { left: width * i / 5 }]} />)}
            </View>
            <View style={styles.riverPath} />
          </View>

          {mockFarmers.map((f, i) => (
            <View key={f.name} style={[styles.farmerPin, { left: f.x - 20, top: f.y - 20 }]}>
              <Text style={styles.farmerAvatar}>{f.avatar}</Text>
              {f.kind === 'user' && <View style={styles.pulseRing} />}
            </View>
          ))}

          <View style={styles.mapControls}>
            <Pressable style={styles.ctrlBtn}><Text style={styles.ctrlTxt}>+</Text></Pressable>
            <Pressable style={styles.ctrlBtn}><Text style={styles.ctrlTxt}>-</Text></Pressable>
            <View style={styles.compass}><Text style={styles.ctrlTxt}>N</Text></View>
          </View>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.progressRow}>
            <View style={styles.progressRing}>
              <View style={[styles.progressFill, { transform: [{ rotate: `${progressDegrees}deg` }] }]} />
              <View style={styles.progressCenter}>
                <Text style={styles.progressNum}>{members}/{bundleTarget}</Text>
                <Text style={styles.progressSub}>{t('farmers')}</Text>
              </View>
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={styles.formTitle}>
                {blockStatus?.oversupply_crops?.length ? `${t('cooperativeSection')}: ${blockStatus.oversupply_crops.join(', ')}` : t('cooperativeSection')}
              </Text>
              <Text style={styles.formSub}>
                {bundleTarget - members} {t('moreForSavings')}
              </Text>
            </View>
          </View>

          <View style={styles.timeline}>
            <TimelineStep label={t('intents')} state="done" activePulse={activePulse} />
            <View style={[styles.connect, { backgroundColor: '#52B788' }]} />
            <TimelineStep label={t('aiNegotiating')} state="done" activePulse={activePulse} />
            <View style={[styles.connect, { backgroundColor: '#52B788' }]} />
            <TimelineStep label={t('mandiSelected')} state="done" activePulse={activePulse} />
            <View style={[styles.connect, { backgroundColor: notified ? '#52B788' : '#374151' }]} />
            <TimelineStep label={t('truckBooked')} state={truckBooked ? "done" : truckBooking ? "active" : "pending"} activePulse={activePulse} />
          </View>
        </View>

        <View style={styles.listWrap}>
          {mockFarmers.map((f, i) => (
            <View key={f.name} style={styles.farmerRow}>
              <Text style={styles.farmerAvatarSmall}>{f.avatar}</Text>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.farmerName}>{f.name}</Text>
                <Text style={styles.farmerInfo}>{f.distance} · {f.crop} · {f.qty}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: f.status === 'confirmed' ? '#52B788' : f.status === 'pending' ? COLORS.harvest : '#6B7280' }]}>
                <Text style={styles.statusText}>{f.status}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.saveCard}>
          <Text style={styles.saveHead}>{t('yourSavings')}</Text>
          <Text style={styles.saveValue}>₹{saving}/quintal</Text>

          <Breakdown label={t('transportSaved')} amount="₹120" style={bar1Style} color="#52B788" />
          <Breakdown label={t('betterPrice')} amount="₹40" style={bar2Style} color={COLORS.harvest} />
          <Breakdown label={t('lessWastage')} amount="₹20" style={bar3Style} color={COLORS.sprout} />

          <Text style={styles.qty}>{t('yourQuantity')}: {quantity} qtl</Text>
          <Pressable style={styles.sliderTrack} onPress={(e) => { hapticLight(); const x = e.nativeEvent.locationX; const q = Math.max(1, Math.min(100, Math.round((x / 260) * 100))); setQuantity(q); }}>
            <View style={[styles.sliderFill, { width: `${quantity}%` }]} />
            <View style={[styles.sliderThumb, { left: `${quantity}%` }]} />
          </Pressable>
          <Text style={styles.total}>{t('totalSaving')}: ₹{(quantity * 180).toLocaleString()}</Text>
        </View>


        <AnimatedPressable style={[styles.joinBtn, joinStyle, joined && { backgroundColor: '#52B788' }]} onPress={onJoin}>
          <LinearGradient colors={joined ? ['#52B788', '#52B788'] : [COLORS.harvest, '#D97706']} style={styles.joinGrad}>
            <Text style={styles.joinText}>
              {joining ? t('joining') : joined ? t('joined') : t('joinBundle')}
            </Text>
          </LinearGradient>
        </AnimatedPressable>

        {joined && !notified && (
          <AnimatedPressable 
            style={[styles.notifyBtn, { transform: [{ scale: activePulse.value }] }]} 
            onPress={onNotifyFarmers}
            disabled={joining}
          >
            <LinearGradient colors={['#52B788', '#2D6A4F']} style={styles.joinGrad}>
              <Text style={styles.notifyText}>
                {joining ? "Sending Alerts..." : "Confirm & Notify All 🚀"}
              </Text>
            </LinearGradient>
          </AnimatedPressable>
        )}

        {joined && (
          <AnimatedPressable
            style={[styles.bookTruckBtn, { transform: [{ scale: activePulse.value }] }]}
            onPress={onBookTruck}
            disabled={truckBooking || truckBooked}
          >
            <LinearGradient colors={truckBooked ? ['#BFC0C0', '#9EA1A1'] : ['#E63946', '#A8202A']} style={styles.joinGrad}>
              <Text style={styles.notifyText}>
                {truckBooking ? "Calling Driver..." : truckBooked ? "Truck Booked! 🚛" : "Book Truck Now 🚛"}
              </Text>
            </LinearGradient>
          </AnimatedPressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.night },
  mapSection: { height: 280, backgroundColor: '#0D2B1F', position: 'relative' },
  mapBackground: { ...StyleSheet.absoluteFillObject },
  gridLines: { ...StyleSheet.absoluteFillObject },
  gridH: { position: 'absolute', left: 0, right: 0, height: 6, backgroundColor: '#374151', opacity: 0.6 },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 6, backgroundColor: '#374151', opacity: 0.6 },
  riverPath: { position: 'absolute', left: 10, right: 14, bottom: 0, height: 200, borderTopWidth: 8, borderTopColor: '#1E40AF', borderRadius: 4, opacity: 0.6 },
  farmerPin: { position: 'absolute', width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  farmerAvatar: { fontSize: 28 },
  pulseRing: { position: 'absolute', width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: COLORS.harvest },
  mapControls: { position: 'absolute', right: 12, top: 12, gap: 8 },
  ctrlBtn: { width: 36, height: 36, backgroundColor: COLORS.forest, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  ctrlTxt: { color: COLORS.white, fontSize: 18, fontFamily: FONTS.bold },
  compass: { width: 36, height: 36, backgroundColor: COLORS.forest, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statusCard: { backgroundColor: COLORS.forest, borderRadius: 20, margin: 12, padding: 16 },
  progressRow: { flexDirection: 'row', alignItems: 'center' },
  progressRing: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  progressFill: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 10, borderColor: COLORS.harvest, borderTopColor: 'transparent', borderRightColor: 'transparent' },
  progressCenter: { alignItems: 'center' },
  progressNum: { color: COLORS.white, fontFamily: FONTS.mono, fontSize: 24 },
  progressSub: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  formTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16 },
  formSub: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, marginTop: 4 },
  timeline: { flexDirection: 'row', alignItems: 'center', marginTop: 16, justifyContent: 'space-between' },
  stepItem: { alignItems: 'center' },
  stepCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: '#52B788' },
  stepActive: { backgroundColor: COLORS.harvest },
  stepPending: { backgroundColor: '#374151' },
  check: { color: '#FFF', fontSize: 14 },
  spinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFF' },
  stepLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, marginTop: 4, textAlign: 'center' },
  connect: { flex: 1, height: 2, marginHorizontal: 4 },
  listWrap: { margin: 12 },
  farmerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.forest, borderRadius: 12, padding: 12, marginBottom: 8 },
  farmerAvatarSmall: { fontSize: 24 },
  farmerName: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 14 },
  farmerInfo: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { color: '#FFF', fontFamily: FONTS.bodyMed, fontSize: 10 },
  saveCard: { backgroundColor: COLORS.forest, borderRadius: 20, margin: 12, padding: 16 },
  saveHead: { color: COLORS.sprout, fontFamily: FONTS.bodyMed, fontSize: 14, textAlign: 'center' },
  saveValue: { color: COLORS.harvest, fontFamily: FONTS.mono, fontSize: 36, textAlign: 'center', marginVertical: 12 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  breakdownLabel: { flex: 1, color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  breakdownAmount: { color: COLORS.white, fontFamily: FONTS.bodyMed, fontSize: 12, marginRight: 12, width: 50, textAlign: 'right' },
  breakdownBar: { height: 6, borderRadius: 3, width: 80 },
  qty: { color: COLORS.white, fontFamily: FONTS.bodyMed, fontSize: 14, marginTop: 16 },
  sliderTrack: { height: 8, backgroundColor: COLORS.night, borderRadius: 4, marginVertical: 12, position: 'relative' },
  sliderFill: { height: '100%', backgroundColor: COLORS.harvest, borderRadius: 4 },
  sliderThumb: { position: 'absolute', top: -8, width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.harvest, marginLeft: -12 },
  total: { color: COLORS.sprout, fontFamily: FONTS.bold, fontSize: 16, textAlign: 'center', marginTop: 8 },
  joinBtn: { margin: 12, borderRadius: 16, overflow: 'hidden' },
  notifyBtn: { margin: 12, marginTop: 4, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: '#52B788' },
  bookTruckBtn: { margin: 12, marginTop: 4, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: '#E63946' },
  joinGrad: { paddingVertical: 18, alignItems: 'center' },
  joinText: { color: COLORS.night, fontFamily: FONTS.bold, fontSize: 16 },
  notifyText: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16 },
});
