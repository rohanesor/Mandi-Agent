import { z } from 'zod';
import * as WebBrowser from 'expo-web-browser';
import { supabase, getCurrentSession, getCurrentUser, signOut as supabaseSignOut } from '../lib/supabase';
import { apiClient, storeTokens, storeFarmerProfile, clearStoredData, TOKEN_KEYS } from './api';
import * as storage from '../lib/storage';

WebBrowser.maybeCompleteAuthSession();

// Zod schemas
export const FarmerProfileSchema = z.object({
  id: z.string().min(1),
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

export type FarmerProfile = z.infer<typeof FarmerProfileSchema>;

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

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  farmer: FarmerProfile;
}

export interface RegisterResponse {
  farmer_id: string;
  access_token: string;
  refresh_token: string;
  farmer: FarmerProfile;
}

// React Native scheme for OAuth redirect
const redirectUri = 'mandi-agent://auth/callback';

/**
 * Register a new farmer profile via backend
 */
export async function register(farmerData: RegisterInput): Promise<{ farmer: FarmerProfile }> {
  const session = await getCurrentSession();
  if (!session) throw new Error('No authenticated session. Please login again.');

  const response = await apiClient.post('/api/farmer/register', farmerData, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  const farmer = FarmerProfileSchema.parse(response.data.farmer || response.data);
  await storeFarmerProfile(farmer);
  return { farmer };
}

/**
 * Request OTP via Supabase Auth
 */
export async function requestOtp(phone: string): Promise<{ message: string }> {
  const { error } = await supabase.auth.signInWithOtp({
    phone: `+91${phone}`,
  });
  if (error) throw new Error(getAuthErrorMessage(error.message));
  return { message: 'OTP sent successfully' };
}

/**
 * Verify OTP and login via Supabase Auth
 */
export async function verifyOtp(phone: string, otp: string): Promise<{ farmer: FarmerProfile | null; isNew: boolean }> {
  const { data, error } = await supabase.auth.verifyOtp({
    phone: `+91${phone}`,
    token: otp,
    type: 'sms',
  });

  if (error) {
    if (error.message.includes('otp_expired') || error.message.includes('expired')) {
      throw new Error('OTP expired. Please request a new one.');
    }
    throw new Error('Invalid OTP. Try again or request a new one.');
  }

  if (!data.session) {
    throw new Error('Login failed. Please try again.');
  }

  await storeTokens(data.session.access_token, data.session.refresh_token);

  // Try fetching farmer profile from backend
  try {
    const user = data.user;
    const response = await apiClient.get(`/api/farmer/by-phone/${phone}`, {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    const farmer = FarmerProfileSchema.parse(response.data);
    await storeFarmerProfile(farmer);
    return { farmer, isNew: false };
  } catch {
    // No profile yet → new user needs to complete profile
    return { farmer: null, isNew: true };
  }
}

/**
 * Sign in with Google via Supabase OAuth
 */
export async function signInWithGoogle(): Promise<{ farmer: FarmerProfile | null; isNew: boolean }> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw new Error('Google sign in failed. Please try again.');
  if (!data.url) throw new Error('Failed to start Google sign in.');

  // Open browser for OAuth flow
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

  if (result.type === 'success') {
    // Supabase stores the session automatically via the SecureStore adapter
    const session = await getCurrentSession();
    if (!session) throw new Error('Google sign in completed but session not found.');

    await storeTokens(session.access_token, session.refresh_token);

    // Try to get existing farmer profile
    const user = await getCurrentUser();
    const phone = user?.phone || user?.email?.split('@')[0] || '';

    try {
      const response = await apiClient.get(`/api/farmer/by-google/${user?.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const farmer = FarmerProfileSchema.parse(response.data);
      await storeFarmerProfile(farmer);
      return { farmer, isNew: false };
    } catch {
      return { farmer: null, isNew: true };
    }
  }

  throw new Error('Google sign in was cancelled.');
}

/**
 * Complete farmer profile after OAuth signup
 */
export async function completeProfile(farmerData: RegisterInput): Promise<FarmerProfile> {
  const session = await getCurrentSession();
  if (!session) throw new Error('No authenticated session. Please login again.');

  const response = await apiClient.post('/api/farmer/complete-profile', farmerData, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  const farmer = FarmerProfileSchema.parse(response.data.farmer || response.data);
  await storeFarmerProfile(farmer);
  return farmer;
}

/**
 * Logout via Supabase
 */
export async function logout(): Promise<void> {
  try {
    await supabaseSignOut();
  } catch { }
  try {
    await clearStoredData();
  } catch { }
  // Force-clear Supabase session from localStorage on web
  if (typeof localStorage !== 'undefined') {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
    keys.forEach(k => localStorage.removeItem(k));
  }
  try { globalThis.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason: 'user_initiated' } })); } catch { }
  // Hard reload on web to clear Supabase in-memory cache
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
    window.location.href = '/';
  }
}

/**
 * Check if user is authenticated via Supabase session
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getCurrentSession();
  if (!session) return false;
  if (session.expires_at && Date.now() / 1000 > session.expires_at) return false;
  return true;
}

/**
 * Get stored farmer profile
 */
export async function getFarmerProfile(): Promise<FarmerProfile | null> {
  try {
    const profile = await storage.getItem(TOKEN_KEYS.FARMER_PROFILE);
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
  if (!current) throw new Error('No farmer profile found');

  const updated = { ...current, ...updates };
  await storeFarmerProfile(updated);
  return FarmerProfileSchema.parse(updated);
}

function getAuthErrorMessage(code: string): string {
  const map: Record<string, string> = {
    'otp_expired': 'OTP expired. Please request again.',
    'sms_not_sent': 'Could not send OTP. Check phone number.',
    'invalid_phone': 'Invalid phone number.',
    'over_request_sms': 'Too many requests. Try again later.',
    'over_phone_sms': 'Too many OTPs sent to this number.',
  };
  return map[code] || code;
}

// Backward-compat aliases
export const login = verifyOtp;
export const refreshToken = async (): Promise<string | null> => {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) return null;
  const token = data.session.access_token;
  await storeTokens(token, data.session.refresh_token);
  return token;
};

export const RegisterResponseSchema = z.object({
  farmer_id: z.string(),
  access_token: z.string(),
  refresh_token: z.string(),
  farmer: FarmerProfileSchema,
});

export const LoginResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  farmer: FarmerProfileSchema,
});

export const authService = {
  register,
  requestOtp,
  verifyOtp,
  login: verifyOtp,
  signInWithGoogle,
  completeProfile,
  logout,
  refreshToken,
  isAuthenticated,
  getFarmerProfile,
  updateFarmerProfile,
};

export default authService;
