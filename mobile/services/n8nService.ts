import { apiClient } from './api';

export interface VoiceAdvisoryTrigger {
  farmer_id: string;
  phone: string;
  language: string;
  advisory_text: string;
}

export interface PriceCrashTrigger {
  block_id: string;
  crop: string;
  forecast_price: number;
  current_price: number;
  drop_pct: number;
  affected_farmer_ids?: string[];
}

export interface EmergencyTrigger {
  farmer_id: string;
  crop: string;
  spoilage_pct: number;
  recommended_action: string;
}


export interface BundleTrigger {
  bundle_id: string;
  crop: string;
  message: string;
  language: string;
  farmer_phones: string[];
}

export const n8nService = {
  /**
   * Master Automation Trigger
   * Trigger any n8n workflow by its friendly ID (bundle, news, weather, etc.) via backend.
   */
  triggerAutomation: async (workflowId: string, data: any) => {
    try {
      console.log(`[n8nService] Triggering ${workflowId}...`);
      const response = await apiClient.post(`/api/automate/${workflowId}`, data);
      return response.data;
    } catch (error) {
      console.error(`n8n ${workflowId} Error:`, error);
      throw error;
    }
  },

  // Legacy/Shortcut methods
  triggerVoiceAdvisory: async (data: any) => n8nService.triggerAutomation('voice', data),
  triggerBundleNotification: async (data: any) => n8nService.triggerAutomation('bundle', data),
  triggerPriceCrash: async (data: any) => n8nService.triggerAutomation('price-crash', data),
  triggerEmergency: async (data: any) => n8nService.triggerAutomation('emergency', data),
};
