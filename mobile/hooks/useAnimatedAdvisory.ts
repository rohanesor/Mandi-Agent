import { useCallback, useEffect, useState } from 'react';
import { useSharedValue, withSpring, SharedValue } from 'react-native-reanimated';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useMutation } from '@tanstack/react-query';
import { useAppStore, selectCurrentSession, selectPipelineStatus } from '../store';
import { advisoryService } from '../services/advisoryService';
import { useVoiceRecording } from './useVoiceRecording';
import { SPRING } from '../constants/theme';

export type PipelineStage = 'idle' | 'data_fetched' | 'rag_retrieved' | 'price_predicted' | 'advisory_generated' | 'guardrail_approved';

export interface UseAnimatedAdvisoryReturn {
  recording: {
    isRecording: boolean;
    amplitude: number;
    audioUri: string | null;
  };
  pipeline: {
    stage: PipelineStage;
    completedStages: PipelineStage[];
    isProcessing: boolean;
  };
  advisory: {
    advisory: {
      advisory_id: string;
      farmer_id: string;
      crop: string;
      language: string;
      decision: string;
      forecast_price: number;
      spoilage_risk_pct: number;
      bundle_available: boolean;
      bundle_saving?: number;
      full_text_english: string;
      full_text_local: string;
      confidence: number;
      guardrail_status: string;
      created_at: string;
    } | null;
    voiceSession: {
      session_id: string;
      farmer_id: string;
      status?: string;
      created_at: string;
    } | null;
  };
  animationValues: {
    micScale: SharedValue<number>;
    sonarOpacity: SharedValue<number>;
    heroScale: SharedValue<number>;
    particleTrigger: SharedValue<number>;
    priceCounterValue: SharedValue<number>;
    spoilageBarWidth: SharedValue<number>;
    orbsLit: SharedValue<number>[];
  };
  actions: {
    handleMicPress: () => Promise<void>;
    handleMicRelease: () => Promise<void>;
  };
}

const PIPELINE_STAGE_MAP: Record<string, PipelineStage> = {
  fetching_data: 'data_fetched',
  predicting_price: 'price_predicted',
  generating_advisory: 'advisory_generated',
  creating_voice: 'advisory_generated',
  completed: 'guardrail_approved',
};

