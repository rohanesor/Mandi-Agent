import { z } from 'zod';

/**
 * API Response Validation Schemas
 * These mirror the backend Pydantic models.
 * Every API response is validated before entering app state.
 */

// =============================================================================
// ENUMS
// =============================================================================

export const PriceSourceEnum = z.enum(['agmarknet', 'enam']);
export const PriceDirectionEnum = z.enum(['rising', 'falling', 'stable']);
export const RiskLevelEnum = z.enum(['safe', 'moderate', 'high', 'critical']);
export const BundleStatusEnum = z.enum([
  'negotiating',
  'confirmed',
  'dispatched',
  'completed',
]);
export const AdvisoryDecisionEnum = z.enum([
  'harvest_now',
  'hold_3_days',
  'hold_7_days',
  'redirect_mandi',
]);
export const GuardrailStatusEnum = z.enum(['approved', 'review', 'flagged']);

// =============================================================================
// SCHEMAS
// =============================================================================

/**
 * Mandi Price - Current market price for a commodity at a mandi
 */
export const MandiPriceSchema = z.object({
  mandi_name: z.string().min(1, 'Mandi name is required'),
  state: z.string().min(1, 'State is required'),
  commodity: z.string().min(1, 'Commodity is required'),
  min_price: z.number().nonnegative('Min price must be non-negative'),
  max_price: z.number().nonnegative('Max price must be non-negative'),
  modal_price: z.number().nonnegative('Modal price must be non-negative'),
  arrival_tonnes: z.number().nonnegative().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  source: PriceSourceEnum,
});

/**
 * Price Forecast - AI prediction for future prices
 */
export const PriceForecastSchema = z.object({
  crop: z.string().min(1, 'Crop is required'),
  mandi_name: z.string().min(1, 'Mandi name is required'),
  forecast_date: z.string().datetime('Forecast date must be a valid ISO datetime'),
  predicted_price: z.number().positive('Predicted price must be positive'),
  confidence: z.number().min(0).max(1, 'Confidence must be between 0 and 1'),
  price_direction: PriceDirectionEnum,
  reasoning: z.string().min(1, 'Reasoning is required'),
  days_ahead: z.number().int().positive('Days ahead must be a positive integer'),
});

/**
 * Spoilage Risk - Assessment of crop spoilage probability
 */
export const SpoilageRiskSchema = z.object({
  farmer_id: z.string().uuid('Farmer ID must be a valid UUID'),
  crop: z.string().min(1, 'Crop is required'),
  spoilage_probability: z.number().min(0).max(1, 'Probability must be between 0 and 1'),
  risk_level: RiskLevelEnum,
  recommendation: z.string().min(1, 'Recommendation is required'),
});

/**
 * Cooperative Bundle - Group of farmers pooling their harvest
 */
export const CooperativeBundleSchema = z.object({
  bundle_id: z.string().uuid('Bundle ID must be a valid UUID'),
  block_id: z.string().uuid('Block ID must be a valid UUID'),
  crop: z.string().min(1, 'Crop is required'),
  farmer_ids: z.array(z.string().uuid()).min(1, 'At least one farmer is required'),
  total_quantity_quintals: z.number().positive('Total quantity must be positive'),
  target_mandi: z.string().min(1, 'Target mandi is required'),
  target_mandi_lat: z.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
  target_mandi_lng: z.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
  delivery_window_start: z.string().datetime('Delivery window start must be a valid datetime'),
  delivery_window_end: z.string().datetime('Delivery window end must be a valid datetime'),
  forecast_price: z.number().positive('Forecast price must be positive'),
  transport_saving_per_quintal: z.number().nonnegative('Transport saving must be non-negative'),
  status: BundleStatusEnum,
});

/**
 * Farmer Advisory - AI-generated recommendation
 */
