import { View, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../store';
import { COLORS, FONTS } from '../constants/theme';
import type { Season, CropPlan } from '../store/useAppStore';

const SEASONS: { key: Season; label: string }[] = [
  { key: 'kharif', label: 'Kharif (Monsoon)' },
  { key: 'rabi', label: 'Rabi (Winter)' },
  { key: 'zaid', label: 'Zaid (Summer)' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function PlanOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const farmer = useAppStore((s) => s.farmer);
  const setSeasonPlan = useAppStore((s) => s.setSeasonPlan);
  const setHasCompletedPlanOnboarding = useAppStore((s) => s.setHasCompletedPlanOnboarding);

  const [season, setSeason] = useState<Season>('kharif');
  const [cropPlans, setCropPlans] = useState<CropPlan[]>(
    (farmer?.primary_crops || ['Tomato']).map((crop) => ({
      crop,
      area_hectares: farmer?.land_size_hectares
        ? Math.round((farmer.land_size_hectares / (farmer.primary_crops?.length || 1)) * 10) / 10
        : 1,
      expected_harvest_month: MONTHS[new Date().getMonth() + 3 > 11 ? 0 : new Date().getMonth() + 3],
    }))
  );

  const updateCropPlan = (index: number, field: keyof CropPlan, value: string | number) => {
    setCropPlans((prev) => prev.map((cp, i) => (i === index ? { ...cp, [field]: value } : cp)));
  };

  const handleSave = () => {
    const id = 'plan-' + Date.now();
    const plan = {
      id,
      season,
      year: new Date().getFullYear(),
      crops: cropPlans,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setSeasonPlan(plan);
    setHasCompletedPlanOnboarding(true);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.emoji}>🌿</Text>
        <Text style={styles.title}>Plan Your Season</Text>
        <Text style={styles.subtitle}>Set up your farming plan for this season</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Season</Text>
          <View style={styles.seasonRow}>
            {SEASONS.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.seasonChip, season === s.key && styles.seasonChipActive]}
                onPress={() => setSeason(s.key)}
              >
                <Text style={[styles.seasonChipText, season === s.key && styles.seasonChipTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={styles.inputLabel}>Your Crops</Text>
        {cropPlans.map((cp, idx) => (
          <View key={idx} style={styles.cropCard}>
            <Text style={styles.cropCardTitle}>{cp.crop}</Text>
            <View style={styles.cropCardRow}>
              <View style={styles.cropField}>
                <Text style={styles.cropFieldLabel}>Area (hectares)</Text>
                <TextInput
                  style={styles.cropInput}
                  value={String(cp.area_hectares)}
                  onChangeText={(v) => updateCropPlan(idx, 'area_hectares', parseFloat(v) || 0)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.cropField}>
                <Text style={styles.cropFieldLabel}>Harvest Month</Text>
                <View style={styles.monthPicker}>
                  {MONTHS.slice(0, 6).map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.monthChip, cp.expected_harvest_month === m && styles.monthChipActive]}
                      onPress={() => updateCropPlan(idx, 'expected_harvest_month', m)}
                    >
                      <Text style={[styles.monthChipText, cp.expected_harvest_month === m && styles.monthChipTextActive]}>
                        {m.slice(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.button} onPress={handleSave}>
          <Text style={styles.buttonText}>Save & Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.night },
  scrollContent: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40 },
  emoji: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  title: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 28, textAlign: 'center', marginBottom: 4 },
  subtitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 14, textAlign: 'center', marginBottom: 32 },
  inputContainer: { gap: 8, marginBottom: 24 },
  inputLabel: { color: COLORS.sprout, fontFamily: FONTS.medium, fontSize: 14, marginBottom: 8 },
  seasonRow: { flexDirection: 'row', gap: 8 },
  seasonChip: {
    flex: 1, borderRadius: 12, backgroundColor: COLORS.forest,
    paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.canopy,
  },
  seasonChipActive: { backgroundColor: COLORS.canopy, borderColor: COLORS.sprout },
  seasonChipText: { color: COLORS.muted, fontFamily: FONTS.medium, fontSize: 12, textAlign: 'center' },
  seasonChipTextActive: { color: COLORS.sprout },
  cropCard: {
    backgroundColor: COLORS.forest, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: COLORS.canopy, marginBottom: 12,
  },
  cropCardTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16, marginBottom: 12 },
  cropCardRow: { gap: 12 },
  cropField: { gap: 6 },
  cropFieldLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  cropInput: {
    backgroundColor: COLORS.canopy, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    color: COLORS.white, fontFamily: FONTS.body, fontSize: 14,
  },
  monthPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  monthChip: {
    borderRadius: 16, backgroundColor: COLORS.canopy,
    paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'transparent',
  },
  monthChipActive: { borderColor: COLORS.sprout, backgroundColor: COLORS.forest },
  monthChipText: { color: COLORS.muted, fontFamily: FONTS.medium, fontSize: 12 },
  monthChipTextActive: { color: COLORS.sprout },
  button: {
    backgroundColor: COLORS.sprout, borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 16,
  },
  buttonText: { color: COLORS.night, fontFamily: FONTS.bold, fontSize: 16 },
});
