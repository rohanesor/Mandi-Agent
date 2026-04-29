import { z } from 'zod';
import { apiClient } from './api';

export const DiseaseDiagnosisSchema = z.object({
  diagnosis_id: z.string(),
  crop: z.string(),
  disease_name: z.string(),
  confidence: z.number(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  symptoms_observed: z.array(z.string()),
  preventive_actions: z.array(z.string()),
  treatment_actions: z.array(z.string()),
  escalation_required: z.boolean(),
  created_at: z.string().optional(),
});

export const GovtSchemeSchema = z.object({
  scheme_id: z.string(),
  scheme_name: z.string(),
  state: z.string(),
  benefits_summary: z.string(),
  eligibility_score: z.number(),
  eligibility_reason: z.string(),
  required_documents: z.array(z.string()),
  next_steps: z.array(z.string()),
});

export const DemandForecastSchema = z.object({
  crop: z.string(),
  state: z.string(),
  months_ahead: z.number(),
  predicted_demand_index: z.number(),
  demand_level: z.enum(['low', 'moderate', 'high']),
  confidence: z.number(),
  recommended_action: z.string(),
  signals: z.array(z.string()),
});

export const FAQVoiceSchema = z.object({
  faq_id: z.string(),
  language: z.string(),
  question: z.string(),
  answer: z.string(),
  audio_url: z.string().nullable().optional(),
  confidence: z.number(),
});

export const WeatherAlertSchema = z.object({
  alert_id: z.string(),
  state: z.string(),
  district: z.string(),
  block_id: z.string().nullable().optional(),
  crop: z.string().nullable().optional(),
  alert_type: z.string(),
  severity: z.string(),
  advisory_text: z.string(),
  valid_from: z.string(),
  valid_until: z.string(),
  push_sent: z.boolean(),
  sms_fallback_sent: z.boolean(),
});

export const FPOAnalyticsSchema = z.object({
  fpo_id: z.string(),
  harvest_intent_map_points: z.array(z.record(z.any())),
  bundle_progress: z.record(z.any()),
  price_trends: z.array(z.record(z.any())),
  engagement_metrics: z.record(z.any()),
});

export async function detectDisease(image_base64: string, crop: string) {
  const { data } = await apiClient.post('/api/disease/detect', { image_base64, crop });
  return DiseaseDiagnosisSchema.parse(data);
}

export async function checkSchemeEligibility(farmer: Record<string, unknown>) {
  const { data } = await apiClient.post('/api/schemes/eligibility', { farmer });
  return z.array(GovtSchemeSchema).parse(data);
}

export async function predictDemand(crop: string, state: string, months_ahead: number) {
  const { data } = await apiClient.post('/api/demand/predict', { crop, state, months_ahead });
  return DemandForecastSchema.parse(data);
}

export async function getVoiceFaq(query: string, language: string) {
  const { data } = await apiClient.post('/api/faq/voice', { query, language });
  return FAQVoiceSchema.parse(data);
}

export async function checkWeatherAlerts(input: {
  state: string;
  district: string;
  block_id?: string;
  crop?: string;
  forecast_rain_mm: number;
  hail_probability: number;
  wind_kmph: number;
}) {
  const { data } = await apiClient.post('/api/weather/alerts/check', input);
  return WeatherAlertSchema.parse(data);
}

export async function getFpoAnalytics(fpoId: string) {
  const { data } = await apiClient.get(`/api/fpo/${fpoId}/analytics`);
  return FPOAnalyticsSchema.parse(data);
}
