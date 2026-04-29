import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  useAppStore,
  selectBlockStatus,
  selectActiveBundle,
  selectUserBundles,
  selectFarmer,
} from '../store';
import { cooperativeService, cooperativeQueryKeys } from '../services/cooperativeService';
import { validateResponse, validateArrayResponse } from '../schemas';
import {
  BlockStatusSchema,
  CooperativeBundleSchema,
} from '../schemas/apiSchemas';
import type { CooperativeBundle, BlockStatus } from '../store/useAppStore';

// =============================================================================
// TYPES
// =============================================================================

interface UseBlockStatusReturn {
  blockStatus: BlockStatus | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface UseJoinBundleReturn {
  joinBundle: (bundleId: string, quantity: number, harvestDate: string, notes?: string) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

interface UseCooperativeReturn {
  // Block status
  useBlockStatus: (blockId: string | null) => UseBlockStatusReturn;

  // Bundle operations
  useJoinBundle: () => UseJoinBundleReturn;
  useLeaveBundle: () => {
    leaveBundle: (bundleId: string) => Promise<void>;
    isLoading: boolean;
  };

  // Active bundle countdown
  useActiveBundleCountdown: () => {
    days: number;
    hours: number;
    minutes: number;
    isExpired: boolean;
    formatted: string;
  };

  // Farmer's bundles
  useFarmerBundles: (farmerId: string | null) => {
    bundles: CooperativeBundle[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
  };

  // Bundle details
  useBundleDetails: (bundleId: string | null) => {
    bundle: CooperativeBundle | null;
    isLoading: boolean;
    error: Error | null;
  };
}

// =============================================================================
// BLOCK STATUS HOOK
// =============================================================================

export function useBlockStatus(blockId: string | null): UseBlockStatusReturn {
  const setBlockStatus = useAppStore((s) => s.setBlockStatus);
  const blockStatus = useAppStore(selectBlockStatus);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: cooperativeQueryKeys.blockStatus(blockId || ''),
    queryFn: async () => {
      if (!blockId) return null;
      const data = await cooperativeService.getBlockStatus(blockId);
      return validateResponse(BlockStatusSchema, data);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    enabled: !!blockId,
  });

  // Update store when data changes
  useEffect(() => {
    if (data) {
      setBlockStatus(data as unknown as BlockStatus);
    }
  }, [data, setBlockStatus]);

  return {
    blockStatus: data as unknown as BlockStatus | null,
    isLoading,
    error: error as Error | null,
    refetch: () => void refetch(),
  };
}

// =============================================================================
// JOIN BUNDLE HOOK
// =============================================================================

export function useJoinBundle(): UseJoinBundleReturn {
  const queryClient = useQueryClient();
  const farmer = useAppStore(selectFarmer);
  const setActiveBundle = useAppStore((s) => s.setActiveBundle);
  const addUserBundle = useAppStore((s) => s.addUserBundle);
  const addToast = useAppStore((s) => s.addToast);
  const isOffline = useAppStore((s) => s.isOffline);

  const mutation = useMutation({
    mutationFn: async ({
      bundleId,
      quantity,
      harvestDate,
      notes,
    }: {
      bundleId: string;
      quantity: number;
      harvestDate: string;
      notes?: string;
    }) => {
      if (!farmer?.id) {
        throw new Error('You must be logged in to join a bundle');
      }

      if (isOffline) {
        throw new Error('Cannot join bundle while offline');
      }

      return cooperativeService.joinBundle(bundleId, farmer.id, {
        quantity,
        harvest_date: harvestDate,
        notes,
      });
    },
    onSuccess: (data) => {
      const validated = validateResponse(CooperativeBundleSchema, data.bundle);

      // Update store
      setActiveBundle(validated as CooperativeBundle);
      addUserBundle(validated as CooperativeBundle);

      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: cooperativeQueryKeys.blockStatus(farmer?.block || ''),
      });
      queryClient.invalidateQueries({
        queryKey: cooperativeQueryKeys.farmerBundles(farmer?.id || ''),
      });

      // Trigger success particles (custom event)
      (globalThis as typeof globalThis & { dispatchEvent: (e: Event) => void }).dispatchEvent(new CustomEvent('app:showSuccessParticles'));

      // Show success toast
      addToast('Bundle joined successfully! 🎉', 'success');
    },
    onError: (error: Error) => {
      // Show error toast in farmer's language
      addToast(error.message, 'error');
    },
  });

  const joinBundle = useCallback(
    async (bundleId: string, quantity: number, harvestDate: string, notes?: string): Promise<void> => {
      await mutation.mutateAsync({ bundleId, quantity, harvestDate, notes });
    },
    [mutation]
  );

