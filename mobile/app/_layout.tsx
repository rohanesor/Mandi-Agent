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

function AgriculturalLoader() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          return 100;
        }
        return p + 10;
      });
    }, 150);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={loaderStyles.container}>
      <View style={loaderStyles.wheatWrap}>
        <Text style={loaderStyles.wheat}>🌾</Text>
        <Text style={loaderStyles.wheat}>🌾</Text>
        <Text style={loaderStyles.wheat}>🌾</Text>
      </View>
      <Text style={loaderStyles.title}>Mandi Agent</Text>
      <Text style={loaderStyles.subtitle}>आपका खेत, आपकी कमाई</Text>
      <View style={loaderStyles.progressBar}>
        <View style={[loaderStyles.progressFill, { width: `${progress}%` }]} />
      </View>
      <Text style={loaderStyles.loading}>Loading · लोड हो रहा है...</Text>
    </View>
  );
}

const loaderStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.night,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  wheatWrap: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  wheat: {
    fontSize: 40,
  },
  title: {
    fontFamily: FONTS.display,
    fontSize: 32,
    color: COLORS.white,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.sprout,
    marginBottom: 32,
  },
  progressBar: {
    width: 200,
    height: 4,
    backgroundColor: COLORS.forest,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.harvest,
    borderRadius: 2,
  },
  loading: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.muted,
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

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkAuth();
    });

    return () => {
      authListener?.subscription.unsubscribe();
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
    const isOnTabs = path === '(tabs)' || path.startsWith('(tabs)/');

    // First launch → language select
    if (isFirstLaunch && !isOnLanguageSelect) {
      router.replace('/language-select');
      return;
    }

    // Not first launch → check auth
    if (!isFirstLaunch) {
      if (authState === 'unauthenticated' && !isOnOnboarding && !isOnLanguageSelect) {
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
    return <AgriculturalLoader />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="language-select" options={{ animation: 'fade' }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="screens/advisory" options={{ headerShown: false }} />
      <Stack.Screen name="advisory" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
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

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View style={[StyleSheet.absoluteFill, { flex: 1, backgroundColor: COLORS.night }]}>
        <AgriculturalLoader />
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { flex: 1, backgroundColor: COLORS.forest }]}>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <AppGate />
        </LanguageProvider>
      </QueryClientProvider>
    </View>
  );
}
