/**
 * Mandi-Agent TypeScript types
 * Shared domain types matching backend Pydantic schemas
 */

export interface Farmer {
  farmer_id: string;
  name: string;
  phone: string;
  language: LanguageCode;
  location: string;
  latitude: number;
  longitude: number;
  block_id: string;
  fpo_id?: string;
  crops: string[];
  landholding_acres: number;
}

export interface HarvestIntent {
  intent_id: string;
  farmer_id: string;
  crop: string;
  quantity_quintals: number;
  expected_harvest_date: string;
  current_growth_stage: string;
  block_id: string;
}

export interface MandiPrice {
  mandi_name: string;
  state: string;
  commodity: string;
  variety: string;
  min_price: number;
  max_price: number;
  modal_price: number;
  arrival_tonnes?: number;
  date: string;
  source: 'agmarknet' | 'enam';
}

export interface PriceForecast {
  crop: string;
  mandi_name: string;
  forecast_date: string;
  predicted_price: number;
  confidence: number;
  price_direction: 'rising' | 'falling' | 'stable';
  reasoning: string;
  model_used: string;
  days_ahead: number;
}

export interface SpoilageRisk {
  farmer_id: string;
  crop: string;
  harvest_date: string;
  transit_hours: number;
  ambient_temp_celsius: number;
  shelf_life_hours: number;
  spoilage_probability: number;
  risk_level: 'safe' | 'moderate' | 'high' | 'critical';
  recommendation: string;
}

export interface CooperativeBundle {
  bundle_id: string;
  block_id: string;
  crop: string;
  farmer_ids: string[];
  total_quantity_quintals: number;
  target_mandi: string;
  target_mandi_lat: number;
  target_mandi_lng: number;
  delivery_window_start: string;
  delivery_window_end: string;
  forecast_price: number;
  transport_saving_per_quintal: number;
  status: 'negotiating' | 'confirmed' | 'dispatched' | 'completed';
}

export interface FarmerAdvisory {
  advisory_id: string;
  farmer_id: string;
  crop: string;
  language: string;
  decision: 'harvest_now' | 'hold_3_days' | 'hold_7_days' | 'redirect_mandi';
  target_mandi?: string;
  forecast_price: number;
  spoilage_risk_pct: number;
  bundle_available: boolean;
  bundle_saving?: number;
  full_text_english: string;
  full_text_local: string;
  confidence: number;
  guardrail_status: 'approved' | 'review' | 'flagged';
  created_at: string;
}

export interface VoiceSession {
  session_id: string;
  farmer_id: string;
  input_audio_url?: string;
  input_text_local: string;
  input_text_english: string;
  detected_language: string;
  intent: string;
  response_text_english: string;
  response_text_local: string;
  response_audio_url?: string;
  processing_ms: number;
  created_at: string;
}

export type LanguageCode = 'hi' | 'ta' | 'te' | 'kn' | 'mr' | 'bn' | 'gu' | 'pa';

export type OnboardingScreen = 1 | 2 | 3;

export interface AnimatedCounter {
  value: number;
  suffix?: string;
  prefix?: string;
}
