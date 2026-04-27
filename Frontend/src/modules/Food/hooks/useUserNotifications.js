import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { toast } from 'sonner';
import { API_BASE_URL } from '@food/api/config';
import { userAPI } from '@food/api';
import { dispatchNotificationInboxRefresh } from '@food/hooks/useNotificationInbox';

const debugLog = (...args) => {
  if (import.meta.env.DEV) {
    console.log('[UserSocket]', ...args);
  }
};

const resolveUserIdFromStorage = () => {
  if (typeof window === 'undefined') return null;

  for (const key of ['user_user', 'userProfile']) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const resolvedId =
        parsed?._id?.toString?.() || parsed?.userId || parsed?.id || null;
      if (resolvedId) return String(resolvedId);
    } catch {
      // Ignore malformed cache entries.
    }
  }

  return null;
};

const broadcastConnectionState = (connected) => {
  if (typeof window === 'undefined') return;
  window.orderSocketConnected = connected;
  window.dispatchEvent(
    new CustomEvent('userSocketConnectionChange', {
      detail: { connected },
    }),
  );
};

/**
 * Hook for user to receive real-time order notifications.
 * Dispatches `orderStatusNotification` for order pages/cards.
 */
export const useUserNotifications = () => {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const cachedUserId = resolveUserIdFromStorage();
    if (cachedUserId) {
      setUserId(cachedUserId);
      return;
    }

    const fetchUserId = async () => {
      try {
        const response = await userAPI.getProfile();
        if (response.data?.success && response.data.data?.user) {
          const user = response.data.data.user;
          const id = user._id?.toString() || user.userId || user.id;
          if (id) setUserId(String(id));
        }
      } catch {
        // Not logged in or profile unavailable.
      }
    };

    fetchUserId();
  }, []);

  useEffect(() => {
    if (!API_BASE_URL || !String(API_BASE_URL).trim()) {
      setIsConnected(false);
      broadcastConnectionState(false);
      return;
    }

    if (!userId) return;

    let backendUrl = API_BASE_URL;
    try {
      backendUrl = new URL(backendUrl).origin;
    } catch {
      backendUrl = String(backendUrl || '')
        .replace(/\/api\/v\d+\/?$/i, '')
        .replace(/\/api\/?$/i, '')
        .replace(/\/+$/, '');
    }

    const token =
      localStorage.getItem('user_accessToken') ||
      localStorage.getItem('accessToken');
    if (!token) return;

    debugLog('Connecting to User Socket.IO:', backendUrl);

    socketRef.current = io(backendUrl, {
      path: '/socket.io/',
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      auth: { token },
    });

    socketRef.current.on('connect', () => {
      debugLog('User Socket connected, userId:', userId);
      setIsConnected(true);
      broadcastConnectionState(true);
    });

    socketRef.current.on('order_status_update', (data) => {
      debugLog('Order status update received:', data);

      const title = data.title || `Order #${data.orderId || 'Update'}`;
      const message =
        data.message ||
        `Your order status is now ${String(data.orderStatus || '').replace(/_/g, ' ')}`;
      const statusText = String(data?.orderStatus || data?.status || '').toLowerCase();
      const isCancellationStatus = statusText.includes('cancel');
      const incomingOrderKeys = [
        data?.orderMongoId,
        data?.orderId,
        data?.order_mongo_id,
        data?.order_id,
      ]
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean);

      let shouldSuppressCancelToast = false;
      if (isCancellationStatus && typeof window !== 'undefined') {
        const suppressMeta = window.__suppressUserCancelToast;
        const suppressAt = Number(suppressMeta?.at || 0);
        const suppressKeys = Array.isArray(suppressMeta?.keys)
          ? suppressMeta.keys.map((value) => String(value).trim()).filter(Boolean)
          : [];
        const withinSuppressWindow = Date.now() - suppressAt < 15000;
        const keyMatches = incomingOrderKeys.some((key) => suppressKeys.includes(key));
        shouldSuppressCancelToast = withinSuppressWindow && keyMatches;
        if (!withinSuppressWindow && suppressMeta) {
          delete window.__suppressUserCancelToast;
        }
      }

      const isImportant =
        isCancellationStatus ||
        ['ready_for_pickup', 'ready', 'confirmed'].includes(data.orderStatus);
      if (isImportant && !shouldSuppressCancelToast) {
        toast.message(title, {
          description: message,
          duration: 10000,
        });
      }

      window.dispatchEvent(
        new CustomEvent('orderStatusNotification', {
          detail: {
            orderMongoId: data.orderMongoId,
            orderId: data.orderId,
            status: data.orderStatus,
            orderStatus: data.orderStatus,
            title,
            message,
            deliveryState: data.deliveryState,
            deliveryVerification: data.deliveryVerification,
            timestamp: new Date().toISOString(),
          },
        }),
      );
    });

    socketRef.current.on('admin_notification', (payload) => {
      toast.message(payload?.title || 'Notification', {
        description: payload?.message || 'New broadcast notification received.',
        duration: 8000,
      });
      dispatchNotificationInboxRefresh();
    });

    socketRef.current.on('connect_error', () => {
      setIsConnected(false);
      broadcastConnectionState(false);
    });

    socketRef.current.on('disconnect', (reason) => {
      debugLog('Socket disconnected:', reason);
      setIsConnected(false);
      broadcastConnectionState(false);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      broadcastConnectionState(false);
    };
  }, [userId]);

  return { isConnected };
};
