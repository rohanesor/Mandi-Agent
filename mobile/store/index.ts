/**
 * Store Index
 * Central export point for Zustand state management
 */

// Main store hook
export { useAppStore, default } from './useAppStore';

// Store actions
export {
  resetStore,
  clearPersistedData,
  getStoreState,
  subscribeToStore,
} from './useAppStore';

// Selectors
export {
  // Farmer
  selectFarmer,
  selectIsAuthenticated,
  selectLanguage,
  // Advisory
  selectCurrentSession,
  selectPipelineStatus,
  selectSessionHistory,
  // Prices
  selectLivePrices,
  selectSelectedCrop,
  selectSelectedState,
  selectPriceHistory,
  // Cooperative
  selectBlockStatus,
  selectActiveBundle,
  selectUserBundles,
  // UI
  selectIsOffline,
  selectActiveBanner,
  selectToastQueue,
  selectIsLoading,
  // Harvest intents
  selectPendingIntents,
  selectSubmittedIntents,
  selectUnreadNewsCount,
  selectLastNewsCheck,
  selectNewsAlerts,
} from './useAppStore';

// Types
export type {
  FarmerProfile,
  VoiceSession,
  FarmerAdvisory,
  MandiPrice,
  PriceHistoryEntry,
  BlockStatus,
  CooperativeBundle,
  HarvestIntent,
  Banner,
  Toast,
  BannerType,
  ToastType,
  PipelineStage,
  NewsAlert,
} from './useAppStore';

// Constants
export { PIPELINE_STAGES } from './useAppStore';