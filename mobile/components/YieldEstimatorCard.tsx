import { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { COLORS, FONTS } from '../constants/theme';
import { useT } from '../utils/useT';

const CROP_YIELD = {
  Tomato: { min: 25, max: 40, unit: 'tonnes/ha' },
  Onion: { min: 15, max: 25, unit: 'tonnes/ha' },
  Potato: { min: 20, max: 35, unit: 'tonnes/ha' },
  Chilli: { min: 2, max: 5, unit: 'tonnes/ha' },
  Rice: { min: 3, max: 6, unit: 'tonnes/ha' },
  Wheat: { min: 2.5, max: 5, unit: 'tonnes/ha' },
  Mango: { min: 8, max: 15, unit: 'tonnes/ha' },
};

const CROPS = Object.keys(CROP_YIELD);

export default function YieldEstimatorCard() {
  const { t } = useT();
  const [selectedCrop, setSelectedCrop] = useState('Tomato');
  const [landArea, setLandArea] = useState('');
  const [result, setResult] = useState<{ min: number; max: number; unit: string } | null>(null);

  const estimate = () => {
    const area = Number(landArea);
    if (!area || area <= 0) return;
    const crop = CROP_YIELD[selectedCrop as keyof typeof CROP_YIELD];
    setResult({
      min: Math.round(crop.min * area * 10) / 10,
      max: Math.round(crop.max * area * 10) / 10,
      unit: crop.unit.replace('/ha', ''),
    });
  };

  const expectedRevenue = result
    ? {
        min: Math.round(result.min * { Tomato: 2500, Onion: 2000, Potato: 1500, Chilli: 15000, Rice: 2200, Wheat: 2100, Mango: 3000 }[selectedCrop as keyof typeof CROP_YIELD] / 1000 * 10) / 10,
        max: Math.round(result.max * { Tomato: 2500, Onion: 2000, Potato: 1500, Chilli: 15000, Rice: 2200, Wheat: 2100, Mango: 3000 }[selectedCrop as keyof typeof CROP_YIELD] / 1000 * 10) / 10,
      }
    : null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>📊 Yield Estimator</Text>

      <Text style={styles.label}>Select Crop</Text>
      <View style={styles.cropRow}>
        {CROPS.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.cropPill, selectedCrop === c && styles.cropPillActive]}
            onPress={() => { setSelectedCrop(c); setResult(null); }}
          >
            <Text style={[styles.cropPillText, selectedCrop === c && styles.cropPillTextActive]}>
              {c}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Land Area (hectares)</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={landArea}
          onChangeText={setLandArea}
          keyboardType="numeric"
          placeholder="e.g. 2.5"
          placeholderTextColor={COLORS.muted}
        />
        <TouchableOpacity style={styles.estimateBtn} onPress={estimate}>
          <Text style={styles.estimateBtnText}>Estimate</Text>
        </TouchableOpacity>
      </View>

      {result && (
        <View style={styles.resultCard}>
          <View style={styles.resultRow}>
            <View style={styles.resultItem}>
              <Text style={styles.resultLabel}>Min Yield</Text>
              <Text style={styles.resultValue}>{result.min} {result.unit}</Text>
            </View>
            <View style={styles.resultItem}>
              <Text style={styles.resultLabel}>Max Yield</Text>
              <Text style={styles.resultValue}>{result.max} {result.unit}</Text>
            </View>
          </View>
          {expectedRevenue && (
            <View style={styles.revenueRow}>
              <Text style={styles.revenueLabel}>Expected Revenue</Text>
              <Text style={styles.revenueValue}>₹{expectedRevenue.min}K — ₹{expectedRevenue.max}K</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.forest, borderRadius: 12, borderWidth: 1, borderColor: COLORS.canopy, padding: 14, gap: 10 },
  title: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16 },
  label: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  cropRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cropPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)' },
  cropPillActive: { backgroundColor: COLORS.harvest },
  cropPillText: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 11 },
  cropPillTextActive: { color: COLORS.night, fontFamily: FONTS.medium },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: COLORS.white, fontFamily: FONTS.body, fontSize: 13 },
  estimateBtn: { backgroundColor: COLORS.canopy, borderRadius: 6, paddingHorizontal: 14, justifyContent: 'center' },
  estimateBtnText: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 12 },
  resultCard: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12, gap: 8 },
  resultRow: { flexDirection: 'row', gap: 12 },
  resultItem: { flex: 1, alignItems: 'center' },
  resultLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  resultValue: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16 },
  revenueRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: COLORS.canopy, paddingTop: 8 },
  revenueLabel: { color: COLORS.harvest, fontFamily: FONTS.medium, fontSize: 12 },
  revenueValue: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 13 },
});
