import { View, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../store';
import { requestOtp, verifyOtp, completeProfile, signInWithGoogle } from '../services/authService';
import { COLORS, FONTS } from '../constants/theme';
import HoverCard from '../components/HoverCard';
import { z } from 'zod';

const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, 'Invalid phone');
const otpSchema = z.string().regex(/^\d{6}$/, 'Invalid OTP');
const nameSchema = z.string().min(2, 'Name too short');

const CROPS = ['Tomato', 'Onion', 'Potato', 'Chilli', 'Mango', 'Wheat', 'Rice', 'Cotton'];

type Mode = 'signin' | 'signup';
type Step = 'phone' | 'otp' | 'profile' | 'complete';

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setFarmer = useAppStore((s) => s.setFarmer);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setSeasonPlan = useAppStore((s) => s.setSeasonPlan);
  const setHasCompletedPlanOnboarding = useAppStore((s) => s.setHasCompletedPlanOnboarding);

  const [mode, setMode] = useState<Mode>('signin');
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<'hi' | 'en'>('hi');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCrop = (crop: string) => {
    setSelectedCrops((prev) =>
      prev.includes(crop) ? prev.filter((c) => c !== crop) : [...prev, crop]
    );
  };

  const resetForm = () => {
    setStep('phone');
    setPhone('');
    setOtp('');
    setName('');
    setSelectedCrops([]);
    setSelectedLanguage('hi');
    setError(null);
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    resetForm();
  };

  const handleSendOtp = async () => {
    setError(null);
    try { phoneSchema.parse(phone); } catch { setError('Please enter a valid 10-digit phone number'); return; }
    setIsLoading(true);
    try {
      await requestOtp(phone);
      setStep('otp');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error sending OTP');
    } finally { setIsLoading(false); }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    try { otpSchema.parse(otp); } catch { setError('Please enter a valid 6-digit OTP'); return; }
    setIsLoading(true);
    try {
      const result = await verifyOtp(phone, otp);
      if (mode === 'signup' && result.isNew) {
        setStep('profile');
      } else if (result.farmer) {
        setFarmer({ ...result.farmer, created_at: result.farmer.created_at || new Date().toISOString() });
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/(tabs)');
      } else {
        setError('No account found. Please sign up first.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error verifying OTP');
    } finally { setIsLoading(false); }
  };

  const handleCompleteProfile = async () => {
    setError(null);
    try { nameSchema.parse(name); } catch { setError('Please enter your name'); return; }
    if (selectedCrops.length === 0) { setError('Please select at least one crop'); return; }
    setIsLoading(true);
    try {
      const farmer = await completeProfile({
        phone, name,
        state: 'Karnataka', district: 'Kolar', block: 'Kolar-1',
        primary_crops: selectedCrops,
        preferred_language: selectedLanguage,
      });
      setFarmer({ ...farmer, created_at: farmer.created_at || new Date().toISOString() });
      setLanguage(selectedLanguage);
      const id = 'plan-' + Date.now();
      setSeasonPlan({
        id, season: 'kharif', year: new Date().getFullYear(),
        crops: selectedCrops.map((crop) => ({
          crop,
          area_hectares: 1,
          expected_harvest_month: new Date().toLocaleString('default', { month: 'long' }),
        })),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setHasCompletedPlanOnboarding(true);
      setStep('complete');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration error');
    } finally { setIsLoading(false); }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.isNew) {
        setStep('profile');
      } else if (result.farmer) {
        setFarmer({ ...result.farmer, created_at: result.farmer.created_at || new Date().toISOString() });
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/(tabs)');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign in failed');
    } finally { setIsLoading(false); }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.emoji}>🌾</Text>
          <Text style={styles.headerTitle}>मंडी एजेंट</Text>
          <Text style={styles.headerSubtitle}>Your Crop, Your Mandi, Your Advisory</Text>
        </View>

        {step === 'phone' && (
          <>
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, mode === 'signin' && styles.tabActive]}
                onPress={() => switchMode('signin')}
              >
                <Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>Sign In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, mode === 'signup' && styles.tabActive]}
                onPress={() => switchMode('signup')}
              >
                <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Sign Up</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>{mode === 'signin' ? 'Welcome Back' : 'Create Account'}</Text>
            <Text style={styles.sectionSubtitle}>
              {mode === 'signin' ? 'Login with your phone number' : 'Register as a new farmer'}
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <View style={styles.phoneInput}>
                <Text style={styles.countryCode}>+91</Text>
                <TextInput
                  style={styles.input}
                  placeholder="9876543210"
                  placeholderTextColor={COLORS.muted}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  maxLength={10}
                />
              </View>
            </View>

            {error && <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View>}

            <HoverCard>
              <TouchableOpacity
                style={styles.googleBtn}
                onPress={handleGoogleLogin}
                disabled={isLoading}
              >
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </TouchableOpacity>
            </HoverCard>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <HoverCard>
              <TouchableOpacity
                style={[styles.button, (isLoading || phone.length !== 10) && styles.buttonDisabled]}
                onPress={handleSendOtp}
                disabled={isLoading || phone.length !== 10}
              >
                {isLoading ? <ActivityIndicator color={COLORS.night} /> : <Text style={styles.buttonText}>Send OTP</Text>}
              </TouchableOpacity>
            </HoverCard>
          </>
        )}

        {step === 'otp' && (
          <>
            <TouchableOpacity onPress={() => setStep('phone')} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Enter OTP</Text>
            <Text style={styles.sectionSubtitle}>Sent to +91 {phone}</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>6-digit OTP</Text>
              <TextInput
                style={styles.otpInput}
                placeholder="000000"
                placeholderTextColor={COLORS.muted}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
              />
            </View>

            {error && <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View>}

            <TouchableOpacity
              style={[styles.button, (isLoading || otp.length !== 6) && styles.buttonDisabled]}
              onPress={handleVerifyOtp}
              disabled={isLoading || otp.length !== 6}
            >
              {isLoading ? <ActivityIndicator color={COLORS.night} /> : <Text style={styles.buttonText}>Verify</Text>}
            </TouchableOpacity>
          </>
        )}

        {step === 'profile' && (
          <>
            <TouchableOpacity onPress={() => setStep('otp')} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Complete Profile</Text>
            <Text style={styles.sectionSubtitle}>Tell us about yourself</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Your Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter your name"
                placeholderTextColor={COLORS.muted}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Crops You Grow</Text>
              <View style={styles.chipGroup}>
                {CROPS.map((crop) => (
                  <TouchableOpacity
                    key={crop}
                    style={[styles.chip, selectedCrops.includes(crop) && styles.chipActive]}
                    onPress={() => toggleCrop(crop)}
                  >
                    <Text style={[styles.chipText, selectedCrops.includes(crop) && styles.chipTextActive]}>
                      {crop}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Language</Text>
              <View style={styles.langRow}>
                <TouchableOpacity
                  style={[styles.langChip, selectedLanguage === 'hi' && styles.langChipActive]}
                  onPress={() => setSelectedLanguage('hi')}
                >
                  <Text style={[styles.langChipText, selectedLanguage === 'hi' && styles.langChipTextActive]}>हिंदी</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.langChip, selectedLanguage === 'en' && styles.langChipActive]}
                  onPress={() => setSelectedLanguage('en')}
                >
                  <Text style={[styles.langChipText, selectedLanguage === 'en' && styles.langChipTextActive]}>English</Text>
                </TouchableOpacity>
              </View>
            </View>

            {error && <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View>}

            <TouchableOpacity
              style={[styles.button, (isLoading || name.length < 2) && styles.buttonDisabled]}
              onPress={handleCompleteProfile}
              disabled={isLoading || name.length < 2}
            >
              {isLoading ? <ActivityIndicator color={COLORS.night} /> : <Text style={styles.buttonText}>Create Account</Text>}
            </TouchableOpacity>
          </>
        )}

        {step === 'complete' && (
          <View style={styles.completeContainer}>
            <Text style={styles.successEmoji}>🎉</Text>
            <Text style={styles.completeTitle}>Welcome!</Text>
            <Text style={styles.completeSubtitle}>
              Your account is created. Your season plan is ready.
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => router.replace('/(tabs)')}
            >
              <Text style={styles.buttonText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.night },
  scrollContent: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 32 },
  emoji: { fontSize: 48, marginBottom: 8 },
  headerTitle: { color: COLORS.sprout, fontFamily: FONTS.display, fontSize: 32, marginBottom: 4 },
  headerSubtitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center' },
  tabRow: { flexDirection: 'row', backgroundColor: COLORS.forest, borderRadius: 12, padding: 4, marginBottom: 24 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: COLORS.canopy },
  tabText: { color: COLORS.muted, fontFamily: FONTS.medium, fontSize: 15 },
  tabTextActive: { color: COLORS.white },
  sectionTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 24, marginBottom: 4 },
  sectionSubtitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 14, marginBottom: 24 },
  inputContainer: { gap: 8, marginBottom: 16 },
  inputLabel: { color: COLORS.sprout, fontFamily: FONTS.medium, fontSize: 14 },
  phoneInput: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.forest, borderRadius: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: COLORS.canopy,
  },
  countryCode: { color: COLORS.muted, fontFamily: FONTS.medium, fontSize: 16, marginRight: 12 },
  input: {
    flex: 1, backgroundColor: 'transparent', borderRadius: 12,
    paddingVertical: 14, color: COLORS.white, fontFamily: FONTS.body, fontSize: 16,
  },
  textInput: {
    backgroundColor: COLORS.forest, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    color: COLORS.white, fontFamily: FONTS.body, fontSize: 16,
    borderWidth: 1, borderColor: COLORS.canopy,
  },
  otpInput: {
    backgroundColor: COLORS.forest, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    color: COLORS.white, fontFamily: FONTS.mono, fontSize: 24,
    textAlign: 'center', letterSpacing: 8, borderWidth: 1, borderColor: COLORS.canopy,
  },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 20, backgroundColor: COLORS.forest,
    paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.canopy,
  },
  chipActive: { backgroundColor: COLORS.canopy, borderColor: COLORS.sprout },
  chipText: { color: COLORS.muted, fontFamily: FONTS.medium, fontSize: 13 },
  chipTextActive: { color: COLORS.sprout },
  langRow: { flexDirection: 'row', gap: 12 },
  langChip: {
    flex: 1, borderRadius: 12, backgroundColor: COLORS.forest,
    paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.canopy,
  },
  langChipActive: { backgroundColor: COLORS.canopy, borderColor: COLORS.sprout },
  langChipText: { color: COLORS.muted, fontFamily: FONTS.medium, fontSize: 14 },
  langChipTextActive: { color: COLORS.sprout },
  backBtn: { marginBottom: 16 },
  backBtnText: { color: COLORS.sprout, fontFamily: FONTS.medium, fontSize: 16 },
  errorBanner: { backgroundColor: '#450A0A', borderRadius: 8, padding: 12, marginBottom: 12 },
  errorText: { color: '#FCA5A5', fontFamily: FONTS.body, fontSize: 14, textAlign: 'center' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.forest, borderRadius: 12, paddingVertical: 16,
    borderWidth: 1.5, borderColor: COLORS.canopy, gap: 12,
  },
  googleIcon: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF',
    textAlign: 'center', lineHeight: 28, color: '#EA4335',
    fontFamily: FONTS.bold, fontSize: 16,
  },
  googleBtnText: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 15 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.canopy },
  dividerText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, paddingHorizontal: 12 },
  button: { backgroundColor: COLORS.sprout, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { backgroundColor: COLORS.forest },
  buttonText: { color: COLORS.night, fontFamily: FONTS.bold, fontSize: 16 },
  completeContainer: { alignItems: 'center', gap: 16, paddingTop: 48 },
  successEmoji: { fontSize: 64 },
  completeTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 28, textAlign: 'center' },
  completeSubtitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  footer: { alignItems: 'center', marginTop: 32 },
  footerText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, textAlign: 'center' },
});