export const FarmerAdvisorySchema = z.object({
  advisory_id: z.string().uuid('Advisory ID must be a valid UUID'),
  farmer_id: z.string().uuid('Farmer ID must be a valid UUID'),
  crop: z.string().min(1, 'Crop is required'),
  language: z.string().min(1, 'Language is required'),
  decision: AdvisoryDecisionEnum,
  target_mandi: z.string().optional(),
  forecast_price: z.number().positive('Forecast price must be positive'),
  spoilage_risk_pct: z.number().min(0).max(100, 'Spoilage risk must be between 0 and 100'),
  bundle_available: z.boolean(),
  bundle_saving: z.number().nonnegative().optional(),
  full_text_english: z.string().min(1, 'English text is required'),
  full_text_local: z.string().min(1, 'Local language text is required'),
  confidence: z.number().min(0).max(1, 'Confidence must be between 0 and 1'),
  guardrail_status: GuardrailStatusEnum,
  created_at: z.string().datetime('Created at must be a valid datetime'),
});

/**
 * Voice Session - Recording and response from voice interaction
 */
export const VoiceSessionSchema = z.object({
  session_id: z.string().uuid('Session ID must be a valid UUID'),
  farmer_id: z.string().uuid('Farmer ID must be a valid UUID'),
  input_text_local: z.string().min(1, 'Input text (local) is required'),
  input_text_english: z.string().min(1, 'Input text (English) is required'),
  detected_language: z.string().min(1, 'Detected language is required'),
  intent: z.string().min(1, 'Intent is required'),
  response_text_english: z.string().min(1, 'Response text (English) is required'),
  response_text_local: z.string().min(1, 'Response text (local) is required'),
  response_audio_url: z.string().url().optional(),
  processing_ms: z.number().nonnegative('Processing time must be non-negative'),
  created_at: z.string().datetime('Created at must be a valid datetime'),
  advisory: FarmerAdvisorySchema.optional(),
});

/**
 * Block Status - Cooperative activity in a block
 */
export const BlockStatusSchema = z.object({
  block_id: z.string().uuid('Block ID must be a valid UUID'),
  active_intents: z.number().int().nonnegative('Active intents must be non-negative'),
  oversupply_crops: z.array(z.string()),
  active_bundles: z.number().int().nonnegative('Active bundles must be non-negative'),
  avg_forecast_price: z.number().nonnegative('Average forecast price must be non-negative'),
});

/**
 * Auth Response - Token response after login/register
 */
export const AuthResponseSchema = z.object({
  farmer_id: z.string().uuid('Farmer ID must be a valid UUID'),
  access_token: z.string().min(1, 'Access token is required'),
  refresh_token: z.string().min(1, 'Refresh token is required'),
  token_type: z.literal('bearer'),
});

// =============================================================================
// DERIVED TYPES
// =============================================================================

export type MandiPrice = z.infer<typeof MandiPriceSchema>;
export type PriceForecast = z.infer<typeof PriceForecastSchema>;
export type SpoilageRisk = z.infer<typeof SpoilageRiskSchema>;
export type CooperativeBundle = z.infer<typeof CooperativeBundleSchema>;
export type FarmerAdvisory = z.infer<typeof FarmerAdvisorySchema>;
export type VoiceSession = z.infer<typeof VoiceSessionSchema>;
export type BlockStatus = z.infer<typeof BlockStatusSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// Enum types
export type PriceSource = z.infer<typeof PriceSourceEnum>;
export type PriceDirection = z.infer<typeof PriceDirectionEnum>;
export type RiskLevel = z.infer<typeof RiskLevelEnum>;
export type BundleStatus = z.infer<typeof BundleStatusEnum>;
export type AdvisoryDecision = z.infer<typeof AdvisoryDecisionEnum>;
export type GuardrailStatus = z.infer<typeof GuardrailStatusEnum>;

// =============================================================================
// VALIDATION ERROR
// =============================================================================

/**
 * Custom error class for API validation failures
 */
export class APIValidationError extends Error {
  public readonly fields: Array<{
    path: string;
    message: string;
    code: string;
  }>;
  public readonly originalData: unknown;

