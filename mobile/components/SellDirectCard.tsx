import { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS } from '../../constants/theme';
import { useT } from '../../utils/useT';

const LISTING_KEY = '@mandiagent:listings';

type Listing = {
  id: string;
  crop: string;
  quantity: number;
  unit: string;
  price: number;
  mandi: string;
  date: string;
  status: 'listed' | 'sold' | 'expired';
};

const MANDIS = ['Kolar APMC', 'Bangalore Market', 'Mysore Mandi', 'Tumkur Market', 'Chikkaballapur'];
const CROPS = ['Tomato', 'Onion', 'Potato', 'Chilli', 'Rice', 'Wheat', 'Mango'];

export default function SellDirectCard() {
  const { t } = useT();
  const [listings, setListings] = useState<Listing[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ crop: 'Tomato', quantity: '', mandi: 'Kolar APMC', price: '' });

  useState(() => {
    AsyncStorage.getItem(LISTING_KEY).then((raw) => {
      if (raw) setListings(JSON.parse(raw));
    });
  });

  const createListing = async () => {
    if (!form.quantity || !form.price) return;
    const listing: Listing = {
      id: Date.now().toString(),
      crop: form.crop,
      quantity: Number(form.quantity),
      unit: 'quintal',
      price: Number(form.price),
      mandi: form.mandi,
      date: new Date().toISOString().split('T')[0],
      status: 'listed',
    };
    const updated = [listing, ...listings];
    setListings(updated);
    await AsyncStorage.setItem(LISTING_KEY, JSON.stringify(updated));
    setForm({ crop: 'Tomato', quantity: '', mandi: 'Kolar APMC', price: '' });
    setShowForm(false);
    Alert.alert('', 'Listing created! Buyers will see your produce.');
  };

  const activeListings = listings.filter((l) => l.status === 'listed');

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>🏪 Sell Direct</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{activeListings.length} Active</Text>
        </View>
      </View>

      {showForm && (
        <View style={styles.form}>
          <Text style={styles.label}>Crop</Text>
          <View style={styles.row}>
            {CROPS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.pill, form.crop === c && styles.pillActive]}
                onPress={() => setForm((p) => ({ ...p, crop: c }))}
              >
                <Text style={[styles.pillText, form.crop === c && styles.pillTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Quantity (quintal)</Text>
          <TextInput
            style={styles.input}
            value={form.quantity}
            onChangeText={(v) => setForm((p) => ({ ...p, quantity: v }))}
            keyboardType="numeric"
            placeholderTextColor={COLORS.muted}
          />

          <Text style={styles.label}>Mandi</Text>
          <View style={styles.row}>
            {MANDIS.slice(0, 3).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.pill, form.mandi === m && styles.pillActive]}
                onPress={() => setForm((p) => ({ ...p, mandi: m }))}
              >
                <Text style={[styles.pillText, form.mandi === m && styles.pillTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Price per Quintal (₹)</Text>
          <TextInput
            style={styles.input}
            value={form.price}
            onChangeText={(v) => setForm((p) => ({ ...p, price: v }))}
            keyboardType="numeric"
            placeholderTextColor={COLORS.muted}
          />

          <TouchableOpacity style={styles.createBtn} onPress={createListing}>
            <Text style={styles.createBtnText}>📢 Create Listing</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.toggleBtn} onPress={() => setShowForm(!showForm)}>
        <Text style={styles.toggleText}>{showForm ? 'Cancel' : '+ New Listing'}</Text>
      </TouchableOpacity>

      {listings.length > 0 && (
        <View style={styles.listingsList}>
          {listings.map((l) => (
            <View key={l.id} style={styles.listingItem}>
              <View style={styles.listingHeader}>
                <Text style={styles.listingCrop}>{l.crop}</Text>
                <View style={[styles.statusBadge, l.status === 'listed' && styles.statusListed]}>
                  <Text style={styles.statusText}>{l.status}</Text>
                </View>
              </View>
              <Text style={styles.listingDetail}>{l.quantity} {l.unit} @ ₹{l.price}/qtl</Text>
              <Text style={styles.listingMandi}>{l.mandi}</Text>
              <Text style={styles.listingDate}>{l.date}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.forest, borderRadius: 12, borderWidth: 1, borderColor: COLORS.canopy, padding: 14, gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16 },
  badge: { backgroundColor: 'rgba(239,68,68,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: COLORS.harvest, fontFamily: FONTS.medium, fontSize: 11 },
  form: { backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10, gap: 8 },
  label: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)' },
  pillActive: { backgroundColor: COLORS.harvest },
  pillText: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 10 },
  pillTextActive: { color: COLORS.night, fontFamily: FONTS.medium },
  input: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: COLORS.white, fontFamily: FONTS.body, fontSize: 13 },
  createBtn: { backgroundColor: COLORS.harvest, borderRadius: 6, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  createBtnText: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 13 },
  toggleBtn: { alignItems: 'center', paddingVertical: 4 },
  toggleText: { color: COLORS.harvest, fontFamily: FONTS.medium, fontSize: 13 },
  listingsList: { gap: 8, marginTop: 4 },
  listingItem: { backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10, gap: 4 },
  listingHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  listingCrop: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 13 },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)' },
  statusListed: { backgroundColor: 'rgba(16,185,129,0.2)' },
  statusText: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 10, textTransform: 'capitalize' },
  listingDetail: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 12 },
  listingMandi: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  listingDate: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
});
