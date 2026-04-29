import { useEffect, useRef, useState, useCallback } from 'react';
import {
  WebSocketService,
  getWebSocketService,
  disconnectWebSocket,
} from '../services/websocketService';
import type { WebSocketEventType, WebSocketEvent } from '../services/websocketService';
import { useAppStore } from '../store';

// =============================================================================
// TYPES
// =============================================================================

export interface UseWebSocketReturn {
  isConnected: boolean;
  connectionState: 'connecting' | 'open' | 'closing' | 'closed';
  lastMessage: WebSocketEvent | null;
  sendMessage: (message: Record<string, unknown>) => boolean;
  reconnect: () => Promise<void>;
  disconnect: () => void;
}

// =============================================================================
// HOOK
// =============================================================================

export function useWebSocket(farmerId: string | null): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'open' | 'closing' | 'closed'>('closed');
  const [lastMessage, setLastMessage] = useState<WebSocketEvent | null>(null);

  const wsRef = useRef<WebSocketService | null>(null);

  // Store actions
  const setPipelineStage = useAppStore((s) => s.setPipelineStage);
  const completePipelineStage = useAppStore((s) => s.completePipelineStage);
  const setPipelineError = useAppStore((s) => s.setPipelineError);
  const setSession = useAppStore((s) => s.setSession);
  const updateBundle = useAppStore((s) => s.updateBundle);
  const setOffline = useAppStore((s) => s.setOffline);
  const showBanner = useAppStore((s) => s.showBanner);
  const hideBanner = useAppStore((s) => s.hideBanner);
  const addToast = useAppStore((s) => s.addToast);

  // ==========================================================================
  // WEBSOCKET EVENT HANDLERS
  // ==========================================================================

  const setupEventListeners = useCallback((ws: WebSocketService) => {
    // Connection established
    ws.on('connected', (event) => {
      setIsConnected(true);
      setConnectionState('open');
      setOffline(false);
      hideBanner();
      addToast('Connected to server', 'success');
    });

    // Connection lost
    ws.on('disconnected', (event) => {
      setIsConnected(false);
      setConnectionState('closed');
      setOffline(true);
      showBanner('Connection lost. Reconnecting...', 'warning');
    });

    // Connection error
    ws.on('error', (event) => {
      setIsConnected(false);
      setConnectionState('closed');
      setOffline(true);
      showBanner('Connection error. Please check your internet.', 'error');
    });

    // Pipeline stages - advisory processing
    ws.on('agent_step', (event) => {
      const { step, status, data } = event.data as {
        step: string;
        status: 'started' | 'processing' | 'done';
        data?: unknown;
      };

      setPipelineStage(step as any);

      if (status === 'done') {
        completePipelineStage(step as any);
      }

      setLastMessage(event);
    });

    // Pipeline started
    ws.on('pipeline_start', (event) => {
      const { session_id } = event.data as { session_id: string };
      // Reset pipeline and start fresh
      setLastMessage(event);
    });

    // Pipeline completed with advisory
    ws.on('advisory_ready', (event) => {
      const { session } = event.data as { session: unknown };
      setSession(session as any);
      setLastMessage(event);
      addToast('Your advisory is ready!', 'success');
    });

    // Incident alert
    ws.on('incident', (event) => {
      const { message, severity } = event.data as {
        message: string;
        severity: 'info' | 'warning' | 'error';
      };

      if (severity === 'error') {
        setPipelineError(message);
      }

      addToast(message, severity);
      setLastMessage(event);
    });

    // Bundle updates
    ws.on('bundle_update', (event) => {
      const { bundle } = event.data as { bundle: unknown };
      updateBundle(bundle as any);
      setLastMessage(event);
    });

    // Price alerts
    ws.on('price_alert', (event) => {
      const { crop, mandi, price, message } = event.data as {
        crop: string;
        mandi: string;
        price: number;
        message: string;
      };

      addToast(`💰 ${crop}: ₹${price}/quintal at ${mandi}`, 'info');
      setLastMessage(event);
    });

    // Heartbeat - connection keepalive
    ws.on('heartbeat', () => {
      // Connection is alive, no action needed
    });

    // Snapshot - initial data sync
    ws.on('snapshot', (event) => {
      const { prices, bundles, advisories } = event.data as {
        prices?: unknown[];
        bundles?: unknown[];
        advisories?: unknown[];
      };

      // Handle initial data snapshot if needed
      setLastMessage(event);
    });
  }, [
    setPipelineStage,
    completePipelineStage,
    setPipelineError,
    setSession,
    updateBundle,
    setOffline,
    showBanner,
    hideBanner,
    addToast,
  ]);

  // ==========================================================================
  // CONNECT ON MOUNT
  // ==========================================================================

  useEffect(() => {
    if (!farmerId) {
      return;
    }

    // Create WebSocket service
    wsRef.current = getWebSocketService(farmerId);

    // Setup event listeners
    setupEventListeners(wsRef.current);

    // Connect
    const connect = async () => {
      setConnectionState('connecting');
      try {
        await wsRef.current?.connect();
      } catch (error) {
        console.error('[useWebSocket] Connection failed:', error);
        setConnectionState('closed');
        setOffline(true);
      }
    };

    connect();

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
    };
  }, [farmerId, setupEventListeners, setOffline]);

  // ==========================================================================
  // SEND MESSAGE
  // ==========================================================================

  const sendMessage = useCallback((message: Record<string, unknown>): boolean => {
    if (!wsRef.current || !isConnected) {
      console.warn('[useWebSocket] Cannot send - not connected');
      return false;
    }

    return wsRef.current.send(message);
  }, [isConnected]);

  // ==========================================================================
  // MANUAL RECONNECT
  // ==========================================================================

  const reconnect = useCallback(async () => {
    if (!wsRef.current || !farmerId) {
      return;
    }

    setConnectionState('connecting');

    // Disconnect first
    wsRef.current.disconnect();

    // Get fresh instance
    wsRef.current = getWebSocketService(farmerId);
    setupEventListeners(wsRef.current);

    // Reconnect
    try {
      await wsRef.current.connect();
    } catch (error) {
      console.error('[useWebSocket] Reconnect failed:', error);
      setConnectionState('closed');
    }
  }, [farmerId, setupEventListeners]);

  // ==========================================================================
  // DISCONNECT
  // ==========================================================================

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }

    setIsConnected(false);
    setConnectionState('closed');
    disconnectWebSocket();
  }, []);

  // ==========================================================================
  // RETURN
  // ==========================================================================

  return {
    isConnected,
    connectionState,
    lastMessage,
    sendMessage,
    reconnect,
    disconnect,
  };
}

