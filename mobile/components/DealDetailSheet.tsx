import React, { useEffect, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Dimensions,
  Linking,
  Modal,
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
import { COLORS, FONTS, SPRING } from '../constants/theme';
import { Deal, DealMember, TruckAgency } from '../hooks/useDeals';
import { hapticHeavy, hapticLight, hapticSuccess } from '../utils/haptics';
import SuccessParticles from './SuccessParticles';

const { height: SCREEN_H } = Dimensions.get('window');

interface Props {
  deal: Deal | null;
  visible: boolean;
  isJoined: boolean;
  isTriggering: boolean;
  onClose: () => void;
  onJoin: (dealId: string, quantity: number) => void;
}

function FarmerRosterRow({ member, index }: { member: DealMember; index: number }) {
  const slideX = useSharedValue(-40);
  const opacity = useSharedValue(0);

  useEffect(() => {
    slideX.value = withTiming(0, { duration: 320 + index * 60 });
    opacity.value = withTiming(1, { duration: 320 + index * 60 });
  }, [index, opacity, slideX]);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.rosterRow, rowStyle]}>
      <View style={styles.rosterAvatar}>
        <Text style={styles.rosterAvatarEmoji}>{member.avatar}</Text>
      </View>
      <View style={styles.rosterInfo}>
        <Text style={styles.rosterName}>{member.name}</Text>
        <Text style={styles.rosterVillage}>{member.village}</Text>
      </View>
      <View style={styles.rosterRight}>
        <Text style={styles.rosterQty}>{member.quantity}q</Text>
        <View style={[styles.rosterBadge, { backgroundColor: member.status === 'confirmed' ? '#16653422' : '#F59E0B22' }]}>
          <Text style={[styles.rosterBadgeText, { color: member.status === 'confirmed' ? '#52B788' : COLORS.harvest }]}>
            {member.status === 'confirmed' ? '✅' : '⏳'}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

function QuantitySlider({ value, onChange, max = 100 }: { value: number; onChange: (v: number) => void; max?: number }) {
  const pct = (value / max) * 100;
  return (
    <View>
      <View style={styles.sliderLabelRow}>
        <Text style={styles.sliderLabel}>Your Quantity</Text>
        <Text style={styles.sliderValue}>{value} quintals</Text>
      </View>
      <Pressable
        style={styles.sliderTrack}
        onPress={(e) => {
          hapticLight();
          const x = e.nativeEvent.locationX;
          const q = Math.max(1, Math.min(max, Math.round((x / 260) * max)));
          onChange(q);
        }}
      >
        <View style={[styles.sliderFill, { width: `${pct}%` }]} />
        <View style={[styles.sliderThumb, { left: `${pct}%` as any }]} />
      </Pressable>
      <View style={styles.sliderRangeRow}>
        <Text style={styles.sliderRange}>1 qtl</Text>
        <Text style={styles.sliderRange}>{max} qtl</Text>
      </View>
    </View>
  );
}

