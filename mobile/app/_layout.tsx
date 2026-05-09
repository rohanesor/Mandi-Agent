import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View, StyleSheet, Text, AppState } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import {
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';
import {
  Inter_400Regular,
  Inter_500Medium,
} from '@expo-google-fonts/inter';
import { SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { isAuthenticated } from '../services/authService';
import { supabase } from '../lib/supabase';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { useNewsNotifications } from '../hooks/useNewsNotifications';
import { COLORS, FONTS } from '../constants/theme';
import { LanguageProvider, useLang } from '../context/LanguageContext';
import AnimatedLoadingScreen from '../components/AnimatedLoadingScreen';
import AnimatedBackground from '../components/AnimatedBackground';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
    },
  },
});

function AppGate() {
  const { isLoaded, isFirstLaunch } = useLang();
  const router = useRouter();
  const segments = useSegments();
  const { registerForPushNotifications } = useNewsNotifications();
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    registerForPushNotifications().catch(() => null);
  }, [registerForPushNotifications]);

  // Check auth state on mount and listen for changes
  useEffect(() => {
    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') setAuthState('authenticated');
      if (event === 'SIGNED_OUT') setAuthState('unauthenticated');
      if (event === 'TOKEN_REFRESHED') setAuthState('authenticated');
    });

    function onForceLogout() { checkAuth(); }
    try { globalThis.addEventListener('auth:logout', onForceLogout); } catch { }

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkAuth();
    });

    return () => {
      authListener?.subscription.unsubscribe();
      try { globalThis.removeEventListener('auth:logout', onForceLogout); } catch { }
      sub.remove();
    };
  }, []);

  async function checkAuth() {
    const authed = await isAuthenticated();
    setAuthState(authed ? 'authenticated' : 'unauthenticated');
  }

  useEffect(() => {
    if (!isLoaded || authState === 'loading') return;

    const path = segments.join('/');
    const isOnLanguageSelect = path === 'language-select';
    const isOnOnboarding = path === 'onboarding';
    const isOnPlanOnboarding = path === 'plan-onboarding';
    const isOnTabs = path === '(tabs)' || path.startsWith('(tabs)/');
    const isPublicRoute = isOnOnboarding || isOnLanguageSelect || isOnPlanOnboarding;

    // First launch → language select
    if (isFirstLaunch && !isOnLanguageSelect) {
      router.replace('/language-select');
      return;
    }

    // Not first launch → check auth
    if (!isFirstLaunch) {
      if (authState === 'unauthenticated' && !isPublicRoute) {
        router.replace('/onboarding');
        return;
      }

      if (authState === 'authenticated' && (isOnOnboarding || isOnLanguageSelect)) {
        router.replace('/(tabs)');
        return;
      }
    }

    // First launch and already on language-select, or after returning from language-select
    if (isFirstLaunch && isOnLanguageSelect) {
      return; // stay on language-select
    }
  }, [isLoaded, authState, isFirstLaunch, segments, router]);

  if (!isLoaded || authState === 'loading') {
    return <AnimatedLoadingScreen onLoaded={() => {}} minimumDuration={2000} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="language-select" options={{ animation: 'fade' }} />
        <Stack.Screen name="onboarding" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="plan-onboarding" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="screens/advisory" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="advisory" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    SpaceMono_700Bold,
  });
  useOfflineSync();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded || isLoading) {
    return (
      <View style={[StyleSheet.absoluteFill, { flex: 1, backgroundColor: COLORS.night }]}>
        <AnimatedLoadingScreen onLoaded={() => setIsLoading(false)} />
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { flex: 1, backgroundColor: COLORS.forest }]}>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <AnimatedBackground>
            <AppGate />
          </AnimatedBackground>
        </LanguageProvider>
      </QueryClientProvider>
    </View>
  );
}
