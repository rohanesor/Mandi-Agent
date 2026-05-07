import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithGoogle } from '../../services/authService';

export default function OAuthConsentScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'consenting' | 'error'>('consenting');

  useEffect(() => {
    (async () => {
      try {
        await signInWithGoogle();
        router.replace('/(tabs)');
      } catch {
        setStatus('error');
      }
    })();
  }, []);

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Google sign-in failed or was cancelled.</Text>
        <Text style={styles.link} onPress={() => router.replace('/onboarding')}>
          Back to login
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#2E7D32" />
      <Text style={styles.text}>Completing sign-in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF5', padding: 24 },
  text: { marginTop: 16, fontSize: 16, color: '#333' },
  error: { fontSize: 16, color: '#C62828', textAlign: 'center', marginBottom: 16 },
  link: { fontSize: 16, color: '#2E7D32', fontWeight: '600' },
});
