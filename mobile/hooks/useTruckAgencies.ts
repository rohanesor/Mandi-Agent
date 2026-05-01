/**
 * useTruckAgencies
 *
 * Fetches truck agencies from the backend (sourced from KisanSabha scraper).
 * Provides filtering by state, city and optional geolocation sort.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api';
import { TruckAgency } from './useDeals';

interface FetchOptions {
  state?: string;
  city?: string;
  category_type?: number;
  lat?: number;
  lon?: number;
  limit?: number;
}

export function useTruckAgencies(initialOptions: FetchOptions = {}) {
  const [agencies, setAgencies] = useState<TruckAgency[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);

  const fetchAgencies = useCallback(async (opts: FetchOptions = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const merged = { ...initialOptions, ...opts };
      if (merged.state)         params.set('state', merged.state);
      if (merged.city)          params.set('city', merged.city);
      if (merged.category_type) params.set('category_type', String(merged.category_type));
      if (merged.lat != null)   params.set('lat', String(merged.lat));
      if (merged.lon != null)   params.set('lon', String(merged.lon));
      if (merged.limit)         params.set('limit', String(merged.limit));

      const res = await apiClient.get(`/api/truck/agencies?${params.toString()}`);
      setAgencies(res.data);
      setLastFetchedAt(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message || 'Failed to load truck agencies');
      // Keep showing fallback agencies (already in state)
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on mount with initial options
  useEffect(() => {
    fetchAgencies(initialOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { agencies, loading, error, lastFetchedAt, refetch: fetchAgencies };
}
