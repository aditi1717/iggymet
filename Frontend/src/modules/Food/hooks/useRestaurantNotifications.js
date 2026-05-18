import { useCallback, useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { toast } from 'sonner';
import { API_BASE_URL } from '@food/api/config';
import { restaurantAPI } from '@food/api';
import alertSound from '@food/assets/audio/alert.mp3';
import { dispatchNotificationInboxRefresh } from '@food/hooks/useNotificationInbox';
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const storeRestaurantAdminNotification = (payload = {}) => {
  if (typeof window === 'undefined') return;
  const id = `admin-${payload?.ticketId || Date.now()}`;
  const item = {
    id,
    title: payload?.title || 'Notification',
    message: payload?.message || 'New notification received.',
    createdAt: payload?.createdAt || new Date().toISOString(),
    read: false,
    type: payload?.type || 'admin_notification',
  };

  try {
    const saved = localStorage.getItem('restaurant_admin_notifications');
    const current = saved ? JSON.parse(saved) : [];
    const rows = Array.isArray(current) ? current : [];
    const next = [item, ...rows.filter((row) => row?.id !== id)].slice(0, 100);
    localStorage.setItem('restaurant_admin_notifications', JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('restaurantNotificationsUpdated'));
  } catch {
    // Local notification cache is best-effort only.
  }
}

const resolveAudioSource = (source, cacheKey = 'restaurant-alert') => {
  if (!source) return source;
  if (!import.meta.env.DEV) return source;
  const separator = source.includes('?') ? '&' : '?';
  return `${source}${separator}devcache=${cacheKey}`;
}

const supportsBrowserNotifications = () =>
  typeof window !== 'undefined' && typeof Notification !== 'undefined';

const buildRestaurantOrderNotification = (orderData = {}) => {
  const orderId = orderData.orderId || orderData.orderMongoId || 'New';
  const itemCount = Array.isArray(orderData.items) ? orderData.items.length : 0;
  const total = Number(orderData.total || orderData.pricing?.total || 0);

  return {
    title: `New order #${orderId}`,
    body: itemCount > 0
      ? `${itemCount} item${itemCount === 1 ? '' : 's'} - ₹${total.toFixed(2)}`
      : 'A new order is waiting for review',
    tag: `restaurant-order-${orderId}`,
    data: {
      orderId,
      targetUrl: `/food/restaurant/orders/${orderData.orderMongoId || orderData._id || orderData.id || orderData.orderId || ''}`,
    },
  };
}

const triggerWebViewNativeNotification = async (orderData = {}) => {
  if (typeof window === 'undefined') return false;

  const bridgePayload = {
    title: 'New restaurant order',
    body: `Order #${orderData?.orderId || orderData?.orderMongoId || orderData?.id || ''}`.trim(),
    orderId: orderData?.orderId || orderData?.order_id || '',
    orderMongoId: orderData?.orderMongoId || orderData?.order_mongo_id || '',
    targetUrl: `/food/restaurant/orders/${orderData?.orderMongoId || orderData?._id || orderData?.id || orderData?.orderId || ''}`,
  };

  try {
    if (
      window.flutter_inappwebview &&
      typeof window.flutter_inappwebview.callHandler === 'function'
    ) {
      const handlerNames = [
        'playNotificationSound',
        'triggerNotificationFeedback',
        'onPushNotification',
      ];

      for (const handlerName of handlerNames) {
        try {
          const result = await window.flutter_inappwebview.callHandler(handlerName, bridgePayload);
          if (
            result === true ||
            result === 'true' ||
            result === 'ok' ||
            result === 'played' ||
            result?.handled === true ||
            result?.played === true ||
            result?.success === true
          ) {
            return true;
          }
        } catch {
          // Try next handler name.
        }
      }
    }
  } catch {
    // Ignore bridge failures and fall back to browser/web audio.
  }

  return false;
}


/**
 * Hook for restaurant to receive real-time order notifications with sound
 * @returns {object} - { newOrder, playSound, isConnected }
 */
export const useRestaurantNotifications = () => {
  const socketRef = useRef(null);
  const [newOrder, setNewOrder] = useState(null);
  const [cancelledOrderId, setCancelledOrderId] = useState(null);
  const [cancelledOrderInfo, setCancelledOrderInfo] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const audioRef = useRef(null);
  const activeOrderRef = useRef(null);
  const alertLoopTimerRef = useRef(null);
  const alertLoopStartedAtRef = useRef(0);
  const userInteractedRef = useRef(false); // Track user interaction for autoplay policy
  const audioUnlockAttemptedRef = useRef(false);
  const [restaurantId, setRestaurantId] = useState(null);
  const joinedRestaurantRoomRef = useRef(null);
  const lastConnectErrorLogRef = useRef(0);
  const lastAlertAtByOrderRef = useRef(new Map());
  const lastBrowserNotificationAtByOrderRef = useRef(new Map());
  const CONNECT_ERROR_LOG_THROTTLE_MS = 10000;
  const ALERT_LOOP_INTERVAL_MS = 4500;
  const ALERT_LOOP_MAX_MS = 120000;
  const ALERT_DEDUPE_MS = 15000;
  const BROWSER_NOTIFICATION_DEDUPE_MS = 20000;
  const NOTIFICATION_PERMISSION_ASKED_KEY = 'restaurant_notification_permission_asked';

  const getOrderAlertKey = (orderData = {}) => (
    String(
      orderData?.orderMongoId ||
      orderData?.order_mongo_id ||
      orderData?.orderId ||
      orderData?.order_id ||
      orderData?._id ||
      orderData?.id ||
      ''
    ).trim()
  );

  const getOrderKeys = (payload = {}) =>
    [
      payload?.orderMongoId,
      payload?.order_mongo_id,
      payload?.orderId,
      payload?.order_id,
      payload?._id,
      payload?.id,
      payload?.mongoId,
    ]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean);

  const hasMatchingOrderKey = (keys = [], payload = null) => {
    if (!payload || !Array.isArray(keys) || keys.length === 0) return false;
    const payloadKeys = getOrderKeys(payload);
    return payloadKeys.some((key) => keys.includes(key));
  };

  const dispatchOrderNoLongerPending = (orderData = null) => {
    if (typeof window === 'undefined' || !orderData) return;
    const orderKeys = getOrderKeys(orderData);
    if (orderKeys.length === 0) return;

    window.dispatchEvent(
      new CustomEvent('restaurantOrderStatusUpdated', {
        detail: {
          ...orderData,
          previousOrderStatus: orderData?.orderStatus || orderData?.status || '',
          orderStatus: 'processed',
          status: 'processed',
          orderKeys,
          message: 'Order is no longer waiting for restaurant review.',
          source: 'restaurant_pending_recovery',
        },
      }),
    );
  };

  const shouldProcessOrderAlert = (orderData = {}) => {
    const status = String(orderData?.orderStatus || orderData?.status || "").toLowerCase();
    if (status && status !== "created" && status !== "confirmed") return false;

    const key = getOrderAlertKey(orderData);
    if (!key) return true;
    const now = Date.now();
    const last = lastAlertAtByOrderRef.current.get(key) || 0;
    if (now - last < ALERT_DEDUPE_MS) return false;
    lastAlertAtByOrderRef.current.set(key, now);
    return true;
  };

  const shouldShowBrowserNotification = (orderData = {}) => {
    const key = getOrderAlertKey(orderData);
    if (!key) return true;
    const now = Date.now();
    const last = lastBrowserNotificationAtByOrderRef.current.get(key) || 0;
    if (now - last < BROWSER_NOTIFICATION_DEDUPE_MS) return false;
    lastBrowserNotificationAtByOrderRef.current.set(key, now);
    return true;
  };

  const showBackgroundOrderNotification = async (orderData) => {
    if (!shouldShowBrowserNotification(orderData)) {
      return;
    }

    if (!supportsBrowserNotifications() || Notification.permission !== 'granted') {
      return;
    }

    const notificationOptions = buildRestaurantOrderNotification(orderData);

    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.showNotification(notificationOptions.title, {
            body: notificationOptions.body,
            tag: notificationOptions.tag,
            renotify: true,
            requireInteraction: true,
            silent: false,
            vibrate: [200, 100, 200, 100, 300],
            icon: '/favicon.ico',
            data: notificationOptions.data,
          });
          return;
        }
      }

      new Notification(notificationOptions.title, {
        body: notificationOptions.body,
        tag: notificationOptions.tag,
        requireInteraction: true,
        silent: false,
        icon: '/favicon.ico',
        data: notificationOptions.data,
      });
    } catch (error) {
      debugWarn('Error showing background restaurant notification:', error);
    }
  };

  const stopAlertLoop = () => {
    if (alertLoopTimerRef.current) {
      clearInterval(alertLoopTimerRef.current);
      alertLoopTimerRef.current = null;
    }
    alertLoopStartedAtRef.current = 0;
  };

  const startAlertLoop = () => {
    stopAlertLoop();
    alertLoopStartedAtRef.current = Date.now();

    alertLoopTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - alertLoopStartedAtRef.current;
      if (elapsed >= ALERT_LOOP_MAX_MS || !activeOrderRef.current) {
        stopAlertLoop();
        return;
      }

      // Keep re-alerting while order is pending and tab is not visible.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        playNotificationSound(activeOrderRef.current);
      }
    }, ALERT_LOOP_INTERVAL_MS);
  };

  const handleIncomingOrderAlert = useCallback((orderData) => {
    if (!shouldProcessOrderAlert(orderData)) {
      return;
    }

    activeOrderRef.current = orderData || { id: Date.now() };
    playNotificationSound(orderData);
    startAlertLoop();

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      showBackgroundOrderNotification(orderData);
    }
  }, []);

  const recoverRestaurantState = useCallback(async () => {
    if (!restaurantId) return;

    try {
      const response = await restaurantAPI.getOrders({ page: 1, limit: 30 });
      const rows =
        response?.data?.data?.orders ||
        response?.data?.data?.data?.orders ||
        [];

      const pendingReview = (rows || [])
        .filter((o) => {
          const status = String(o?.orderStatus || o?.status || "").toLowerCase();
          return status === "created" || status === "confirmed";
        })
        .sort((a, b) => {
          const at = a?.updatedAt || a?.createdAt || 0;
          const bt = b?.updatedAt || b?.createdAt || 0;
          return new Date(bt).getTime() - new Date(at).getTime();
        });

      const pendingOrderKeys = Array.from(
        new Set(
          pendingReview
            .flatMap((order) => getOrderKeys(order))
            .filter(Boolean),
        ),
      );

      if (activeOrderRef.current && !hasMatchingOrderKey(pendingOrderKeys, activeOrderRef.current)) {
        dispatchOrderNoLongerPending(activeOrderRef.current);
        stopAlertLoop();
        activeOrderRef.current = null;
      }

      if (pendingReview.length === 0) {
        setNewOrder((prev) => {
          if (prev) dispatchOrderNoLongerPending(prev);
          return prev ? null : prev;
        });
        return;
      }

      const latestPendingOrder = pendingReview[0];
      setNewOrder((prev) => {
        if (prev && hasMatchingOrderKey(pendingOrderKeys, prev)) {
          return prev;
        }
        if (prev) dispatchOrderNoLongerPending(prev);
        return latestPendingOrder;
      });
      pendingReview.slice(0, 5).forEach((order) => handleIncomingOrderAlert(order));
    } catch (error) {
      debugWarn('Restaurant recovery sync failed:', error?.message || error);
    }
  }, [restaurantId, handleIncomingOrderAlert]);

  const joinRestaurantRoomIfPossible = useCallback(() => {
    if (!socketRef.current?.connected || !restaurantId) {
      return false;
    }

    if (joinedRestaurantRoomRef.current === restaurantId) {
      return true;
    }

    debugLog('Joining restaurant room', {
      restaurantId,
      socketId: socketRef.current?.id,
    });
    socketRef.current.emit('join-restaurant', restaurantId);
    joinedRestaurantRoomRef.current = restaurantId;
    return true;
  }, [restaurantId]);

  // Get restaurant ID only when restaurant is approved and accepting orders.
  useEffect(() => {
    const fetchRestaurantId = async () => {
      try {
        const response = await restaurantAPI.getCurrentRestaurant();
        if (response.data?.success && response.data.data?.restaurant) {
          const restaurant = response.data.data.restaurant;
          const isEligible =
            String(restaurant?.status || '').toLowerCase() === 'approved' &&
            restaurant?.isAcceptingOrders === true;
          if (!isEligible) {
            stopAlertLoop();
            activeOrderRef.current = null;
            setNewOrder(null);
            setRestaurantId(null);
            if (socketRef.current) {
              socketRef.current.disconnect();
            }
            return;
          }
          const id = restaurant._id?.toString() || restaurant.restaurantId;
          setRestaurantId(id);
        }
      } catch (error) {
        debugError('Error fetching restaurant:', error);
      }
    };
    fetchRestaurantId();

    const handleOnlineStatusChanged = (event) => {
      const isOnline = event?.detail?.isOnline === true;
      if (!isOnline) {
        stopAlertLoop();
        activeOrderRef.current = null;
        setNewOrder(null);
        setRestaurantId(null);
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
        return;
      }
      fetchRestaurantId();
    };

    window.addEventListener('restaurantOnlineStatusChanged', handleOnlineStatusChanged);
    return () => {
      window.removeEventListener('restaurantOnlineStatusChanged', handleOnlineStatusChanged);
    };
  }, []);

  // Reliability fallback:
  // If Socket.IO fails (expired jwt / missing token / room join failed),
  // we still fetch restaurant orders from REST periodically and trigger the same
  // alert flow. This prevents "restaurant didn't receive the order" cases.
  useEffect(() => {
    if (!restaurantId) return;

    const ALERT_POLL_MS = isConnected ? 30000 : 12000; // 12s if disconnected, 30s if connected
    let isCancelled = false;

    const pollOrders = async () => {
      if (isCancelled) return;

      try {
        await recoverRestaurantState();
      } catch (error) {
        // Non-blocking: keep polling.
      }
    };

    // Initial poll immediately.
    pollOrders();
    const intervalId = setInterval(pollOrders, ALERT_POLL_MS);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [restaurantId, recoverRestaurantState, isConnected]);

  useEffect(() => {
    if (!supportsBrowserNotifications()) return;

    if (Notification.permission !== 'default') return;
    if (localStorage.getItem(NOTIFICATION_PERMISSION_ASKED_KEY) === 'true') return;

    const requestPermissionOnce = async () => {
      localStorage.setItem(NOTIFICATION_PERMISSION_ASKED_KEY, 'true');
      try {
        await Notification.requestPermission();
      } catch (error) {
        debugWarn('Failed to request restaurant notification permission:', error);
      }
    };

    const askOnInteraction = () => {
      requestPermissionOnce();
      window.removeEventListener('pointerdown', askOnInteraction);
      window.removeEventListener('keydown', askOnInteraction);
    };

    window.addEventListener('pointerdown', askOnInteraction, { once: true, passive: true });
    window.addEventListener('keydown', askOnInteraction, { once: true });

    return () => {
      window.removeEventListener('pointerdown', askOnInteraction);
      window.removeEventListener('keydown', askOnInteraction);
    };
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (typeof document === 'undefined') return;

      if (document.visibilityState === 'hidden') {
        if (!activeOrderRef.current) return;
        playNotificationSound(activeOrderRef.current);
        showBackgroundOrderNotification(activeOrderRef.current);
        return;
      }

      if (!socketRef.current?.connected) {
        socketRef.current?.connect();
      }
      joinRestaurantRoomIfPossible();
      void recoverRestaurantState();
    };

    const onWindowFocus = () => {
      if (!socketRef.current?.connected) {
        socketRef.current?.connect();
      }
      joinRestaurantRoomIfPossible();
      void recoverRestaurantState();
    };

    const onPageShow = () => {
      if (!socketRef.current?.connected) {
        socketRef.current?.connect();
      }
      joinRestaurantRoomIfPossible();
      void recoverRestaurantState();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onWindowFocus);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [joinRestaurantRoomIfPossible, recoverRestaurantState]);

  useEffect(() => {
    if (!API_BASE_URL || !String(API_BASE_URL).trim()) {
      setIsConnected(false);
      return;
    }
    if (!restaurantId) {
      debugLog('? Waiting for restaurantId...');
      return;
    }

    // Normalize backend URL - use simpler, more robust approach
    let backendUrl = API_BASE_URL;
    
    // Step 1: Extract protocol and hostname using URL parsing if possible
    try {
      const urlObj = new URL(backendUrl);
      // Remove /api from pathname
      let pathname = urlObj.pathname.replace(/^\/api\/?$/, '');
      // Reconstruct clean URL
      backendUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? `:${urlObj.port}` : ''}${pathname}`;
    } catch (e) {
      // If URL parsing fails, use regex-based normalization
      // Remove /api suffix first
      backendUrl = backendUrl.replace(/\/api\/?$/, '');
      backendUrl = backendUrl.replace(/\/+$/, ''); // Remove trailing slashes
      
      // Normalize protocol - ensure exactly two slashes after protocol
      // Fix patterns: https:/, https:///, https://https://
      if (backendUrl.startsWith('https:') || backendUrl.startsWith('http:')) {
        // Extract protocol
        const protocolMatch = backendUrl.match(/^(https?):/i);
        if (protocolMatch) {
          const protocol = protocolMatch[1].toLowerCase();
          // Remove everything up to and including the first valid domain part
          const afterProtocol = backendUrl.substring(protocol.length + 1);
          // Remove leading slashes
          const cleanPath = afterProtocol.replace(/^\/+/, '');
          // Reconstruct with exactly two slashes
          backendUrl = `${protocol}://${cleanPath}`;
        }
      }
    }
    
    // Final cleanup: ensure exactly two slashes after protocol
    backendUrl = backendUrl.replace(/^(https?):\/+/gi, '$1://');
    backendUrl = backendUrl.replace(/\/+$/, ''); // Remove trailing slashes
    
    // CRITICAL: Check for localhost in production BEFORE creating socket
    // Detect production environment more reliably
    const frontendHostname = window.location.hostname;
    const isLocalhost = frontendHostname === 'localhost' || 
                        frontendHostname === '127.0.0.1' ||
                        frontendHostname === '';
    const isProductionBuild = import.meta.env.MODE === 'production' || import.meta.env.PROD;
    // Production deployment: not localhost AND (HTTPS OR has domain name with dots)
    const isProductionDeployment = !isLocalhost && (
      window.location.protocol === 'https:' || 
      (frontendHostname.includes('.') && !frontendHostname.startsWith('192.168.') && !frontendHostname.startsWith('10.'))
    );
    
    // If backend URL is localhost but we're not running locally, BLOCK connection
    const backendIsLocalhost = backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');
    // Block if: backend is localhost AND (production build OR production deployment)
    // Allow if: frontend is also localhost (development scenario)
    const shouldBlockConnection = backendIsLocalhost && (isProductionBuild || isProductionDeployment) && !isLocalhost;
    
    if (shouldBlockConnection) {
      // Try to infer backend URL from frontend URL (common pattern: api.domain.com or domain.com/api)
      const frontendHost = window.location.hostname;
      const frontendProtocol = window.location.protocol;
      let suggestedBackendUrl = null;
      
      // Common patterns:
      // - If frontend is on foods.appzeto.com, backend might be api.foods.appzeto.com or foods.appzeto.com
      if (frontendHost.includes('foods.appzeto.com')) {
        suggestedBackendUrl = `${frontendProtocol}//api.foods.appzeto.com/api`;
      } else if (frontendHost.includes('appzeto.com')) {
        suggestedBackendUrl = `${frontendProtocol}//api.${frontendHost}/api`;
      }
      
      debugError('? CRITICAL: BLOCKING Socket.IO connection to localhost!');
      debugError('Backend connectivity disabled (UI-only mode).');
      debugError('?? Current backendUrl:', backendUrl);
      debugError('?? Current API_BASE_URL:', API_BASE_URL);
      debugError('?? Frontend hostname:', frontendHost);
      debugError('?? Frontend protocol:', frontendProtocol);
      debugError('?? Is production build:', isProductionBuild);
      debugError('?? Is production deployment:', isProductionDeployment);
      debugError('?? Backend is localhost:', backendIsLocalhost);
      if (suggestedBackendUrl) {
        debugError('?? Suggested backend URL:', suggestedBackendUrl);
      } else {
        debugError('?? Backend URL config is disabled in this build.');
      }
      debugError('?? Backend URL config is disabled in this build.');
      
      // Clean up any existing socket connection
      if (socketRef.current) {
        debugLog('?? Cleaning up existing socket connection...');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      
      // Don't try to connect to localhost in production - it will fail
      setIsConnected(false);
      return; // CRITICAL: Exit early to prevent socket creation
    }
    
    // Validate backend URL format
    if (!backendUrl || !backendUrl.startsWith('http')) {
      debugError('? CRITICAL: Invalid backend URL format:', backendUrl);
      debugError('?? API_BASE_URL:', API_BASE_URL);
      debugError('?? Expected format: https://your-domain.com or ');
      setIsConnected(false);
      return; // Don't try to connect with invalid URL
    }
    
    // Construct Socket.IO URL
    // IMPORTANT: Socket.IO server is on the origin (not /api/v1).
    // Our API baseURL is typically like: http://localhost:5000/api/v1
    // So for sockets we always connect to: http://localhost:5000
    let socketOrigin = backendUrl;
    try {
      socketOrigin = new URL(backendUrl).origin;
    } catch {
      socketOrigin = String(backendUrl || "")
        .replace(/\/api\/v\d+\/?$/i, "")
        .replace(/\/api\/?$/i, "")
        .replace(/\/+$/, "");
    }

    // Backend uses default namespace; rooms handle role separation.
    const socketUrl = `${socketOrigin}`;
    
    // Validate socket URL format
    try {
      const urlTest = new URL(socketUrl); // This will throw if URL is invalid
      // Additional validation: ensure it's not localhost in production
      if ((isProductionBuild || isProductionDeployment) && (urlTest.hostname === 'localhost' || urlTest.hostname === '127.0.0.1')) {
        debugError('? CRITICAL: Socket URL contains localhost in production!');
        debugError('?? Socket URL:', socketUrl);
        debugError('?? This should have been caught earlier, but blocking anyway');
        setIsConnected(false);
        return;
      }
    } catch (urlError) {
      debugError('? CRITICAL: Invalid Socket.IO URL:', socketUrl);
      debugError('?? URL validation error:', urlError.message);
      debugError('?? Backend URL:', backendUrl);
      debugError('?? API_BASE_URL:', API_BASE_URL);
      setIsConnected(false);
      return; // Don't try to connect with invalid URL
    }
    
    debugLog('?? Attempting to connect to Socket.IO:', socketUrl);
    debugLog('?? Backend URL:', backendUrl);
    debugLog('?? API_BASE_URL:', API_BASE_URL);
    debugLog('?? Restaurant ID:', restaurantId);
    debugLog('?? Environment:', import.meta.env.MODE);
    debugLog('?? Is Production Build:', isProductionBuild);
    debugLog('?? Is Production Deployment:', isProductionDeployment);

    // Initialize socket connection (default namespace).
    // Prefer WebSocket for immediate alerts, with polling fallback for restricted networks.
    socketRef.current = io(socketUrl, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      upgrade: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 20,
      timeout: 20000,
      forceNew: true,
      autoConnect: true,
      auth: {
        token: localStorage.getItem('restaurant_accessToken') || localStorage.getItem('accessToken')
      }
    });

    socketRef.current.on('connect', () => {
      debugLog('? Restaurant Socket connected, restaurantId:', restaurantId);
      debugLog('? Socket ID:', socketRef.current.id);
      debugLog('? Socket URL:', socketUrl);
      setIsConnected(true);
      joinedRestaurantRoomRef.current = null;
      
      // Join restaurant room immediately after connection with retry
      if (restaurantId) {
        const joinRoom = () => {
          debugLog('?? Joining restaurant room with ID:', restaurantId);
          socketRef.current.emit('join-restaurant', restaurantId);
          joinedRestaurantRoomRef.current = restaurantId;
          
          // Retry join after 2 seconds if no confirmation received
          setTimeout(() => {
            if (socketRef.current?.connected) {
              debugLog('?? Retrying restaurant room join...');
              socketRef.current.emit('join-restaurant', restaurantId);
              joinedRestaurantRoomRef.current = restaurantId;
            }
          }, 2000);
        };
        
        joinRoom();
        void recoverRestaurantState();
      } else {
        debugWarn('?? Cannot join restaurant room: restaurantId is missing');
      }
    });

    // Listen for room join confirmation
    socketRef.current.on('restaurant-room-joined', (data) => {
      debugLog('? Restaurant room joined successfully:', data);
      debugLog('? Room:', data?.room);
      debugLog('? Restaurant ID in room:', data?.restaurantId);
      joinedRestaurantRoomRef.current = data?.restaurantId || restaurantId;
    });

    // Listen for connection errors (throttle logs to avoid console spam on reconnect loops)
    socketRef.current.on('connect_error', (error) => {
      const now = Date.now();
      const shouldLog = now - lastConnectErrorLogRef.current >= CONNECT_ERROR_LOG_THROTTLE_MS;
      if (shouldLog) {
        lastConnectErrorLogRef.current = now;
        const isTransportError = error.type === 'TransportError' || error.message?.includes('xhr poll error');
        debugWarn(
          'Restaurant Socket:',
          isTransportError
            ? `Cannot reach backend at ${backendUrl}. Ensure the backend is running (e.g. npm run dev in backend).`
            : error.message
        );
        if (!isTransportError) {
          debugWarn('Details:', { type: error.type, socketUrl, backendUrl });
        }
      }
      if (error.message?.includes('CORS') || error.message?.includes('Not allowed')) {
        debugWarn('?? Add frontend URL to CORS_ORIGIN in backend .env');
      }
      setIsConnected(false);
    });

    // Listen for disconnection
    socketRef.current.on('disconnect', (reason) => {
      debugLog('? Restaurant Socket disconnected:', reason);
      setIsConnected(false);
      joinedRestaurantRoomRef.current = null;
      
      if (reason === 'io server disconnect') {
        // Server disconnected the socket, reconnect manually
        socketRef.current.connect();
      }
    });

    // Listen for reconnection attempts
    socketRef.current.on('reconnect_attempt', (attemptNumber) => {
      debugLog(`?? Reconnection attempt ${attemptNumber}...`);
    });

    // Listen for successful reconnection
    socketRef.current.on('reconnect', (attemptNumber) => {
      debugLog(`? Reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
      joinedRestaurantRoomRef.current = null;
      
      // Rejoin restaurant room after reconnection
      if (restaurantId) {
        socketRef.current.emit('join-restaurant', restaurantId);
        joinedRestaurantRoomRef.current = restaurantId;
      }
      void recoverRestaurantState();
    });

    // Listen for new order notifications
    socketRef.current.on('new_order', (orderData) => {
      debugLog('?? New order received:', orderData);
      setNewOrder(orderData);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('restaurantNewOrderReceived', {
            detail: orderData || {},
          }),
        );
      }

      handleIncomingOrderAlert(orderData);
    });

    // Listen for sound notification event
    socketRef.current.on('play_notification_sound', (data) => {
      debugLog('?? Sound notification:', data);
      const normalizedData = {
        orderId: data?.orderId || data?.order_id,
        orderMongoId: data?.orderMongoId || data?.order_mongo_id,
        ...data
      };
      if (normalizedData?.orderId || normalizedData?.orderMongoId) {
        setNewOrder((prev) => prev || normalizedData);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('restaurantNewOrderReceived', {
              detail: normalizedData,
            }),
          );
        }
      }
      // Force immediate buzz for notification events, even if dedupe would skip.
      activeOrderRef.current = normalizedData || { id: Date.now() };
      playNotificationSound(normalizedData);
      startAlertLoop();
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        showBackgroundOrderNotification(normalizedData);
      }
      handleIncomingOrderAlert(normalizedData);
    });

    // Listen for order status updates
    socketRef.current.on('order_status_update', (data) => {
      debugLog('?? Order status update:', data);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('restaurantOrderStatusUpdated', {
            detail: data || {},
          }),
        );
      }
      const status = String(data?.orderStatus || data?.status || '').toLowerCase();
      const eventOrderKeys = getOrderKeys(data);
      if (status.includes('cancel')) {
        const orderKeys = eventOrderKeys;
        const primaryOrderId = orderKeys[0] || '';
        if (primaryOrderId) {
          const cancelledByRaw = String(
            data?.cancelledBy ||
            data?.cancellationBy ||
            data?.updatedByRole ||
            data?.actor ||
            ''
          ).toLowerCase();
          let cancelledBy = 'unknown';
          if (cancelledByRaw.includes('customer') || cancelledByRaw.includes('user')) cancelledBy = 'user';
          else if (cancelledByRaw.includes('restaurant') || cancelledByRaw.includes('seller')) cancelledBy = 'restaurant';
          else if (cancelledByRaw.includes('admin')) cancelledBy = 'admin';

          setCancelledOrderId(primaryOrderId);
          setCancelledOrderInfo({
            orderId: primaryOrderId,
            orderKeys,
            cancelledBy,
            title: data?.title || '',
            message: data?.message || '',
          });
        }
      }

      // If order is no longer waiting for restaurant review, immediately clear
      // the active new-order notification for the same order.
      const isPendingReviewStatus = status === 'created' || status === 'confirmed';
      if (eventOrderKeys.length > 0 && status && !isPendingReviewStatus) {
        if (activeOrderRef.current) {
          const activeOrderKeys = getOrderKeys(activeOrderRef.current);
          const matchesActive = activeOrderKeys.some((key) =>
            eventOrderKeys.includes(key),
          );
          if (matchesActive) {
            stopAlertLoop();
            activeOrderRef.current = null;
          }
        }

        setNewOrder((prev) => {
          if (!prev) return prev;
          const prevOrderKeys = getOrderKeys(prev);
          const matchesCurrent = prevOrderKeys.some((key) =>
            eventOrderKeys.includes(key),
          );
          return matchesCurrent ? null : prev;
        });
      }
    });

    // Listen for specialized order cancellation events
    socketRef.current.on('order_cancelled', (data) => {
      debugLog('?? Order cancelled event received:', data);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('restaurantOrderStatusUpdated', {
            detail: { ...data, status: 'cancelled' },
          }),
        );
      }
      
      const eventOrderKeys = getOrderKeys(data);
      if (eventOrderKeys.length > 0) {
        if (activeOrderRef.current) {
          const activeOrderKeys = getOrderKeys(activeOrderRef.current);
          const matchesActive = activeOrderKeys.some((key) =>
            eventOrderKeys.includes(key),
          );
          if (matchesActive) {
            stopAlertLoop();
            activeOrderRef.current = null;
          }
        }

        setNewOrder((prev) => {
          if (!prev) return prev;
          const prevOrderKeys = getOrderKeys(prev);
          const matchesCurrent = prevOrderKeys.some((key) =>
            eventOrderKeys.includes(key),
          );
          return matchesCurrent ? null : prev;
        });

        // Also set cancelled order info for toasts/banners
        const primaryOrderId = eventOrderKeys[0] || '';
        if (primaryOrderId) {
          setCancelledOrderId(primaryOrderId);
          setCancelledOrderInfo({
            orderId: primaryOrderId,
            orderKeys: eventOrderKeys,
            cancelledBy: 'user', // Default to user if from order_cancelled
            title: data?.title || 'Order Cancelled',
            message: data?.message || 'Order has been cancelled by the user',
          });
        }
      }
    });

    socketRef.current.on('admin_notification', (payload) => {
      debugLog('?? Admin broadcast received:', payload);
      toast.message(payload?.title || 'Notification', {
        description: payload?.message || 'New notification received.',
        duration: 8000,
      });
      storeRestaurantAdminNotification(payload);
      dispatchNotificationInboxRefresh();
    });

    const handleAuthChange = () => {
      const newToken = localStorage.getItem('restaurant_accessToken') || localStorage.getItem('accessToken');
      if (socketRef.current && newToken) {
        socketRef.current.auth.token = newToken;
        if (!socketRef.current.connected) {
          socketRef.current.connect();
        }
      }
    };

    const handleAuthRefreshed = (e) => {
      if (e.detail?.module === 'restaurant' && socketRef.current && e.detail.token) {
        socketRef.current.auth.token = e.detail.token;
        if (!socketRef.current.connected) {
          socketRef.current.connect();
        }
      }
    };

    window.addEventListener('restaurantAuthChanged', handleAuthChange);
    window.addEventListener('authRefreshed', handleAuthRefreshed);

    // Load notification sound
    audioRef.current = new Audio(resolveAudioSource(alertSound));
    audioRef.current.preload = 'auto';
    audioRef.current.volume = 1;

    return () => {
      stopAlertLoop();
      joinedRestaurantRoomRef.current = null;
      window.removeEventListener('restaurantAuthChanged', handleAuthChange);
      window.removeEventListener('authRefreshed', handleAuthRefreshed);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [restaurantId, recoverRestaurantState]);

  useEffect(() => {
    if (!restaurantId) {
      return;
    }

    joinRestaurantRoomIfPossible();

    if (socketRef.current?.connected) {
      void recoverRestaurantState();
    }
  }, [restaurantId, joinRestaurantRoomIfPossible, recoverRestaurantState]);

  // Track user interaction for autoplay policy
  useEffect(() => {
    const handleUserInteraction = async () => {
      userInteractedRef.current = true;

      if (!audioRef.current) {
        audioRef.current = new Audio(resolveAudioSource(alertSound));
        audioRef.current.preload = 'auto';
        audioRef.current.volume = 1;
      }

      if (!audioUnlockAttemptedRef.current && audioRef.current) {
        audioUnlockAttemptedRef.current = true;
        try {
          audioRef.current.muted = true;
          await audioRef.current.play();
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } catch (error) {
          audioUnlockAttemptedRef.current = false;
          if (!error.message?.includes('user didn\'t interact') && !error.name?.includes('NotAllowedError')) {
            debugWarn('Error unlocking notification sound:', error);
          }
        } finally {
          // Ensure audio never remains muted after unlock attempts.
          if (audioRef.current) {
            audioRef.current.muted = false;
          }
        }
      }

      // Remove listeners after first interaction
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      window.removeEventListener('pointerdown', handleUserInteraction);
    };
    
    // Listen for user interaction
    document.addEventListener('click', handleUserInteraction, { once: true });
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
    document.addEventListener('keydown', handleUserInteraction, { once: true });
    window.addEventListener('pointerdown', handleUserInteraction, { once: true, passive: true });
    
    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      window.removeEventListener('pointerdown', handleUserInteraction);
    };
  }, []);

  const playNotificationSound = async (orderData = {}) => {
    try {
      await triggerWebViewNativeNotification(orderData);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([200, 100, 200, 100, 300]);
      }

      if (audioRef.current) {
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(error => {
          // Don't log autoplay policy errors as they're expected
          if (!error.message?.includes('user didn\'t interact') && !error.name?.includes('NotAllowedError')) {
            debugWarn('Error playing notification sound:', error);
            // Fallback: try one-shot audio instance (more reliable in background tabs on some browsers)
            try {
              const fallbackAudio = new Audio(resolveAudioSource(alertSound, `restaurant-alert-${Date.now()}`));
              fallbackAudio.volume = 1;
              fallbackAudio.play().catch(() => {});
            } catch (fallbackError) {
              debugWarn('Fallback audio playback failed:', fallbackError);
            }
          }
        });
      }
    } catch (error) {
      // Don't log autoplay policy errors
      if (!error.message?.includes('user didn\'t interact') && !error.name?.includes('NotAllowedError')) {
        debugWarn('Error playing sound:', error);
      }
    }
  };

  const clearNewOrder = () => {
    stopAlertLoop();
    activeOrderRef.current = null;
    setNewOrder(null);
  };

  const clearCancelledOrderId = () => {
    setCancelledOrderId(null);
    setCancelledOrderInfo(null);
  };

  return {
    newOrder,
    clearNewOrder,
    cancelledOrderId,
    cancelledOrderInfo,
    clearCancelledOrderId,
    isConnected,
    playNotificationSound
  };
};



