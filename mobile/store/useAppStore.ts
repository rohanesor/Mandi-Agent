import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// =============================================================================
// TYPES
// =============================================================================

// Farmer types
export interface FarmerProfile {
  id: string;
  phone: string;
  name: string;
  state: string;
  district: string;
  block: string;
  village?: string;
  primary_crops: string[];
  land_size_hectares?: number;
  preferred_language: 'hi' | 'en' | 'mr' | 'ta' | 'te' | 'bn' | 'gu' | 'kn' | 'ml' | 'pa';
  created_at: string;
}

// Voice Session types
export interface VoiceSession {
  session_id: string;
  farmer_id: string;
  input_text_local: string;
  input_text_english: string;
  detected_language: string;
  intent: string;
  response_text_english: string;
  response_text_local: string;
  response_audio_url?: string;
  processing_ms: number;
  created_at: string;
  advisory?: FarmerAdvisory;
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

// Price types
export interface MandiPrice {
  mandi_name: string;
  state: string;
  commodity: string;
  min_price: number;
  max_price: number;
  modal_price: number;
  arrival_tonnes?: number;
  date: string;
  source: 'agmarknet' | 'enam';
}

export interface PriceHistoryEntry {
  date: string;
  price: number;
}

// Cooperative types
export interface BlockStatus {
  block_id: string;
  active_intents: number;
  oversupply_crops: string[];
  active_bundles: Array<{
    bundle_id: string;
    crop: string;
    status: string;
  }>;
  avg_forecast_price: number;
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

// Harvest Intent types
export interface HarvestIntent {
  intent_id: string;
  farmer_id: string;
  crop: string;
  estimated_quantity: number;
  harvest_date: string;
  preferred_mandi?: string;
  status: 'pending' | 'submitted' | 'synced';
  created_at: string;
  offline?: boolean;
}

// UI types
export type BannerType = 'info' | 'warning' | 'error' | 'success';
export type ToastType = 'info' | 'warning' | 'error' | 'success';

export interface Banner {
  message: string;
  type: BannerType;
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

// =============================================================================
// PIPELINE STAGES
// =============================================================================

export const PIPELINE_STAGES = [
  'fetching_data',
  'predicting_price',
  'generating_advisory',
  'creating_voice',
  'completed',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// =============================================================================
// STORE STATE
// =============================================================================

interface FarmerState {
  farmer: FarmerProfile | null;
  isAuthenticated: boolean;
  preferredLanguage: string;
}

interface AdvisoryState {
  currentSession: VoiceSession | null;
  sessionHistory: VoiceSession[];
  pipelineStatus: {
    stage: PipelineStage | '';
    isRunning: boolean;
    completedStages: PipelineStage[];
    error: string | null;
  };
}

interface PricesState {
  livePrices: MandiPrice[];
  selectedCrop: string;
  selectedState: string;
  priceHistory: Record<string, PriceHistoryEntry[]>;
}

interface CooperativeState {
  blockStatus: BlockStatus | null;
  activeBundle: CooperativeBundle | null;
  userBundles: CooperativeBundle[];
}

interface UIState {
  isOffline: boolean;
  activeBanner: Banner | null;
  toastQueue: Toast[];
  isLoading: Record<string, boolean>;
}

interface HarvestIntentsState {
  pendingIntents: HarvestIntent[];
  submittedIntents: HarvestIntent[];
}

export interface NewsAlert {
  id: string;
  headline: string;
  urgency: 'emergency' | 'important' | 'digest';
  receivedAt: string;
  isRead: boolean;
}

// =============================================================================
// PLAN TYPES
// =============================================================================

export type Season = 'kharif' | 'rabi' | 'zaid';

export interface CropPlan {
  crop: string;
  area_hectares: number;
  expected_harvest_month: string;
}

export interface SeasonPlan {
  id: string;
  season: Season;
  year: number;
  crops: CropPlan[];
  created_at: string;
  updated_at: string;
}

interface NotificationState {
  unreadNewsCount: number;
  lastNewsCheck: string | null;
  newsAlerts: NewsAlert[];
}

interface PlanState {
  seasonPlan: SeasonPlan | null;
  hasCompletedPlanOnboarding: boolean;
}

// =============================================================================
// STORE ACTIONS
// =============================================================================

interface FarmerActions {
  setFarmer: (profile: FarmerProfile | null) => void;
  setLanguage: (lang: string) => void;
  clearFarmer: () => void;
  setPreferredLanguage: (lang: string) => void;
}

interface AdvisoryActions {
  setPipelineStage: (stage: PipelineStage) => void;
  completePipelineStage: (stage: PipelineStage) => void;
  setSession: (session: VoiceSession | null) => void;
  addSessionToHistory: (session: VoiceSession) => void;
  setPipelineError: (error: string | null) => void;
  resetPipeline: () => void;
  clearCurrentSession: () => void;
}

interface PricesActions {
  setLivePrices: (prices: MandiPrice[]) => void;
  setSelectedCrop: (crop: string) => void;
  setSelectedState: (state: string) => void;
  setPriceHistory: (key: string, history: PriceHistoryEntry[]) => void;
  clearPrices: () => void;
}

interface CooperativeActions {
  setBlockStatus: (status: BlockStatus | null) => void;
  setActiveBundle: (bundle: CooperativeBundle | null) => void;
  updateBundle: (bundle: CooperativeBundle) => void;
  addUserBundle: (bundle: CooperativeBundle) => void;
  removeUserBundle: (bundleId: string) => void;
  clearCooperative: () => void;
}

interface UIActions {
  setOffline: (offline: boolean) => void;
  showBanner: (message: string, type: BannerType) => void;
  hideBanner: () => void;
  addToast: (message: string, type: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
  setLoading: (key: string, value: boolean) => void;
  clearLoading: () => void;
}

interface HarvestIntentsActions {
  addPendingIntent: (intent: HarvestIntent) => void;
  updatePendingIntent: (intentId: string, updates: Partial<HarvestIntent>) => void;
  removePendingIntent: (intentId: string) => void;
  markIntentSubmitted: (intentId: string) => void;
  markIntentSynced: (intentId: string) => void;
  addSubmittedIntent: (intent: HarvestIntent) => void;
  clearPendingIntents: () => void;
  clearSubmittedIntents: () => void;
}

interface NotificationActions {
  addNewsAlert: (alert: Omit<NewsAlert, 'isRead'> & { isRead?: boolean }) => void;
  markAllNewsRead: () => void;
  setLastNewsCheck: (ts: string) => void;
}

interface PlanActions {
  setSeasonPlan: (plan: SeasonPlan) => void;
  clearSeasonPlan: () => void;
  setHasCompletedPlanOnboarding: (completed: boolean) => void;
}

// =============================================================================
// COMPLETE STORE TYPE
// =============================================================================

type AppState = FarmerState &
  AdvisoryState &
  PricesState &
  CooperativeState &
  UIState &
  HarvestIntentsState &
  NotificationState &
  PlanState;

type AppActions = FarmerActions &
  AdvisoryActions &
  PricesActions &
  CooperativeActions &
  UIActions &
  HarvestIntentsActions &
  NotificationActions &
  PlanActions;

type AppStore = AppState & AppActions;

// =============================================================================
// INITIAL STATES
// =============================================================================

const initialFarmerState: FarmerState = {
  farmer: null,
  isAuthenticated: false,
  preferredLanguage: 'hi',
};

const initialAdvisoryState: AdvisoryState = {
  currentSession: null,
  sessionHistory: [],
  pipelineStatus: {
    stage: '',
    isRunning: false,
    completedStages: [],
    error: null,
  },
};

const initialPricesState: PricesState = {
  livePrices: [],
  selectedCrop: 'Tomato',
  selectedState: 'Karnataka',
  priceHistory: {},
};

const initialCooperativeState: CooperativeState = {
  blockStatus: null,
  activeBundle: null,
  userBundles: [],
};

const initialUIState: UIState = {
  isOffline: false,
  activeBanner: null,
  toastQueue: [],
  isLoading: {},
};

const initialHarvestIntentsState: HarvestIntentsState = {
  pendingIntents: [],
  submittedIntents: [],
};

const initialNotificationState: NotificationState = {
  unreadNewsCount: 0,
  lastNewsCheck: null,
  newsAlerts: [],
};

const initialPlanState: PlanState = {
  seasonPlan: null,
  hasCompletedPlanOnboarding: false,
};

// =============================================================================
// CUSTOM STORAGE ADAPTER
// =============================================================================

const storage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await AsyncStorage.getItem(name);
      return value;
    } catch (error) {
      console.error('[Storage] Failed to get item:', error);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (error) {
      console.error('[Storage] Failed to set item:', error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (error) {
      console.error('[Storage] Failed to remove item:', error);
    }
  },
};

// =============================================================================
// STORE CREATION
// =============================================================================

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // ===================
      // FARMER STATE
      // ===================
      ...initialFarmerState,

      setFarmer: (profile) =>
        set({
          farmer: profile,
          isAuthenticated: !!profile,
        }),

      setLanguage: (lang) =>
        set({ preferredLanguage: lang }),
        
      setPreferredLanguage: (lang) =>
        set({ preferredLanguage: lang }),

      clearFarmer: () =>
        set({
          ...initialFarmerState,
          // Keep language preference
          preferredLanguage: get().preferredLanguage,
        }),

      // ===================
      // ADVISORY STATE
      // ===================
      ...initialAdvisoryState,

      setPipelineStage: (stage) =>
        set((state) => ({
          pipelineStatus: {
            ...state.pipelineStatus,
            stage,
            isRunning: stage !== 'completed',
          },
        })),

      completePipelineStage: (stage) =>
        set((state) => {
          const completedStages = state.pipelineStatus.completedStages.includes(stage)
            ? state.pipelineStatus.completedStages
            : [...state.pipelineStatus.completedStages, stage];

          const isComplete = stage === 'completed';

          return {
            pipelineStatus: {
              ...state.pipelineStatus,
              stage: isComplete ? '' : stage,
              isRunning: !isComplete,
              completedStages,
              error: null,
            },
          };
        }),

      setSession: (session) =>
        set({ currentSession: session }),

      addSessionToHistory: (session) =>
        set((state) => ({
          sessionHistory: [session, ...state.sessionHistory].slice(0, 50), // Keep last 50
        })),

      setPipelineError: (error) =>
        set((state) => ({
          pipelineStatus: {
            ...state.pipelineStatus,
            error,
            isRunning: false,
          },
        })),

      resetPipeline: () =>
        set({
          currentSession: null,
          pipelineStatus: { ...initialAdvisoryState.pipelineStatus },
        }),

      clearCurrentSession: () =>
        set({ currentSession: null }),

      // ===================
      // PRICES STATE
      // ===================
      ...initialPricesState,

      setLivePrices: (prices) =>
        set({ livePrices: prices }),

      setSelectedCrop: (crop) =>
        set({ selectedCrop: crop }),

      setSelectedState: (stateName) =>
        set({ selectedState: stateName }),

      setPriceHistory: (key, history) =>
        set((state) => ({
          priceHistory: {
            ...state.priceHistory,
            [key]: history,
          },
        })),

      clearPrices: () =>
        set(initialPricesState),

      // ===================
      // COOPERATIVE STATE
      // ===================
      ...initialCooperativeState,

      setBlockStatus: (status) =>
        set({ blockStatus: status }),

      setActiveBundle: (bundle) =>
        set({ activeBundle: bundle }),

      updateBundle: (bundle) =>
        set((state) => {
          const exists = state.userBundles.find((b) => b.bundle_id === bundle.bundle_id);
          return {
            userBundles: exists
              ? state.userBundles.map((b) =>
                  b.bundle_id === bundle.bundle_id ? bundle : b
                )
              : [...state.userBundles, bundle],
            activeBundle:
              state.activeBundle?.bundle_id === bundle.bundle_id
                ? bundle
                : state.activeBundle,
          };
        }),

      addUserBundle: (bundle) =>
        set((state) => ({
          userBundles: [...state.userBundles, bundle],
        })),

      removeUserBundle: (bundleId) =>
        set((state) => ({
          userBundles: state.userBundles.filter((b) => b.bundle_id !== bundleId),
          activeBundle:
            state.activeBundle?.bundle_id === bundleId ? null : state.activeBundle,
        })),

      clearCooperative: () =>
        set(initialCooperativeState),

      // ===================
      // UI STATE
      // ===================
      ...initialUIState,

      setOffline: (offline) =>
        set({ isOffline: offline }),

      showBanner: (message, type) =>
        set({
          activeBanner: { message, type },
        }),

      hideBanner: () =>
        set({ activeBanner: null }),

      addToast: (message, type, duration = 4000) => {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);

        set((state) => ({
          toastQueue: [...state.toastQueue, { id, message, type, duration }],
        }));

        // Auto-remove after duration
        if (duration > 0) {
          setTimeout(() => {
            get().removeToast(id);
          }, duration);
        }
      },

      removeToast: (id) =>
        set((state) => ({
          toastQueue: state.toastQueue.filter((t) => t.id !== id),
        })),

      setLoading: (key, value) =>
        set((state) => ({
          isLoading: { ...state.isLoading, [key]: value },
        })),

      clearLoading: () =>
        set({ isLoading: {} }),

      // ===================
      // HARVEST INTENTS STATE
      // ===================
      ...initialHarvestIntentsState,

      addPendingIntent: (intent) =>
        set((state) => ({
          pendingIntents: [...state.pendingIntents, intent],
        })),

      updatePendingIntent: (intentId, updates) =>
        set((state) => ({
          pendingIntents: state.pendingIntents.map((intent) =>
            intent.intent_id === intentId ? { ...intent, ...updates } : intent
          ),
        })),

      removePendingIntent: (intentId) =>
        set((state) => ({
          pendingIntents: state.pendingIntents.filter((i) => i.intent_id !== intentId),
        })),

      markIntentSubmitted: (intentId) =>
        set((state) => {
          const intent = state.pendingIntents.find((i) => i.intent_id === intentId);
          if (!intent) return state;

          return {
            pendingIntents: state.pendingIntents.filter((i) => i.intent_id !== intentId),
            submittedIntents: [
              { ...intent, status: 'submitted' },
              ...state.submittedIntents,
            ],
          };
        }),

      markIntentSynced: (intentId) =>
        set((state) => ({
          submittedIntents: state.submittedIntents.map((intent) =>
            intent.intent_id === intentId
              ? { ...intent, status: 'synced' }
              : intent
          ),
        })),

      addSubmittedIntent: (intent) =>
        set((state) => ({
          submittedIntents: [intent, ...state.submittedIntents],
        })),

      clearPendingIntents: () =>
        set({ pendingIntents: [] }),
        
      clearSubmittedIntents: () =>
        set({ submittedIntents: [] }),

      // ===================
      // NOTIFICATIONS STATE
      // ===================
      ...initialNotificationState,

      addNewsAlert: (alert) =>
        set((state) => {
          const withRead = {
            ...alert,
            isRead: alert.isRead ?? false,
          } as NewsAlert;

          const newsAlerts = [withRead, ...state.newsAlerts].slice(0, 50);
          const unreadNewsCount = newsAlerts.filter((a) => !a.isRead).length;

          return {
            newsAlerts,
            unreadNewsCount,
          };
        }),

      markAllNewsRead: () =>
        set((state) => ({
          newsAlerts: state.newsAlerts.map((a) => ({ ...a, isRead: true })),
          unreadNewsCount: 0,
          lastNewsCheck: new Date().toISOString(),
        })),

      setLastNewsCheck: (ts) =>
        set({ lastNewsCheck: ts }),

      // ===================
      // PLAN STATE
      // ===================
      ...initialPlanState,

      setSeasonPlan: (plan) =>
        set({ seasonPlan: plan }),

      clearSeasonPlan: () =>
        set({ seasonPlan: null }),

      setHasCompletedPlanOnboarding: (completed) =>
        set({ hasCompletedPlanOnboarding: completed }),
    }),
    {
      name: 'mandi-agent-store',
      storage: createJSONStorage(() => storage),
      version: 1,
      // CRITICAL: ONLY persist specific keys
      partialize: (state) => ({
        farmer: state.farmer,
        isAuthenticated: state.isAuthenticated,
        preferredLanguage: state.preferredLanguage,
        pendingIntents: state.pendingIntents,
        submittedIntents: state.submittedIntents,
        selectedCrop: state.selectedCrop,
        selectedState: state.selectedState,
        lastNewsCheck: state.lastNewsCheck,
        seasonPlan: state.seasonPlan,
        hasCompletedPlanOnboarding: state.hasCompletedPlanOnboarding,
      }),
      // Migration for version upgrades
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          persistedState.selectedCrop = persistedState.selectedCrop || 'Tomato';
          persistedState.selectedState = persistedState.selectedState || 'Karnataka';
          return persistedState;
        }
        return persistedState;
      },
    }
  )
);

