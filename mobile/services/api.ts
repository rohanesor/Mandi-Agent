import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as storage from '../lib/storage';
import { supabase } from '../lib/supabase';

// Configuration
const RAW_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
const BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');
const DEFAULT_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;
let AUTH_REFRESH_AVAILABLE = true;
let REFRESH_IN_PROGRESS: Promise<string | null> | null = null;

function dispatchAuthEvent(type: string, detail?: Record<string, unknown>) {
  try {
    globalThis.dispatchEvent(new CustomEvent(type, { detail }));
  } catch { }
}

function buildWebSocketUrl(path: string): string {
  const wsProtocol = BASE_URL.startsWith('https://') ? 'wss' : 'ws';
  const wsHost = BASE_URL.replace(/^https?:\/\//, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${wsProtocol}://${wsHost}${normalizedPath}`;
}

// Token storage keys
const TOKEN_KEYS = {
  ACCESS_TOKEN: 'mandi_access_token',
  REFRESH_TOKEN: 'mandi_refresh_token',
  FARMER_PROFILE: 'mandi_farmer_profile',
} as const;

// Error types for farmer-friendly messages
type ErrorCode =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'VALIDATION_ERROR'
  | 'OFFLINE'
  | 'UNKNOWN';

interface ApiError {
  code: ErrorCode;
  message: string;
  originalError?: AxiosError;
  retryable: boolean;
}

// Farmer-friendly error messages (will be translated in UI)
const FARMER_FRIENDLY_MESSAGES: Record<ErrorCode, string> = {
  NETWORK_ERROR: 'Network problem. Please check your internet connection.',
  TIMEOUT: 'The server is taking too long to respond. Please try again.',
  UNAUTHORIZED: 'Your session has expired. Please login again.',
  FORBIDDEN: 'You do not have permission to access this.',
  NOT_FOUND: 'The information you requested could not be found.',
  SERVER_ERROR: 'Our servers are having issues. Please try again later.',
  VALIDATION_ERROR: 'Some information is missing or incorrect.',
  OFFLINE: 'You appear to be offline. Please check your connection.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: DEFAULT_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper: Get stored tokens
async function getAccessToken(): Promise<string | null> {
  try {
    return await storage.getItem(TOKEN_KEYS.ACCESS_TOKEN);
  } catch {
    return null;
  }
}

async function getRefreshToken(): Promise<string | null> {
  try {
    return await storage.getItem(TOKEN_KEYS.REFRESH_TOKEN);
  } catch {
    return null;
  }
}

async function getStoredFarmerProfile(): Promise<{ id?: string; preferred_language?: string } | null> {
  try {
    const profile = await storage.getItem(TOKEN_KEYS.FARMER_PROFILE);
    return profile ? JSON.parse(profile) : null;
  } catch {
    return null;
  }
}

// Helper: Store tokens
export async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  await storage.setItem(TOKEN_KEYS.ACCESS_TOKEN, accessToken);
  await storage.setItem(TOKEN_KEYS.REFRESH_TOKEN, refreshToken);
}

// Helper: Store farmer profile
export async function storeFarmerProfile(profile: Record<string, unknown>): Promise<void> {
  await storage.setItem(TOKEN_KEYS.FARMER_PROFILE, JSON.stringify(profile));
}

// Helper: Clear all stored data
export async function clearStoredData(): Promise<void> {
  await storage.removeItem(TOKEN_KEYS.ACCESS_TOKEN);
  await storage.removeItem(TOKEN_KEYS.REFRESH_TOKEN);
  await storage.removeItem(TOKEN_KEYS.FARMER_PROFILE);
}

// Refresh token function (defined before interceptors to avoid hoisting issues)
async function refreshAccessToken(): Promise<string | null> {
  if (!AUTH_REFRESH_AVAILABLE) {
    return null;
  }

  // Deduplicate concurrent refresh calls
  if (REFRESH_IN_PROGRESS) return REFRESH_IN_PROGRESS;

  const stored = await getRefreshToken();
  if (!stored) {
    return null;
  }

  REFRESH_IN_PROGRESS = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        AUTH_REFRESH_AVAILABLE = false;
        await clearStoredData();
        return null;
      }
      AUTH_REFRESH_AVAILABLE = true;
      const token = data.session.access_token;
      await storage.setItem(TOKEN_KEYS.ACCESS_TOKEN, token);
      await storage.setItem(TOKEN_KEYS.REFRESH_TOKEN, data.session.refresh_token);
      return token;
    } catch {
      AUTH_REFRESH_AVAILABLE = false;
      await clearStoredData();
      return null;
    } finally {
      REFRESH_IN_PROGRESS = null;
    }
  })();

  return REFRESH_IN_PROGRESS;
}

