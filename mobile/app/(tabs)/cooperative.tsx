import { useEffect, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPRING } from '../../constants/theme';
import { hapticLight, hapticHeavy } from '../../utils/haptics';
import { useDeals, Deal } from '../../hooks/useDeals';
import DealCard from '../../components/DealCard';
import DealDetailSheet from '../../components/DealDetailSheet';
import PostDealModal from '../../components/PostDealModal';

// ─── Crop filter pills ────────────────────────────────────────────────────────
const CROP_FILTERS = [
  { label: 'All',    emoji: '🌾' },
  { label: 'Tomato', emoji: '🍅' },
  { label: 'Onion',  emoji: '🧅' },
  { label: 'Potato', emoji: '🥔' },
  { label: 'Chilli', emoji: '🌶️' },
];

// ─── Header stats strip ───────────────────────────────────────────────────────
function StatsStrip({ deals }: { deals: Deal[] }) {
  const openDeals = deals.filter((d) => d.status === 'open' || d.status === 'filling').length;
  const confirmedDeals = deals.filter((d) => d.status === 'confirmed' || d.status === 'truck_booked').length;
  const totalFarmers = deals.reduce((s, d) => s + d.members.length, 0);

  const statAnim = useSharedValue(0);
  useEffect(() => {
    statAnim.value = withTiming(1, { duration: 700 });
  }, [statAnim]);
  const statStyle = useAnimatedStyle(() => ({ opacity: statAnim.value }));

  return (
    <Animated.View style={[styles.statsStrip, statStyle]}>
      <View style={styles.statItem}>
        <Text style={styles.statNum}>{openDeals}</Text>
        <Text style={styles.statLabel}>Active Deals</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <Text style={styles.statNum}>{totalFarmers}</Text>
        <Text style={styles.statLabel}>Farmers In</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <Text style={[styles.statNum, { color: '#52B788' }]}>{confirmedDeals}</Text>
        <Text style={styles.statLabel}>Confirmed</Text>
      </View>
    </Animated.View>
  );
}

