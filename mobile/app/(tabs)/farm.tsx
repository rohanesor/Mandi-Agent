import { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS } from '../../constants/theme';
import { useT } from '../../utils/useT';
import { DEMO_FARMER, DEMO_WEATHER, DEMO_FARM_CROPS } from '../../constants/demoData';
import { DEMO_MODE } from '../../constants/demoConfig';
import NotificationBell from '../../components/NotificationBell';
import {
  checkSchemeEligibility,
  detectDisease,
  getFpoAnalytics,
  getVoiceFaq,
  predictDemand,
} from '../../services';

type GoogleUser = { name: string; email: string; photo: string | null } | null;

const GOOGLE_USER_KEY = '@mandiagent:googleUser';

const WEATHER_ICONS: Record<string, string> = {
  sunny: '☀️',
  cloudy: '⛅',
  rainy: '🌧️',
};

export default function FarmScreen() {
  const { t } = useT();
  const [googleUser, setGoogleUser] = useState<GoogleUser>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [insight, setInsight] = useState<string>('Tap a tool below to fetch high-impact insights');

  useEffect(() => {
    AsyncStorage.getItem(GOOGLE_USER_KEY).then((raw) => {
      if (raw) setGoogleUser(JSON.parse(raw));
    });
  }, []);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    await new Promise((r) => setTimeout(r, 1500));
    const user = { name: 'Raju Naik', email: 'raju.naik@gmail.com', photo: null };
    setGoogleUser(user);
    await AsyncStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(user));
    setSigningIn(false);
  };

  const hectares = (DEMO_FARMER.landholding_acres * 0.4047).toFixed(2);

  const runDemandPrediction = async () => {
    const res = await predictDemand('Tomato', DEMO_FARMER.state, 3);
    setInsight(`Demand (${res.demand_level}): index ${res.predicted_demand_index} · ${res.recommended_action}`);
  };

  const runSchemeCheck = async () => {
    const [top] = await checkSchemeEligibility({
      farmer_id: 'demo-farmer',
      name: DEMO_FARMER.name,
      phone: '+919876543210',
      language: 'hi',
      location: DEMO_FARMER.location,
      latitude: 13.13,
      longitude: 78.12,
      block_id: 'KA-KOL-06',
      crops: ['Tomato'],
      landholding_acres: DEMO_FARMER.landholding_acres,
      category: 'sc',
      irrigation_type: 'rainfed',
    });
    if (top) setInsight(`Top Scheme: ${top.scheme_name} (${Math.round(top.eligibility_score * 100)}%)`);
  };

  const runFaq = async () => {
    const faq = await getVoiceFaq('Heavy rain advice for tomato', 'hi');
    setInsight(`FAQ: ${faq.answer.slice(0, 110)}...`);
  };

  const runDiseaseDemo = async () => {
    const diagnosis = await detectDisease('', 'Tomato');
    setInsight(`Disease: ${diagnosis.disease_name} (${Math.round(diagnosis.confidence * 100)}% confidence)`);
  };

  const runFpoAnalytics = async () => {
    const analytics = await getFpoAnalytics('FPO-KA-KOL-01');
    setInsight(`FPO ${analytics.fpo_id}: ${analytics.bundle_progress.confirmed} confirmed bundles, ${analytics.engagement_metrics.active_farmers_7d} active farmers`);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.header}>{t('myFarm')}</Text>
          <NotificationBell />
        </View>

        {!googleUser ? (
          <View style={styles.googleCard}>
            <Text style={styles.googleHint}>🟡 Sign in with Google to save your farm profile</Text>
            <TouchableOpacity style={styles.googleButton} onPress={handleGoogleSignIn} disabled={signingIn}>
              {signingIn ? (
                <ActivityIndicator color={COLORS.night} />
              ) : (
                <Text style={styles.googleButtonText}>G  Sign in with Google</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.googleSignedCard}>
            <View style={styles.avatar}><Text style={styles.avatarText}>RN</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{googleUser.name}</Text>
              <Text style={styles.profileEmail}>{googleUser.email}</Text>
            </View>
            <TouchableOpacity
              onPress={async () => {
                setGoogleUser(null);
                await AsyncStorage.removeItem(GOOGLE_USER_KEY);
              }}
            >
              <Text style={styles.signOut}>Sign out</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.profileCard}>
          <Text style={styles.profileName}>{DEMO_FARMER.name}</Text>
          <Text style={styles.profileLocation}>{DEMO_FARMER.location}, {DEMO_FARMER.state}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}><Text style={styles.statValue}>{DEMO_FARM_CROPS.length}</Text><Text style={styles.statLabel}>{t('crops')}</Text></View>
            <View style={styles.statItem}><Text style={styles.statValue}>{hectares}</Text><Text style={styles.statLabel}>{t('hectare')}</Text></View>
            <View style={styles.statItem}><Text style={styles.statValue}>{DEMO_FARMER.state}</Text><Text style={styles.statLabel}>{t('state')}</Text></View>
          </View>

          <View style={styles.metaRow}><Text style={styles.metaLabel}>Village</Text><Text style={styles.metaValue}>Mulbagal</Text></View>
          <View style={styles.metaRow}><Text style={styles.metaLabel}>Block</Text><Text style={styles.metaValue}>KA-KOL-06</Text></View>
          <View style={styles.metaRow}><Text style={styles.metaLabel}>District</Text><Text style={styles.metaValue}>Kolar</Text></View>
        </View>

        <View style={styles.weatherCard}>
          <Text style={styles.sectionTitle}>{t('weather')}</Text>
          <Text style={styles.tempText}>{DEMO_WEATHER.temperature}°C</Text>
          <Text style={styles.conditionText}>{DEMO_WEATHER.condition}</Text>

          <View style={styles.weatherStats}>
            <View><Text style={styles.smallLabel}>Humidity</Text><Text style={styles.smallValue}>{DEMO_WEATHER.humidity}%</Text></View>
            <View><Text style={styles.smallLabel}>Rainfall</Text><Text style={styles.smallValue}>{DEMO_WEATHER.rainfall_mm}mm</Text></View>
            <View><Text style={styles.smallLabel}>Soil</Text><Text style={styles.smallValue}>{DEMO_WEATHER.soil_moisture}%</Text></View>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${DEMO_WEATHER.soil_moisture}%` }]} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            {DEMO_WEATHER.forecast_7d.map((day) => (
              <View key={day.day} style={styles.forecastPill}>
                <Text style={styles.forecastText}>{day.day}</Text>
                <Text style={styles.forecastEmoji}>{WEATHER_ICONS[day.condition] || '⛅'}</Text>
                <Text style={styles.forecastText}>{day.high}°</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        <Text style={styles.sectionTitle}>{t('myCrops')}</Text>
        {DEMO_FARM_CROPS.map((crop) => (
          <View key={crop.crop} style={styles.cropCard}>
            <Text style={styles.cropName}>{crop.crop} · {crop.local_name}</Text>
            <Text style={styles.cropDates}>{crop.planted_date} → {crop.expected_harvest_date}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${crop.growth_pct}%` }]} />
            </View>
            <Text style={styles.cropMeta}>Growth: {crop.growth_pct}%</Text>
            <Text style={styles.cropMeta}>Current: ₹{crop.current_price} | Forecast: ₹{crop.forecast_price}</Text>
            <Text style={styles.cropMeta}>Days to harvest: {crop.days_to_harvest}</Text>
          </View>
        ))}

        <View style={styles.profileCard}>
          <Text style={styles.sectionTitle}>High-Impact Tools</Text>
          <View style={styles.toolRow}>
            <TouchableOpacity style={styles.toolButton} onPress={runDemandPrediction}><Text style={styles.toolText}>Demand</Text></TouchableOpacity>
            <TouchableOpacity style={styles.toolButton} onPress={runSchemeCheck}><Text style={styles.toolText}>Schemes</Text></TouchableOpacity>
            <TouchableOpacity style={styles.toolButton} onPress={runFaq}><Text style={styles.toolText}>Voice FAQ</Text></TouchableOpacity>
          </View>
          <View style={styles.toolRow}>
            <TouchableOpacity style={styles.toolButton} onPress={runDiseaseDemo}><Text style={styles.toolText}>Disease</Text></TouchableOpacity>
            <TouchableOpacity style={styles.toolButton} onPress={runFpoAnalytics}><Text style={styles.toolText}>FPO</Text></TouchableOpacity>
          </View>
          <Text style={styles.insightText}>{insight}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.night },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  header: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 24 },
  googleCard: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, borderWidth: 1, borderColor: COLORS.harvest, padding: 12 },
  googleHint: { color: COLORS.white, fontFamily: FONTS.body, marginBottom: 10 },
  googleButton: { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  googleButtonText: { color: '#111827', fontFamily: FONTS.medium },
  googleSignedCard: { backgroundColor: COLORS.forest, borderRadius: 12, borderWidth: 1, borderColor: COLORS.canopy, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.harvest, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLORS.night, fontFamily: FONTS.bold },
  signOut: { color: COLORS.harvest, fontFamily: FONTS.body, textDecorationLine: 'underline' },
  profileCard: { backgroundColor: COLORS.forest, borderRadius: 12, borderWidth: 1, borderColor: COLORS.canopy, padding: 14 },
  profileName: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 18 },
  profileEmail: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  profileLocation: { color: COLORS.muted, fontFamily: FONTS.body, marginTop: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, marginBottom: 8 },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { color: COLORS.white, fontFamily: FONTS.mono, fontSize: 16 },
  statLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  metaLabel: { color: COLORS.muted, fontFamily: FONTS.body },
  metaValue: { color: COLORS.white, fontFamily: FONTS.medium },
  weatherCard: { backgroundColor: '#2D6A4F', borderRadius: 12, padding: 14 },
  sectionTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 18, marginTop: 6 },
  tempText: { color: COLORS.harvest, fontFamily: FONTS.mono, fontSize: 36, marginTop: 8 },
  conditionText: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 14 },
  weatherStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  smallLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  smallValue: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 14 },
  progressTrack: { marginTop: 8, height: 8, borderRadius: 999, backgroundColor: '#1F2937', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.harvest },
  forecastPill: { width: 62, backgroundColor: COLORS.forest, borderRadius: 10, paddingVertical: 8, marginRight: 8, alignItems: 'center' },
  forecastText: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 11 },
  forecastEmoji: { fontSize: 14, marginVertical: 3 },
  cropCard: { backgroundColor: COLORS.forest, borderRadius: 12, borderWidth: 1, borderColor: COLORS.canopy, padding: 12 },
  cropName: { color: COLORS.white, fontFamily: FONTS.bold },
  cropDates: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, marginTop: 2 },
  cropMeta: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 12, marginTop: 6 },
  toolRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  toolButton: { backgroundColor: COLORS.canopy, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  toolText: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 12 },
  insightText: { color: COLORS.white, fontFamily: FONTS.body, marginTop: 10, fontSize: 12 },
});
