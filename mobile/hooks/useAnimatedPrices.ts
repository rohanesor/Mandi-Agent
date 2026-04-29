import { useCallback, useEffect, useRef, useState } from 'react';
import { useSharedValue, withSpring, withTiming, SharedValue } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { priceService, priceQueryKeys } from '../services/priceService';
import { SPRING } from '../constants/theme';
import type { MandiPrice } from '../types';

export interface UseAnimatedPricesReturn {
  prices: MandiPrice[];
  priceValues: SharedValue<number>[];
  isLoading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
  refetch: () => void;
  animatePriceChange: (index: number, newPrice: number) => void;
}

const AUTO_REFRESH_INTERVAL = 15 * 60 * 1000;

export function useAnimatedPrices(crop: string, state: string): UseAnimatedPricesReturn {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [prices, setPrices] = useState<MandiPrice[]>([]);
  const priceValuesRef = useRef<SharedValue<number>[]>([]);
  const maxPriceRef = useRef(1);
  const initializedRef = useRef(false);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: priceQueryKeys.livePrices(crop, state),
    queryFn: async () => {
      const result = await priceService.getLivePrices({ crop, state });
      return result;
    },
    staleTime: AUTO_REFRESH_INTERVAL,
    refetchInterval: AUTO_REFRESH_INTERVAL,
    refetchOnWindowFocus: true,
    enabled: !!crop && !!state,
  });

  useEffect(() => {
    if (data && data.length > 0) {
      const currentMax = Math.max(...data.map((p) => Number(p.modal_price) || 0), 1);
      maxPriceRef.current = currentMax;

      if (!initializedRef.current) {
        initializedRef.current = true;
        priceValuesRef.current = data.map((p) => useSharedValue(Number(p.modal_price) || 0));
      }

      const newPrices = data.map((p) => ({
        mandi_name: p.mandi_name,
        state: p.state,
        commodity: p.crop,
        variety: p.variety || '',
        min_price: p.min_price || 0,
        max_price: p.max_price || 0,
        modal_price: Number(p.modal_price) || 0,
        arrival_tonnes: p.arrival_qty,
        date: p.arrival_date || new Date().toISOString(),
        source: (p.source as 'agmarknet' | 'enam') || 'agmarknet',
      }));

      newPrices.forEach((newPriceData, index) => {
        if (priceValuesRef.current[index]) {
          const newPrice = newPriceData.modal_price;
          priceValuesRef.current[index].value = withSpring(newPrice, SPRING.bouncy);
        }
      });

      setPrices(newPrices);
      setLastUpdated(new Date());
    }
  }, [data]);

  const animatePriceChange = useCallback((index: number, newPrice: number) => {
    if (priceValuesRef.current[index]) {
      const percentChange = Math.abs((newPrice - priceValuesRef.current[index].value) / Math.max(1, priceValuesRef.current[index].value)) * 100;

      if (percentChange > 5) {
        priceValuesRef.current[index].value = withSpring(newPrice, {
          ...SPRING.bouncy,
        });
      } else {
        priceValuesRef.current[index].value = withTiming(newPrice, { duration: 600 });
      }
    }
  }, []);

  return {
    prices,
    priceValues: priceValuesRef.current,
    isLoading,
    error: error as Error | null,
    lastUpdated,
    refetch,
    animatePriceChange,
  };
}

export default useAnimatedPrices;
