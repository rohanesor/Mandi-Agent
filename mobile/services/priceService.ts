import { z } from 'zod';
import { apiClient } from './api';

// Zod schemas for validation
export const MandiPriceSchema = z.object({
  mandi_id: z.string().optional(),
  mandi_name: z.string(),
  state: z.string(),
  district: z.string().optional(),
  crop: z.string(),
  variety: z.string().optional(),
  modal_price: z.number(),
  min_price: z.number().optional(),
  max_price: z.number().optional(),
  arrival_qty: z.number().optional(),
  arrival_unit: z.string().optional(),
  arrival_date: z.string().optional(),
  source: z.string().optional(),
  updated_at: z.string().datetime(),
});

export const PriceForecastSchema = z.object({
  crop: z.string(),
  mandi: z.string(),
  state: z.string(),
  forecast_days: z.number(),
  predictions: z.array(
    z.object({
      date: z.string(),
      modal_price: z.number(),
      min_price: z.number().optional(),
      max_price: z.number().optional(),
      confidence: z.number().min(0).max(1),
    })
  ),
  trend: z.enum(['rising', 'falling', 'stable', 'volatile']),
  recommendation: z.string().optional(),
  factors: z.array(z.string()).optional(),
  generated_at: z.string().datetime(),
});

export const PriceHistorySchema = z.object({
  crop: z.string(),
  mandi: z.string(),
  state: z.string(),
  data: z.array(
    z.object({
      date: z.string(),
      modal_price: z.number(),
      min_price: z.number().optional(),
      max_price: z.number().optional(),
      arrival_qty: z.number().optional(),
    })
  ),
});

export const PriceAlertSchema = z.object({
  alert_id: z.string().uuid(),
  farmer_id: z.string().uuid(),
  crop: z.string(),
  mandi: z.string(),
  target_price: z.number(),
  condition: z.enum(['above', 'below']),
  is_active: z.boolean(),
  last_triggered: z.string().datetime().optional(),
  created_at: z.string().datetime(),
});

export type MandiPrice = z.infer<typeof MandiPriceSchema>;
export type PriceForecast = z.infer<typeof PriceForecastSchema>;
export type PriceHistory = z.infer<typeof PriceHistorySchema>;
export type PriceAlert = z.infer<typeof PriceAlertSchema>;

// Input types
export interface GetLivePricesInput {
  crop: string;
  state: string;
  district?: string;
  mandi?: string;
}

export interface GetPriceForecastInput {
  crop: string;
  mandi: string;
  daysAhead: number;
}

export interface GetPriceHistoryInput {
  crop: string;
  mandi: string;
  months: number;
}

export interface CreatePriceAlertInput {
  farmer_id: string;
  crop: string;
  mandi: string;
  target_price: number;
  condition: 'above' | 'below';
}

/**
 * Get live mandi prices
 * GET /api/prices/live
 * Cache: React Query with staleTime 15 minutes
 */
export async function getLivePrices(input: GetLivePricesInput): Promise<MandiPrice[]> {
  try {
    const params = new URLSearchParams();
    if (input.state) {
      params.append('state', input.state);
    }

    const response = await apiClient.get(`/api/prices/${encodeURIComponent(input.crop)}?${params.toString()}`);

    const mapped = (response.data as Array<Record<string, unknown>>).map((item) => ({
      mandi_name: String(item.mandi_name || ''),
      state: String(item.state || input.state || ''),
      district: input.district,
      crop: String(item.commodity || input.crop),
      variety: item.variety ? String(item.variety) : undefined,
      modal_price: Number(item.modal_price || 0),
      min_price: item.min_price !== undefined ? Number(item.min_price) : undefined,
      max_price: item.max_price !== undefined ? Number(item.max_price) : undefined,
      arrival_qty: item.arrival_tonnes !== undefined ? Number(item.arrival_tonnes) : undefined,
      arrival_unit: item.arrival_tonnes !== undefined ? 'tonnes' : undefined,
      arrival_date: item.price_date ? String(item.price_date) : undefined,
      source: item.source ? String(item.source) : undefined,
      updated_at: new Date().toISOString(),
    }));

    return z.array(MandiPriceSchema).parse(mapped);
  } catch (error) {
    throw handlePriceError(error);
  }
}

/**
 * Get price forecast
 * GET /api/prices/forecast
 * Cache: React Query with staleTime 30 minutes
 */
export async function getPriceForecast(input: GetPriceForecastInput): Promise<PriceForecast> {
  try {
    const params = new URLSearchParams({
      mandi_name: input.mandi,
      days_ahead: input.daysAhead.toString(),
    });

    const response = await apiClient.get(`/api/forecast/${encodeURIComponent(input.crop)}?${params.toString()}`);
    const first = (response.data as Array<Record<string, unknown>>)?.[0];

    if (!first) {
      throw new Error('No forecast data available');
    }

    const mapped = {
      crop: String(first.crop || input.crop),
      mandi: String(first.mandi_name || input.mandi),
      state: String(first.state || ''),
      forecast_days: Number(first.days_ahead || input.daysAhead),
      predictions: [
        {
          date: String(first.forecast_date || new Date().toISOString()),
          modal_price: Number(first.predicted_price || 0),
          confidence: Number(first.confidence || 0),
        },
      ],
      trend: String(first.price_direction || 'stable') as 'rising' | 'falling' | 'stable' | 'volatile',
      recommendation: String(first.reasoning || ''),
      factors: [] as string[],
      generated_at: new Date().toISOString(),
    };

    return PriceForecastSchema.parse(mapped);
  } catch (error) {
    throw handlePriceError(error);
  }
}

