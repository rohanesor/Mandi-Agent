import * as FileSystem from 'expo-file-system';
import { z } from 'zod';
import { apiClient, DEFAULT_TIMEOUT, TOKEN_KEYS } from './api';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Zod schemas for validation
export const MandiPriceSchema = z.object({
  mandi_name: z.string(),
  state: z.string(),
  crop: z.string(),
  modal_price: z.number(),
  min_price: z.number().optional(),
  max_price: z.number().optional(),
  arrival_date: z.string().optional(),
  updated_at: z.string().datetime(),
});

export const VoiceSessionSchema = z.object({
  session_id: z.string(),
  farmer_id: z.string(),
  input_text_local: z.string().optional(),
  input_text_english: z.string().optional(),
  detected_language: z.string().optional(),
  response_text_english: z.string().optional(),
  response_text_local: z.string().optional(),
  response_audio_url: z.string().nullable().optional(),
  processing_ms: z.number().optional(),
  advisory: z.object({
    advisory_id: z.string(),
    farmer_id: z.string(),
    crop: z.string(),
    language: z.string(),
    decision: z.string(),
    target_mandi: z.string().optional(),
    forecast_price: z.number(),
    current_price: z.number().optional(),
    spoilage_risk_pct: z.number(),
    bundle_available: z.boolean(),
    bundle_saving: z.number().optional(),
    confidence: z.number(),
    guardrail_status: z.string(),
    full_text_local: z.string(),
    full_text_english: z.string(),
    created_at: z.string(),
  }).optional(),
  n8n_triggered: z.boolean().optional(),
  created_at: z.string(),
}).passthrough();

export const FarmerAdvisorySchema = z.object({
  advisory_id: z.string().uuid(),
  session_id: z.string().uuid(),
  farmer_id: z.string().uuid(),
  type: z.enum(['voice', 'text', 'harvest_intent']),
  content: z.string(),
  audio_url: z.string().url().optional(),
  created_at: z.string().datetime(),
  crops: z.array(z.string()).optional(),
  mandis: z.array(z.string()).optional(),
});

export const HarvestIntentSchema = z.object({
  intent_id: z.string().uuid(),
  farmer_id: z.string().uuid(),
  crop: z.string(),
  estimated_quantity: z.number().positive(),
  harvest_date: z.string(),
  preferred_mandi: z.string().optional(),
  status: z.enum(['pending', 'confirmed', 'cancelled']),
  created_at: z.string().datetime(),
});

export const HarvestIntentResponseSchema = z.object({
  intent_id: z.string().uuid(),
  received: z.boolean(),
  next_step: z.string(),
});

export type MandiPrice = z.infer<typeof MandiPriceSchema>;
export type VoiceSession = z.infer<typeof VoiceSessionSchema>;
export type FarmerAdvisory = z.infer<typeof FarmerAdvisorySchema>;
export type HarvestIntent = z.infer<typeof HarvestIntentSchema>;
export type HarvestIntentInput = z.infer<typeof HarvestIntentInputSchema>;

// Input types
export const HarvestIntentInputSchema = z.object({
  farmer_id: z.string().uuid(),
  crop: z.string().min(1),
  estimated_quantity: z.number().positive(),
  harvest_date: z.string(),
  preferred_mandi: z.string().optional(),
  notes: z.string().optional(),
});

// Progress callback types
export type AdvisoryStage = 'fetching_data' | 'predicting_price' | 'generating_advisory' | 'creating_voice' | 'completed';

export interface ProgressCallback {
  (stage: AdvisoryStage, message?: string): void;
}

function generateIntentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const hex = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 14)}`.padEnd(32, '0').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// WebSocket message handler type
export type WebSocketMessageHandler = (message: VoiceSession) => void;

/**
 * Send voice advisory - records and sends audio for AI processing
 * POST /api/advisory
 */
export async function sendVoiceAdvisory(
  audioUri: string,
  farmerId: string,
  onProgress?: ProgressCallback
): Promise<VoiceSession> {
  try {
    // Web: send JSON instead of FormData (data URI can't be read by FileSystem)
    if (Platform.OS === 'web' || audioUri.startsWith('data:')) {
      onProgress?.('predicting_price', 'Analyzing your request...');
      const profileRaw = await SecureStore.getItemAsync(TOKEN_KEYS.FARMER_PROFILE);
      const profile = profileRaw ? (JSON.parse(profileRaw) as { name?: string; language?: string }) : null;

      const response = await apiClient.post('/api/advisory', {
        farmer_id: farmerId,
        crop: 'Tomato',
        language: profile?.language || 'en',
        phone: '+91' + '0000000000',
      }, { timeout: 30000 });
      onProgress?.('completed', 'Advisory ready');
      return VoiceSessionSchema.parse(response.data);
    }

    // Stage 1: Read audio file from URI
    onProgress?.('fetching_data', 'Preparing audio upload...');

    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(audioUri);
    if (!fileInfo.exists) {
      throw new Error('Audio file not found');
    }

    const fileName = audioUri.split('/').pop() || 'recording.m4a';
    const fileExt = fileName.split('.').pop() || 'm4a';
    const contentType = getAudioContentType(fileExt);

    // Create form data for upload
    const formData = new FormData();
    // @ts-ignore
    formData.append('audio', {
      uri: Platform.OS === 'ios' ? audioUri.replace('file://', '') : audioUri,
      name: fileName,
      type: contentType,
    });
    formData.append('farmer_id', farmerId);

    // Stage 2: Send to backend
    onProgress?.('predicting_price', 'Analyzing your request...');
    
    const response = await apiClient.post('/api/advisory', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 30000, // 30s timeout for AI processing
    });

    // Stage 3: Return result
    onProgress?.('completed', 'Advisory ready');
    return VoiceSessionSchema.parse(response.data);
  } catch (error) {
    console.error('[advisoryService] Voice advisory failed:', error);
    throw handleAdvisoryError(error);
  }
}

/**
 * Get advisory history for a farmer
 * GET /api/farmer/{farmerId}/history
 * React Query will handle caching
 */
export async function getAdvisoryHistory(farmerId: string): Promise<FarmerAdvisory[]> {
  try {
    const response = await apiClient.get(`/api/farmer/${farmerId}/history`);

    // Backend shape: { farmer_id, advisories: [...] }
    const validated = z.array(FarmerAdvisorySchema).parse(response.data?.advisories || []);

    return validated;
  } catch (error) {
    throw handleAdvisoryError(error);
  }
}

/**
 * Get a specific advisory by ID
 * GET /api/advisory/{advisoryId}
 */
export async function getAdvisory(advisoryId: string): Promise<FarmerAdvisory> {
  try {
    const response = await apiClient.get(`/api/advisory/${advisoryId}`);
    return FarmerAdvisorySchema.parse(response.data);
  } catch (error) {
    throw handleAdvisoryError(error);
  }
}

/**
 * Get voice session status
 * GET /api/advisory/session/{sessionId}
 */
export async function getVoiceSession(sessionId: string): Promise<VoiceSession> {
  try {
    const response = await apiClient.get(`/api/advisory/session/${sessionId}`);
    return VoiceSessionSchema.parse(response.data);
  } catch (error) {
    throw handleAdvisoryError(error);
  }
}

/**
 * Submit harvest intent
 * POST /api/harvest-intent
 */
export async function submitHarvestIntent(
  intent: z.infer<typeof HarvestIntentInputSchema>
): Promise<{ intent_id: string; received: boolean; next_step: string }> {
  try {
    // Validate input
    const validatedInput = HarvestIntentInputSchema.parse(intent);

    const profileRaw = await SecureStore.getItemAsync(TOKEN_KEYS.FARMER_PROFILE);
    const profile = profileRaw ? (JSON.parse(profileRaw) as { block?: string }) : null;

    const payload = {
      intent: {
        intent_id: generateIntentId(),
        farmer_id: validatedInput.farmer_id,
        crop: validatedInput.crop,
        quantity_quintals: validatedInput.estimated_quantity,
        expected_harvest_date: validatedInput.harvest_date,
        current_growth_stage: 'mature',
        block_id: profile?.block || 'unknown-block',
      },
    };

    const response = await apiClient.post('/api/harvest-intent', payload);

    return HarvestIntentResponseSchema.parse(response.data);
  } catch (error) {
    throw handleAdvisoryError(error);
  }
}

/**
 * Get harvest intent history
 * GET /api/farmer/{farmerId}/harvest-intents
 */
export async function getHarvestIntents(farmerId: string): Promise<HarvestIntent[]> {
  try {
    const response = await apiClient.get(`/api/farmer/${farmerId}/harvest-intents`);
    return z.array(HarvestIntentSchema).parse(response.data);
  } catch (error) {
    throw handleAdvisoryError(error);
  }
}

/**
 * Cancel harvest intent
 * DELETE /api/harvest-intent/{intentId}
 */
export async function cancelHarvestIntent(intentId: string): Promise<void> {
  try {
    await apiClient.delete(`/api/harvest-intent/${intentId}`);
  } catch (error) {
    throw handleAdvisoryError(error);
  }
}

/**
 * Get audio content type from file extension
 */
function getAudioContentType(extension: string): string {
  const contentTypes: Record<string, string> = {
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    aac: 'audio/aac',
    webm: 'audio/webm',
  };

  return contentTypes[extension] || 'audio/mp4';
}

/**
 * Handle advisory errors
 */
function handleAdvisoryError(error: unknown): Error {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as { response?: { data?: { detail?: string } } };
    const detail = axiosError.response?.data?.detail;

    if (detail) {
      return new Error(sanitizeAdvisoryError(detail));
    }
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Could not process your request. Please try again.');
}

/**
 * Sanitize advisory error messages
 */
function sanitizeAdvisoryError(message: string): string {
  // Map backend error codes to farmer-friendly messages
  const errorMap: Record<string, string> = {
    audio_too_short: 'The recording is too short. Please speak for at least 2 seconds.',
    audio_too_long: 'The recording is too long. Please keep it under 60 seconds.',
    unsupported_format: 'This audio format is not supported. Please use MP3 or M4A.',
    farmer_not_found: 'Your account could not be found. Please login again.',
    processing_failed: 'We could not process your question. Please try again.',
  };

  // Check for known error codes
  for (const [code, friendlyMessage] of Object.entries(errorMap)) {
    if (message.toLowerCase().includes(code.toLowerCase())) {
      return friendlyMessage;
    }
  }

  // Remove technical details
  return message
    .replace(/\/[\w/.-]+/g, '[path]')
    .replace(/SELECT|INSERT|UPDATE|DELETE/gi, '[query]')
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[ip]')
    .trim();
}

export const advisoryService = {
  sendVoiceAdvisory,
  getAdvisoryHistory,
  getAdvisory,
  getVoiceSession,
  submitHarvestIntent,
  getHarvestIntents,
  cancelHarvestIntent,
};

export default advisoryService;