// Request interceptor
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Add JWT token
    const token = await getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add farmer context headers
    const farmerProfile = await getStoredFarmerProfile();
    if (farmerProfile) {
      if (farmerProfile.id) {
        config.headers['X-Farmer-ID'] = farmerProfile.id;
      }
      if (farmerProfile.preferred_language) {
        config.headers['X-Language'] = farmerProfile.preferred_language;
      }
    }

    // Log in development
    if (__DEV__) {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Helper: Convert axios error to ApiError
function axiosToApiError(error: AxiosError): ApiError {
  const status = error.response?.status;

  if (error.code === 'ECONNABORTED') {
    return {
      code: 'TIMEOUT',
      message: FARMER_FRIENDLY_MESSAGES.TIMEOUT,
      originalError: error,
      retryable: true,
    };
  }

  if (!error.response) {
    // Network error
    return {
      code: 'NETWORK_ERROR',
      message: FARMER_FRIENDLY_MESSAGES.NETWORK_ERROR,
      originalError: error,
      retryable: true,
    };
  }

  switch (status) {
    case 400:
      return {
        code: 'VALIDATION_ERROR',
        message: FARMER_FRIENDLY_MESSAGES.VALIDATION_ERROR,
        originalError: error,
        retryable: false,
      };
    case 401:
      return {
        code: 'UNAUTHORIZED',
        message: FARMER_FRIENDLY_MESSAGES.UNAUTHORIZED,
        originalError: error,
        retryable: false,
      };
    case 403:
      return {
        code: 'FORBIDDEN',
        message: FARMER_FRIENDLY_MESSAGES.FORBIDDEN,
        originalError: error,
        retryable: false,
      };
    case 404:
      return {
        code: 'NOT_FOUND',
        message: FARMER_FRIENDLY_MESSAGES.NOT_FOUND,
        originalError: error,
        retryable: false,
      };
    case 500:
    case 503:
      return {
        code: 'SERVER_ERROR',
        message: FARMER_FRIENDLY_MESSAGES.SERVER_ERROR,
        originalError: error,
        retryable: true,
      };
    default:
      return {
        code: 'UNKNOWN',
        message: FARMER_FRIENDLY_MESSAGES.UNKNOWN,
        originalError: error,
        retryable: false,
      };
  }
}

// Track requests being retried to prevent infinite loops
const retriedRequests = new WeakMap<InternalAxiosRequestConfig, number>();

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    // Strip sensitive data before logging in development
    if (__DEV__) {
      const { data, ...safeResponse } = response;
      const sanitizedData = { ...data };
      // Remove sensitive fields from logs
      delete sanitizedData.access_token;
      delete sanitizedData.refresh_token;
      console.log(`[API] Response ${response.status}:`, sanitizedData);
    }
    return response;
  },
  async (error: AxiosError) => {
    const apiError = axiosToApiError(error);
    const originalRequest = error.config as InternalAxiosRequestConfig | undefined;

    // Handle 401 - try to refresh token
    if (apiError.code === 'UNAUTHORIZED' && originalRequest) {
      // Check if we already retried this request
      const retryCount = retriedRequests.get(originalRequest) || 0;

      if (retryCount < 1) {
        retriedRequests.set(originalRequest, retryCount + 1);

        const newToken = await refreshAccessToken();
        if (newToken && originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        }
      }

      if (AUTH_REFRESH_AVAILABLE) {
        dispatchAuthEvent('auth:logout', { reason: 'token_expired' });
      }
    }

    // Handle 403 - forbidden, logout user
    if (apiError.code === 'FORBIDDEN') {
      await clearStoredData();
      dispatchAuthEvent('auth:logout', { reason: 'forbidden' });
    }

    // Handle server errors (500, 503) - show offline banner
    if (apiError.code === 'SERVER_ERROR') {
      dispatchAuthEvent('app:offline', { error: apiError });
    }

    // Handle timeout - show "Network slow" toast
    if (apiError.code === 'TIMEOUT') {
      dispatchAuthEvent('app:networkSlow');
    }

    // Retry logic for retryable errors
    if (apiError.retryable && originalRequest) {
      const retryCount = retriedRequests.get(originalRequest) || 0;

      if (retryCount < MAX_RETRIES) {
        retriedRequests.set(originalRequest, retryCount + 1);

        // Exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, retryCount) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        return apiClient(originalRequest);
      }
    }

    // Clear retry count for completed request tracking
    if (originalRequest) {
      retriedRequests.delete(originalRequest);
    }

    return Promise.reject(apiError);
  }
);

// Export for use in services
export { apiClient, BASE_URL, DEFAULT_TIMEOUT, TOKEN_KEYS, buildWebSocketUrl };
export type { ApiError, ErrorCode };