import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import { apiClient, storeTokens, storeFarmerProfile, clearStoredData, TOKEN_KEYS } from './api';

// Zod schemas for validation
export const FarmerProfileSchema = z.object({
  id: z.string().uuid(),
  phone: z.string().min(10),
  name: z.string().min(1),
  state: z.string().min(1),
  district: z.string().min(1),
  block: z.string().min(1),
  village: z.string().optional(),
  primary_crops: z.array(z.string()).min(1),
  land_size_hectares: z.number().positive().optional(),
  preferred_language: z.enum(['hi', 'en', 'mr', 'ta', 'te', 'bn', 'gu', 'kn', 'ml', 'pa']),
  created_at: z.string().datetime().optional(),
});

export const RegisterResponseSchema = z.object({
  farmer_id: z.string().uuid(),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  farmer: FarmerProfileSchema,
});

export const LoginResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  farmer: FarmerProfileSchema,
});

export const RefreshResponseSchema = z.object({
  access_token: z.string().min(1),
});

export type FarmerProfile = z.infer<typeof FarmerProfileSchema>;
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// Input types
export interface RegisterInput {
  phone: string;
  name: string;
  state: string;
  district: string;
  block: string;
  village?: string;
  primary_crops: string[];
  land_size_hectares?: number;
  preferred_language: 'hi' | 'en' | 'mr' | 'ta' | 'te' | 'bn' | 'gu' | 'kn' | 'ml' | 'pa';
}

export interface LoginInput {
  phone: string;
  otp: string;
}

// Farmer-friendly error messages map for auth errors
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  phone_required: 'Phone number is required.',
  phone_invalid: 'Please enter a valid 10-digit phone number.',
  otp_invalid: 'The OTP you entered is incorrect. Please try again.',
  otp_expired: 'Your OTP has expired. Please request a new one.',
  farmer_not_found: 'No account found with this phone number. Please register first.',
  farmer_already_exists: 'An account with this phone number already exists. Please login.',
  name_required: 'Please enter your name.',
  state_required: 'Please select your state.',
  district_required: 'Please select your district.',
  block_required: 'Please select your block.',
  crops_required: 'Please select at least one crop you grow.',
  language_required: 'Please select your preferred language.',
};

/**
 * Register a new farmer
 * POST /api/farmer/register
 */
export async function register(farmerData: RegisterInput): Promise<RegisterResponse> {
  try {
    const response = await apiClient.post('/api/farmer/register', farmerData);

    // Validate response with Zod
    const validated = RegisterResponseSchema.parse(response.data);

    // Store tokens and profile
    await storeTokens(validated.access_token, validated.refresh_token);
    await storeFarmerProfile(validated.farmer);

    return validated;
  } catch (error) {
    throw handleAuthError(error);
  }
}

/**
 * Request OTP for login
 * POST /api/auth/otp/request
 */
export async function requestOtp(phone: string): Promise<{ message: string; expires_in: number }> {
  try {
    const response = await apiClient.post('/api/auth/otp/request', { phone });
    return {
      message: response.data.message,
      expires_in: response.data.expires_in,
    };
  } catch (error) {
    throw handleAuthError(error);
  }
}

/**
 * Login with phone and OTP
 * POST /api/auth/login
 */
export async function login(credentials: LoginInput): Promise<LoginResponse> {
  try {
    const response = await apiClient.post('/api/auth/login', {
      phone: credentials.phone,
      otp: credentials.otp,
    });

    // Validate response with Zod
    const validated = LoginResponseSchema.parse(response.data);

    // Store tokens and profile
    await storeTokens(validated.access_token, validated.refresh_token);
    await storeFarmerProfile(validated.farmer);

    return validated;
  } catch (error) {
    throw handleAuthError(error);
  }
}

/**
 * Refresh access token
 * GET /api/auth/refresh
 */
export async function refreshToken(): Promise<string> {
  try {
    const refreshToken = await SecureStore.getItemAsync(TOKEN_KEYS.REFRESH_TOKEN);

    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await apiClient.get('/api/auth/refresh', {
      headers: {
        Authorization: `Bearer ${refreshToken}`,
      },
    });

    const validated = RefreshResponseSchema.parse(response.data);

    // Store new access token
    await SecureStore.setItemAsync(TOKEN_KEYS.ACCESS_TOKEN, validated.access_token);

    return validated.access_token;
  } catch (error) {
    // Refresh failed - force logout
    await clearStoredData();
    throw handleAuthError(error);
  }
}

/**
 * Logout user
 * POST /api/auth/logout
 */
export async function logout(): Promise<void> {
  try {
    // Attempt to notify backend
    await apiClient.post('/api/auth/logout');
  } catch {
    // Ignore errors on logout - proceed to clear local data
  } finally {
    // Always clear local data
    await clearStoredData();

    // Emit logout event for app state reset
    (globalThis as typeof globalThis & { dispatchEvent: (e: Event) => void }).dispatchEvent(new CustomEvent('auth:logout', {
      detail: { reason: 'user_initiated' }
    }));
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEYS.ACCESS_TOKEN);
    const profile = await SecureStore.getItemAsync(TOKEN_KEYS.FARMER_PROFILE);
    return !!(token && profile);
  } catch {
    return false;
  }
}

/**
 * Get stored farmer profile
 */
export async function getFarmerProfile(): Promise<FarmerProfile | null> {
  try {
    const profile = await SecureStore.getItemAsync(TOKEN_KEYS.FARMER_PROFILE);
    return profile ? FarmerProfileSchema.parse(JSON.parse(profile)) : null;
  } catch {
    return null;
  }
}

/**
 * Update farmer profile in storage
 */
export async function updateFarmerProfile(updates: Partial<FarmerProfile>): Promise<FarmerProfile> {
  const current = await getFarmerProfile();
  if (!current) {
    throw new Error('No farmer profile found');
  }

  const updated = { ...current, ...updates };
  await storeFarmerProfile(updated);

  return FarmerProfileSchema.parse(updated);
}

/**
 * Handle auth errors and convert to farmer-friendly messages
 */
function handleAuthError(error: unknown): Error {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as { response?: { data?: { detail?: string; error_code?: string } } };
    const errorCode = axiosError.response?.data?.error_code;
    const detail = axiosError.response?.data?.detail;

    if (errorCode && AUTH_ERROR_MESSAGES[errorCode]) {
      return new Error(AUTH_ERROR_MESSAGES[errorCode]);
    }

    if (detail) {
      // Sanitize technical details
      return new Error(sanitizeError(detail));
    }
  }

  // Check if it's already our ApiError
  if (error instanceof Error) {
    return error;
  }

  return new Error('Something went wrong. Please try again.');
}

/**
 * Sanitize error messages to remove technical details
 */
function sanitizeError(message: string): string {
  // Remove stack traces, file paths, SQL queries, etc.
  return message
    .replace(/\/[\w/.-]+/g, '[path]') // Remove file paths
    .replace(/SELECT|INSERT|UPDATE|DELETE/gi, '[query]') // Remove SQL
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[ip]') // Remove IPs
    .replace(/error:\s*/i, '') // Remove "Error:" prefix
    .trim();
}

export const authService = {
  register,
  requestOtp,
  login,
  refreshToken,
  logout,
  isAuthenticated,
  getFarmerProfile,
  updateFarmerProfile,
};

export default authService;