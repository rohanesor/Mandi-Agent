import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import {
  useAppStore,
  selectCurrentSession,
  selectPipelineStatus,
  selectPendingIntents,
  selectSessionHistory,
} from '../store';
import { advisoryService } from '../services/advisoryService';
import { getWebSocketService } from '../services/websocketService';

interface UseAdvisoryReturn {
  requestAdvisory: (audioUri: string, farmerId: string) => Promise<unknown>;
  currentSession: unknown;
  pipelineStatus: unknown;
  isLoading: boolean;
  submitHarvestIntent: (intent: unknown) => Promise<void>;
  pendingIntents: unknown;
  advisoryHistory: unknown;
  isHistoryLoading: boolean;
  historyError: Error | null;
  refetchHistory: () => void;
}

export function useAdvisory(): UseAdvisoryReturn {
  const queryClient = useQueryClient();

  const currentSession = useAppStore(selectCurrentSession);
  const pipelineStatus = useAppStore(selectPipelineStatus);
  const pendingIntents = useAppStore(selectPendingIntents);
  const sessionHistory = useAppStore(selectSessionHistory);

  const setPipelineStage = useAppStore((s) => s.setPipelineStage);
  const completePipelineStage = useAppStore((s) => s.completePipelineStage);
  const setSession = useAppStore((s) => s.setSession);
  const setPipelineError = useAppStore((s) => s.setPipelineError);
  const resetPipeline = useAppStore((s) => s.resetPipeline);
  const setLoading = useAppStore((s) => s.setLoading);
  const addToast = useAppStore((s) => s.addToast);
  const isOffline = useAppStore((s) => s.isOffline);
  const addPendingIntent = useAppStore((s) => s.addPendingIntent);
  const markIntentSubmitted = useAppStore((s) => s.markIntentSubmitted);
  const addSessionToHistory = useAppStore((s) => s.addSessionToHistory);

  useEffect(() => {
    const farmerId = (currentSession as { farmer_id?: string } | null)?.farmer_id;
    if (!farmerId) return;

    const ws = getWebSocketService(farmerId);
    (ws as { connect: () => Promise<void> }).connect().catch((err: Error) => {
      console.error('[useAdvisory] WebSocket connection failed:', err);
    });

    return () => {};
  }, [currentSession]);

  const requestAdvisoryMutation = useMutation({
    mutationFn: async ({ audioUri, farmerId }: { audioUri: string; farmerId: string }) => {
      setLoading('advisory', true);
      setPipelineStage('fetching_data' as unknown as Parameters<typeof setPipelineStage>[0]);
      return advisoryService.sendVoiceAdvisory(audioUri, farmerId, () => {});
    },
    onSuccess: (data) => {
      setSession(data as unknown as Parameters<typeof setSession>[0]);
      addSessionToHistory(data as unknown as Parameters<typeof addSessionToHistory>[0]);
      completePipelineStage('completed' as unknown as Parameters<typeof completePipelineStage>[0]);
      addToast('Advisory ready', 'success');
    },
    onError: (error: Error) => {
      setPipelineError(error.message);
      addToast(error.message, 'error');
    },
  });

  const requestAdvisory = useCallback(
    async (audioUri: string, farmerId: string): Promise<unknown> => {
      if (isOffline) {
        addToast('You are offline. Please connect to internet and try again.', 'warning');
        return null;
      }
      try {
        return await requestAdvisoryMutation.mutateAsync({ audioUri, farmerId });
      } catch {
        return null;
      }
    },
    [isOffline, requestAdvisoryMutation, addToast]
  );

  const submitHarvestIntentMutation = useMutation({
    mutationFn: async (intent: unknown) => {
      return advisoryService.submitHarvestIntent(intent as Parameters<typeof advisoryService.submitHarvestIntent>[0]);
    },
    onSuccess: (_, variables) => {
      markIntentSubmitted((variables as { farmer_id: string }).farmer_id);
      addToast('Harvest intent submitted successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['advisory-history'] });
    },
    onError: (error: Error) => {
      addToast(error.message, 'error');
    },
  });

  const submitHarvestIntent = useCallback(
    async (intent: unknown): Promise<void> => {
      await submitHarvestIntentMutation.mutateAsync(intent);
    },
    [submitHarvestIntentMutation]
  );

  const {
    isLoading: isHistoryLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['advisory-history', (currentSession as { farmer_id?: string } | null)?.farmer_id],
    queryFn: async ({ queryKey }) => {
      const [, farmerId] = queryKey as [string, string];
      if (!farmerId) return [];
      return advisoryService.getAdvisoryHistory(farmerId);
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!(currentSession as { farmer_id?: string } | null)?.farmer_id,
  });

  return {
    requestAdvisory,
    currentSession,
    pipelineStatus,
    isLoading: false,
    submitHarvestIntent,
    pendingIntents,
    advisoryHistory: sessionHistory,
    isHistoryLoading,
    historyError: historyError as Error | null,
    refetchHistory,
  };
}

export default useAdvisory;