// ─── My Active Deal status card ───────────────────────────────────────────────
function MyActiveDealCard({ deal, onViewDeal }: { deal: Deal; onViewDeal: () => void }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (deal.status === 'truck_booked') {
      pulse.value = withRepeat(
        withSequence(withSpring(1.02, SPRING.gentle), withSpring(1, SPRING.gentle)),
        -1,
        true
      );
    }
  }, [deal.status, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const isTruckBooked = deal.status === 'truck_booked' || deal.status === 'departed';
  const isConfirmed = deal.status === 'confirmed' || isTruckBooked;

  const statusSteps = [
    { label: 'Joined',    done: true },
    { label: 'Confirmed', done: isConfirmed },
    { label: 'Truck',     done: isTruckBooked },
    { label: 'At Mandi',  done: deal.status === 'settled' },
  ];

  return (
    <Animated.View style={[styles.myDealCard, pulseStyle]}>
      <LinearGradient
        colors={isConfirmed ? ['#1a4a2e', '#0d2b1f'] : ['#2d4a1e', '#1b3320']}
        style={styles.myDealGradient}
      >
        <View style={styles.myDealHeader}>
          <Text style={styles.myDealTitle}>My Active Deal</Text>
          <Pressable onPress={onViewDeal} style={styles.myDealViewBtn}>
            <Text style={styles.myDealViewText}>View →</Text>
          </Pressable>
        </View>

        <View style={styles.myDealMeta}>
          <Text style={styles.myDealCrop}>{deal.crop_emoji} {deal.crop}</Text>
          <Text style={styles.myDealMandi}>→ {deal.target_mandi}</Text>
        </View>

        {/* Timeline */}
        <View style={styles.myDealTimeline}>
          {statusSteps.map((step, i) => (
            <View key={step.label} style={styles.timelineItem}>
              <View style={[styles.timelineDot, step.done && styles.timelineDotDone]} />
              {i < statusSteps.length - 1 && (
                <View style={[styles.timelineLine, step.done && styles.timelineLineDone]} />
              )}
              <Text style={[styles.timelineLabel, step.done && { color: COLORS.sprout }]}>
                {step.label}
              </Text>
            </View>
          ))}
        </View>

        {isTruckBooked && deal.truck && (
          <View style={styles.truckInfoRow}>
            <Text style={styles.truckInfoText}>
              🚛 {deal.truck.driver_name} · {deal.truck.vehicle_no}
            </Text>
            <Text style={styles.truckInfoText}>
              Pickup: {deal.truck.pickup_time}
            </Text>
          </View>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onPost }: { onPost: () => void }) {
  const bounce = useSharedValue(0);
  useEffect(() => {
    bounce.value = withRepeat(
      withSequence(withTiming(-8, { duration: 700 }), withTiming(0, { duration: 700 })),
      -1,
      true
    );
  }, [bounce]);
  const bounceStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bounce.value }] }));

  return (
    <View style={styles.emptyState}>
      <Animated.Text style={[styles.emptyEmoji, bounceStyle]}>🌾</Animated.Text>
      <Text style={styles.emptyTitle}>No deals for this crop yet</Text>
      <Text style={styles.emptySubtitle}>Be the first to post a deal and invite nearby farmers</Text>
      <Pressable onPress={onPost} style={styles.emptyBtn}>
        <Text style={styles.emptyBtnText}>Post First Deal →</Text>
      </Pressable>
    </View>
  );
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────
export default function CooperativeScreen() {
  const {
    deals,
    selectedDeal,
    myJoinedDealIds,
    triggeringDealId,
    joinDeal,
    postDeal,
    openDeal,
    closeDeal,
    isMyDeal,
  } = useDeals();

  const [cropFilter, setCropFilter] = useState<string | null>(null);
  const [showPostModal, setShowPostModal] = useState(false);

  // Header entrance animation
  const headerY = useSharedValue(-30);
  const headerOpacity = useSharedValue(0);
  useEffect(() => {
    headerY.value = withSpring(0, SPRING.gentle);
    headerOpacity.value = withTiming(1, { duration: 500 });
  }, [headerY, headerOpacity]);
  const headerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerY.value }],
    opacity: headerOpacity.value,
  }));

  // Filtered deals
  const filteredDeals = cropFilter
    ? deals.filter((d) => d.crop === cropFilter)
    : deals;

  // Find the deal I'm currently in (for the status card)
  const myActiveDeal = deals.find((d) => myJoinedDealIds.includes(d.deal_id));

  const handleFilterPress = (label: string) => {
    hapticLight();
    setCropFilter(label === 'All' ? null : label === cropFilter ? null : label);
  };

  return (
    <View style={styles.container}>
      {/* ── Hero header ── */}
      <Animated.View style={[styles.header, headerStyle]}>
        <LinearGradient colors={['#0d2b1f', '#1B4332']} style={styles.headerGrad}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.headerTitle}>Virtual Cooperative 🤝</Text>
              <Text style={styles.headerSub}>Pool produce · Best price · Shared truck</Text>
            </View>
            <Pressable
              onPress={() => { hapticHeavy(); setShowPostModal(true); }}
              style={styles.postBtn}
            >
              <LinearGradient colors={[COLORS.harvest, '#D97706']} style={styles.postBtnGrad}>
                <Text style={styles.postBtnText}>+ Post Deal</Text>
              </LinearGradient>
            </Pressable>
          </View>

          <StatsStrip deals={deals} />
        </LinearGradient>
      </Animated.View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── My Active Deal card ── */}
        {myActiveDeal && (
          <MyActiveDealCard
            deal={myActiveDeal}
            onViewDeal={() => openDeal(myActiveDeal)}
          />
        )}

        {/* ── Crop filter pills ── */}
        <View style={styles.filterSection}>
          <Text style={styles.filterTitle}>Deals Near You</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {CROP_FILTERS.map((f) => {
              const isActive = (f.label === 'All' && !cropFilter) || f.label === cropFilter;
              return (
                <Pressable
                  key={f.label}
                  onPress={() => handleFilterPress(f.label)}
                  style={[styles.filterPill, isActive && styles.filterPillActive]}
                >
                  <Text style={styles.filterEmoji}>{f.emoji}</Text>
                  <Text style={[styles.filterLabel, isActive && styles.filterLabelActive]}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Deal cards ── */}
        {filteredDeals.length === 0 ? (
          <EmptyState onPost={() => setShowPostModal(true)} />
        ) : (
          filteredDeals.map((deal) => (
            <DealCard
              key={deal.deal_id}
              deal={deal}
              isJoined={isMyDeal(deal.deal_id)}
              onPress={openDeal}
            />
          ))
        )}

        {/* ── How it works strip ── */}
        <View style={styles.howSection}>
          <Text style={styles.howTitle}>How it works</Text>
          <View style={styles.howSteps}>
            {[
              { icon: '📋', text: 'Browse deals or post your own' },
              { icon: '🤝', text: 'Join a deal — add your quantity' },
              { icon: '🎯', text: 'Target hit → all farmers notified' },
              { icon: '🚛', text: 'Truck auto-booked, goods shipped' },
            ].map((s, i) => (
              <View key={i} style={styles.howStep}>
                <View style={styles.howIconCircle}>
                  <Text style={styles.howIcon}>{s.icon}</Text>
                </View>
                {i < 3 && <View style={styles.howLine} />}
                <Text style={styles.howStepText}>{s.text}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* ── Deal Detail Bottom Sheet ── */}
      <DealDetailSheet
        deal={selectedDeal}
        visible={!!selectedDeal}
        isJoined={selectedDeal ? isMyDeal(selectedDeal.deal_id) : false}
        isTriggering={selectedDeal ? triggeringDealId === selectedDeal.deal_id : false}
        onClose={closeDeal}
        onJoin={joinDeal}
      />

      {/* ── Post Deal Modal ── */}
      <PostDealModal
        visible={showPostModal}
        onClose={() => setShowPostModal(false)}
        onPost={postDeal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.night },

  header: { overflow: 'hidden' },
  headerGrad: { paddingTop: 52, paddingHorizontal: 16, paddingBottom: 0 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  headerTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 20 },
  headerSub: { color: COLORS.sprout, fontFamily: FONTS.body, fontSize: 12, marginTop: 3 },
  postBtn: { borderRadius: 12, overflow: 'hidden' },
  postBtnGrad: { paddingHorizontal: 16, paddingVertical: 10 },
  postBtnText: { color: COLORS.night, fontFamily: FONTS.bold, fontSize: 13 },

  statsStrip: {
    flexDirection: 'row',
    backgroundColor: COLORS.forest,
    borderRadius: 14,
    marginBottom: 0,
    padding: 14,
    marginTop: 0,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { color: COLORS.harvest, fontFamily: FONTS.mono, fontSize: 22 },
  statLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: COLORS.canopy, marginVertical: 4 },

  scrollContent: { paddingBottom: 120, paddingTop: 12 },

  // My active deal card
  myDealCard: { marginHorizontal: 16, marginBottom: 14, borderRadius: 18, overflow: 'hidden' },
  myDealGradient: { padding: 16 },
  myDealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  myDealTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 14 },
  myDealViewBtn: { backgroundColor: '#ffffff20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  myDealViewText: { color: COLORS.sprout, fontFamily: FONTS.bodyMed, fontSize: 12 },
  myDealMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  myDealCrop: { color: COLORS.white, fontFamily: FONTS.bodyMed, fontSize: 15 },
  myDealMandi: { color: COLORS.sprout, fontFamily: FONTS.body, fontSize: 13 },
  myDealTimeline: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  timelineItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.canopy, marginRight: 0 },
  timelineDotDone: { backgroundColor: '#52B788' },
  timelineLine: { flex: 1, height: 2, backgroundColor: COLORS.canopy, marginHorizontal: 2 },
  timelineLineDone: { backgroundColor: '#52B788' },
  timelineLabel: { position: 'absolute', top: 14, left: 0, color: COLORS.muted, fontFamily: FONTS.body, fontSize: 9 },
  truckInfoRow: { backgroundColor: '#ffffff10', borderRadius: 10, padding: 10, marginTop: 4, gap: 4 },
  truckInfoText: { color: COLORS.sprout, fontFamily: FONTS.body, fontSize: 12 },

  // Filter section
  filterSection: { marginBottom: 16, paddingHorizontal: 16 },
  filterTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 18, marginBottom: 10 },
  filterRow: { gap: 8 },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.forest,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  filterPillActive: { borderColor: COLORS.harvest, backgroundColor: COLORS.canopy },
  filterEmoji: { fontSize: 16 },
  filterLabel: { color: COLORS.muted, fontFamily: FONTS.bodyMed, fontSize: 13 },
  filterLabelActive: { color: COLORS.white },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 18, textAlign: 'center', marginBottom: 8 },
  emptySubtitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 14, textAlign: 'center', marginBottom: 24 },
  emptyBtn: { backgroundColor: COLORS.harvest, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText: { color: COLORS.night, fontFamily: FONTS.bold, fontSize: 14 },

  // How it works
  howSection: { marginHorizontal: 16, marginTop: 24, backgroundColor: COLORS.forest, borderRadius: 20, padding: 16 },
  howTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 15, marginBottom: 16 },
  howSteps: { gap: 16 },
  howStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  howIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.canopy, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  howIcon: { fontSize: 18 },
  howLine: { display: 'none' }, // horizontal version not needed in column layout
  howStepText: { flex: 1, color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, paddingTop: 8 },
});
