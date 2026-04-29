import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAppStore, selectLivePrices, selectPriceHistory } from '../store';
import { priceService, priceQueryKeys } from '../services/priceService';

export function usePrices(crop: string, state: string) {
  const livePrices = useAppStore(selectLivePrices);
  const setLivePrices = useAppStore((s) => s.setLivePrices);
  const setSelectedCrop = useAppStore((s) => s.setSelectedCrop);
  const setSelectedState = useAppStore((s) => s.setSelectedState);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: priceQueryKeys.livePrices(crop, state),
    queryFn: async () => {
      return await priceService.getLivePrices({ crop, state });
    },
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
    enabled: !!crop && !!state,
  });

  useEffect(() => {
    if (data) {
      setLivePrices(data as unknown as Parameters<typeof setLivePrices>[0]);
    }
  }, [data, setLivePrices]);

  useEffect(() => {
    if (crop) setSelectedCrop(crop);
    if (state) setSelectedState(state);
  }, [crop, state, setSelectedCrop, setSelectedState]);

  return {
    livePrices,
    isLoading,
    error: error as Error | null,
    refetch: () => void refetch(),
  };
}

export function usePriceForecast(crop: string, mandi: string, daysAhead: number = 7) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: priceQueryKeys.forecast(crop, mandi, daysAhead),
    queryFn: async () => {
      return await priceService.getPriceForecast({ crop, mandi, daysAhead });
    },
    staleTime: 30 * 60 * 1000,
    enabled: !!crop && !!mandi && daysAhead > 0,
  });

  return {
    forecast: data || null,
    isLoading,
    error: error as Error | null,
    refetch: () => void refetch(),
  };
}

export function usePriceHistory(crop: string, mandi: string, months: number = 3) {
  const storePriceHistory = useAppStore(selectPriceHistory);
  const setPriceHistory = useAppStore((s) => s.setPriceHistory);
  const historyKey = `${crop}-${mandi}-${months}`;

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: priceQueryKeys.history(crop, mandi, months),
    queryFn: async () => {
      return await priceService.getPriceHistory({ crop, mandi, months });
    },
    staleTime: 60 * 60 * 1000,
    enabled: !!crop && !!mandi && months > 0,
  });

  useEffect(() => {
    if (data) {
      const entries = (data as { data?: Array<{ modal_price: number; date: string }> })?.data?.map((d) => ({
        date: d.date,
        price: d.modal_price,
      })) || [];
      setPriceHistory(historyKey, entries);
    }
  }, [data, setPriceHistory, historyKey]);

  return {
    priceHistory: storePriceHistory,
    isLoading,
    error: error as Error | null,
    refetch: () => void refetch(),
  };
}

export function useNearbyMandis(state: string, district?: string, crop?: string) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['nearby-mandis', state, district, crop],
    queryFn: async () => {
      return await priceService.getNearbyMandis({ state, district, crop });
    },
    staleTime: 60 * 60 * 1000,
    enabled: !!state,
  });

  return {
    mandis: data || [],
    isLoading,
    error: error as Error | null,
    refetch: () => void refetch(),
  };
}

export function useSupportedCrops() {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['supported-crops'],
    queryFn: async () => {
      return await priceService.getSupportedCrops();
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  return {
    crops: data || [],
    isLoading,
    error: error as Error | null,
    refetch: () => void refetch(),
  };
}

export function usePriceAlerts(farmerId: string) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['price-alerts', farmerId],
    queryFn: async () => {
      return await priceService.getPriceAlerts(farmerId);
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: !!farmerId,
  });

  return {
    alerts: data || [],
    isLoading,
    error: error as Error | null,
    refetch: () => void refetch(),
  };
}