// =============================================================================
// SPECIALIZED HOOKS
// =============================================================================

/**
 * Hook for listening to specific WebSocket events
 */
export function useWebSocketEvent<T = unknown>(
  eventType: WebSocketEventType,
  callback: (data: T) => void
): void {
  const farmer = useAppStore((s) => s.farmer);
  const wsRef = useRef<WebSocketService | null>(null);

  useEffect(() => {
    if (!farmer?.id) return;

    wsRef.current = getWebSocketService(farmer.id);
    const unsubscribe = wsRef.current.on(eventType, (event) => {
      callback(event.data as T);
    });

    return unsubscribe;
  }, [farmer?.id, eventType, callback]);
}

/**
 * Hook for advisory-specific WebSocket events
 */
export function useAdvisoryWebSocket(farmerId: string | null): {
  onStageChange: (callback: (stage: string, status: string) => void) => () => void;
  onComplete: (callback: (session: unknown) => void) => () => void;
  onError: (callback: (message: string) => void) => () => void;
} {
  const onStageChange = useCallback(
    (callback: (stage: string, status: string) => void) => {
      if (!farmerId) return () => {};

      const ws = getWebSocketService(farmerId);
      return ws.on('agent_step', (event) => {
        const { step, status } = event.data as { step: string; status: string };
        callback(step, status);
      });
    },
    [farmerId]
  );

  const onComplete = useCallback(
    (callback: (session: unknown) => void) => {
      if (!farmerId) return () => {};

      const ws = getWebSocketService(farmerId);
      return ws.on('advisory_ready', (event) => {
        const { session } = event.data as { session: unknown };
        callback(session);
      });
    },
    [farmerId]
  );

  const onError = useCallback(
    (callback: (message: string) => void) => {
      if (!farmerId) return () => {};

      const ws = getWebSocketService(farmerId);
      return ws.on('incident', (event) => {
        const { message } = event.data as { message: string };
        callback(message);
      });
    },
    [farmerId]
  );

  return {
    onStageChange,
    onComplete,
    onError,
  };
}

export default useWebSocket;