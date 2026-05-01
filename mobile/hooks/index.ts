/**
 * Hooks Index
 * Central export point for all custom hooks
 *
 * Architecture: Component → Hook → Service → API
 * Components should NEVER import services directly.
 */

// Advisory hooks
export { useAdvisory } from './useAdvisory';

// Price hooks
export {
  usePrices,
  usePriceForecast,
  usePriceHistory,
  useNearbyMandis,
  useSupportedCrops,
  usePriceAlerts,
} from './usePrices';

// Cooperative hooks
export {
  useBlockStatus,
  useJoinBundle,
  useLeaveBundle,
  useActiveBundleCountdown,
  useFarmerBundles,
  useBundleDetails,
  useCreateBundle,
} from './useCooperative';
export type {
  UseBlockStatusReturn,
  UseJoinBundleReturn,
} from './useCooperative';

// Voice recording hooks
export {
  useVoiceRecording,
  default as useVoiceRecordingDefault,
} from './useVoiceRecording';

// WebSocket hooks
export {
  useWebSocket,
  useWebSocketEvent,
  useAdvisoryWebSocket,
  default as useWebSocketDefault,
} from './useWebSocket';
export type { UseWebSocketReturn } from './useWebSocket';

// Offline sync hooks
export {
  useOfflineSync,
} from './useOfflineSync';

// Animated hooks
export {
  useAnimatedAdvisory,
  default as useAnimatedAdvisoryDefault,
} from './useAnimatedAdvisory';
export type { UseAnimatedAdvisoryReturn, PipelineStage } from './useAnimatedAdvisory';

export {
  useAnimatedPrices,
  default as useAnimatedPricesDefault,
} from './useAnimatedPrices';
export type { UseAnimatedPricesReturn } from './useAnimatedPrices';

// Notifications
export { useNewsNotifications } from './useNewsNotifications';

// Deals (Virtual Cooperative)
export { useDeals } from './useDeals';
export type { Deal, DealMember, DealStatus, TruckInfo } from './useDeals';