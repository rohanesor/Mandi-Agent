import { buildWebSocketUrl } from './api';

// WebSocket message types
export type WebSocketEventType =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'snapshot'
  | 'pipeline_start'
  | 'agent_step'
  | 'incident'
  | 'heartbeat'
  | 'bundle_update'
  | 'price_alert'
  | 'advisory_ready';

export interface WebSocketMessage {
  type?: WebSocketEventType;
  payload?: Record<string, unknown>;
  timestamp?: string;
  event?: string;
  [key: string]: unknown;
}

export interface WebSocketEvent<T = unknown> {
  type: WebSocketEventType;
  data: T;
}

type EventListener = (event: WebSocketEvent) => void;

// Reconnection configuration
const RECONNECT_CONFIG = {
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  maxAttempts: 10,
  backoffMultiplier: 1.5,
  pingInterval: 30000, // 30 seconds
};

/**
 * WebSocket Service for real-time updates
 * Handles connection, reconnection, and message routing
 */
export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private farmerId: string;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private listeners: Map<WebSocketEventType, Set<EventListener>> = new Map();
  private isConnecting = false;
  private shouldReconnect = true;

  constructor(farmerId: string) {
    this.farmerId = farmerId;
    this.url = buildWebSocketUrl(`/ws/advisory/${farmerId}`);
  }

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      if (this.isConnecting) {
        // Wait for existing connection attempt
        const checkInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        return;
      }

      this.isConnecting = true;
      this.shouldReconnect = true;

      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startPingInterval();
          this.emit('connected', { farmerId: this.farmerId });
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as WebSocketMessage;
            this.handleMessage(message);
          } catch (error) {
            console.error('[WebSocket] Failed to parse message:', error);
          }
        };

        this.ws.onerror = (error) => {
          this.isConnecting = false;
          console.error('[WebSocket] Error:', error);
          this.emit('error', { error: 'WebSocket connection error' });
          reject(error);
        };

        this.ws.onclose = (event) => {
          this.isConnecting = false;
          this.stopPingInterval();
          this.emit('disconnected', {
            code: event.code,
            reason: event.reason,
          });

          if (this.shouldReconnect) {
            this.scheduleReconnect();
          }
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(message: WebSocketMessage): void {
    // Native app event shape: { type, payload, timestamp }
    if (message.type) {
      const { type, payload, timestamp } = message;

      if (type === 'heartbeat') {
        this.resetConnectionTimeout();
        return;
      }

      this.emit(type, {
        ...(payload ?? {}),
        timestamp,
      });
      return;
    }

    // Backend event shape: { event, ...data }
    if (typeof message.event === 'string') {
      const backendEvent = message.event;

      if (backendEvent === 'heartbeat') {
        this.resetConnectionTimeout();
        this.emit('heartbeat', { timestamp: new Date().toISOString() });
        return;
      }

      if (backendEvent === 'complete') {
        this.emit('advisory_ready', {
          session: message.session,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (backendEvent === 'error') {
        const errorMsg =
          typeof message.error === 'string' ? message.error : 'WebSocket pipeline error';
        this.emit('incident', {
          message: errorMsg,
          severity: 'error',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Generic stage mapping for backend progress events
      this.emit('agent_step', {
        step: backendEvent,
        status: 'processing',
        data: message,
        timestamp: new Date().toISOString(),
      });

      return;
    }
  }

  /**
   * Emit event to all registered listeners
   */
  private emit(type: WebSocketEventType, data: unknown): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const event: WebSocketEvent = { type, data };
      listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error(`[WebSocket] Listener error for ${type}:`, error);
        }
      });
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= RECONNECT_CONFIG.maxAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached');
      this.emit('error', { error: 'Max reconnection attempts reached' });
      return;
    }

    // Calculate delay with exponential backoff
    const baseDelay = RECONNECT_CONFIG.initialDelay;
    const multiplier = RECONNECT_CONFIG.backoffMultiplier;
    const delay = Math.min(
      baseDelay * Math.pow(multiplier, this.reconnectAttempts),
      RECONNECT_CONFIG.maxDelay
    );

    // Specific delays: 1s, 2s, 5s, then 10s
    const specificDelays = [1000, 2000, 5000];
    const actualDelay = this.reconnectAttempts < specificDelays.length
      ? specificDelays[this.reconnectAttempts]
      : RECONNECT_CONFIG.maxDelay;

    console.log(`[WebSocket] Reconnecting in ${actualDelay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch(() => {
        // Error is already handled in connect()
      });
    }, actualDelay);
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    this.stopPingInterval();

    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: 'ping', timestamp: new Date().toISOString() }));
      }
    }, RECONNECT_CONFIG.pingInterval);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Reset connection timeout on heartbeat
   */
  private resetConnectionTimeout(): void {
    // Connection is alive, reset reconnect attempts
    this.reconnectAttempts = 0;
  }

  /**
   * Subscribe to a specific event type
   */
  on(type: WebSocketEventType, listener: EventListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(type)?.delete(listener);
    };
  }

  /**
   * Unsubscribe from a specific event type
   */
  off(type: WebSocketEventType, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  /**
   * Subscribe to multiple event types at once
   */
  subscribe(events: WebSocketEventType[], listener: EventListener): () => void {
    const unsubscribers = events.map((type) => this.on(type, listener));

    // Return function to unsubscribe from all
    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }

  /**
   * Send a message through WebSocket
   */
  send(message: Record<string, unknown>): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.error('[WebSocket] Cannot send - connection not open');
      return false;
    }

    try {
      // Keep backend contract intact if caller sends an explicit action
      if (typeof message.action === 'string') {
        this.ws.send(JSON.stringify(message));
      } else {
        this.ws.send(JSON.stringify({
          ...message,
          timestamp: new Date().toISOString(),
        }));
      }
      return true;
    } catch (error) {
      console.error('[WebSocket] Send error:', error);
      return false;
    }
  }

  /**
   * Get current connection state
   */
  getState(): 'connecting' | 'open' | 'closing' | 'closed' {
    switch (this.ws?.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'open';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'closed';
      default:
        return 'closed';
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.stopPingInterval();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'User initiated disconnect');
      this.ws = null;
    }

    // Clear all listeners
    this.listeners.clear();
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    reconnectAttempts: number;
    state: string;
    listeners: number;
  } {
    return {
      reconnectAttempts: this.reconnectAttempts,
      state: this.getState(),
      listeners: Array.from(this.listeners.values())
        .reduce((sum, set) => sum + set.size, 0),
    };
  }
}

// Singleton instance management
let wsInstance: WebSocketService | null = null;

/**
 * Get or create WebSocket instance for a farmer
 */
export function getWebSocketService(farmerId: string): WebSocketService {
  if (!wsInstance || wsInstance['farmerId'] !== farmerId) {
    wsInstance?.disconnect();
    wsInstance = new WebSocketService(farmerId);
  }
  return wsInstance;
}

/**
 * Disconnect and clear WebSocket instance
 */
export function disconnectWebSocket(): void {
  wsInstance?.disconnect();
  wsInstance = null;
}

export default WebSocketService;