  constructor(
    message: string,
    fields: Array<{ path: string; message: string; code: string }>,
    originalData: unknown
  ) {
    super(message);
    this.name = 'APIValidationError';
    this.fields = fields;
    this.originalData = originalData;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, APIValidationError.prototype);
  }

  /**
   * Get farmer-friendly error message
   */
  getFarmerMessage(): string {
    if (this.fields.length === 0) {
      return 'Received invalid data from server. Please try again.';
    }

    // Return first field error as it's most relevant
    const firstError = this.fields[0];
    return `Invalid ${firstError.path.replace(/_/g, ' ')}. Please try again.`;
  }

  /**
   * Format errors for logging
   */
  toLogString(): string {
    const fieldErrors = this.fields
      .map((f) => `${f.path}: ${f.message} (${f.code})`)
      .join(', ');
    return `APIValidationError: ${this.message} | Fields: [${fieldErrors}]`;
  }
}

// =============================================================================
// VALIDATION HELPER
// =============================================================================

/**
 * Validate API response against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @param data - Unknown data from API response
 * @returns Validated data of type T
 * @throws APIValidationError if validation fails
 *
 * @example
 * const price = validateResponse(MandiPriceSchema, apiResponse);
 * // price is now typed as MandiPrice
 */
export function validateResponse<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Extract field-level errors
      const fields = error.errors.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));

      // Log validation failure for debugging
      if (__DEV__) {
        console.error('[Validation] Schema validation failed:', {
          fields,
          data: sanitizeForLogging(data),
        });
      }

      throw new APIValidationError(
        'API response validation failed',
        fields,
        data
      );
    }

    // Re-throw non-Zod errors
    throw error;
  }
}

/**
 * Validate API response (async version for use in async contexts)
 *
 * @param schema - Zod schema to validate against
 * @param data - Unknown data from API response
 * @returns Promise resolving to validated data of type T
 * @throws APIValidationError if validation fails
 */
export async function validateResponseAsync<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Promise<T> {
  return validateResponse(schema, data);
}

/**
 * Validate an array of items against a schema
 *
 * @param schema - Zod schema for individual items
 * @param data - Array of unknown items
 * @returns Array of validated items
 * @throws APIValidationError if any item fails validation
 */
export function validateArrayResponse<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T[] {
  if (!Array.isArray(data)) {
    throw new APIValidationError(
      'Expected an array response',
      [{ path: 'root', message: 'Expected array, got ' + typeof data, code: 'invalid_type' }],
      data
    );
  }

  const errors: Array<{ index: number; fields: APIValidationError['fields'] }> = [];

  const validated = data.map((item, index) => {
    try {
      return schema.parse(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        errors.push({
          index,
          fields: error.errors.map((err) => ({
            path: `[${index}].${err.path.join('.')}`,
            message: err.message,
            code: err.code,
          })),
        });
      }
      throw error;
    }
  });

  if (errors.length > 0) {
    const allFields = errors.flatMap((e) => e.fields);

    if (__DEV__) {
      console.error('[Validation] Array validation failed:', {
        errorCount: errors.length,
        fields: allFields,
      });
    }

    throw new APIValidationError(
      `${errors.length} items failed validation`,
      allFields,
      data
    );
  }

  return validated;
}

/**
 * Sanitize data for logging (remove sensitive fields)
 */
function sanitizeForLogging(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  const sensitiveFields = [
    'access_token',
    'refresh_token',
    'password',
    'otp',
    'phone',
    'secret',
    'api_key',
    'token',
  ];

  if (Array.isArray(data)) {
    return data.map(sanitizeForLogging);
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (sensitiveFields.some((sf) => key.toLowerCase().includes(sf))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// =============================================================================
// PARTIAL VALIDATION HELPERS
// =============================================================================

/**
 * Validate only specific fields (useful for PATCH updates)
 */
export function validatePartial<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Partial<T> {
  if (schema instanceof z.ZodObject) {
    const partialSchema = schema.partial();
    return validateResponse(partialSchema, data) as Partial<T>;
  }

  throw new Error('validatePartial only works with ZodObject schemas');
}

/**
 * Safe validation - returns result instead of throwing
 */
export function safeValidateResponse<T>(
  schema: z.ZodSchema<T>,
  data: unknown
):
  | { success: true; data: T }
  | { success: false; error: APIValidationError } {
  try {
    const validated = validateResponse(schema, data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof APIValidationError) {
      return { success: false, error };
    }
    throw error;
  }
}