export function useAnimatedAdvisory(): UseAnimatedAdvisoryReturn {
  const voiceRecording = useVoiceRecording();
  const currentSession = useAppStore(selectCurrentSession);
  const pipelineStatus = useAppStore(selectPipelineStatus);
  const setPipelineStage = useAppStore((s) => s.setPipelineStage);
  const completePipelineStage = useAppStore((s) => s.completePipelineStage);
  const setSession = useAppStore((s) => s.setSession);
  const setPipelineError = useAppStore((s) => s.setPipelineError);
  const setLoading = useAppStore((s) => s.setLoading);
  const addToast = useAppStore((s) => s.addToast);
  const farmerId = useAppStore((s) => s.farmer?.id || 'default-farmer-id');

  const [advisoryData, setAdvisoryData] = useState<UseAnimatedAdvisoryReturn['advisory']['advisory']>(null);
  const [voiceSessionData, setVoiceSessionData] = useState<UseAnimatedAdvisoryReturn['advisory']['voiceSession']>(null);
  const [pipelineStage, setPipelineStageState] = useState<PipelineStage>('idle');
  const [completedStages, setCompletedStages] = useState<PipelineStage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const micScale = useSharedValue(1);
  const sonarOpacity = useSharedValue(0);
  const heroScale = useSharedValue(0.8);
  const particleTrigger = useSharedValue(0);
  const priceCounterValue = useSharedValue(0);
  const spoilageBarWidth = useSharedValue(0);
  const orbsLit = Array.from({ length: 8 }, () => useSharedValue(0));

  const updatePipelineStage = useCallback((stage: PipelineStage) => {
    setPipelineStage(stage as unknown as Parameters<typeof setPipelineStage>[0]);
  }, [setPipelineStage]);

  const lightOrbsForStage = useCallback((stage: PipelineStage) => {
    const orbIndexMap: Record<string, number> = {
      data_fetched: 0, rag_retrieved: 1, price_predicted: 2,
      advisory_generated: 3, guardrail_approved: 4,
    };
    const orbIndex = orbIndexMap[stage];
    if (orbIndex !== undefined && orbsLit[orbIndex]) {
      orbsLit[orbIndex].value = withSpring(1, SPRING.bouncy);
    }
  }, [orbsLit]);

  const animateResult = useCallback((advisory: NonNullable<typeof advisoryData>) => {
    heroScale.value = withSpring(1, SPRING.bouncy);
    priceCounterValue.value = withSpring(advisory.forecast_price, SPRING.gentle);
    spoilageBarWidth.value = withSpring(advisory.spoilage_risk_pct, SPRING.gentle);
    particleTrigger.value = withSpring(1, SPRING.bouncy);
  }, [heroScale, priceCounterValue, spoilageBarWidth, particleTrigger]);

  const requestAdvisoryMutation = useMutation({
    mutationFn: async ({ audioUri, farmerId: fid }: { audioUri: string; farmerId: string }) => {
      setLoading('advisory', true);
      setPipelineStage('fetching_data' as unknown as Parameters<typeof setPipelineStage>[0]);
      return advisoryService.sendVoiceAdvisory(audioUri, fid, () => {});
    },
    onSuccess: (data) => {
      setSession(data as unknown as Parameters<typeof setSession>[0]);
      completePipelineStage('completed' as unknown as Parameters<typeof completePipelineStage>[0]);
      addToast('Advisory ready', 'success');
    },
    onError: (error: Error) => {
      setPipelineError(error.message);
      addToast(error.message, 'error');
    },
  });

  const handleMicPress = useCallback(async () => {
    micScale.value = withSpring(1.15, SPRING.snappy);
    sonarOpacity.value = withSpring(0.4, SPRING.gentle);
    await voiceRecording.startRecording();
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [micScale, sonarOpacity, voiceRecording]);

  const handleMicRelease = useCallback(async () => {
    micScale.value = withSpring(1, SPRING.gentle);
    sonarOpacity.value = withSpring(0, SPRING.gentle);
    setIsProcessing(true);

    // Light 8 orbs progressively over 3.5s CONCURRENTLY with HTTP request
    const ORB_DELAYS_MS = [0, 450, 900, 1350, 1800, 2300, 2800, 3300];
    const orbTimers: ReturnType<typeof setTimeout>[] = [];
    ORB_DELAYS_MS.forEach((delay, idx) => {
      const t = setTimeout(() => {
        if (orbsLit[idx]) orbsLit[idx].value = withSpring(1, SPRING.bouncy);
      }, delay);
      orbTimers.push(t);
    });

    try {
      const audioUri = await voiceRecording.stopRecording();
      if (audioUri) {
        const result = await requestAdvisoryMutation.mutateAsync({ audioUri, farmerId });
        if (result && (result as any).advisory) {
          const res = result as any;

          // Persist to session history so home screen can read it
          useAppStore.getState().addSessionToHistory(res);

          setVoiceSessionData({
            session_id: res.session_id,
            farmer_id: res.farmer_id,
            status: 'completed',
            created_at: res.created_at,
          });

          const actualAdvisory = res.advisory;
          setAdvisoryData(actualAdvisory);
          animateResult(actualAdvisory);

          if (res.n8n_triggered) {
            addToast('WhatsApp sent - Raju will receive the advisory', 'success');
          }
        }
      }
    } catch (error) {
      console.error('[useAnimatedAdvisory] Failed:', error);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsProcessing(false);
      orbTimers.forEach(clearTimeout);
    }
  }, [micScale, sonarOpacity, voiceRecording, requestAdvisoryMutation, farmerId,
    updatePipelineStage, lightOrbsForStage, animateResult, orbsLit, addToast]);

  useEffect(() => {
    const p = pipelineStatus as { stage?: string; completedStages?: string[] } | null;
    if (p?.stage && p.stage !== 'completed') {
      const mappedStage = PIPELINE_STAGE_MAP[p.stage];
      if (mappedStage) {
        updatePipelineStage(mappedStage);
        lightOrbsForStage(mappedStage);
      }
    }
  }, [pipelineStatus, updatePipelineStage, lightOrbsForStage]);

  return {
    recording: {
      isRecording: voiceRecording.isRecording,
      amplitude: voiceRecording.amplitude,
      audioUri: voiceRecording.audioUri,
    },
    pipeline: { stage: pipelineStage, completedStages, isProcessing },
    advisory: { advisory: advisoryData, voiceSession: voiceSessionData },
    animationValues: { micScale, sonarOpacity, heroScale, particleTrigger, priceCounterValue, spoilageBarWidth, orbsLit },
    actions: { handleMicPress, handleMicRelease },
  };
}

export default useAnimatedAdvisory;
