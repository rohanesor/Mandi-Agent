import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, FONTS } from '../constants/theme';
import { DEMO_MODE, DEMO_FARMER_ID, DEMO_CROP, DEMO_PHONE, DEMO_LANGUAGE } from '../constants/demoConfig';
import { apiClient } from '../services/api';
import { useAppStore } from '../store/useAppStore';

export function DemoShowcaseButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const addToast = useAppStore((s) => s.addToast);

  if (!DEMO_MODE) return null;

  const runDemo = async () => {
    if (running) return;
    setRunning(true);
    try {
      const response = await apiClient.post('/api/advisory', {
        farmer_id: DEMO_FARMER_ID,
        crop: DEMO_CROP,
        language: DEMO_LANGUAGE,
        phone: DEMO_PHONE,
      });
      const data = response.data;
      if (data?.advisory) {
        useAppStore.getState().addSessionToHistory(data);
        if (data.n8n_triggered) addToast('WhatsApp sent to Raju', 'success');
      }
      router.push('/advisory');
    } catch {
      addToast('Demo failed - is backend running on :8000?', 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable style={[styles.btn, running && styles.btnRunning]} onPress={runDemo}>
        <Text style={styles.text}>{running ? 'Loading' : 'Demo'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', bottom: 96, right: 16, zIndex: 100 },
  btn: { backgroundColor: COLORS.harvest, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, elevation: 6 },
  btnRunning: { backgroundColor: COLORS.forest },
  text: { color: COLORS.night, fontFamily: FONTS.bold, fontSize: 14 },
});