  return {
    joinBundle,
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}

// =============================================================================
// LEAVE BUNDLE HOOK
// =============================================================================

export function useLeaveBundle(): {
  leaveBundle: (bundleId: string) => Promise<void>;
  isLoading: boolean;
} {
  const queryClient = useQueryClient();
  const farmer = useAppStore(selectFarmer);
  const removeUserBundle = useAppStore((s) => s.removeUserBundle);
  const addToast = useAppStore((s) => s.addToast);

  const mutation = useMutation({
    mutationFn: async (bundleId: string) => {
      if (!farmer?.id) {
        throw new Error('You must be logged in to leave a bundle');
      }
      return cooperativeService.leaveBundle(bundleId, farmer.id);
    },
    onSuccess: (_, bundleId) => {
      // Remove from store
      removeUserBundle(bundleId);

      // Invalidate queries
      queryClient.invalidateQueries({
        queryKey: cooperativeQueryKeys.farmerBundles(farmer?.id || ''),
      });

      addToast('You have left the bundle', 'info');
    },
    onError: (error: Error) => {
      addToast(error.message, 'error');
    },
  });

  const leaveBundle = useCallback(
    async (bundleId: string): Promise<void> => {
      await mutation.mutateAsync(bundleId);
    },
    [mutation]
  );

  return {
    leaveBundle,
    isLoading: mutation.isPending,
  };
}

// =============================================================================
// ACTIVE BUNDLE COUNTDOWN HOOK
// =============================================================================

export function useActiveBundleCountdown(): {
  days: number;
  hours: number;
  minutes: number;
  isExpired: boolean;
  formatted: string;
} {
  const activeBundle = useAppStore(selectActiveBundle);
  const [countdown, setCountdown] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    isExpired: false,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!activeBundle?.delivery_window_start) {
      return;
    }

    const calculateCountdown = () => {
      const targetDate = new Date(activeBundle.delivery_window_start);
      const now = new Date();
      const diff = targetDate.getTime() - now.getTime();

      if (diff <= 0) {
        setCountdown({
          days: 0,
          hours: 0,
          minutes: 0,
          isExpired: true,
        });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      setCountdown({
        days,
        hours,
        minutes,
        isExpired: false,
      });
    };

    // Calculate immediately
    calculateCountdown();

    // Update every minute
    intervalRef.current = setInterval(calculateCountdown, 60 * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [activeBundle?.delivery_window_start]);

  // Format as readable string
  const formatted = countdown.isExpired
    ? 'Delivery window open'
    : `${countdown.days}d ${countdown.hours}h ${countdown.minutes}m`;

  return {
    ...countdown,
    formatted,
  };
}

// =============================================================================
// FARMER BUNDLES HOOK
// =============================================================================

export function useFarmerBundles(farmerId: string | null): {
  bundles: CooperativeBundle[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const userBundles = useAppStore(selectUserBundles);
  const addUserBundle = useAppStore((s) => s.addUserBundle);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: cooperativeQueryKeys.farmerBundles(farmerId || ''),
    queryFn: async () => {
      if (!farmerId) return [];
      const data = await cooperativeService.getFarmerBundles(farmerId);
      return validateArrayResponse(CooperativeBundleSchema, data);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!farmerId,
  });

  // Sync with store
  useEffect(() => {
    if (data && data.length > 0) {
      data.forEach((bundle) => {
        addUserBundle(bundle as CooperativeBundle);
      });
    }
  }, [data, addUserBundle]);

  // Prefer store data if available
  const bundles = userBundles.length > 0 ? userBundles : (data as CooperativeBundle[]) || [];

  return {
    bundles,
    isLoading,
    error: error as Error | null,
    refetch: () => void refetch(),
  };
}

// =============================================================================
// BUNDLE DETAILS HOOK
// =============================================================================

export function useBundleDetails(bundleId: string | null): {
  bundle: CooperativeBundle | null;
  isLoading: boolean;
  error: Error | null;
} {
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: cooperativeQueryKeys.bundleDetails(bundleId || ''),
    queryFn: async () => {
      if (!bundleId) return null;
      const data = await cooperativeService.getBundleDetails(bundleId);
      return validateResponse(CooperativeBundleSchema, data);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: !!bundleId,
  });

  return {
    bundle: data as CooperativeBundle | null,
    isLoading,
    error: error as Error | null,
  };
}

// =============================================================================
// CREATE BUNDLE HOOK
// =============================================================================

export function useCreateBundle(): {
  createBundle: (input: {
    block_id: string;
    crop: string;
    target_mandi: string;
    farmer_id: string;
    initial_quantity: number;
    harvest_date: string;
  }) => Promise<CooperativeBundle>;
  isLoading: boolean;
  error: Error | null;
} {
  const queryClient = useQueryClient();
  const addUserBundle = useAppStore((s) => s.addUserBundle);
  const addToast = useAppStore((s) => s.addToast);

  const mutation = useMutation({
    mutationFn: async (input: Parameters<typeof cooperativeService.createBundle>[0]) => {
      const data = await cooperativeService.createBundle(input);
      return validateResponse(CooperativeBundleSchema, data);
    },
    onSuccess: (data) => {
      // Add to store
      addUserBundle(data as CooperativeBundle);

      // Invalidate queries
      queryClient.invalidateQueries({
        queryKey: cooperativeQueryKeys.blockStatus(data.block_id),
      });
      queryClient.invalidateQueries({
        queryKey: cooperativeQueryKeys.farmerBundles(data.farmer_ids[0] || ''),
      });

      // Show success
      (globalThis as typeof globalThis & { dispatchEvent: (e: Event) => void }).dispatchEvent(new CustomEvent('app:showSuccessParticles'));
      addToast('Bundle created successfully! 🎉', 'success');
    },
    onError: (error: Error) => {
      addToast(error.message, 'error');
    },
  });

  const createBundle = useCallback(
    async (input: Parameters<typeof cooperativeService.createBundle>[0]): Promise<CooperativeBundle> => {
      return mutation.mutateAsync(input) as Promise<CooperativeBundle>;
    },
    [mutation]
  );

  return {
    createBundle,
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export type { UseBlockStatusReturn, UseJoinBundleReturn, UseCooperativeReturn };
export default useBlockStatus;