/**
 * Get price history
 * GET /api/prices/history
 * Cache: React Query with staleTime 1 hour
 */
export async function getPriceHistory(input: GetPriceHistoryInput): Promise<PriceHistory> {
  try {
    const params = new URLSearchParams({
      crop: input.crop,
      mandi: input.mandi,
      months: input.months.toString(),
    });

    const response = await apiClient.get(`/api/prices/history?${params.toString()}`);

    return PriceHistorySchema.parse(response.data);
  } catch (error) {
    throw handlePriceError(error);
  }
}

/**
 * Get nearby mandis
 * GET /api/mandis/nearby
 */
export async function getNearbyMandis(input: {
  state: string;
  district?: string;
  crop?: string;
}): Promise<Array<{ mandi_id: string; mandi_name: string; district: string; state: string; distance_km?: number }>> {
  try {
    const params = new URLSearchParams({ state: input.state });

    if (input.district) {
      params.append('district', input.district);
    }

    if (input.crop) {
      params.append('crop', input.crop);
    }

    const response = await apiClient.get(`/api/mandis/nearby?${params.toString()}`);

    return z.array(
      z.object({
        mandi_id: z.string(),
        mandi_name: z.string(),
        district: z.string(),
        state: z.string(),
        distance_km: z.number().optional(),
      })
    ).parse(response.data);
  } catch (error) {
    throw handlePriceError(error);
  }
}

/**
 * Get supported crops
 * GET /api/crops
 */
export async function getSupportedCrops(): Promise<string[]> {
  try {
    const response = await apiClient.get('/api/crops');
    return z.array(z.string()).parse(response.data);
  } catch (error) {
    throw handlePriceError(error);
  }
}

/**
 * Create price alert
 * POST /api/price-alerts
 */
export async function createPriceAlert(input: CreatePriceAlertInput): Promise<PriceAlert> {
  try {
    const response = await apiClient.post('/api/price-alerts', input);
    return PriceAlertSchema.parse(response.data);
  } catch (error) {
    throw handlePriceError(error);
  }
}

/**
 * Get farmer's price alerts
 * GET /api/farmer/{farmerId}/price-alerts
 */
export async function getPriceAlerts(farmerId: string): Promise<PriceAlert[]> {
  try {
    const response = await apiClient.get(`/api/farmer/${farmerId}/price-alerts`);
    return z.array(PriceAlertSchema).parse(response.data);
  } catch (error) {
    throw handlePriceError(error);
  }
}

/**
 * Delete price alert
 * DELETE /api/price-alerts/{alertId}
 */
export async function deletePriceAlert(alertId: string): Promise<void> {
  try {
    await apiClient.delete(`/api/price-alerts/${alertId}`);
  } catch (error) {
    throw handlePriceError(error);
  }
}

/**
 * Handle price service errors
 */
function handlePriceError(error: unknown): Error {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as { response?: { data?: { detail?: string } } };
    const detail = axiosError.response?.data?.detail;

    if (detail) {
      return new Error(sanitizePriceError(detail));
    }
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Could not fetch price information. Please try again.');
}

/**
 * Sanitize price error messages
 */
function sanitizePriceError(message: string): string {
  const errorMap: Record<string, string> = {
    crop_not_found: 'This crop is not in our database. Please select a supported crop.',
    mandi_not_found: 'This mandi is not in our database. Please select a nearby mandi.',
    no_data_available: 'Price data is not available for this selection. Please try another.',
    invalid_date_range: 'Please select a valid date range.',
  };

  for (const [code, friendlyMessage] of Object.entries(errorMap)) {
    if (message.toLowerCase().includes(code.toLowerCase())) {
      return friendlyMessage;
    }
  }

  return message
    .replace(/\/[\w/.-]+/g, '[path]')
    .replace(/SELECT|INSERT|UPDATE|DELETE/gi, '[query]')
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[ip]')
    .trim();
}

// React Query keys for caching
export const priceQueryKeys = {
  livePrices: (crop: string, state: string) => ['prices', 'live', crop, state] as const,
  forecast: (crop: string, mandi: string, days: number) => ['prices', 'forecast', crop, mandi, days] as const,
  history: (crop: string, mandi: string, months: number) => ['prices', 'history', crop, mandi, months] as const,
  nearbyMandis: (state: string, district?: string) => ['mandis', 'nearby', state, district] as const,
  supportedCrops: () => ['crops', 'supported'] as const,
  alerts: (farmerId: string) => ['price-alerts', farmerId] as const,
};

export const priceService = {
  getLivePrices,
  getPriceForecast,
  getPriceHistory,
  getNearbyMandis,
  getSupportedCrops,
  createPriceAlert,
  getPriceAlerts,
  deletePriceAlert,
};

export default priceService;