// =============================================================================
// SELECTORS (for performance optimization)
// =============================================================================

// Farmer selectors
export const selectFarmer = (state: AppStore) => state.farmer;
export const selectIsAuthenticated = (state: AppStore) => state.isAuthenticated;
export const selectLanguage = (state: AppStore) => state.preferredLanguage;

// Advisory selectors
export const selectCurrentSession = (state: AppStore) => state.currentSession;
export const selectPipelineStatus = (state: AppStore) => state.pipelineStatus;
export const selectSessionHistory = (state: AppStore) => state.sessionHistory;

// Prices selectors
export const selectLivePrices = (state: AppStore) => state.livePrices;
export const selectSelectedCrop = (state: AppStore) => state.selectedCrop;
export const selectSelectedState = (state: AppStore) => state.selectedState;
export const selectPriceHistory = (state: AppStore) => state.priceHistory;

// Cooperative selectors
export const selectBlockStatus = (state: AppStore) => state.blockStatus;
export const selectActiveBundle = (state: AppStore) => state.activeBundle;
export const selectUserBundles = (state: AppStore) => state.userBundles;

// UI selectors
export const selectIsOffline = (state: AppStore) => state.isOffline;
export const selectActiveBanner = (state: AppStore) => state.activeBanner;
export const selectToastQueue = (state: AppStore) => state.toastQueue;
export const selectIsLoading = (key: string) => (state: AppStore) => state.isLoading[key];

