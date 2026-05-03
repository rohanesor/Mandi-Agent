import { View, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAppStore } from '../store';
import { register, requestOtp, login } from '../services/authService';
import { COLORS, FONTS } from '../constants/theme';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { z } from 'zod';

const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, 'Invalid phone');
const otpSchema = z.string().regex(/^\d{6}$/, 'Invalid OTP');
const nameSchema = z.string().min(2, 'Name too short');

type Step = 'method' | 'phone' | 'otp' | 'profile' | 'complete';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const GOOGLE_USER_KEY = '@mandiagent:googleUser';

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setFarmer = useAppStore((s) => s.setFarmer);
  const setLanguage = useAppStore((s) => s.setLanguage);

  const [step, setStep] = useState<Step>('method');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<'hi' | 'en'>('hi');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buttonScale = useSharedValue(1);

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handleButtonPressIn = () => {
    buttonScale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
  };

  const handleButtonPressOut = () => {
    buttonScale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handleSendOtp = async () => {
    setError(null);
    try {
      phoneSchema.parse(phone);
    } catch {
      setError('कृपया वैध 10 अंकों का फ़ोन नंबर दर्ज करें · Please enter valid 10-digit phone');
      return;
    }
    setIsLoading(true);
    try {
      await requestOtp(phone);
      setStep('otp');
      if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP भेजने में त्रुटि · Error sending OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    try {
      otpSchema.parse(otp);
    } catch {
      setError('कृपया वैध 6 अंकों का OTP दर्ज करें · Please enter valid 6-digit OTP');
      return;
    }
    setIsLoading(true);
    try {
      const response = await login({ phone, otp });
      if (response.farmer) {
        setFarmer({ ...response.farmer, created_at: response.farmer.created_at || new Date().toISOString() });
        if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/(tabs)');
      } else {
        setStep('profile');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP सत्यापन में त्रुटि · Error verifying OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteProfile = async () => {
    setError(null);
    try {
      nameSchema.parse(name);
    } catch {
      setError('कृपया अपना नाम दर्ज करें · Please enter your name');
      return;
    }
    setIsLoading(true);
    try {
      const response = await register({
        phone,
        name,
        state: 'Punjab',
        district: 'Ludhiana',
        block: 'Ludhiana-1',
        primary_crops: ['Wheat', 'Rice'],
        preferred_language: selectedLanguage,
      });
      setFarmer({ ...response.farmer, created_at: response.farmer.created_at || new Date().toISOString() });
      setLanguage(selectedLanguage);
      setStep('complete');
      if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'पंजीकरण में त्रुटि · Registration error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const googleUser = {
        name: 'Raju Naik',
        email: 'raju.naik@gmail.com',
        phone: '',
      };
      await SecureStore.setItemAsync(GOOGLE_USER_KEY, JSON.stringify(googleUser));
      setFarmer({
        id: 'google-' + Date.now(),
        phone: googleUser.phone,
        name: googleUser.name,
        state: 'Karnataka',
        district: 'Kolar',
        block: 'Kolar-1',
        village: 'Mulbagal',
        primary_crops: ['Tomato'],
        preferred_language: selectedLanguage,
        created_at: new Date().toISOString(),
      });
      setLanguage(selectedLanguage);
      if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinue = () => {
    router.replace('/(tabs)');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>मंडी एजेंट</Text>
        <Text style={styles.headerSubtitle}>आपकी फसल, आपकी मंडी, आपकी सलाह · Your Crop, Your Mandi, Your Advisory</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* STEP 1: Choose login method */}
        {step === 'method' && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>लॉगिन करें · Login</Text>
            <Text style={styles.stepSubtitle}>Choose how you want to sign in</Text>

            <AnimatedTouchable
              style={[styles.methodBtn, buttonStyle]}
              onPress={handleGoogleLogin}
              onPressIn={handleButtonPressIn}
              onPressOut={handleButtonPressOut}
              disabled={isLoading}
            >
              <View style={styles.methodIcon}>
                <Text style={styles.googleIcon}>G</Text>
              </View>
              <View style={styles.methodText}>
                <Text style={styles.methodTitle}>Continue with Google</Text>
                <Text style={styles.methodDesc}>Quick & easy sign-in</Text>
              </View>
            </AnimatedTouchable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <AnimatedTouchable
              style={[styles.methodBtn, styles.phoneBtn, buttonStyle]}
              onPress={() => setStep('phone')}
              onPressIn={handleButtonPressIn}
              onPressOut={handleButtonPressOut}
            >
              <View style={styles.phoneIcon}>
                <Text style={styles.phoneIconText}>+91</Text>
              </View>
              <View style={styles.methodText}>
                <Text style={styles.methodTitle}>Continue with Phone</Text>
                <Text style={styles.methodDesc}>Login with OTP verification</Text>
              </View>
            </AnimatedTouchable>

            <View style={styles.langRow}>
              <Text style={styles.langLabel}>भाषा · Language: </Text>
              <TouchableOpacity
                style={[styles.langChip, selectedLanguage === 'hi' && styles.langChipActive]}
                onPress={() => setSelectedLanguage('hi')}
              >
                <Text style={[styles.langChipText, selectedLanguage === 'hi' && { color: COLORS.night }]}>हिंदी</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langChip, selectedLanguage === 'en' && styles.langChipActive]}
                onPress={() => setSelectedLanguage('en')}
              >
                <Text style={[styles.langChipText, selectedLanguage === 'en' && { color: COLORS.night }]}>English</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP 2: Phone number */}
        {step === 'phone' && (
          <View style={styles.stepContainer}>
            <TouchableOpacity onPress={() => setStep('method')} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.stepTitle}>अपना फ़ोन नंबर दर्ज करें · Enter your phone number</Text>
            <Text style={styles.stepSubtitle}>हम आपको 6 अंकों का OTP भेजेंगे · We will send you 6-digit OTP</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>फ़ोन नंबर · Phone Number</Text>
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

            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <AnimatedTouchable
              style={[styles.button, isLoading && styles.buttonDisabled, buttonStyle]}
              onPress={handleSendOtp}
              onPressIn={handleButtonPressIn}
              onPressOut={handleButtonPressOut}
              disabled={isLoading || phone.length !== 10}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.buttonText}>OTP भेजें · Send OTP</Text>
              )}
            </AnimatedTouchable>
          </View>
        )}

        {/* STEP 3: OTP verification */}
        {step === 'otp' && (
          <View style={styles.stepContainer}>
            <TouchableOpacity onPress={() => setStep('phone')} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.stepTitle}>OTP दर्ज करें · Enter OTP</Text>
            <Text style={styles.stepSubtitle}>{phone} पर भेजा गया · Sent to {phone}</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>6 अंकों का OTP · 6-digit OTP</Text>
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

            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <AnimatedTouchable
              style={[styles.button, isLoading && styles.buttonDisabled, buttonStyle]}
              onPress={handleVerifyOtp}
              onPressIn={handleButtonPressIn}
              onPressOut={handleButtonPressOut}
              disabled={isLoading || otp.length !== 6}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.buttonText}>सत्यापित करें · Verify</Text>
              )}
            </AnimatedTouchable>

            <TouchableOpacity onPress={() => setStep('phone')} style={styles.backLink}>
              <Text style={styles.backLinkText}>फ़ोन नंबर बदलें · Change phone number</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 4: Complete profile (for new users) */}
        {step === 'profile' && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>अपनी प्रो़फ़ाइल पूरी करें · Complete your profile</Text>
            <Text style={styles.stepSubtitle}>व्यक्तिगत जानकारी · Personal information</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>आपका नाम · Your name</Text>
              <TextInput
                style={styles.input}
                placeholder="अपना नाम लिखें · Enter your name"
                placeholderTextColor={COLORS.muted}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>भाषा चुनें · Choose language</Text>
              <View style={styles.languageSelector}>
                <TouchableOpacity
                  style={[styles.languageOption, selectedLanguage === 'hi' && styles.languageOptionActive]}
                  onPress={() => {
                    setSelectedLanguage('hi');
                    if (Platform.OS !== 'web') Haptics.selectionAsync();
                  }}
                >
                  <Text style={[styles.languageText, selectedLanguage === 'hi' && styles.languageTextActive]}>
                    हिंदी · Hindi
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.languageOption, selectedLanguage === 'en' && styles.languageOptionActive]}
                  onPress={() => {
                    setSelectedLanguage('en');
                    if (Platform.OS !== 'web') Haptics.selectionAsync();
                  }}
                >
                  <Text style={[styles.languageText, selectedLanguage === 'en' && styles.languageTextActive]}>
                    English · अंग्रेज़ी
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <AnimatedTouchable
              style={[styles.button, isLoading && styles.buttonDisabled, buttonStyle]}
              onPress={handleCompleteProfile}
              onPressIn={handleButtonPressIn}
              onPressOut={handleButtonPressOut}
              disabled={isLoading || name.length < 2}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.buttonText}>जारी रखें · Continue</Text>
              )}
            </AnimatedTouchable>
          </View>
        )}

        {/* STEP 5: Welcome complete */}
        {step === 'complete' && (
          <View style={styles.completeContainer}>
            <Text style={styles.successEmoji}>🎉</Text>
            <Text style={styles.completeTitle}>स्वागत है! · Welcome!</Text>
            <Text style={styles.completeSubtitle}>
              आपका खाता बन गया है। अब आप मंडी भाव देख सकते हैं, सलाह ले सकते हैं, और सहकारी में शामिल हो सकते हैं।{'\n'}
              Your account is created. Now you can view mandi prices, get advisories, and join cooperatives.
            </Text>

            <AnimatedTouchable
              style={[styles.button, buttonStyle]}
              onPress={handleContinue}
              onPressIn={handleButtonPressIn}
              onPressOut={handleButtonPressOut}
            >
              <Text style={styles.buttonText}>शुरू करें · Get Started</Text>
            </AnimatedTouchable>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          जारी रखकर, आप हमारी सेवा की शर्तें और गोपनीयता नीति से सहमत होते हैं।{'\n'}
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.night },
  header: { alignItems: 'center', paddingVertical: 32 },
  headerTitle: { color: COLORS.sprout, fontFamily: FONTS.display, fontSize: 32, marginBottom: 8 },
  headerSubtitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 14, textAlign: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 24 },
  stepContainer: { gap: 16 },
  stepTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 24, marginBottom: 4 },
  stepSubtitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 14, marginBottom: 16 },

  // Login method buttons
  methodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.forest,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: COLORS.canopy,
  },
  phoneBtn: { borderColor: COLORS.canopy },
  methodIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 14,
  },
  googleIcon: { color: '#EA4335', fontFamily: FONTS.bold, fontSize: 22 },
  phoneIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.canopy,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 14,
  },
  phoneIconText: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 14 },
  methodText: { flex: 1 },
  methodTitle: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 15 },
  methodDesc: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, marginTop: 2 },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.canopy },
  dividerText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, paddingHorizontal: 12 },

  // Language selection on method screen
  langRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  langLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
  langChip: { borderRadius: 16, backgroundColor: COLORS.canopy, paddingHorizontal: 14, paddingVertical: 6, marginHorizontal: 4 },
  langChipActive: { backgroundColor: COLORS.harvest },
  langChipText: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 13 },

  // Back button
  backBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  backBtnText: { color: COLORS.harvest, fontFamily: FONTS.medium, fontSize: 14 },

  // Input
  inputContainer: { gap: 8 },
  inputLabel: { color: COLORS.sprout, fontFamily: FONTS.medium, fontSize: 14 },
  input: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: COLORS.white,
    fontFamily: FONTS.body,
    fontSize: 16,
  },
  phoneInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.forest,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.canopy,
  },
  countryCode: { color: COLORS.muted, fontFamily: FONTS.medium, fontSize: 16, marginRight: 12 },
  otpInput: {
    flex: 1,
    backgroundColor: COLORS.forest,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: COLORS.white,
    fontFamily: FONTS.mono,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 1,
    borderColor: COLORS.canopy,
  },

  // Language selector on profile step
  languageSelector: { flexDirection: 'row', gap: 12 },
  languageOption: { flex: 1, backgroundColor: COLORS.forest, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  languageOptionActive: { backgroundColor: COLORS.canopy, borderColor: COLORS.sprout },
  languageText: { color: COLORS.muted, fontFamily: FONTS.medium, fontSize: 14 },
  languageTextActive: { color: COLORS.sprout },

  // Error
  errorBanner: { backgroundColor: '#450A0A', borderRadius: 8, padding: 12 },
  errorText: { color: '#FCA5A5', fontFamily: FONTS.body, fontSize: 14, textAlign: 'center' },

  // Button
  button: { backgroundColor: COLORS.sprout, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { backgroundColor: COLORS.forest },
  buttonText: { color: COLORS.night, fontFamily: FONTS.bold, fontSize: 16 },
  backLink: { alignItems: 'center', marginTop: 16 },
  backLinkText: { color: COLORS.leaf, fontFamily: FONTS.medium, fontSize: 14 },

  // Complete
  completeContainer: { alignItems: 'center', gap: 16, paddingTop: 32 },
  successEmoji: { fontSize: 64 },
  completeTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 28, textAlign: 'center' },
  completeSubtitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 14, textAlign: 'center', lineHeight: 22 },

  // Footer
  footer: { paddingHorizontal: 24, paddingVertical: 16 },
  footerText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, textAlign: 'center' },
});
