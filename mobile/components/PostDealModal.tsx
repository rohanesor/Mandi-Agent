import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS } from '../constants/theme';
import { Deal } from '../hooks/useDeals';
import { hapticLight, hapticHeavy } from '../utils/haptics';

const CROPS = [
  { label: 'Tomato', emoji: '🍅' },
  { label: 'Onion',  emoji: '🧅' },
  { label: 'Potato', emoji: '🥔' },
  { label: 'Chilli', emoji: '🌶️' },
  { label: 'Brinjal',emoji: '🍆' },
  { label: 'Cabbage',emoji: '🥬' },
  { label: 'Carrot', emoji: '🥕' },
  { label: 'Mango',  emoji: '🥭' },
];

const MANDIS = [
  { name: 'Kolar APMC',     price: 34 },
  { name: 'Bangalore APMC', price: 31 },
  { name: 'Mysore APMC',    price: 29 },
  { name: 'Tumkur APMC',    price: 27 },
  { name: 'Hassan APMC',    price: 26 },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onPost: (deal: Omit<Deal, 'deal_id' | 'members' | 'current_quantity' | 'status'>) => void;
}

export default function PostDealModal({ visible, onClose, onPost }: Props) {
  const [selectedCrop, setSelectedCrop] = useState(CROPS[0]);
  const [selectedMandi, setSelectedMandi] = useState(MANDIS[0]);
  const [targetQty, setTargetQty] = useState(100);
  const [myQty, setMyQty] = useState(10);
  const [proposedDate, setProposedDate] = useState('2026-05-05');
  const [posting, setPosting] = useState(false);

  const handlePost = async () => {
    hapticHeavy();
    setPosting(true);
    await new Promise((r) => setTimeout(r, 800));

    onPost({
      crop: selectedCrop.label,
      crop_emoji: selectedCrop.emoji,
      target_mandi: selectedMandi.name,
      mandi_price: selectedMandi.price,
      price_change_pct: Math.round(-5 + Math.random() * 20),
      target_quantity: targetQty,
      distance_km: parseFloat((1 + Math.random() * 9).toFixed(1)),
      proposed_date: proposedDate,
      expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      savings_per_quintal: Math.round(100 + Math.random() * 120),
      posted_by_farmer_id: 'ME',
      block_id: 'BLK-001',
    });

    setPosting(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handleBar} />
        <Text style={styles.title}>Post a New Deal 🌾</Text>
        <Text style={styles.subtitle}>Invite nearby farmers to pool produce for the best price</Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>

          {/* Crop Picker */}
          <Text style={styles.sectionLabel}>Select Crop</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cropRow}>
            {CROPS.map((c) => (
              <Pressable
                key={c.label}
                onPress={() => { setSelectedCrop(c); hapticLight(); }}
                style={[styles.cropPill, selectedCrop.label === c.label && styles.cropPillActive]}
              >
                <Text style={styles.cropEmoji}>{c.emoji}</Text>
                <Text style={[styles.cropLabel, selectedCrop.label === c.label && styles.cropLabelActive]}>
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Mandi Picker */}
          <Text style={styles.sectionLabel}>Select Target Mandi</Text>
          {MANDIS.map((m) => (
            <Pressable
              key={m.name}
              onPress={() => { setSelectedMandi(m); hapticLight(); }}
              style={[styles.mandiRow, selectedMandi.name === m.name && styles.mandiRowActive]}
            >
              <Text style={styles.mandiIcon}>🏪</Text>
              <Text style={[styles.mandiName, selectedMandi.name === m.name && { color: COLORS.white }]}>
                {m.name}
              </Text>
              <Text style={[styles.mandiPrice, { color: COLORS.harvest }]}>₹{m.price}/kg</Text>
              {selectedMandi.name === m.name && (
                <View style={styles.bestBadge}>
                  <Text style={styles.bestBadgeText}>Selected</Text>
                </View>
              )}
            </Pressable>
          ))}

          {/* Target Quantity */}
          <Text style={styles.sectionLabel}>Target Quantity (quintals)</Text>
          <View style={styles.qtyRow}>
            {[50, 75, 100, 150, 200].map((q) => (
              <Pressable
                key={q}
                onPress={() => { setTargetQty(q); hapticLight(); }}
                style={[styles.qtyPill, targetQty === q && styles.qtyPillActive]}
              >
                <Text style={[styles.qtyText, targetQty === q && styles.qtyTextActive]}>{q}q</Text>
              </Pressable>
            ))}
          </View>

          {/* My Quantity */}
          <Text style={styles.sectionLabel}>Your Contribution (quintals)</Text>
          <Pressable
            style={styles.sliderTrack}
            onPress={(e) => {
              hapticLight();
              const x = e.nativeEvent.locationX;
              const q = Math.max(1, Math.min(50, Math.round((x / 280) * 50)));
              setMyQty(q);
            }}
          >
            <View style={[styles.sliderFill, { width: `${(myQty / 50) * 100}%` }]} />
            <View style={[styles.sliderThumb, { left: `${(myQty / 50) * 100}%` as any }]} />
          </Pressable>
          <Text style={styles.myQtyLabel}>{myQty} quintals from you</Text>

          {/* Post Button */}
          <Pressable onPress={handlePost} disabled={posting} style={{ marginTop: 20 }}>
            <LinearGradient colors={['#52B788', '#2D6A4F']} style={styles.postBtn}>
              <Text style={styles.postBtnText}>
                {posting ? 'Posting Deal...' : 'Post Deal & Notify Nearby Farmers 🚀'}
              </Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000AA' },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.night,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 12, paddingHorizontal: 16, maxHeight: '92%',
  },
  handleBar: { width: 40, height: 4, backgroundColor: COLORS.canopy, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 20, marginBottom: 4 },
  subtitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, marginBottom: 20 },
  sectionLabel: { color: COLORS.muted, fontFamily: FONTS.bodyMed, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 16 },
  cropRow: { gap: 10, paddingBottom: 4 },
  cropPill: { alignItems: 'center', backgroundColor: COLORS.forest, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1.5, borderColor: 'transparent' },
  cropPillActive: { borderColor: COLORS.harvest, backgroundColor: COLORS.canopy },
  cropEmoji: { fontSize: 24, marginBottom: 4 },
  cropLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  cropLabelActive: { color: COLORS.white },
  mandiRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.forest, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: 'transparent', gap: 10 },
  mandiRowActive: { borderColor: '#52B788' },
  mandiIcon: { fontSize: 20 },
  mandiName: { flex: 1, color: COLORS.muted, fontFamily: FONTS.bodyMed, fontSize: 14 },
  mandiPrice: { fontFamily: FONTS.mono, fontSize: 15 },
  bestBadge: { backgroundColor: '#16653480', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 6 },
  bestBadgeText: { color: '#52B788', fontFamily: FONTS.bodyMed, fontSize: 10 },
  qtyRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  qtyPill: { backgroundColor: COLORS.forest, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, borderWidth: 1.5, borderColor: 'transparent' },
  qtyPillActive: { borderColor: COLORS.harvest, backgroundColor: COLORS.canopy },
  qtyText: { color: COLORS.muted, fontFamily: FONTS.bodyMed, fontSize: 14 },
  qtyTextActive: { color: COLORS.harvest },
  sliderTrack: { height: 10, backgroundColor: COLORS.forest, borderRadius: 5, position: 'relative', marginBottom: 6 },
  sliderFill: { height: '100%', backgroundColor: COLORS.leaf, borderRadius: 5 },
  sliderThumb: { position: 'absolute', top: -8, width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.leaf, marginLeft: -13, borderWidth: 3, borderColor: COLORS.white },
  myQtyLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  postBtn: { borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  postBtnText: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16 },
});
