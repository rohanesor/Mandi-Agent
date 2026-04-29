import { useEffect, useRef, useCallback } from 'react'
import { Platform } from 'react-native'
import { useAppStore } from '../store/useAppStore'
import { BASE_URL } from '../services/api'

// Platform-aware offline cache - no SQLite on web
let db: any = null;
let initialized = false;

async function initOfflineCache() {
  if (initialized) return;

  if (Platform.OS === 'web') {
    initialized = true;
    return;
  }

  try {
    const SQLite = await import('expo-sqlite');
    db = await SQLite.openDatabaseAsync('mandi_agent_offline.db');

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        operation_id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        client_version INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    initialized = true;
  } catch (e) {
    console.warn('SQLite init failed:', e);
    initialized = true;
  }
}

async function enqueueSyncOperation(item: any) {
  if (!db) return;
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_queue (operation_id, entity_type, entity_id, operation, payload_json, client_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [item.operation_id, item.entity_type, item.entity_id, item.operation, item.payload_json, item.client_version, item.created_at]
  );
}

async function listSyncQueue() {
  if (!db) return [];
  return await db.getAllAsync('SELECT * FROM sync_queue ORDER BY created_at ASC');
}

async function removeSyncOperation(operationId: string) {
  if (!db) return;
  await db.runAsync('DELETE FROM sync_queue WHERE operation_id = ?', [operationId]);
}

// Only import native modules on non-web platforms
let NetInfo: any = null;
let Notifications: any = null;

if (Platform.OS !== 'web') {
  try {
    NetInfo = require('@react-native-community/netinfo').default;
    Notifications = require('expo-notifications');
    
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (e) {
    console.warn('Native module load failed:', e);
  }
}

export function useOfflineSync() {
  const {
    isOffline,
    setOffline,
    pendingIntents,
    markIntentSubmitted,
    showBanner,
    hideBanner,
  } = useAppStore()

  const wasOffline = useRef(false)
  const isSyncing = useRef(false)

  useEffect(() => {
    initOfflineCache().catch(console.warn);
  }, [])

  // ── Request notification permission ────────────────
  useEffect(() => {
    if (Platform.OS === 'web' || !Notifications) return
    Notifications.requestPermissionsAsync().catch(() => {})
  }, [])

  // ── Monitor network state ──────────────────────────
  useEffect(() => {
    if (!NetInfo) return;
    
    const unsubscribe = NetInfo.addEventListener((state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      const offline = !(
        state.isConnected && state.isInternetReachable
      )

      setOffline(offline)

      if (offline) {
        wasOffline.current = true
        showBanner(
          'No internet — your request will sync when online',
          'warning'
        )
      } else if (wasOffline.current) {
        wasOffline.current = false
        hideBanner()
        syncPendingIntents()
      }
    })
    return () => unsubscribe()
  }, [pendingIntents])

  // ── Sync pending intents ───────────────────────────
  const syncPendingIntents = useCallback(async () => {
    if (isSyncing.current) return
    if (pendingIntents.length === 0) return

    isSyncing.current = true

    for (const intent of pendingIntents) {
      try {
        const payload = {
          intent: {
            intent_id: intent.intent_id,
            farmer_id: intent.farmer_id,
            crop: intent.crop,
            quantity_quintals: intent.estimated_quantity,
            expected_harvest_date: intent.harvest_date,
            current_growth_stage: 'mature',
            block_id: 'unknown-block',
          },
        }

        const res = await fetch(
          `${BASE_URL}/api/harvest-intent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        )
        if (res.ok) {
          markIntentSubmitted(intent.intent_id)
        }
      } catch {
        await enqueueSyncOperation({
          operation_id: `op-${intent.intent_id}`,
          entity_type: 'harvest_intent',
          entity_id: intent.intent_id,
          operation: 'upsert',
          payload_json: JSON.stringify(intent),
          client_version: 1,
          created_at: new Date().toISOString(),
        })
      }
    }

    const queued = await listSyncQueue()
    for (const op of queued) {
      try {
        const payload = JSON.parse(op.payload_json)
        const res = await fetch(`${BASE_URL}/api/harvest-intent/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intent: {
              intent_id: payload.intent_id,
              farmer_id: payload.farmer_id,
              crop: payload.crop,
              quantity_quintals: payload.estimated_quantity,
              expected_harvest_date: payload.harvest_date,
              current_growth_stage: 'mature',
              block_id: 'unknown-block',
            },
            client_version: op.client_version,
          }),
        })

        if (res.ok) {
          await removeSyncOperation(op.operation_id)
          markIntentSubmitted(op.entity_id)
        }
      } catch {
        // retry next cycle
      }
    }

    isSyncing.current = false
  }, [pendingIntents, markIntentSubmitted])

  return {
    isOffline,
    pendingCount: pendingIntents.length,
    syncNow: syncPendingIntents,
  }
}
