/**
 * API Service Layer - Index
 * Central export point for all API services
 *
 * Architecture: Component → Hook → Service → API
 * This is the ONLY layer that talks to the backend.
 */

// Base API client
export {
  apiClient,
  BASE_URL,
  DEFAULT_TIMEOUT,
  TOKEN_KEYS,
  storeTokens,
  storeFarmerProfile,
  clearStoredData,
} from './api';
export type { ApiError, ErrorCode } from './api';

// Authentication service
export {
  register,
  requestOtp,
  verifyOtp,
  login,
  refreshToken,
  logout,
  isAuthenticated,
  getFarmerProfile,
  updateFarmerProfile,
  authService,
} from './authService';
export type {
  FarmerProfile,
  RegisterInput,
  LoginInput,
  RegisterResponse,
  LoginResponse,
} from './authService';
export {
  FarmerProfileSchema,
  RegisterResponseSchema,
  LoginResponseSchema,
} from './authService';

// Advisory service
export {
  sendVoiceAdvisory,
  getAdvisoryHistory,
  getAdvisory,
  getVoiceSession,
  submitHarvestIntent,
  getHarvestIntents,
  cancelHarvestIntent,
  advisoryService,
} from './advisoryService';
export type {
  MandiPrice,
  VoiceSession,
  FarmerAdvisory,
  HarvestIntent,
  AdvisoryStage,
  ProgressCallback,
} from './advisoryService';
export {
  MandiPriceSchema,
  VoiceSessionSchema,
  FarmerAdvisorySchema,
  HarvestIntentSchema,
  HarvestIntentInputSchema,
} from './advisoryService';

// Price service
export {
  getLivePrices,
  getPriceForecast,
  getPriceHistory,
  getNearbyMandis,
  getSupportedCrops,
  createPriceAlert,
  getPriceAlerts,
  deletePriceAlert,
  priceService,
  priceQueryKeys,
} from './priceService';
export type {
  MandiPrice as PriceMandiPrice,
  PriceForecast,
  PriceHistory,
  PriceAlert,
  GetLivePricesInput,
  GetPriceForecastInput,
  GetPriceHistoryInput,
  CreatePriceAlertInput,
} from './priceService';
export {
  MandiPriceSchema as PriceMandiPriceSchema,
  PriceForecastSchema,
  PriceHistorySchema,
  PriceAlertSchema,
} from './priceService';

// Cooperative service
export {
  getBlockStatus,
  getBlockBundles,
  getBundleDetails,
  joinBundle,
  leaveBundle,
  createBundle,
  getFarmerBundles,
  getPendingInvitations,
  respondToInvitation,
  getBundleSettlement,
  cooperativeService,
  cooperativeQueryKeys,
} from './cooperativeService';
export type {
  BlockStatus,
  CooperativeBundle,
  BundleJoinRequest,
  BundleJoinResponse,
  CooperativeInvitation,
} from './cooperativeService';
export {
  BlockStatusSchema,
  CooperativeBundleSchema,
  BundleJoinRequestSchema,
  BundleJoinResponseSchema,
  CooperativeInvitationSchema,
} from './cooperativeService';

// WebSocket service
export {
  WebSocketService,
  getWebSocketService,
  disconnectWebSocket,
} from './websocketService';
export type {
  WebSocketEventType,
  WebSocketMessage,
  WebSocketEvent,
} from './websocketService';

// News service
export { fetchNews, newsService } from './newsService';
export type { NewsArticle, NewsCategory, NewsUrgency } from './newsService';

// High-impact feature services
// High-impact feature services
export {
  detectDisease,
  checkSchemeEligibility,
  predictDemand,
  getVoiceFaq,
  checkWeatherAlerts,
  getFpoAnalytics,
} from './highImpactService';

// n8n connection service
export { n8nService } from './n8nService';
export type {
  VoiceAdvisoryTrigger,
  PriceCrashTrigger,
  EmergencyTrigger,
} from './n8nService';