import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { UtensilsCrossed, ChevronRight, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BRAND_THEME from "@/config/brandTheme";

const CookingAnimation = memo(() => (
  <div className="relative w-12 h-12 flex items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-900/30 overflow-visible shadow-[0_4px_15px_rgba(41,121,251,0.16)] dark:shadow-none shrink-0">
    <div className="absolute -top-3 flex gap-1.5">
      <motion.div animate={{ opacity: [0, 0.8, 0], y: [0, -8, -12], scale: [0.8, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0, ease: "easeOut" }} className="w-1.5 h-3 bg-brand-400/60 rounded-full blur-[1px]" />
      <motion.div animate={{ opacity: [0, 0.8, 0], y: [0, -10, -15], scale: [0.8, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.5, ease: "easeOut" }} className="w-1.5 h-3 bg-brand-400/60 rounded-full blur-[1px]" />
      <motion.div animate={{ opacity: [0, 0.8, 0], y: [0, -8, -12], scale: [0.8, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity, delay: 1, ease: "easeOut" }} className="w-1.5 h-3 bg-brand-400/60 rounded-full blur-[1px]" />
    </div>
    <motion.div animate={{ rotate: [-2, 2, -2] }} transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }} className="relative z-10 mt-1">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-sm" style={{ color: BRAND_THEME.colors.brand.primary }}>
        {/* Cooker Body */}
        <path d="M6 10h12v6a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4v-6z" />
        {/* Lid Rim */}
        <rect x="5" y="8" width="14" height="2" rx="1" />
        {/* Pressure Whistle (Top) */}
        <path d="M12 8V5" />
        <path d="M11 5h2v2h-2z" fill="currentColor" />
        {/* Main Handle (Right) */}
        <path d="M19 9l3-1v2l-3 1" fill="currentColor" strokeWidth="1" />
        {/* Sub Handle (Left) */}
        <path d="M5 10H3v2h2" />
      </svg>
    </motion.div>
    {/* Flame below */}
    <motion.div animate={{ opacity: [0.4, 0.8, 0.4], scaleX: [0.8, 1.2, 0.8] }} transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-0 w-full flex justify-center z-0">
      <div className="w-4 h-1 blur-[2px] rounded-full" style={{ backgroundColor: BRAND_THEME.colors.brand.primary }} />
    </motion.div>
  </div>
));

import { useOrders } from "@food/context/OrdersContext";
import { orderAPI } from "@food/api";

const getOrderKey = (order) => order?.orderId || order?._id || order?.id || null;
const getOrderRouteId = (order) => order?.mongoId || order?._id || order?.id || order?.orderId || null;
const getCustomerToken = () =>
  localStorage.getItem("auth_customer") ||
  localStorage.getItem("user_accessToken") ||
  localStorage.getItem("accessToken") ||
  null;

const getOrderStatus = (order) =>
  String(order?.orderStatus || order?.status || order?.deliveryState?.status || "").toLowerCase();

const getOrderPhase = (order) =>
  String(order?.deliveryState?.currentPhase || "").toLowerCase();

const ACTIVE_PHASES = new Set([
  "created",
  "confirmed",
  "preparing",
  "accepted",
  "ready",
  "ready_for_pickup",
  "reached_pickup",
  "picked_up",
  "out_for_delivery",
  "en_route_to_delivery",
  "at_pickup",
  "at_drop",
]);

/** Orders that should show the live tracking strip (any in-flight order, not terminal). */
const TERMINAL_STATUSES = new Set([
  "delivered",
  "cancelled",
  "completed",
  "failed",
  "cancelled_by_user",
  "cancelled_by_restaurant",
  "cancelled_by_admin",
]);

const isActiveOrder = (order) => {
  if (!order) return false;
  const status = getOrderStatus(order);
  const phase = getOrderPhase(order);
  if (TERMINAL_STATUSES.has(status)) return false;
  if (phase === "completed" || phase === "delivered") return false;
  // Some refresh payloads provide live phase but sparse status; keep tracking visible.
  if (!status && phase) return ACTIVE_PHASES.has(phase);
  if (!status) return false;
  return true;
};

const getTimeRemaining = (order) => {
  if (!order) return null;

  const orderTime = new Date(
    order.createdAt || order.orderDate || order.created_at || order.date || Date.now(),
  );
  const estimatedMinutes =
    order.estimatedDeliveryTime ||
    order.estimatedTime ||
    order.estimated_delivery_time ||
    35;
  const deliveryTime = new Date(orderTime.getTime() + estimatedMinutes * 60000);
  return Math.max(0, Math.floor((deliveryTime - new Date()) / 60000));
};

/** Cheap fingerprint so we skip setState when list content is unchanged (fewer re-renders). */
function ordersFingerprint(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return "";
  return orders
    .map((o) => `${getOrderKey(o)}:${getOrderStatus(o)}`)
    .join("|");
}

function OrderTrackingCardInner({ hasBottomNav = true }) {
  const navigate = useNavigate();
  const { orders: contextOrders } = useOrders();
  const hasCustomerAuth = !!getCustomerToken();
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [apiOrders, setApiOrders] = useState([]);
  const [hasFetchedApi, setHasFetchedApi] = useState(false);
  const [activeOrderOverride, setActiveOrderOverride] = useState(null);
  const lastRefreshRef = useRef(0);
  const lastApiFingerprintRef = useRef("");
  const activeOrderKeyRef = useRef("");
  const activeOrderSnapshotRef = useRef(null);
  const [invalidOrderIds, setInvalidOrderIds] = useState(new Set());

  const fetchOrders = useCallback(async () => {
    if (!getCustomerToken()) {
      if (lastApiFingerprintRef.current !== "") {
        lastApiFingerprintRef.current = "";
        setApiOrders([]);
      }
      setHasFetchedApi(true);
      return;
    }
    try {
      const response = await orderAPI.getOrders({ limit: 10, page: 1 });
      let nextOrders = [];

      if (response?.data?.success && response?.data?.data?.orders) {
        nextOrders = response.data.data.orders;
      } else if (response?.data?.orders) {
        nextOrders = response.data.orders;
      } else if (response?.data?.data?.data && Array.isArray(response.data.data.data)) {
        nextOrders = response.data.data.data;
      } else if (response?.data?.data?.docs && Array.isArray(response.data.data.docs)) {
        nextOrders = response.data.data.docs;
      } else if (response?.data?.data && Array.isArray(response.data.data)) {
        nextOrders = response.data.data;
      }

      const list = Array.isArray(nextOrders) ? nextOrders : [];
      const fp = ordersFingerprint(list);
      if (fp !== lastApiFingerprintRef.current) {
        lastApiFingerprintRef.current = fp;
        setApiOrders(list);
      }
    } catch (error) {
      if (lastApiFingerprintRef.current !== "") {
        lastApiFingerprintRef.current = "";
        setApiOrders([]);
      }
    } finally {
      setHasFetchedApi(true);
    }
  }, []);

  useEffect(() => {
    if (!hasCustomerAuth) return;
    fetchOrders();
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders, hasCustomerAuth]);

  const uniqueOrders = useMemo(() => {
    const isMongoObjectId = (value) => /^[a-f0-9]{24}$/i.test(String(value || ""));
    const serverKeys = new Set(
      (apiOrders || []).map((o) => String(getOrderKey(o) || "")).filter(Boolean),
    );
    const seen = new Set();

    return [...apiOrders, ...contextOrders].filter((order) => {
      const key = getOrderKey(order);
      if (!key || seen.has(key)) {
        return false;
      }
      if (invalidOrderIds.has(key)) {
        return false;
      }
      // After first API sync, ignore stale local Mongo-like ids that are absent server-side.
      // This prevents repeated verification calls for already-deleted orders.
      if (
        hasFetchedApi &&
        isMongoObjectId(key) &&
        !serverKeys.has(String(key))
      ) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [contextOrders, apiOrders, invalidOrderIds, hasFetchedApi]);

  const activeOrder = useMemo(() => {
    const candidate = uniqueOrders.find((order) => isActiveOrder(order)) || null;
    if (!candidate) return null;
    const overrideKey = getOrderKey(activeOrderOverride);
    const candidateKey = getOrderKey(candidate);
    if (overrideKey && candidateKey && overrideKey === candidateKey) return activeOrderOverride;
    return candidate;
  }, [uniqueOrders, activeOrderOverride]);

  useEffect(() => {
    const key = String(getOrderKey(activeOrder) || "");
    activeOrderKeyRef.current = key;
    activeOrderSnapshotRef.current = activeOrder;
  }, [activeOrder]);

  useEffect(() => {
    if (!hasCustomerAuth) return;
    const handleOrderStatusNotification = async (event) => {
      const detail = event?.detail || {};
      const incomingKey = String(detail?.orderMongoId || detail?.orderId || "").trim();
      const currentKey = activeOrderKeyRef.current;
      if (!incomingKey || !currentKey) return;
      if (incomingKey !== currentKey) return;

      const snap = activeOrderSnapshotRef.current;

      setActiveOrderOverride((prev) => ({
        ...(prev || snap || {}),
        orderStatus: detail?.orderStatus || prev?.orderStatus || snap?.orderStatus,
        deliveryState: detail?.deliveryState
          ? { ...(prev?.deliveryState || snap?.deliveryState || {}), ...detail.deliveryState }
          : prev?.deliveryState || snap?.deliveryState,
        status: detail?.status || prev?.status || snap?.status,
      }));

      const now = Date.now();
      if (now - lastRefreshRef.current < 1500) return;
      lastRefreshRef.current = now;

      try {
        const response = await orderAPI.getOrderDetails(incomingKey);
        const fresh = response?.data?.data?.order || response?.data?.order || response?.data?.data || null;
        if (fresh) setActiveOrderOverride(fresh);
      } catch (error) {
        if (error?.response?.status === 404 || error?.response?.status === 400) {
          setInvalidOrderIds((prev) => {
            const next = new Set(prev);
            next.add(incomingKey);
            return next;
          });
        }
      }
    };

    const handleOrderPlaced = () => {
      fetchOrders();
    };

    window.addEventListener("orderStatusNotification", handleOrderStatusNotification);
    window.addEventListener("order-placed", handleOrderPlaced);

    return () => {
      window.removeEventListener("orderStatusNotification", handleOrderStatusNotification);
      window.removeEventListener("order-placed", handleOrderPlaced);
    };
  }, [fetchOrders, hasCustomerAuth]);

  useEffect(() => {
    if (!activeOrder) {
      setTimeRemaining((prev) => (prev !== null ? null : prev));
      return;
    }

    const tick = () => {
      const next = getTimeRemaining(activeOrder);
      setTimeRemaining((prev) => (prev === next ? prev : next));
    };

    tick();
    const interval = setInterval(tick, 60000);

    return () => clearInterval(interval);
  }, [activeOrder]);

  // Proactive verification for active orders not found in recent API list
  useEffect(() => {
    if (!hasCustomerAuth) return;
    const key = getOrderKey(activeOrder);
    if (!key || invalidOrderIds.has(key)) return;

    // If order is present in the recent server-provided list, we consider it valid without extra check
    const isRecentlyConfirmed = apiOrders.some((o) => getOrderKey(o) === key);
    if (isRecentlyConfirmed) return;

    const verifyOrderExists = async () => {
      try {
        await orderAPI.getOrderDetails(key);
      } catch (error) {
        if (error?.response?.status === 404 || error?.response?.status === 400) {
          setInvalidOrderIds((prev) => {
            const next = new Set(prev);
            next.add(key);
            return next;
          });
        }
      }
    };

    verifyOrderExists();
  }, [activeOrder, apiOrders, invalidOrderIds, hasCustomerAuth]);

  const [dismissedKey, setDismissedKey] = useState(null);

  if (!hasCustomerAuth) {
    return null;
  }

  if (!activeOrder) {
    return null;
  }

  const currentOrderKey = getOrderKey(activeOrder);
  const orderRouteId = getOrderRouteId(activeOrder);
  if (dismissedKey === currentOrderKey) {
    return null;
  }
  if (!orderRouteId) {
    return null;
  }

  const orderStatus = getOrderStatus(activeOrder) || "preparing";
  const orderPhase = getOrderPhase(activeOrder);
  if (orderStatus === "delivered" || orderStatus === "completed") {
    return null;
  }

  const restaurantName =
    activeOrder.restaurant || activeOrder.restaurantName || "Restaurant";
  const statusText = (() => {
    const s = String(orderStatus);
    const p = String(orderPhase);

    if (s === "confirmed") return "Order confirmed";
    if (s === "preparing" || s === "created" || s === "pending") return "Preparing your order";
    if (s === "ready_for_pickup") return "Ready for pickup";

    if (s === "reached_pickup" || p === "at_pickup") return "Delivery partner reached restaurant";
    if (s === "picked_up" || p === "en_route_to_delivery") return "On the way";
    if (s === "reached_drop" || p === "at_drop") return "Arrived near you";

    if (s === "delivered" || p === "delivered" || p === "completed") return "Delivered";
    return "Preparing your order";
  })();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={`fixed ${hasBottomNav ? "bottom-20" : "bottom-6"} left-4 right-4 z-[9999]`}
      >
        <div 
          onClick={() =>
            navigate(
              `/food/orders/${encodeURIComponent(String(orderRouteId))}`,
            )
          }
          className="relative bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-xl rounded-[20px] p-4 shadow-[0_8px_30px_rgba(41,121,251,0.16)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)] border border-brand-100/70 dark:border-white/10 overflow-visible cursor-pointer group"
        >
          {/* Subtle gradient background mesh */}
          <div className="absolute inset-0 bg-gradient-to-r from-brand-50/60 via-white/50 to-white/85 dark:from-brand-900/20 dark:via-transparent dark:to-transparent opacity-70 pointer-events-none rounded-[20px]" />
          
          <button 
             onClick={(e) => { e.stopPropagation(); setDismissedKey(currentOrderKey); }}
             className="absolute top-2 right-2 p-1.5 rounded-full bg-brand-50/80 dark:bg-white/10 text-brand-400 hover:text-brand-600 dark:hover:text-brand-300 hover:bg-brand-100/80 dark:hover:bg-white/20 transition-colors z-20 shadow-sm"
          >
            <X className="w-3.5 h-3.5 pointer-events-none" />
          </button>

          <div className="flex items-center gap-4 relative z-10 w-full">
            <CookingAnimation className="dark:invert" />

            <div className="flex-1 min-w-0 pr-4">
              <p className="text-gray-900 dark:text-white font-bold text-base md:text-lg truncate tracking-tight">{restaurantName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-gray-500 dark:text-gray-400 font-medium text-xs md:text-sm truncate">{statusText}</p>
                <ChevronRight className="w-3.5 h-3.5 shrink-0 group-hover:translate-x-1 transition-transform" style={{ color: BRAND_THEME.colors.brand.primary }} />
              </div>
            </div>

            <div className="rounded-xl px-4 py-2 shrink-0 flex flex-col items-center justify-center border" style={{ background: BRAND_THEME.gradients.primary, borderColor: `${BRAND_THEME.colors.brand.primary}33`, boxShadow: `0 15px 35px -20px ${BRAND_THEME.colors.brand.primaryDark}` }}>
              <p className="text-brand-50 text-[10px] font-bold uppercase tracking-wider opacity-95 leading-tight mb-[2px]">
                arriving in
              </p>
              <p className="text-white text-base md:text-[17px] font-black leading-tight drop-shadow-sm">
                {timeRemaining !== null
                  ? `${Math.max(1, timeRemaining)} min`
                  : "--"}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

const OrderTrackingCard = memo(OrderTrackingCardInner);
export default OrderTrackingCard;