// Harvest intents selectors
export const selectPendingIntents = (state: AppStore) => state.pendingIntents;
export const selectSubmittedIntents = (state: AppStore) => state.submittedIntents;
export const selectUnreadNewsCount = (state: AppStore) => state.unreadNewsCount;
export const selectLastNewsCheck = (state: AppStore) => state.lastNewsCheck;
export const selectNewsAlerts = (state: AppStore) => state.newsAlerts;

// Plan selectors
export const selectSeasonPlan = (state: AppStore) => state.seasonPlan;
export const selectHasCompletedPlanOnboarding = (state: AppStore) => state.hasCompletedPlanOnboarding;

// Compatibility functions
export const useFarmer = () => useAppStore(s => s.farmer);
export const useIsOffline = () => useAppStore(s => s.isOffline);
export const usePipelineStatus = () => useAppStore(s => s.pipelineStatus);
export const usePendingIntents = () => useAppStore(s => s.pendingIntents);

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export const resetStore = () => {
  useAppStore.setState({
    ...initialFarmerState,
    ...initialAdvisoryState,
    ...initialPricesState,
    ...initialCooperativeState,
    ...initialUIState,
    ...initialHarvestIntentsState,
    ...initialNotificationState,
    ...initialPlanState,
  });
};

export const clearPersistedData = async () => {
  try {
    await AsyncStorage.removeItem('mandi-agent-store');
    resetStore();
  } catch (error) {
    console.error('[Storage] Failed to clear persisted data:', error);
  }
};

export const getStoreState = () => useAppStore.getState();
export const subscribeToStore = (listener: (state: AppState) => void) =>
  useAppStore.subscribe(listener);

export default useAppStore;