function AgencyContactRow({ agency }: { agency: TruckAgency }) {
  const callAgency = () => {
    if (agency.phone) Linking.openURL(`tel:${agency.phone}`);
  };
  const whatsappAgency = () => {
    const num = agency.whatsapp.replace(/\D/g, '');
    Linking.openURL(`https://wa.me/${num}?text=Hello, I found your contact via KisanSabha and would like to discuss a truck booking for agricultural produce.`);
  };
  const openKisanSabha = () => {
    if (agency.profile_url) Linking.openURL(agency.profile_url);
    else Linking.openURL('https://kisansabha.in/Directory.aspx?Category=Transporter&CategoryType=21');
  };

  const stars = '★'.repeat(Math.round(agency.rating)) + '☆'.repeat(5 - Math.round(agency.rating));

  return (
    <View style={styles.agencyBlock}>
      <View style={styles.agencyHeader}>
        <View style={styles.agencyBadge}>
          <Text style={styles.agencyBadgeText}>{agency.category_name}</Text>
        </View>
        {agency.verified && (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>✓ Verified</Text>
          </View>
        )}
      </View>
      <Text style={styles.agencyName}>{agency.name}</Text>
      <Text style={styles.agencyCity}>{agency.city}, {agency.state}</Text>
      <View style={styles.agencyMetaRow}>
        <Text style={styles.agencyRating}>{stars} {agency.rating.toFixed(1)}</Text>
        {agency.total_trips > 0 && (
          <Text style={styles.agencyTrips}>{agency.total_trips} trips</Text>
        )}
        {agency.price_per_km != null && (
          <Text style={styles.agencyPrice}>₹{agency.price_per_km}/km</Text>
        )}
      </View>
      {agency.vehicle_types.length > 0 && (
        <View style={styles.vehicleTypesRow}>
          {agency.vehicle_types.map((v) => (
            <View key={v} style={styles.vehiclePill}>
              <Text style={styles.vehiclePillText}>{v}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.agencyActionRow}>
        <Pressable style={styles.callBtn} onPress={callAgency}>
          <Text style={styles.callBtnText}>📞 Call Agency</Text>
        </Pressable>
        <Pressable style={styles.waBtn} onPress={whatsappAgency}>
          <Text style={styles.waBtnText}>💬 WhatsApp</Text>
        </Pressable>
      </View>
      <Pressable style={styles.kisanSabhaLink} onPress={openKisanSabha}>
        <Text style={styles.kisanSabhaLinkText}>View on KisanSabha →</Text>
      </Pressable>
    </View>
  );
}


function TruckStatusCard({ deal }: { deal: Deal }) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withSpring(1.04, SPRING.gentle), withSpring(1, SPRING.gentle)),
      -1,
      true
    );
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const steps = [
    { label: 'Deal Confirmed', done: true, icon: '✅' },
    { label: 'Truck Booked', done: deal.status === 'truck_booked' || deal.status === 'departed', icon: '🚛' },
    { label: 'Driver En Route', done: deal.status === 'departed', icon: '🛣️' },
    { label: 'At Mandi', done: deal.status === 'settled', icon: '🏪' },
  ];

  return (
    <Animated.View style={[styles.truckCard, pulseStyle]}>
      <LinearGradient colors={['#1a4a2e', '#0d2b1f']} style={styles.truckGradient}>
        <Text style={styles.truckTitle}>🚛 Transport Status</Text>
        {deal.truck && (
          <View style={styles.truckInfo}>
            <View style={styles.truckDriverRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.truckDriver}>{deal.truck.driver_name}</Text>
                <Text style={styles.truckMeta}>Vehicle: {deal.truck.vehicle_no}</Text>
                <Text style={styles.truckMeta}>Pickup: {deal.truck.pickup_time}</Text>
                <Text style={styles.truckMeta}>ETA Mandi: {deal.truck.eta_mandi}</Text>
              </View>
              {deal.truck.estimated_cost > 0 && (
                <View style={styles.costBadge}>
                  <Text style={styles.costLabel}>Est. Cost</Text>
                  <Text style={styles.costValue}>₹{deal.truck.estimated_cost.toLocaleString()}</Text>
                </View>
              )}
            </View>
            {deal.truck.agency && <AgencyContactRow agency={deal.truck.agency} />}
          </View>
        )}
        <View style={styles.stepsRow}>
          {steps.map((step, i) => (
            <View key={step.label} style={styles.stepItem}>
              <View style={[styles.stepCircle, step.done ? styles.stepDone : styles.stepPending]}>
                <Text style={styles.stepIcon}>{step.done ? step.icon : '○'}</Text>
              </View>
              {i < steps.length - 1 && (
                <View style={[styles.stepLine, { backgroundColor: step.done ? '#52B788' : '#374151' }]} />
              )}
              <Text style={styles.stepLabel}>{step.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export default function DealDetailSheet({ deal, visible, isJoined, isTriggering, onClose, onJoin }: Props) {
  const [myQuantity, setMyQuantity] = useState(10);
  const [joining, setJoining] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const slideY = useRef(new RNAnimated.Value(SCREEN_H)).current;

  useEffect(() => {
    if (visible) {
      RNAnimated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      RNAnimated.timing(slideY, { toValue: SCREEN_H, useNativeDriver: true, duration: 260 }).start();
    }
  }, [visible, slideY]);

  if (!deal) return null;

  const fillPct = Math.min(deal.current_quantity / deal.target_quantity, 1);
  const remaining = Math.max(0, deal.target_quantity - deal.current_quantity);
  const mySavings = myQuantity * deal.savings_per_quintal;
  const isConfirmed = deal.status === 'confirmed' || deal.status === 'truck_booked' || deal.status === 'departed';

  const handleJoin = async () => {
    hapticHeavy();
    setJoining(true);
    await onJoin(deal.deal_id, myQuantity);
    setJoining(false);

    const newTotal = deal.current_quantity + myQuantity;
    if (newTotal >= deal.target_quantity) {
      hapticSuccess();
      setShowParticles(true);
      setTimeout(() => setShowParticles(false), 3000);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <RNAnimated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>

        {/* Handle bar */}
        <View style={styles.handleBar} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <View style={styles.sheetCropRow}>
            <Text style={styles.sheetCropEmoji}>{deal.crop_emoji}</Text>
            <View>
              <Text style={styles.sheetCropName}>{deal.crop}</Text>
              <Text style={styles.sheetMandiName}>→ {deal.target_mandi}</Text>
            </View>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

          {/* Price + Summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View>
                <Text style={styles.summaryPriceLabel}>Best Price Today</Text>
                <View style={styles.summaryPriceRow}>
                  <Text style={styles.summaryPrice}>₹{deal.mandi_price}/kg</Text>
                  <Text style={[styles.summaryChange, { color: deal.price_change_pct >= 0 ? '#52B788' : '#EF4444' }]}>
                    {deal.price_change_pct >= 0 ? '↑' : '↓'}{Math.abs(deal.price_change_pct)}%
                  </Text>
                </View>
              </View>
              <View style={styles.summaryRight}>
                <Text style={styles.summaryDate}>Pickup: {deal.proposed_date}</Text>
                <Text style={styles.summarySaving}>Save ₹{deal.savings_per_quintal}/qtl</Text>
              </View>
            </View>

            {/* Progress */}
            <View style={styles.progressSection}>
              <View style={styles.progressLabelRow}>
                <Text style={styles.progressLabelText}>
                  <Text style={{ color: COLORS.harvest, fontFamily: FONTS.bold }}>{deal.current_quantity}q</Text>
                  {' '}filled of {deal.target_quantity}q target
                </Text>
                {remaining > 0
                  ? <Text style={styles.progressRemaining}>{remaining}q more needed</Text>
                  : <Text style={styles.progressDone}>🎯 Target Reached!</Text>
                }
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, {
                  width: `${fillPct * 100}%`,
                  backgroundColor: isConfirmed ? '#52B788' : fillPct > 0.75 ? COLORS.harvest : COLORS.leaf,
                }]} />
                {/* Milestone marker at 50% */}
                <View style={[styles.progressMilestone, { left: '50%' }]} />
              </View>
              <View style={styles.milestoneLabels}>
                <Text style={styles.milestoneTxt}>50%</Text>
                <Text style={styles.milestoneTxt}>100%</Text>
              </View>
            </View>
          </View>

          {/* Truck status if confirmed */}
          {isConfirmed && <TruckStatusCard deal={deal} />}

          {/* Triggering overlay */}
          {isTriggering && (
            <View style={styles.triggeringBanner}>
              <Text style={styles.triggeringText}>⚡ Target hit! Notifying farmers & booking truck...</Text>
            </View>
          )}

          {/* Farmer Roster */}
          <View style={styles.rosterSection}>
            <Text style={styles.rosterTitle}>
              👥 Who's In This Deal ({deal.members.length} farmers)
            </Text>
            {deal.members.map((m, i) => (
              <FarmerRosterRow key={m.farmer_id} member={m} index={i} />
            ))}
          </View>

          {/* Join Section (if not joined and not confirmed) */}
          {!isJoined && !isConfirmed && (
            <View style={styles.joinSection}>
              <Text style={styles.joinTitle}>Add Your Produce</Text>
              <QuantitySlider value={myQuantity} onChange={setMyQuantity} max={100} />
              <View style={styles.savingRow}>
                <Text style={styles.savingLabel}>Your estimated savings</Text>
                <Text style={styles.savingAmount}>₹{mySavings.toLocaleString()}</Text>
              </View>
              <Pressable onPress={handleJoin} disabled={joining}>
                <LinearGradient
                  colors={joining ? [COLORS.canopy, COLORS.forest] : [COLORS.harvest, '#D97706']}
                  style={styles.joinBtn}
                >
                  <Text style={styles.joinBtnText}>
                    {joining ? 'Joining...' : `Join Deal — ${myQuantity}q 🤝`}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {/* Already joined banner */}
          {isJoined && !isConfirmed && (
            <View style={styles.alreadyJoinedBanner}>
              <Text style={styles.alreadyJoinedText}>
                ✅ You're in! Waiting for {remaining}q more to confirm the deal.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Particles overlay */}
        {showParticles && (
          <SuccessParticles
            trigger={showParticles}
            origin={{ x: Dimensions.get('window').width / 2, y: 200 }}
          />
        )}
      </RNAnimated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000AA' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_H * 0.92,
    backgroundColor: COLORS.night,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
  handleBar: { width: 40, height: 4, backgroundColor: COLORS.canopy, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 14 },
  sheetCropRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetCropEmoji: { fontSize: 40 },
  sheetCropName: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 22 },
  sheetMandiName: { color: COLORS.sprout, fontFamily: FONTS.body, fontSize: 13, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.forest, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: COLORS.muted, fontFamily: FONTS.bold, fontSize: 16 },

  summaryCard: { backgroundColor: COLORS.forest, borderRadius: 18, marginHorizontal: 16, marginBottom: 12, padding: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  summaryPriceLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  summaryPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  summaryPrice: { color: COLORS.harvest, fontFamily: FONTS.mono, fontSize: 26 },
  summaryChange: { fontFamily: FONTS.bodyMed, fontSize: 13 },
  summaryRight: { alignItems: 'flex-end' },
  summaryDate: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  summarySaving: { color: '#52B788', fontFamily: FONTS.bodyMed, fontSize: 13, marginTop: 4 },

  progressSection: {},
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabelText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  progressRemaining: { color: COLORS.harvest, fontFamily: FONTS.bodyMed, fontSize: 12 },
  progressDone: { color: '#52B788', fontFamily: FONTS.bold, fontSize: 12 },
  progressTrack: { height: 10, backgroundColor: COLORS.night, borderRadius: 5, overflow: 'visible', position: 'relative' },
  progressFill: { height: '100%', borderRadius: 5 },
  progressMilestone: { position: 'absolute', top: -3, width: 2, height: 16, backgroundColor: COLORS.canopy },
  milestoneLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  milestoneTxt: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },

  triggeringBanner: { backgroundColor: '#D97706', marginHorizontal: 16, borderRadius: 12, padding: 12, marginBottom: 12 },
  triggeringText: { color: COLORS.night, fontFamily: FONTS.bold, fontSize: 13, textAlign: 'center' },

  rosterSection: { marginHorizontal: 16, marginBottom: 16 },
  rosterTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 15, marginBottom: 12 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.forest, borderRadius: 14, padding: 12, marginBottom: 8 },
  rosterAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.canopy, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rosterAvatarEmoji: { fontSize: 22 },
  rosterInfo: { flex: 1 },
  rosterName: { color: COLORS.white, fontFamily: FONTS.bodyMed, fontSize: 14 },
  rosterVillage: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, marginTop: 2 },
  rosterRight: { alignItems: 'flex-end', gap: 4 },
  rosterQty: { color: COLORS.harvest, fontFamily: FONTS.mono, fontSize: 16 },
  rosterBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  rosterBadgeText: { fontFamily: FONTS.bodyMed, fontSize: 12 },

  joinSection: { marginHorizontal: 16, backgroundColor: COLORS.forest, borderRadius: 18, padding: 16, marginBottom: 12 },
  joinTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 15, marginBottom: 14 },
  sliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sliderLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
  sliderValue: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 13 },
  sliderTrack: { height: 10, backgroundColor: COLORS.night, borderRadius: 5, position: 'relative', marginBottom: 4 },
  sliderFill: { height: '100%', backgroundColor: COLORS.harvest, borderRadius: 5 },
  sliderThumb: { position: 'absolute', top: -8, width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.harvest, marginLeft: -13, borderWidth: 3, borderColor: COLORS.white },
  sliderRangeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  sliderRange: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  savingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, backgroundColor: '#166534', borderRadius: 10, padding: 12 },
  savingLabel: { color: '#86EFAC', fontFamily: FONTS.body, fontSize: 13 },
  savingAmount: { color: '#52B788', fontFamily: FONTS.mono, fontSize: 20 },
  joinBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  joinBtnText: { color: COLORS.night, fontFamily: FONTS.bold, fontSize: 16 },

  alreadyJoinedBanner: { marginHorizontal: 16, backgroundColor: '#16653444', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#52B788' },
  alreadyJoinedText: { color: '#52B788', fontFamily: FONTS.bodyMed, fontSize: 14, textAlign: 'center' },

  // TruckStatusCard
  truckCard: { marginHorizontal: 16, marginBottom: 16, borderRadius: 20, overflow: 'hidden' },
  truckGradient: { flex: 1, padding: 20, borderRadius: 20 },
  truckTitle: { color: '#fff', fontFamily: FONTS.bold, fontSize: 16, marginBottom: 12 },
  truckInfo: { marginBottom: 16 },
  truckDriverRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  truckDriver: { color: '#fff', fontFamily: FONTS.bold, fontSize: 15, marginBottom: 4 },
  truckPhone: { color: '#52B788', fontFamily: FONTS.body, fontSize: 13, marginBottom: 4 },
  truckMeta: { color: '#9CA3AF', fontFamily: FONTS.body, fontSize: 12, marginBottom: 2 },
  costBadge: { backgroundColor: '#52B78820', borderRadius: 10, padding: 10, alignItems: 'center', minWidth: 88 },
  costLabel: { color: '#52B788', fontFamily: FONTS.medium, fontSize: 10, marginBottom: 2 },
  costValue: { color: '#fff', fontFamily: FONTS.bold, fontSize: 15 },

  stepsRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  stepItem: { alignItems: 'center', flex: 1 },
  stepCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stepDone: { backgroundColor: '#52B78830', borderWidth: 1.5, borderColor: '#52B788' },
  stepPending: { backgroundColor: '#37415130', borderWidth: 1.5, borderColor: '#374151' },
  stepIcon: { fontSize: 14 },
  stepLine: { position: 'absolute', top: 15, left: '60%' as any, right: '-60%' as any, height: 2 },
  stepLabel: { color: '#9CA3AF', fontFamily: FONTS.body, fontSize: 9, textAlign: 'center' },

  // AgencyContactRow
  agencyBlock: { backgroundColor: '#0a1f14', borderRadius: 12, padding: 14, marginTop: 4 },
  agencyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  agencyBadge: { backgroundColor: '#52B78820', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  agencyBadgeText: { color: '#52B788', fontFamily: FONTS.medium, fontSize: 10 },
  verifiedBadge: { backgroundColor: '#3B82F620', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  verifiedText: { color: '#60A5FA', fontFamily: FONTS.medium, fontSize: 10 },
  agencyName: { color: '#fff', fontFamily: FONTS.bold, fontSize: 15, marginBottom: 2 },
  agencyCity: { color: '#9CA3AF', fontFamily: FONTS.body, fontSize: 12, marginBottom: 6 },
  agencyMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  agencyRating: { color: '#F59E0B', fontFamily: FONTS.medium, fontSize: 12 },
  agencyTrips: { color: '#6B7280', fontFamily: FONTS.body, fontSize: 12 },
  agencyPrice: { color: '#52B788', fontFamily: FONTS.medium, fontSize: 12 },
  vehicleTypesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  vehiclePill: { backgroundColor: '#1F2937', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  vehiclePillText: { color: '#D1D5DB', fontFamily: FONTS.body, fontSize: 11 },
  agencyActionRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  callBtn: { flex: 1, backgroundColor: '#166534', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  callBtnText: { color: '#fff', fontFamily: FONTS.bold, fontSize: 13 },
  waBtn: { flex: 1, backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  waBtnText: { color: '#fff', fontFamily: FONTS.bold, fontSize: 13 },
  kisanSabhaLink: { alignItems: 'center', paddingVertical: 6 },
  kisanSabhaLinkText: { color: '#60A5FA', fontFamily: FONTS.medium, fontSize: 12 },
});
