import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  checkOnboardingStatus,
  isRestaurantOnboardingComplete,
} from "@food/utils/onboardingUtils";
import { motion, AnimatePresence } from "framer-motion";
import Lenis from "lenis";
import {
  Printer,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  X,
  AlertCircle,
  Loader2,
  Calendar,
  Clock,
  Users,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders";
import RestaurantNavbar from "@food/components/restaurant/RestaurantNavbar";
import notificationSound from "@food/assets/audio/alert.mp3";
import { restaurantAPI } from "@food/api";
import { useRestaurantNotifications } from "@food/hooks/useRestaurantNotifications";
import { formatOrderAddressWithLabels } from "@food/utils/orderAddressFormatter";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import BRAND_THEME from "@/config/brandTheme";
const debugLog = (...args) => {};
const debugWarn = (...args) => {};
const debugError = (...args) => {};

const STORAGE_KEY = "restaurant_online_status";

// Top filter tabs
const filterTabs = [
  { id: "all", label: "All" },
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready" },
  { id: "out-for-delivery", label: "Picked Up" },
  { id: "scheduled", label: "Scheduled" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

const allOrdersStatusPriority = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  picked_up: 4,
  out_for_delivery: 4,
  reached_drop: 5,
  scheduled: 5,
  // delivered, completed, cancelled — no fixed priority, sorted by date only
};

const getAllOrdersTimestamp = (order) =>
  order?.cancelledAt ||
  order?.deliveredAt ||
  order?.updatedAt ||
  order?.createdAt ||
  new Date().toISOString();

const formatOrderDateTime = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  const timeStr = d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  }) + `, ${timeStr}`;
};

const getDispatchPartnerId = (orderLike) =>
  orderLike?.deliveryPartnerId || orderLike?.dispatch?.deliveryPartnerId || null;

const getDispatchPartnerName = (orderLike) => {
  const candidates = [
    orderLike?.deliveryPartnerName,
    orderLike?.dispatch?.deliveryPartnerName,
    orderLike?.dispatch?.deliveryPartner?.name,
    orderLike?.dispatch?.deliveryPartnerId?.name,
    orderLike?.deliveryPartner?.name,
    orderLike?.deliveryPartnerId?.name,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const pickFirstText = (...values) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const resolveCustomerName = (order = {}) =>
  pickFirstText(
    order?.customerName,
    order?.deliveryAddress?.fullName,
    order?.deliveryAddress?.name,
    order?.address?.fullName,
    order?.address?.name,
    order?.user?.name,
    order?.userId?.name,
    order?.customer?.name,
    order?.customerInfo?.name,
    order?.customerPhone,
    order?.deliveryAddress?.phone,
    order?.userId?.phone,
    "Guest",
  );

const transformOrderForList = (order) => ({
  orderId: order.orderId || order._id,
  mongoId: order._id,
  status: order.status || "pending",
  customerName: resolveCustomerName(order),
  type: "Home Delivery",
  tableOrToken: null,
  timePlaced: formatOrderDateTime(order.createdAt),
  eta: null,
  itemsSummary:
    order.items?.map((item) => `${item.quantity}x ${item.name}`).join(", ") ||
    "No items",
  items: Array.isArray(order.items) ? order.items : [],
  photoUrl: order.items?.[0]?.image || null,
  photoAlt: order.items?.[0]?.name || "Order",
  paymentMethod: order.paymentMethod || order.payment?.method || null,
  deliveryPartnerId: getDispatchPartnerId(order),
  deliveryPartnerName: getDispatchPartnerName(order),
  dispatchStatus: order.dispatch?.status || null,
  deliveryState: order.deliveryState || null,
  preparingTimestamp: order.tracking?.preparing?.timestamp
    ? new Date(order.tracking.preparing.timestamp)
    : new Date(order.createdAt || Date.now()),
  initialETA: order.estimatedDeliveryTime || 30,
  sortTimestamp: new Date(order.createdAt || Date.now()).getTime(),
});

// Completed Orders List Component
function CompletedOrders({ onSelectOrder, refreshToken = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          const completedOrders = response.data.data.orders.filter(
            (order) =>
              order.status === "delivered" || order.status === "completed",
          );

          const transformedOrders = completedOrders.map((order) => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || "delivered",
            customerName: resolveCustomerName(order),
            type: "Home Delivery",
            tableOrToken: null,
            timePlaced: formatOrderDateTime(order.createdAt),
            deliveredAt:
              order.deliveredAt || order.updatedAt || order.createdAt,
            itemsSummary:
              order.items
                ?.map((item) => `${item.quantity}x ${item.name}`)
                .join(", ") || "No items",
            items: Array.isArray(order.items) ? order.items : [],
            photoUrl: order.items?.[0]?.image || null,
            photoAlt: order.items?.[0]?.name || "Order",
            amount: order.pricing?.total || order.total || 0,
            paymentMethod: order.paymentMethod || order.payment?.method || null,
          }));

          transformedOrders.sort((a, b) => {
            const dateA = new Date(a.deliveredAt);
            const dateB = new Date(b.deliveredAt);
            return dateB - dateA;
          });

          if (isMounted) {
            setOrders(transformedOrders);
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setOrders([]);
            setLoading(false);
          }
        }
      } catch (error) {
        if (!isMounted) return;

        if (error.code !== "ERR_NETWORK" && error.response?.status !== 404) {
          debugError("Error fetching completed orders:", error);
        }

        if (isMounted) {
          setOrders([]);
          setLoading(false);
        }
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [refreshToken]);

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">
            Completed orders
          </h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Completed orders</h2>
        <span className="text-xs text-gray-500">{orders.length} total</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No completed orders yet
        </div>
      ) : (
        <div>
          {orders.map((order) => {
            const deliveredDate = order.deliveredAt
              ? new Date(order.deliveredAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "N/A";

            return (
              <div
                key={order.orderId || order.mongoId}
                className="w-full bg-white rounded-2xl p-4 mb-3 border border-gray-200">
                <button
                  type="button"
                  onClick={() =>
                    onSelectOrder?.({
                      orderId: order.orderId,
                      mongoId: order.mongoId,
                      status: "Delivered",
                      customerName: order.customerName,
                      type: order.type,
                      tableOrToken: order.tableOrToken,
                      timePlaced: deliveredDate,
                      itemsSummary: order.itemsSummary,
                      items: order.items,
                      paymentMethod: order.paymentMethod,
                    })
                  }
                  className="w-full text-left flex gap-3 items-stretch">
                  <div className="h-20 w-20 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0 my-auto">
                    {order.photoUrl ? (
                      <img
                        src={order.photoUrl}
                        alt={order.photoAlt}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center px-2">
                        <span className="text-[11px] font-medium text-gray-500 text-center leading-tight">
                          {order.photoAlt}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col justify-between min-h-[80px]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-black leading-tight">
                          Order #{order.orderId}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {order.customerName}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border border-green-500 text-green-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Delivered
                        </span>
                        <span className="text-[11px] text-gray-500 text-right">
                          {deliveredDate}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2">
                      <p className="text-xs text-gray-600 line-clamp-1">
                        {order.itemsSummary}
                      </p>
                    </div>

                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-[11px] text-gray-500">
                          {order.type}
                        </p>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-[11px] text-gray-500">
                          Amount
                        </span>
                        <span className="text-xs font-medium text-black">
                          ₹{order.amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Cancelled Orders List Component
function CancelledOrders({ onSelectOrder, refreshToken = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          // Filter cancelled orders (both restaurant and user cancelled)
          const cancelledOrders = response.data.data.orders.filter(
            (order) => order.status === "cancelled",
          );

          const transformedOrders = cancelledOrders.map((order) => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || "cancelled",
            customerName: resolveCustomerName(order),
            type: "Home Delivery",
            tableOrToken: null,
            timePlaced: formatOrderDateTime(order.createdAt),
            cancelledAt:
              order.cancelledAt || order.updatedAt || order.createdAt,
            cancelledBy: order.cancelledBy || "unknown",
            cancellationReason:
              order.cancellationReason || "No reason provided",
            itemsSummary:
              order.items
                ?.map((item) => `${item.quantity}x ${item.name}`)
                .join(", ") || "No items",
            items: Array.isArray(order.items) ? order.items : [],
            photoUrl: order.items?.[0]?.image || null,
            photoAlt: order.items?.[0]?.name || "Order",
            amount: order.pricing?.total || order.total || 0,
            paymentMethod: order.paymentMethod || order.payment?.method || null,
          }));

          transformedOrders.sort((a, b) => {
            const dateA = new Date(a.cancelledAt);
            const dateB = new Date(b.cancelledAt);
            return dateB - dateA;
          });

          if (isMounted) {
            setOrders(transformedOrders);
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setOrders([]);
            setLoading(false);
          }
        }
      } catch (error) {
        if (!isMounted) return;

        if (error.code !== "ERR_NETWORK" && error.response?.status !== 404) {
          debugError("Error fetching cancelled orders:", error);
        }

        if (isMounted) {
          setOrders([]);
          setLoading(false);
        }
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [refreshToken]);

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">
            Cancelled orders
          </h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Cancelled orders</h2>
        <span className="text-xs text-gray-500">{orders.length} total</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No cancelled orders yet
        </div>
      ) : (
        <div>
          {orders.map((order) => {
            const cancelledDate = order.cancelledAt
              ? new Date(order.cancelledAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "N/A";

            const cancelledByText =
              order.cancelledBy === "user"
                ? "Cancelled by User"
                : order.cancelledBy === "restaurant"
                  ? "Cancelled by Restaurant"
                  : "Cancelled";

            return (
              <div
                key={order.orderId || order.mongoId}
                className="w-full bg-white rounded-2xl p-4 mb-3 border border-gray-200">
                <button
                  type="button"
                  onClick={() =>
                    onSelectOrder?.({
                      orderId: order.orderId,
                      mongoId: order.mongoId,
                      status: "Cancelled",
                      customerName: order.customerName,
                      type: order.type,
                      tableOrToken: order.tableOrToken,
                      timePlaced: cancelledDate,
                      itemsSummary: order.itemsSummary,
                      items: order.items,
                      paymentMethod: order.paymentMethod,
                    })
                  }
                  className="w-full text-left flex gap-3 items-stretch">
                  <div className="h-20 w-20 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0 my-auto">
                    {order.photoUrl ? (
                      <img
                        src={order.photoUrl}
                        alt={order.photoAlt}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center px-2">
                        <span className="text-[11px] font-medium text-gray-500 text-center leading-tight">
                          {order.photoAlt}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col justify-between min-h-[80px]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-black leading-tight">
                          Order #{order.orderId}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {order.customerName}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border ${
                            order.cancelledBy === "user"
                              ? "border-orange-500 text-orange-600"
                              : "border-red-500 text-red-600"
                          }`}>
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              order.cancelledBy === "user"
                                ? "bg-orange-500"
                                : "bg-red-500"
                            }`}
                          />
                          {cancelledByText}
                        </span>
                        <span className="text-[11px] text-gray-500 text-right">
                          {cancelledDate}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2">
                      <p className="text-xs text-gray-600 line-clamp-1">
                        {order.itemsSummary}
                      </p>
                      {order.cancellationReason && (
                        <p className="text-[10px] text-red-600 mt-1 line-clamp-1">
                          Reason: {order.cancellationReason}
                        </p>
                      )}
                    </div>

                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-[11px] text-gray-500">
                          {order.type}
                        </p>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-[11px] text-gray-500">
                          Amount
                        </span>
                        <span className="text-xs font-medium text-black">
                          ₹{order.amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AllOrders({ onSelectOrder, onCancel, refreshToken = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [markingReadyOrderIds, setMarkingReadyOrderIds] = useState({});

  useEffect(() => {
    let isMounted = true;
    let intervalId = null;
    let countdownIntervalId = null;

    const fetchOrders = async () => {
      try {
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          const transformedOrders = response.data.data.orders
            .map(transformOrderForList)
            .sort((a, b) => {
              const priorityDiff =
                (allOrdersStatusPriority[a.status] ?? 999) -
                (allOrdersStatusPriority[b.status] ?? 999);
              if (priorityDiff !== 0) return priorityDiff;
              return b.sortTimestamp - a.sortTimestamp;
            });

          setOrders(transformedOrders);
        } else {
          setOrders([]);
        }
      } catch (error) {
        if (!isMounted) return;

        if (
          error.code !== "ERR_NETWORK" &&
          error.response?.status !== 404 &&
          error.response?.status !== 401
        ) {
          debugError("Error fetching all orders:", error);
        }

        setOrders([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchOrders();
    intervalId = setInterval(fetchOrders, 10000);
    countdownIntervalId = setInterval(() => {
      if (isMounted) {
        setCurrentTime(new Date());
      }
    }, 1000);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
      if (countdownIntervalId) clearInterval(countdownIntervalId);
    };
  }, [refreshToken]);

  const handleMarkReady = async ({ orderId, mongoId }) => {
    const orderKey = mongoId || orderId;
    if (!orderKey || markingReadyOrderIds[orderKey]) return;

    try {
      setMarkingReadyOrderIds((prev) => ({ ...prev, [orderKey]: true }));
      await restaurantAPI.markOrderReady(orderKey);
      setOrders((prev) =>
        prev.map((order) =>
          (order.mongoId || order.orderId) === orderKey
            ? {
                ...order,
                status: "ready",
                eta: null,
                sortTimestamp: Date.now(),
              }
            : order,
        ),
      );
      toast.success("Order marked as ready");
    } catch (error) {
      debugError("Error marking order as ready from All orders:", error);
      toast.error(
        error.response?.data?.message || "Failed to mark order as ready",
      );
    } finally {
      setMarkingReadyOrderIds((prev) => ({ ...prev, [orderKey]: false }));
    }
  };

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">All orders</h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">All orders</h2>
        <span className="text-xs text-gray-500">{orders.length} total</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No orders found
        </div>
      ) : (
        <div>
          {orders.map((order) => {
            const normalizedStatus = String(order.status || "").toLowerCase();
            let etaDisplay = order.eta;

            if (normalizedStatus === "preparing" && order.preparingTimestamp) {
              const elapsedMs = currentTime - order.preparingTimestamp;
              const elapsedMinutes = Math.floor(elapsedMs / 60000);
              const remainingMinutes = Math.max(
                0,
                order.initialETA - elapsedMinutes,
              );

              if (remainingMinutes <= 0) {
                const remainingSeconds = Math.max(
                  0,
                  Math.floor(order.initialETA * 60 - elapsedMs / 1000),
                );
                etaDisplay =
                  remainingSeconds > 0 ? `${remainingSeconds} secs` : "0 mins";
              } else {
                etaDisplay = `${remainingMinutes} mins`;
              }
            }

            return (
              <OrderCard
                key={order.orderId || order.mongoId}
                {...order}
                eta={etaDisplay}
                onSelect={onSelectOrder}
                onCancel={
                  normalizedStatus === "preparing" ? onCancel : undefined
                }
                onMarkReady={
                  normalizedStatus === "preparing" ? handleMarkReady : undefined
                }
                isMarkingReady={Boolean(
                  markingReadyOrderIds[order.mongoId || order.orderId],
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function OrdersMain() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("all");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const contentRef = useRef(null);
  const filterBarRef = useRef(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);
  const mouseStartX = useRef(0);
  const mouseEndX = useRef(0);
  const isMouseDown = useRef(false);

  // New order popup states
  const [showNewOrderPopup, setShowNewOrderPopup] = useState(false);
  const [popupOrder, setPopupOrder] = useState(null); // Store order for popup (from Socket.IO or API)
  const [isMuted, setIsMuted] = useState(false);
  const [prepTime, setPrepTime] = useState(11);
  const [countdown, setCountdown] = useState(240); // 4 minutes in seconds
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(true);
  const [showRejectPopup, setShowRejectPopup] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [acceptSwipeProgress, setAcceptSwipeProgress] = useState(0);
  const [isAcceptingOrder, setIsAcceptingOrder] = useState(false);
  const audioRef = useRef(null);
  const shownOrdersRef = useRef(new Set()); // Track orders already shown in popup
  const acceptSliderRef = useRef(null);
  const acceptSwipeStartXRef = useRef(0);
  const acceptSwipeActiveRef = useRef(false);
  const [restaurantStatus, setRestaurantStatus] = useState({
    isActive: null,
    rejectionReason: null,
    onboarding: null,
    isLoading: true,
  });
  const [isReverifying, setIsReverifying] = useState(false);
  const audioUnlockedRef = useRef(false);
  const showNewOrderPopupRef = useRef(showNewOrderPopup);
  const isMutedRef = useRef(isMuted);
  const newOrderRef = useRef(null);
  const popupOrderRef = useRef(null);
  const popupHydrationRef = useRef("");
  const selectedOrderHydrationRef = useRef("");

  const markOrderAsShown = (orderLike) => {
    const keys = [
      orderLike?.orderMongoId,
      orderLike?.orderId,
      orderLike?._id,
      orderLike?.id,
    ]
      .map((v) => (v == null ? "" : String(v).trim()))
      .filter(Boolean);

    for (const k of keys) shownOrdersRef.current.add(k);
  };

  const hasOrderBeenShown = (orderLike) => {
    const keys = [
      orderLike?.orderMongoId,
      orderLike?.orderId,
      orderLike?._id,
      orderLike?.id,
    ]
      .map((v) => (v == null ? "" : String(v).trim()))
      .filter(Boolean);

    return keys.some((k) => shownOrdersRef.current.has(k));
  };

  const getOrderKeys = (orderLike) =>
    [
      orderLike?.orderMongoId,
      orderLike?.mongoId,
      orderLike?.orderId,
      orderLike?._id,
      orderLike?.id,
    ]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean);

  const normalizePopupOrderForModal = (orderLike = {}, previous = null) => {
    if (!orderLike || typeof orderLike !== "object") return previous || null;

    const source = { ...(previous || {}), ...orderLike };
    const sourceStatus = String(
      source?.status || source?.orderStatus || "",
    ).trim();

    return {
      ...source,
      orderMongoId:
        source?.orderMongoId || source?._id || previous?.orderMongoId || null,
      orderId: source?.orderId || previous?.orderId || source?._id || null,
      status: sourceStatus || previous?.status || "created",
      orderStatus: sourceStatus || previous?.orderStatus || "created",
      items: Array.isArray(source?.items) ? source.items : previous?.items || [],
      pricing: source?.pricing || previous?.pricing || {},
      paymentMethod:
        source?.paymentMethod ||
        source?.payment?.method ||
        previous?.paymentMethod ||
        null,
      payment: source?.payment || previous?.payment || null,
    };
  };

  const normalizeSelectedOrderForSheet = (orderLike = {}, previous = null) => {
    if (!orderLike || typeof orderLike !== "object") return previous || null;

    const source = { ...(previous || {}), ...orderLike };
    const sourceStatusRaw = String(source?.status || "").trim();
    const formattedStatus = sourceStatusRaw
      ? sourceStatusRaw
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : String(previous?.status || "Pending");

    return {
      ...source,
      orderId:
        source?.orderId || source?.id || source?._id || previous?.orderId || "",
      mongoId: source?.mongoId || source?._id || previous?.mongoId || null,
      status: formattedStatus,
      items: Array.isArray(source?.items) ? source.items : previous?.items || [],
      itemsSummary:
        source?.itemsSummary ||
        previous?.itemsSummary ||
        (Array.isArray(source?.items)
          ? source.items
              .map((item) => `${item?.quantity || 1}x ${item?.name || "Item"}`)
              .join(", ")
          : "No items"),
      paymentMethod:
        source?.paymentMethod ||
        source?.payment?.method ||
        previous?.paymentMethod ||
        null,
      deliveryPartnerName:
        source?.deliveryPartnerName ||
        previous?.deliveryPartnerName ||
        getDispatchPartnerName(source) ||
        "",
    };
  };

  const hasMatchingOrderKey = (eventKeys = [], orderLike = null) => {
    if (!orderLike) return false;
    const targetKeys = getOrderKeys(orderLike);
    if (targetKeys.length === 0 || eventKeys.length === 0) return false;
    return targetKeys.some((key) => eventKeys.includes(key));
  };

  const getPopupOrderTotal = (orderLike) => {
    if (!orderLike) return 0;

    const directTotal = Number(orderLike.total);
    if (Number.isFinite(directTotal) && directTotal > 0) return directTotal;

    const pricingTotal = Number(orderLike.pricing?.total);
    if (Number.isFinite(pricingTotal) && pricingTotal > 0) return pricingTotal;

    const amountDue = Number(orderLike.payment?.amountDue);
    if (Number.isFinite(amountDue) && amountDue > 0) return amountDue;

    const items = Array.isArray(orderLike.items) ? orderLike.items : [];
    const itemsTotal = items.reduce((sum, item) => {
      const price = Number(item?.price || 0);
      const qty = Number(item?.quantity || 0);
      return sum + (Number.isFinite(price) ? price : 0) * (Number.isFinite(qty) ? qty : 0);
    }, 0);

    return Number.isFinite(itemsTotal) ? itemsTotal : 0;
  };

  const formatPopupAmount = (value) => {
    const amount = Number(value || 0);
    return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  };

  const getPopupBillBreakdown = (orderLike) => {
    const pricing = orderLike?.pricing || {};
    const items = Array.isArray(orderLike?.items) ? orderLike.items : [];
    const toFiniteOrNull = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const computedItemsTotal = items.reduce((sum, item) => {
      const quantity = Math.max(1, Number(item?.quantity || 1));
      const unitPrice = Number(item?.price ?? item?.unitPrice ?? item?.basePrice ?? 0);
      const lineTotal = Number(
        item?.totalPrice ?? item?.lineTotal ?? item?.subtotal ?? unitPrice * quantity,
      );
      return sum + (Number.isFinite(lineTotal) ? lineTotal : 0);
    }, 0);

    const itemTotalRaw =
      Number(pricing?.subtotal) ||
      Number(pricing?.itemsTotal) ||
      Number(pricing?.itemSubtotal) ||
      Number(orderLike?.itemSubtotal) ||
      Number(orderLike?.subtotal) ||
      computedItemsTotal;
    const itemTotal = Number.isFinite(itemTotalRaw) ? itemTotalRaw : 0;

    const packagingFeeRaw = Number(pricing?.packagingFee ?? orderLike?.packagingFee ?? 0);
    const packagingFee = Number.isFinite(packagingFeeRaw) ? packagingFeeRaw : 0;

    const deliveryFeeRaw = Number(pricing?.deliveryFee ?? orderLike?.deliveryFee ?? 0);
    const deliveryFee = Number.isFinite(deliveryFeeRaw) ? deliveryFeeRaw : 0;

    const platformFeeRaw = Number(pricing?.platformFee ?? orderLike?.platformFee ?? 0);
    const platformFee = Number.isFinite(platformFeeRaw) ? platformFeeRaw : 0;

    const taxesRaw = Number(
      pricing?.tax ?? pricing?.gst ?? orderLike?.tax ?? orderLike?.gst ?? 0,
    );
    const taxes = Number.isFinite(taxesRaw) ? taxesRaw : 0;

    const discountRaw = Number(pricing?.discount ?? orderLike?.discount ?? 0);
    const discount = Number.isFinite(discountRaw) ? discountRaw : 0;

    const couponByRestaurantRaw = Number(pricing?.couponByRestaurant ?? 0);
    const couponByRestaurant = Number.isFinite(couponByRestaurantRaw)
      ? couponByRestaurantRaw
      : 0;

    const offerByRestaurantRaw = Number(pricing?.offerByRestaurant ?? 0);
    const offerByRestaurant = Number.isFinite(offerByRestaurantRaw)
      ? offerByRestaurantRaw
      : 0;
    const commissionRaw = Number(
      orderLike?.commission ?? pricing?.restaurantCommission ?? 0,
    );
    const commission = Number.isFinite(commissionRaw) ? commissionRaw : 0;

    const totalRaw =
      Number(pricing?.total) ||
      Number(orderLike?.payment?.amountDue) ||
      Number(orderLike?.total) ||
      itemTotal + packagingFee + deliveryFee + platformFee + taxes - discount;
    const total = Number.isFinite(totalRaw) ? Math.max(0, totalRaw) : 0;

    // Keep this aligned with restaurant order report/invoice logic:
    // prefer backend payout fields; fallback to net formula used in reports.
    // Keep this aligned with admin regular order report:
    // restaurantEarning = subtotal + packagingFee - adminCommission - couponByRestaurant - offerByRestaurant
    const subtotalForEarning = toFiniteOrNull(pricing?.subtotal) ?? itemTotal;
    const directEarning =
      toFiniteOrNull(orderLike?.restaurantEarning) ??
      toFiniteOrNull(orderLike?.payout) ??
      toFiniteOrNull(pricing?.restaurantEarning) ??
      toFiniteOrNull(pricing?.payoutToRestaurant);
    const earningRaw =
      directEarning ??
      (subtotalForEarning +
        packagingFee -
        commission -
        couponByRestaurant -
        offerByRestaurant);
    const restaurantEarning = Number.isFinite(earningRaw) ? Math.max(0, earningRaw) : 0;

    return {
      itemTotal,
      packagingFee,
      deliveryFee,
      platformFee,
      taxes,
      discount,
      commission,
      total,
      restaurantEarning,
    };
  };

  const getPopupItemVariantText = (item = {}) => {
    const variantParts = [
      item?.variantName,
      item?.selectedVariant?.name,
      item?.variant?.name,
      typeof item?.size === "string" ? item.size : item?.size?.name,
      item?.portion,
    ]
      .map((value) => (value == null ? "" : String(value).trim()))
      .filter(Boolean);

    const addons = Array.isArray(item?.addons)
      ? item.addons
          .map((addon) => {
            const addonName =
              addon?.name || addon?.title || addon?.addonName || "Add-on";
            const addonQty = Math.max(1, Number(addon?.quantity || 1));
            return addonQty > 1 ? `${addonName} x${addonQty}` : addonName;
          })
          .filter(Boolean)
      : [];

    if (addons.length > 0) {
      variantParts.push(`Add-ons: ${addons.join(", ")}`);
    }

    return variantParts.join(" | ");
  };

  // Restaurant notifications hook for real-time orders
  const {
    newOrder,
    clearNewOrder,
    cancelledOrderId,
    cancelledOrderInfo,
    clearCancelledOrderId,
    isConnected
  } = useRestaurantNotifications();

  const rejectReasons = [
    "Restaurant is too busy",
    "Item not available",
    "Outside delivery area",
    "Kitchen closing soon",
    "Technical issue",
    "Other reason",
  ];

  // Fetch restaurant verification status
  useEffect(() => {
    const fetchRestaurantStatus = async () => {
      try {
        const response = await restaurantAPI.getCurrentRestaurant();
        const restaurant =
          response?.data?.data?.restaurant || response?.data?.restaurant;
        if (restaurant) {
          setRestaurantStatus({
            isActive: restaurant.isActive,
            rejectionReason: restaurant.rejectionReason || null,
            onboarding: restaurant.onboarding || null,
            isLoading: false,
          });

          // Check if onboarding is incomplete and redirect if needed
          if (!isRestaurantOnboardingComplete(restaurant)) {
            // Onboarding is incomplete, redirect to onboarding page
            const incompleteStep = await checkOnboardingStatus();
            if (incompleteStep) {
              navigate(`/restaurant/onboarding?step=${incompleteStep}`, {
                replace: true,
              });
              return;
            }
          }
        }
      } catch (error) {
        // Only log error if it's not a network/timeout error (backend might be down/slow)
        if (
          error.code !== "ERR_NETWORK" &&
          error.code !== "ECONNABORTED" &&
          !error.message?.includes("timeout")
        ) {
          debugError("Error fetching restaurant status:", error);
        }
        // Set loading to false so UI doesn't stay in loading state
        setRestaurantStatus((prev) => ({ ...prev, isLoading: false }));
      }
    };

    fetchRestaurantStatus();

    // Listen for restaurant profile updates
    const handleProfileRefresh = () => {
      fetchRestaurantStatus();
    };

    window.addEventListener("restaurantProfileRefresh", handleProfileRefresh);

    return () => {
      window.removeEventListener(
        "restaurantProfileRefresh",
        handleProfileRefresh,
      );
    };
  }, [navigate]);

  // Handle reverify (resubmit for approval)
  const handleReverify = async () => {
    try {
      setIsReverifying(true);
      await restaurantAPI.reverify();

      // Refresh restaurant status
      const response = await restaurantAPI.getCurrentRestaurant();
      const restaurant =
        response?.data?.data?.restaurant || response?.data?.restaurant;
      if (restaurant) {
        setRestaurantStatus({
          isActive: restaurant.isActive,
          rejectionReason: restaurant.rejectionReason || null,
          onboarding: restaurant.onboarding || null,
          isLoading: false,
        });
      }

      // Trigger profile refresh event
      window.dispatchEvent(new Event("restaurantProfileRefresh"));

      alert(
        "Restaurant reverified successfully! Verification will be done in 24 hours.",
      );
    } catch (error) {
      // Don't log network/timeout errors (backend might be down)
      if (
        error.code !== "ERR_NETWORK" &&
        error.code !== "ECONNABORTED" &&
        !error.message?.includes("timeout")
      ) {
        debugError("Error reverifying restaurant:", error);
      }

      // Handle 401 Unauthorized errors (token expired/invalid)
      if (error.response?.status === 401) {
        const errorMessage =
          error.response?.data?.message ||
          "Your session has expired. Please login again.";
        alert(errorMessage);
        // The axios interceptor should handle redirecting to login
        // But if it doesn't, we can manually redirect
        if (!error.response?.data?.message?.includes("inactive")) {
          // Only redirect if it's not an "inactive" error (which we handle differently)
          setTimeout(() => {
            window.location.href = "/restaurant/login";
          }, 1500);
        }
      } else {
        // Other errors (400, 500, etc.)
        const errorMessage =
          error.response?.data?.message ||
          "Failed to reverify restaurant. Please try again.";
        alert(errorMessage);
      }
    } finally {
      setIsReverifying(false);
    }
  };

  // Lenis smooth scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  // Show new order popup when real order notification arrives from Socket.IO
  useEffect(() => {
    if (newOrder) {
      debugLog("?? New order received via Socket.IO:", newOrder);

      const scheduledAt = newOrder.scheduledAt
        ? new Date(newOrder.scheduledAt).getTime()
        : null;
      const isFutureScheduled =
        scheduledAt && scheduledAt > Date.now() + 30 * 60000;

      if (isFutureScheduled) {
        toast.info(
          `New scheduled order received for ${new Date(scheduledAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
        );
        requestOrdersRefresh();
        return; // Do not show the immediate popup
      }

      if (!hasOrderBeenShown(newOrder)) {
        markOrderAsShown(newOrder);
        setPopupOrder((prev) => normalizePopupOrderForModal(newOrder, prev));
        setShowNewOrderPopup(true);
        setCountdown(240); // Reset countdown to 4 minutes
        requestOrdersRefresh();
      }
    }
  }, [newOrder]);

  // Keep refs in sync to avoid stale state inside one-time event handlers.
  useEffect(() => {
    showNewOrderPopupRef.current = showNewOrderPopup;
  }, [showNewOrderPopup]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    newOrderRef.current = newOrder;
  }, [newOrder]);

  useEffect(() => {
    popupOrderRef.current = popupOrder;
  }, [popupOrder]);

  // Hydrate popup with latest backend order details so fields stay linked
  // with tracking/report data (items variants, payment snapshot, pricing, earnings).
  useEffect(() => {
    if (!showNewOrderPopup) return;
    const orderForModal = popupOrder || newOrder;
    if (!orderForModal) return;

    const lookupIdRaw =
      orderForModal?.orderMongoId ||
      orderForModal?._id ||
      orderForModal?.orderId ||
      orderForModal?.id ||
      "";
    const lookupId = String(lookupIdRaw).trim();
    if (!lookupId) return;

    if (popupHydrationRef.current === lookupId) return;
    popupHydrationRef.current = lookupId;

    let active = true;
    (async () => {
      try {
        const response = await restaurantAPI.getOrderById(lookupId);
        const apiOrder =
          response?.data?.data?.order ||
          response?.data?.order ||
          response?.data?.data ||
          null;
        if (!active || !apiOrder) return;

        setPopupOrder((prev) =>
          normalizePopupOrderForModal(apiOrder, prev || orderForModal),
        );
      } catch (error) {
        debugError("Error hydrating popup order details:", error);
      }
    })();

    return () => {
      active = false;
    };
  }, [showNewOrderPopup, popupOrder, newOrder]);

  // Real-time: close popup if the order currently shown gets cancelled by user
  useEffect(() => {
    if (!cancelledOrderId || !showNewOrderPopup) return;

    const eventKeys = Array.from(
      new Set(
        [
          ...(Array.isArray(cancelledOrderInfo?.orderKeys)
            ? cancelledOrderInfo.orderKeys
            : []),
          cancelledOrderId,
        ]
          .filter(Boolean)
          .map((value) => String(value).trim())
          .filter(Boolean),
      ),
    );
    const matchesPopupOrder =
      hasMatchingOrderKey(eventKeys, popupOrder) ||
      hasMatchingOrderKey(eventKeys, newOrder);

    if (matchesPopupOrder) {
      // Stop audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setShowNewOrderPopup(false);
      setPopupOrder(null);
      clearNewOrder();
      clearCancelledOrderId();
      requestOrdersRefresh();
      const cancelledBy = String(cancelledOrderInfo?.cancelledBy || "").toLowerCase();
      const customMessage = String(cancelledOrderInfo?.message || "").trim();
      const messageFromPayload =
        customMessage && /cancel/i.test(customMessage)
          ? customMessage
          : cancelledBy === "restaurant"
            ? "Order was cancelled by the restaurant."
            : cancelledBy === "admin"
              ? "Order was cancelled by admin."
              : "Order was cancelled by the customer.";
      toast.error(messageFromPayload);
    }
  }, [cancelledOrderId, cancelledOrderInfo]);

  // Close open order details sheet if that order gets cancelled by user/admin.
  useEffect(() => {
    if (!cancelledOrderId || !isSheetOpen || !selectedOrder) return;

    const eventKeys = Array.from(
      new Set(
        [
          ...(Array.isArray(cancelledOrderInfo?.orderKeys)
            ? cancelledOrderInfo.orderKeys
            : []),
          cancelledOrderId,
        ]
          .filter(Boolean)
          .map((value) => String(value).trim())
          .filter(Boolean),
      ),
    );

    if (!hasMatchingOrderKey(eventKeys, selectedOrder)) return;

    setIsSheetOpen(false);
    setSelectedOrder(null);
    setShowCancelPopup(false);
    setOrderToCancel(null);
    requestOrdersRefresh();
    clearCancelledOrderId();
  }, [
    cancelledOrderId,
    cancelledOrderInfo,
    isSheetOpen,
    selectedOrder,
    clearCancelledOrderId,
  ]);

  // Hydrate selected order with latest backend payload when details sheet opens.
  useEffect(() => {
    if (!isSheetOpen || !selectedOrder) return;

    const lookupIdRaw =
      selectedOrder?.mongoId ||
      selectedOrder?.orderMongoId ||
      selectedOrder?.orderId ||
      selectedOrder?.id ||
      "";
    const lookupId = String(lookupIdRaw).trim();
    if (!lookupId) return;

    if (selectedOrderHydrationRef.current === lookupId) return;
    selectedOrderHydrationRef.current = lookupId;

    let active = true;

    (async () => {
      try {
        const response = await restaurantAPI.getOrderById(lookupId);
        const apiOrder =
          response?.data?.data?.order ||
          response?.data?.order ||
          response?.data?.data ||
          null;
        if (!active || !apiOrder) return;

        setSelectedOrder((prev) =>
          normalizeSelectedOrderForSheet(
            {
              ...apiOrder,
              orderId: prev?.orderId || apiOrder?.orderId || apiOrder?._id,
              mongoId: prev?.mongoId || apiOrder?._id || null,
              customerName:
                prev?.customerName ||
                apiOrder?.userId?.name ||
                apiOrder?.user?.name ||
                apiOrder?.customerName ||
                apiOrder?.userId?.phone ||
                "Guest",
              type:
                prev?.type ||
                (apiOrder?.deliveryFleet === "standard"
                  ? "Home Delivery"
                  : "Express Delivery"),
              tableOrToken: prev?.tableOrToken || null,
              timePlaced: prev?.timePlaced || formatOrderDateTime(apiOrder?.createdAt),
            },
            prev,
          ),
        );
      } catch (error) {
        debugError("Error hydrating selected order details:", error);
      }
    })();

    return () => {
      active = false;
    };
  }, [isSheetOpen, selectedOrder]);

  // Best-effort unlock for popup buzzer so it can keep playing when tab is backgrounded.
  useEffect(() => {
    const unlockAudio = async () => {
      if (audioUnlockedRef.current || !audioRef.current) return;
      try {
        audioRef.current.muted = true;
        await audioRef.current.play();
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
        audioUnlockedRef.current = true;

        // If an order popup is already open, start buzzing immediately after unlock.
        if (showNewOrderPopupRef.current && !isMutedRef.current) {
          audioRef.current.loop = true;
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }
      } catch (_) {
        audioRef.current.muted = false;
      }
    };

    window.addEventListener("pointerdown", unlockAudio, {
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  const [ordersRefreshToken, setOrdersRefreshToken] = useState(0);
  const requestOrdersRefresh = () => setOrdersRefreshToken((t) => t + 1);

  useEffect(() => {
    const handleRestaurantOrderStatusUpdated = (event) => {
      const payload = event?.detail || {};
      const hasDispatchUpdate =
        payload?.dispatchStatus != null ||
        payload?.dispatch_status != null;
      const hasOrderStatusUpdate =
        payload?.orderStatus != null || payload?.status != null;

      if (hasDispatchUpdate || hasOrderStatusUpdate) {
        requestOrdersRefresh();
      }

      const statusLower = String(
        payload?.orderStatus || payload?.status || "",
      ).toLowerCase();
      const isPendingReviewStatus =
        statusLower === "created" || statusLower === "confirmed";
      if (!statusLower || isPendingReviewStatus || !showNewOrderPopupRef.current) {
        return;
      }

      const eventKeys = Array.from(
        new Set(
          [
            payload?.orderMongoId,
            payload?.order_mongo_id,
            payload?.orderId,
            payload?.order_id,
            payload?._id,
            payload?.id,
          ]
            .filter(Boolean)
            .map((value) => String(value).trim())
            .filter(Boolean),
        ),
      );
      if (eventKeys.length === 0) return;

      const matchesPopupOrder =
        hasMatchingOrderKey(eventKeys, popupOrderRef.current) ||
        hasMatchingOrderKey(eventKeys, newOrderRef.current);

      if (!matchesPopupOrder) return;

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setShowNewOrderPopup(false);
      setPopupOrder(null);
      clearNewOrder();
    };

    window.addEventListener(
      "restaurantOrderStatusUpdated",
      handleRestaurantOrderStatusUpdated,
    );

    return () => {
      window.removeEventListener(
        "restaurantOrderStatusUpdated",
        handleRestaurantOrderStatusUpdated,
      );
    };
  }, []);

  // Check for confirmed orders that haven't been shown in popup yet, or scheduled orders whose time has come
  useEffect(() => {
    const checkOrdersToPopup = async () => {
      // Skip if popup is already showing or Socket.IO order exists
      if (showNewOrderPopupRef.current || newOrderRef.current) return;

      try {
        const response = await restaurantAPI.getOrders();
        if (response.data?.success && response.data.data?.orders) {
          const now = Date.now();

          // Find orders that should trigger the popup
          const targetOrders = response.data.data.orders.filter((order) => {
            if (hasOrderBeenShown(order)) return false;

            const statusLower = String(order.status || "").toLowerCase();
            const isPendingReview =
              statusLower === "created" || statusLower === "confirmed";

            if (isPendingReview && !order.scheduledAt) return true; // ordinary new-order fallback

            if (
              order.scheduledAt &&
              (order.status === "created" || order.status === "confirmed")
            ) {
              const scheduledTime = new Date(order.scheduledAt).getTime();
              // Show popup if scheduled time is <= 30 mins from now
              if (scheduledTime <= now + 30 * 60000) return true;
            }

            return false;
          });

          // Show the most recent matching order in popup
          if (
            targetOrders.length > 0 &&
            !showNewOrderPopupRef.current &&
            !newOrderRef.current
          ) {
            const orderToPopup = targetOrders[0];
            const orderId = orderToPopup.orderId || orderToPopup._id;

            // Transform order to match newOrder format (include payment so COD shows correctly)
            const orderForPopup = {
              orderId: orderToPopup.orderId,
              orderMongoId: orderToPopup._id,
              restaurantId: orderToPopup.restaurantId,
              restaurantName: orderToPopup.restaurantName,
              items: orderToPopup.items || [],
              total: orderToPopup.pricing?.total || 0,
              customerAddress: orderToPopup.address,
              status: orderToPopup.status,
              createdAt: orderToPopup.createdAt,
              scheduledAt: orderToPopup.scheduledAt,
              estimatedDeliveryTime: orderToPopup.estimatedDeliveryTime || 30,
              note: orderToPopup.note || "",
              restaurantNote: orderToPopup.restaurantNote || "",
              customerNote: orderToPopup.customerNote || "",
              sendCutlery: orderToPopup.sendCutlery,
              paymentMethod:
                orderToPopup.paymentMethod ||
                orderToPopup.payment?.method ||
                null,
              payment: orderToPopup.payment,
            };

            debugLog("?? Found order ready for popup:", orderForPopup);
            markOrderAsShown({ orderId, _id: orderToPopup._id });
            setPopupOrder((prev) =>
              normalizePopupOrderForModal(orderForPopup, prev),
            );
            setShowNewOrderPopup(true);
            setCountdown(240);
          }
        }
      } catch (error) {
        if (error.response?.status !== 401) {
          debugError("Error checking orders to popup:", error);
        }
      }
    };

    // Check once on mount, and then every minute
    checkOrdersToPopup();
    const intervalId = setInterval(checkOrdersToPopup, 60000);

    return () => clearInterval(intervalId);
  }, []);

  // Play audio when popup opens
  useEffect(() => {
    if (showNewOrderPopup && !isMuted) {
      if (audioRef.current) {
        audioRef.current.loop = true;
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
        audioRef.current.currentTime = 0;
        audioRef.current
          .play()
          .catch((err) => debugLog("Audio play failed:", err));
      }
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [showNewOrderPopup, isMuted]);

  // Countdown timer
  useEffect(() => {
    if (showNewOrderPopup && countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [showNewOrderPopup, countdown]);

  useEffect(() => {
    if (!showNewOrderPopup) {
      popupHydrationRef.current = "";
      setAcceptSwipeProgress(0);
      setIsAcceptingOrder(false);
      acceptSwipeActiveRef.current = false;
      acceptSwipeStartXRef.current = 0;
    }
  }, [showNewOrderPopup]);

  useEffect(() => {
    const handleMouseMove = (event) => {
      if (acceptSwipeActiveRef.current) {
        handleAcceptSwipeMove(event.clientX);
      }
    };

    const handleTouchMove = (event) => {
      if (acceptSwipeActiveRef.current && event.touches[0]) {
        // Prevent page scroll while swiping the slider
        if (typeof event.preventDefault === "function") event.preventDefault();
        handleAcceptSwipeMove(event.touches[0].clientX);
      }
    };

    const handlePointerEnd = () => {
      if (acceptSwipeActiveRef.current) {
        handleAcceptSwipeEnd();
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handlePointerEnd);
    // passive: false is required to allow preventDefault() during swipe
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handlePointerEnd);
    window.addEventListener("touchcancel", handlePointerEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handlePointerEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handlePointerEnd);
      window.removeEventListener("touchcancel", handlePointerEnd);
    };
  }, [isAcceptingOrder]);

  // Format countdown time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getOrderNoteForRestaurant = (order) => {
    if (!order) return "";
    const noteCandidate =
      order?.notes?.restaurant ||
      order?.notes?.customer ||
      order.restaurantNote ||
      order.customerNote ||
      order.note ||
      order.specialInstructions ||
      order.instructions ||
      "";
    return String(noteCandidate || "").trim();
  };

  const getAcceptSliderMetrics = () => {
    const sliderWidth = acceptSliderRef.current?.offsetWidth || 320;
    const handleWidth = 56;
    const horizontalPadding = 8;
    const maxTravel = Math.max(
      sliderWidth - handleWidth - horizontalPadding * 2,
      1,
    );
    return { maxTravel };
  };

  const triggerSwipeAccept = () => {
    if (isAcceptingOrder) return;
    setAcceptSwipeProgress(1);
    setTimeout(() => {
      handleAcceptOrder();
    }, 160);
  };

  const handleAcceptSwipeStart = (clientX) => {
    if (isAcceptingOrder) return;
    acceptSwipeStartXRef.current = clientX;
    acceptSwipeActiveRef.current = true;
  };

  const handleAcceptSwipeMove = (clientX) => {
    if (!acceptSwipeActiveRef.current || isAcceptingOrder) return;
    const deltaX = Math.max(clientX - acceptSwipeStartXRef.current, 0);
    const { maxTravel } = getAcceptSliderMetrics();
    setAcceptSwipeProgress(Math.min(deltaX / maxTravel, 1));
  };

  const handleAcceptSwipeEnd = () => {
    if (!acceptSwipeActiveRef.current || isAcceptingOrder) return;
    acceptSwipeActiveRef.current = false;

    if (acceptSwipeProgress >= 0.45) {
      triggerSwipeAccept();
      return;
    }

    setAcceptSwipeProgress(0);
  };

  // Handle accept order
  const handleAcceptOrder = async () => {
    if (isAcceptingOrder) return;
    setIsAcceptingOrder(true);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // Use popupOrder (from Socket.IO or API fallback) or newOrder (from hook)
    const orderToAccept = popupOrder || newOrder;

    // Ensure this order can't re-trigger fallback popup by using a different id key.
    markOrderAsShown(orderToAccept);

    // Accept order via API if we have a real order
    if (orderToAccept?.orderMongoId || orderToAccept?.orderId) {
      try {
        const orderId = orderToAccept.orderMongoId || orderToAccept.orderId;
        const response = await restaurantAPI.acceptOrder(orderId, prepTime);
        debugLog("? Order accepted:", orderId);
        toast.success("Order accepted successfully");
        requestOrdersRefresh();
      } catch (error) {
        debugError("? Error accepting order:", error);
        const errorMessage =
          error.response?.data?.message ||
          error.message ||
          "Failed to accept order. Please try again.";

        // Show specific error message
        if (error.response?.status === 400) {
          toast.error(errorMessage);
        } else if (error.response?.status === 404) {
          toast.error(
            "Order not found. It may have been cancelled or already processed.",
          );
        } else {
          toast.error(errorMessage);
        }
        setIsAcceptingOrder(false);
        setAcceptSwipeProgress(0);
        return;
      }
    }

    setShowNewOrderPopup(false);
    setPopupOrder(null);
    clearNewOrder();
    setCountdown(240);
    setPrepTime(11);
    setAcceptSwipeProgress(0);
    setIsAcceptingOrder(false);

    // Note: PreparingOrders component will automatically refresh orders via its own useEffect
    // No need to manually refresh here as the component polls every 10 seconds
  };

  const handleCancelOrderClick = () => {
    setShowRejectPopup(true);
  };

  // Help CTA from new-order modal
  const handleNeedHelpClick = () => {
    const currentOrder = popupOrder || newOrder || null;
    const orderId =
      currentOrder?.orderMongoId || currentOrder?.orderId || currentOrder?._id || "";
    const qs = orderId ? `?orderId=${encodeURIComponent(String(orderId))}` : "";
    navigate(`/food/restaurant/help-centre/support${qs}`);
  };

  const handleRejectConfirm = async () => {
    if (!rejectReason) return;

    // Use popupOrder (from Socket.IO or API fallback) or newOrder (from hook)
    const orderToReject = popupOrder || newOrder;

    // Reject order via API if we have a real order
    if (orderToReject?.orderMongoId || orderToReject?.orderId) {
      try {
        const orderId = orderToReject.orderMongoId || orderToReject.orderId;
        await restaurantAPI.rejectOrder(orderId, rejectReason);
        debugLog("? Order rejected:", orderId);
        requestOrdersRefresh();
      } catch (error) {
        debugError("? Error rejecting order:", error);
        alert("Failed to reject order. Please try again.");
        return;
      }
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setShowRejectPopup(false);
    setShowNewOrderPopup(false);
    setPopupOrder(null);
    clearNewOrder();
    setRejectReason("");
    setCountdown(240);
    setPrepTime(11);
  };

  const handleRejectCancel = () => {
    setShowRejectPopup(false);
    setShowNewOrderPopup(false);
    setPopupOrder(null);
    clearNewOrder();
    setRejectReason("");
    setCountdown(240);
  };

  // Handle cancel order (for preparing orders)
  const handleCancelClick = (order) => {
    setOrderToCancel(order);
    setShowCancelPopup(true);
  };

  const handleCancelConfirm = async () => {
    if (!cancelReason.trim() || !orderToCancel) return;

    try {
      const orderId = orderToCancel.mongoId || orderToCancel.orderId;
      await restaurantAPI.rejectOrder(orderId, cancelReason.trim());
      toast.success("Order cancelled successfully");
      requestOrdersRefresh();
      setShowCancelPopup(false);
      setOrderToCancel(null);
      setCancelReason("");
    } catch (error) {
      debugError("? Error cancelling order:", error);
      toast.error(error.response?.data?.message || "Failed to cancel order");
    }
  };

  const handleCancelPopupClose = () => {
    setShowCancelPopup(false);
    setOrderToCancel(null);
    setCancelReason("");
  };

  // Toggle mute
  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      if (!isMuted) {
        audioRef.current.pause();
      } else {
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
        audioRef.current.currentTime = 0;
        audioRef.current
          .play()
          .catch((err) => debugLog("Audio play failed:", err));
      }
    }
  };

  // Handle PDF download
  const handlePrint = async () => {
    const orderToPrint = popupOrder || newOrder;
    if (!orderToPrint) {
      debugWarn("No order data available for PDF generation");
      return;
    }

    try {
      const doc = new jsPDF();

      const formatMoney = (value) => {
        const numberValue = Number(value);
        return `Rs. ${(Number.isFinite(numberValue) ? numberValue : 0).toFixed(2)}`;
      };

      const orderDate = orderToPrint.createdAt
        ? new Date(orderToPrint.createdAt).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : new Date().toLocaleString("en-GB");

      const items = Array.isArray(orderToPrint.items) ? orderToPrint.items : [];
      const lineItems = items.map((item) => {
        const qty = Number(item?.quantity ?? item?.qty ?? 1);
        const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
        const unitPrice = Number(
          item?.price ?? item?.unitPrice ?? item?.itemPrice ?? item?.food?.price ?? 0,
        );
        const safePrice = Number.isFinite(unitPrice) ? unitPrice : 0;
        const variantLabel = getPopupItemVariantText(item);
        const itemName = item?.name || item?.food?.name || "Item";
        return {
          name: variantLabel ? `${itemName} (${variantLabel})` : itemName,
          qty: safeQty,
          price: safePrice,
          total: safePrice * safeQty,
        };
      });

      const bill = getPopupBillBreakdown(orderToPrint);
      const computedItemsTotal = lineItems.reduce((sum, item) => sum + item.total, 0);
      const fallbackTotal = getPopupOrderTotal(orderToPrint);
      const grandTotal =
        bill.total > 0
          ? bill.total
          : fallbackTotal > 0
            ? fallbackTotal
            : computedItemsTotal;

      const rawPaymentMethod =
        orderToPrint?.paymentMethod || orderToPrint?.payment?.method || "";
      const normalizedPaymentMethod = String(rawPaymentMethod).toLowerCase().trim();
      const paymentLabel =
        normalizedPaymentMethod === "cod" || normalizedPaymentMethod === "cash"
          ? "Cash on Delivery"
          : "Online";

      const addressText = formatOrderAddressWithLabels(
        orderToPrint.customerAddress || orderToPrint.deliveryAddress || orderToPrint.address || null,
      );

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 210, 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("Order Receipt", 14, 17);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(orderToPrint.restaurantName || "Restaurant", 14, 24);

      doc.setTextColor(17, 24, 39);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Order ID: ${orderToPrint.orderId || "N/A"}`, 14, 38);
      doc.setFont("helvetica", "normal");
      doc.text(`Date: ${orderDate}`, 14, 45);
      doc.text(`Payment: ${paymentLabel}`, 14, 52);

      let yPos = 62;
      if (addressText && addressText !== "Address not available") {
        doc.setFont("helvetica", "bold");
        doc.text("Delivery address", 14, yPos);
        doc.setFont("helvetica", "normal");
        const addressLines = doc.splitTextToSize(addressText, 180);
        doc.text(addressLines, 14, yPos + 6);
        yPos += 6 + addressLines.length * 5 + 5;
      }

      autoTable(doc, {
        startY: yPos,
        head: [["Item", "Qty", "Unit Price", "Line Total"]],
        body:
          lineItems.length > 0
            ? lineItems.map((item) => [
                item.name,
                String(item.qty),
                formatMoney(item.price),
                formatMoney(item.total),
              ])
            : [["No items", "-", "-", "-"]],
        theme: "grid",
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: 255,
          fontStyle: "bold",
          halign: "left",
        },
        bodyStyles: {
          textColor: [31, 41, 55],
        },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: {
          0: { cellWidth: 95 },
          1: { cellWidth: 20, halign: "center" },
          2: { cellWidth: 35, halign: "right" },
          3: { cellWidth: 40, halign: "right" },
        },
      });

      yPos = (doc.lastAutoTable?.finalY || yPos) + 8;
      doc.setDrawColor(229, 231, 235);
      doc.line(14, yPos, 196, yPos);
      yPos += 8;

      const summaryRows = [
        ["Subtotal", bill.itemTotal],
        ...(bill.packagingFee > 0 ? [["Packaging Fee", bill.packagingFee]] : []),
        ...(bill.deliveryFee > 0 ? [["Delivery Fee", bill.deliveryFee]] : []),
        ...(bill.platformFee > 0 ? [["Platform Fee", bill.platformFee]] : []),
        ...(bill.taxes > 0 ? [["Tax", bill.taxes]] : []),
        ...(bill.discount > 0 ? [["Discount", -Math.abs(bill.discount)]] : []),
      ];

      if (summaryRows.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        summaryRows.forEach(([label, amount]) => {
          const amountValue = Number(amount || 0);
          doc.text(String(label), 120, yPos);
          doc.text(formatMoney(amountValue), 196, yPos, { align: "right" });
          yPos += 6;
        });
        yPos += 2;
        doc.setDrawColor(209, 213, 219);
        doc.line(120, yPos, 196, yPos);
        yPos += 7;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Grand Total", 14, yPos);
      doc.text(formatMoney(grandTotal), 196, yPos, { align: "right" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      yPos += 9;
      const cutleryLabel =
        orderToPrint.sendCutlery === false
          ? "Cutlery preference: Do not send cutlery"
          : "Cutlery preference: Send cutlery";
      doc.text(cutleryLabel, 14, yPos);

      const orderNote = getOrderNoteForRestaurant(orderToPrint);
      if (orderNote) {
        yPos += 8;
        doc.setFont("helvetica", "bold");
        doc.text("Restaurant note", 14, yPos);
        doc.setFont("helvetica", "normal");
        const noteLines = doc.splitTextToSize(orderNote, 180);
        doc.text(noteLines, 14, yPos + 6);
      }

      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(8.5);
      doc.setTextColor(107, 114, 128);
      doc.text(
        `Generated on ${new Date().toLocaleString("en-GB")}`,
        196,
        pageHeight - 10,
        { align: "right" },
      );

      const fileName = `Order-${orderToPrint.orderId || "Receipt"}-${Date.now()}.pdf`;
      doc.save(fileName);

      debugLog("? PDF generated successfully:", fileName);
    } catch (error) {
      debugError("? Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    }
  };

  // Handle swipe gestures with smooth animations
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchEndX.current = e.touches[0].clientX;
    isSwiping.current = false;
  };

  const handleTouchMove = (e) => {
    if (!isSwiping.current) {
      const deltaX = Math.abs(e.touches[0].clientX - touchStartX.current);
      const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current);

      // Determine if this is a horizontal swipe
      if (deltaX > deltaY && deltaX > 10) {
        isSwiping.current = true;
      }
    }

    if (isSwiping.current) {
      touchEndX.current = e.touches[0].clientX;
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping.current) {
      touchStartX.current = 0;
      touchEndX.current = 0;
      return;
    }

    const swipeDistance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;
    const swipeVelocity = Math.abs(swipeDistance);

    if (swipeVelocity > minSwipeDistance && !isTransitioning) {
      const currentIndex = filterTabs.findIndex(
        (tab) => tab.id === activeFilter,
      );
      let newIndex = currentIndex;

      if (swipeDistance > 0 && currentIndex < filterTabs.length - 1) {
        // Swipe left - go to next filter (right side)
        newIndex = currentIndex + 1;
      } else if (swipeDistance < 0 && currentIndex > 0) {
        // Swipe right - go to previous filter (left side)
        newIndex = currentIndex - 1;
      }

      if (newIndex !== currentIndex) {
        setIsTransitioning(true);

        // Smooth transition with animation
        setTimeout(() => {
          setActiveFilter(filterTabs[newIndex].id);
          scrollToFilter(newIndex);

          // Reset transition state after animation
          setTimeout(() => {
            setIsTransitioning(false);
          }, 300);
        }, 50);
      }
    }

    // Reset touch positions
    touchStartX.current = 0;
    touchEndX.current = 0;
    touchStartY.current = 0;
    isSwiping.current = false;
  };

  // Scroll filter bar to show active button with smooth animation
  const scrollToFilter = (index) => {
    if (filterBarRef.current) {
      const buttons = filterBarRef.current.querySelectorAll("button");
      if (buttons[index]) {
        const button = buttons[index];
        const container = filterBarRef.current;
        const buttonLeft = button.offsetLeft;
        const buttonWidth = button.offsetWidth;
        const containerWidth = container.offsetWidth;
        const scrollLeft = buttonLeft - containerWidth / 2 + buttonWidth / 2;

        container.scrollTo({
          left: scrollLeft,
          behavior: "smooth",
        });
      }
    }
  };

  // Scroll to active filter on change with smooth animation
  useEffect(() => {
    const index = filterTabs.findIndex((tab) => tab.id === activeFilter);
    if (index >= 0) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        scrollToFilter(index);
      });
    }
  }, [activeFilter]);

  const handleSelectOrder = (order) => {
    selectedOrderHydrationRef.current = "";
    setSelectedOrder(normalizeSelectedOrderForSheet(order));
    setIsSheetOpen(true);
  };

  const renderContent = () => {
    switch (activeFilter) {
      case "all":
        return (
          <AllOrders
            onSelectOrder={handleSelectOrder}
            onCancel={handleCancelClick}
            refreshToken={ordersRefreshToken}
          />
        );
      case "preparing":
        return (
          <PreparingOrders
            onSelectOrder={handleSelectOrder}
            onCancel={handleCancelClick}
            refreshToken={ordersRefreshToken}
            onStatusChanged={requestOrdersRefresh}
          />
        );
      case "ready":
        return (
          <ReadyOrders
            onSelectOrder={handleSelectOrder}
            refreshToken={ordersRefreshToken}
          />
        );
      case "out-for-delivery":
        return (
          <OutForDeliveryOrders
            onSelectOrder={handleSelectOrder}
            refreshToken={ordersRefreshToken}
          />
        );
      case "scheduled":
        return <EmptyState message="Scheduled orders will appear here" />;
      case "completed":
        return (
          <CompletedOrders
            onSelectOrder={handleSelectOrder}
            refreshToken={ordersRefreshToken}
          />
        );
      case "cancelled":
        return (
          <CancelledOrders
            onSelectOrder={handleSelectOrder}
            refreshToken={ordersRefreshToken}
          />
        );
      default:
        return <EmptyState />;
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft }}
    >
      {/* Restaurant Navbar - Sticky at top */}
      <div className="sticky top-0 z-50 bg-white">
        <RestaurantNavbar showNotifications={true} showSearch={false} />
      </div>

      {/* Top Filter Bar - Sticky below navbar */}
      <div className="sticky top-[50px] z-40 pb-2 bg-gray-100">
        <div
          ref={filterBarRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide bg-transparent rounded-full px-3 py-2 mt-2"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
          }}>
          <style>{`
            .scrollbar-hide::-webkit-scrollbar {
              display: none;
            }
          `}</style>
          {filterTabs.map((tab, index) => {
            const isActive = activeFilter === tab.id;

            return (
              <motion.button
                key={tab.id}
                onClick={() => {
                  if (!isTransitioning) {
                    setIsTransitioning(true);
                    setActiveFilter(tab.id);
                    scrollToFilter(index);
                    setTimeout(() => setIsTransitioning(false), 300);
                  }
                }}
                className={`shrink-0 px-6 py-3.5 rounded-full font-medium text-sm whitespace-nowrap relative overflow-hidden ${
                  isActive ? "text-white" : "bg-white text-gray-900"
                }`}
                animate={{
                  scale: isActive ? 1.05 : 1,
                  opacity: isActive ? 1 : 0.7,
                }}
                transition={{
                  duration: 0.3,
                  ease: [0.25, 0.1, 0.25, 1],
                }}
                whileTap={{ scale: 0.95 }}>
                {isActive && (
                  <motion.div
                    layoutId="activeFilterBackground"
                    className="absolute inset-0 rounded-full -z-10"
                    style={{ background: BRAND_THEME.gradients.primary }}
                    initial={false}
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 30,
                    }}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Content Area - Scrollable */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto px-4 pb-24 content-scroll"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={(e) => {
          mouseStartX.current = e.clientX;
          mouseEndX.current = e.clientX;
          isMouseDown.current = true;
          isSwiping.current = false;
        }}
        onMouseMove={(e) => {
          if (isMouseDown.current) {
            if (!isSwiping.current) {
              const deltaX = Math.abs(e.clientX - mouseStartX.current);
              if (deltaX > 10) {
                isSwiping.current = true;
              }
            }
            if (isSwiping.current) {
              mouseEndX.current = e.clientX;
            }
          }
        }}
        onMouseUp={() => {
          if (isMouseDown.current && isSwiping.current) {
            const swipeDistance = mouseStartX.current - mouseEndX.current;
            const minSwipeDistance = 50;

            if (
              Math.abs(swipeDistance) > minSwipeDistance &&
              !isTransitioning
            ) {
              const currentIndex = filterTabs.findIndex(
                (tab) => tab.id === activeFilter,
              );
              let newIndex = currentIndex;

              if (swipeDistance > 0 && currentIndex < filterTabs.length - 1) {
                newIndex = currentIndex + 1;
              } else if (swipeDistance < 0 && currentIndex > 0) {
                newIndex = currentIndex - 1;
              }

              if (newIndex !== currentIndex) {
                setIsTransitioning(true);
                setTimeout(() => {
                  setActiveFilter(filterTabs[newIndex].id);
                  scrollToFilter(newIndex);
                  setTimeout(() => setIsTransitioning(false), 300);
                }, 50);
              }
            }
          }

          isMouseDown.current = false;
          isSwiping.current = false;
          mouseStartX.current = 0;
          mouseEndX.current = 0;
        }}
        onMouseLeave={() => {
          isMouseDown.current = false;
          isSwiping.current = false;
        }}>
        <style>{`
          .content-scroll {
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .content-scroll::-webkit-scrollbar {
            display: none;
          }
        `}</style>

        {/* Verification Pending Card - Show if onboarding is complete (all 4 steps) and restaurant is not active */}
        {!restaurantStatus.isLoading &&
          !restaurantStatus.isActive &&
          restaurantStatus.onboarding?.completedSteps === 4 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className={`mt-4 mb-4 rounded-2xl shadow-sm px-6 py-4 ${
                restaurantStatus.rejectionReason
                  ? "bg-white border border-red-200"
                  : "bg-white border border-yellow-200"
              }`}>
              {restaurantStatus.rejectionReason ? (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex-shrink-0 rounded-full p-2 bg-red-100">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-red-600 mb-2">
                        Denied Verification
                      </h3>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                        <p className="text-xs font-semibold text-red-800 mb-2">
                          Reason for Rejection:
                        </p>
                        <div className="text-xs text-red-700 space-y-1">
                          {restaurantStatus.rejectionReason
                            .split("\n")
                            .filter((line) => line.trim()).length > 1 ? (
                            <ul className="space-y-1 list-disc list-inside">
                              {restaurantStatus.rejectionReason
                                .split("\n")
                                .map(
                                  (point, index) =>
                                    point.trim() && (
                                      <li key={index}>{point.trim()}</li>
                                    ),
                                )}
                            </ul>
                          ) : (
                            <p className="text-red-700">
                              {restaurantStatus.rejectionReason}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 mb-3">
                    Please correct the above issues and click "Reverify" to
                    resubmit your request for approval.
                  </p>
                  <button
                    onClick={handleReverify}
                    disabled={isReverifying}
                    className="w-full px-6 py-2.5 bg-brand-600 text-white rounded-lg font-semibold text-sm hover:bg-brand-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {isReverifying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Reverify"
                    )}
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    Verification Done in 24 Hours
                  </h3>
                  <p className="text-sm text-gray-600">
                    Your account is under verification. You'll be notified once
                    approved.
                  </p>
                </>
              )}
            </motion.div>
          )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeFilter}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}>
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Audio element */}
      <audio
        ref={audioRef}
        src={notificationSound}
        preload="auto"
        playsInline
      />

      {/* New Order Popup */}
      <AnimatePresence>
        {showNewOrderPopup && (

            <motion.div
              className="fixed inset-0 z-[60] bg-brand-900/50 flex items-end justify-center p-3 pb-20 sm:items-center sm:p-4 sm:pb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}>
              <motion.div
                className="w-[96%] max-w-md max-h-[calc(100dvh-9.5rem)] sm:max-h-[calc(100dvh-2rem)] bg-white rounded-[1.25rem] sm:rounded-[2rem] shadow-2xl overflow-hidden p-1 flex flex-col"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-3 py-2.5 sm:px-4 sm:py-3 bg-white border-b border-gray-200 flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-gray-900">
                      {(popupOrder || newOrder)?.orderId || "#Order"}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {(popupOrder || newOrder)?.restaurantName || "Restaurant"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrint}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label="Print">
                      <Printer className="w-5 h-5 text-gray-700" />
                    </button>
                    <button
                      onClick={toggleMute}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label={isMuted ? "Unmute" : "Mute"}>
                      {isMuted ? (
                        <VolumeX className="w-5 h-5 text-gray-700" />
                      ) : (
                        <Volume2 className="w-5 h-5 text-gray-700" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="px-3 pt-2.5 pb-3 sm:px-4 sm:pt-3 sm:pb-5 flex-1 overflow-y-auto min-h-0 overscroll-contain">
                  {/* Scheduled Indicator */}
                  {(popupOrder || newOrder)?.scheduledAt && (
                    <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-green-800 uppercase tracking-wider">
                          Scheduled Order
                        </p>
                        <p className="text-sm font-semibold text-green-900 mt-0.5">
                          For{" "}
                          {new Date(
                            (popupOrder || newOrder).scheduledAt,
                          ).toLocaleString("en-US", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Customer info */}
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-900">
                      {(popupOrder || newOrder)?.items?.[0]?.name ||
                        "New Order"}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      {(popupOrder || newOrder)?.createdAt
                        ? new Date(
                            (popupOrder || newOrder).createdAt,
                          ).toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Just now"}
                    </p>
                  </div>

                  {getOrderNoteForRestaurant(popupOrder || newOrder) && (
                    <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                        Restaurant note
                      </p>
                      <p className="mt-1 text-sm leading-5 text-brand-900">
                        {getOrderNoteForRestaurant(popupOrder || newOrder)}
                      </p>
                    </div>
                  )}

                  {/* Details Accordion */}
                  <div className="mb-4">
                    <button
                      onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                      className="w-full flex items-center justify-between py-2 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <svg
                          className="w-5 h-5 text-gray-700"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        <span className="text-sm font-semibold text-gray-900">
                          Details
                        </span>
                        <span className="text-xs text-gray-500">
                          {(popupOrder || newOrder)?.items?.length || 0} item
                          {(popupOrder || newOrder)?.items?.length !== 1
                            ? "s"
                            : ""}
                        </span>
                      </div>
                      {isDetailsExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-600" />
                      )}
                    </button>

                    <AnimatePresence>
                      {isDetailsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden">
                          <div className="py-3">
                            {(() => {
                              const orderItems = Array.isArray(
                                (popupOrder || newOrder)?.items,
                              )
                                ? (popupOrder || newOrder).items
                                : [];

                              if (orderItems.length === 0) {
                                return (
                                  <p className="text-sm text-gray-500">
                                    No items
                                  </p>
                                );
                              }

                              return (
                                <div className="overflow-x-auto rounded-lg border border-gray-200">
                                  <table className="min-w-full text-xs">
                                    <thead className="bg-gray-50 text-gray-600">
                                      <tr>
                                        <th className="px-2 py-2 text-left font-semibold">
                                          Item
                                        </th>
                                        <th className="px-2 py-2 text-right font-semibold">
                                          Qty
                                        </th>
                                        <th className="px-2 py-2 text-right font-semibold">
                                          Rate
                                        </th>
                                        <th className="px-2 py-2 text-right font-semibold">
                                          Total
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {orderItems.map((item, index) => {
                                        const quantity = Math.max(
                                          1,
                                          Number(item?.quantity || 1),
                                        );
                                        const unitPrice = Number(
                                          item?.price ??
                                            item?.unitPrice ??
                                            item?.basePrice ??
                                            0,
                                        );
                                        const lineTotal = Number(
                                          item?.totalPrice ??
                                            item?.lineTotal ??
                                            item?.subtotal ??
                                            unitPrice * quantity,
                                        );
                                        const itemName =
                                          item?.name || item?.title || "Item";
                                        const itemVariant =
                                          getPopupItemVariantText(item);
                                        const itemDisplayName = itemVariant
                                          ? `${itemName} (${itemVariant})`
                                          : itemName;
                                        const isVegItem =
                                          item?.isVeg === true ||
                                          String(item?.foodType || "")
                                            .toLowerCase()
                                            .trim() === "veg" ||
                                          String(item?.type || "")
                                            .toLowerCase()
                                            .trim() === "veg";

                                        return (
                                          <tr
                                            key={`${itemName}-${index}`}
                                            className="border-t border-gray-100 align-top">
                                            <td className="px-2 py-2.5 text-gray-900 font-medium">
                                              <div className="flex items-start gap-2">
                                                <span
                                                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                                                    isVegItem
                                                      ? "bg-green-500"
                                                      : "bg-red-500"
                                                  }`}
                                                />
                                                <span>{itemDisplayName}</span>
                                              </div>
                                            </td>
                                            <td className="px-2 py-2.5 text-right text-gray-900">
                                              {quantity}
                                            </td>
                                            <td className="px-2 py-2.5 text-right text-gray-900">
                                              {formatPopupAmount(unitPrice)}
                                            </td>
                                            <td className="px-2 py-2.5 text-right font-semibold text-gray-900">
                                              {formatPopupAmount(lineTotal)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            })()}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Cutlery preference */}
                  <div
                    className={`mb-4 flex items-center gap-2 rounded-lg p-3 ${(popupOrder || newOrder)?.sendCutlery === false
                        ? "bg-orange-50"
                        : "bg-gray-50"
                      }`}>
                    <svg
                      className={`h-5 w-5 ${(popupOrder || newOrder)?.sendCutlery === false
                          ? "text-orange-600"
                          : "text-gray-600"
                        }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    <span
                      className={`text-sm font-medium ${(popupOrder || newOrder)?.sendCutlery === false
                          ? "text-orange-700"
                          : "text-gray-700"
                        }`}>
                      {(popupOrder || newOrder)?.sendCutlery === false
                        ? "Don't send cutlery"
                        : "Send cutlery"}
                    </span>
                  </div>

                  {(() => {
                    const bill = getPopupBillBreakdown(popupOrder || newOrder);
                    return (
                      <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/80 p-3">
                        <p className="text-sm font-semibold text-gray-900">Bill summary</p>

                        <div className="mt-2 space-y-1.5 text-sm">
                          <div className="flex items-center justify-between text-gray-700">
                            <span>Item total</span>
                            <span>{formatPopupAmount(bill.itemTotal)}</span>
                          </div>
                          <div className="flex items-center justify-between text-gray-700">
                            <span>Packaging fee</span>
                            <span>{formatPopupAmount(bill.packagingFee)}</span>
                          </div>
                          <div className="flex items-center justify-between text-gray-700">
                            <span>Delivery fee</span>
                            <span>{formatPopupAmount(bill.deliveryFee)}</span>
                          </div>
                          <div className="flex items-center justify-between text-gray-700">
                            <span>Platform fee</span>
                            <span>{formatPopupAmount(bill.platformFee)}</span>
                          </div>
                          <div className="flex items-center justify-between text-gray-700">
                            <span>Taxes & charges (GST)</span>
                            <span>{formatPopupAmount(bill.taxes)}</span>
                          </div>
                          {bill.discount > 0 && (
                            <div className="flex items-center justify-between text-green-700">
                              <span>Total discount</span>
                              <span>-{formatPopupAmount(bill.discount)}</span>
                            </div>
                          )}
                        </div>

                        <div className="mt-2 border-t border-gray-200 pt-2 flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-900">Total bill</span>
                          <span className="text-base font-bold text-gray-900">
                            {formatPopupAmount(bill.total)}
                          </span>
                        </div>

                        {bill.commission > 0 && (
                          <div className="mt-2 flex items-center justify-between text-sm text-orange-700">
                            <span>Restaurant commission</span>
                            <span className="font-semibold">-{formatPopupAmount(bill.commission)}</span>
                          </div>
                        )}

                        <div className="mt-2 rounded-lg border border-green-200 bg-green-50 px-2.5 py-2 flex items-center justify-between">
                          <span className="text-sm font-semibold text-green-800">Your earning</span>
                          <span className="text-sm font-bold text-green-800">
                            {formatPopupAmount(bill.restaurantEarning)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Payment snapshot from backend order payload */}
                  {(() => {
                    const payment = (popupOrder || newOrder)?.payment || {};
                    const rawMethod =
                      (popupOrder || newOrder)?.paymentMethod ||
                      payment?.method;
                    const method = String(rawMethod || "")
                      .toLowerCase()
                      .trim();
                    const methodLabelMap = {
                      cash: "Cash on Delivery",
                      cod: "Cash on Delivery",
                      razorpay: "Razorpay",
                      razorpay_qr: "Razorpay QR",
                      wallet: "Wallet",
                      card: "Card",
                    };
                    const methodLabel =
                      methodLabelMap[method] ||
                      (rawMethod
                        ? String(rawMethod).replace(/_/g, " ")
                        : "Unknown");

                    const rawStatus = payment?.status;
                    const statusLabel = rawStatus
                      ? String(rawStatus).replace(/_/g, " ")
                      : "";

                    const isCashLike = method === "cash" || method === "cod";

                    return (
                      <div className="mb-4 flex items-center justify-between py-2">
                        <span className="text-sm font-medium text-gray-700">
                          Payment
                        </span>
                        <span
                          className={`text-sm font-semibold ${isCashLike ? "text-amber-600" : "text-green-600"}`}>
                          {methodLabel}
                          {statusLabel ? ` (${statusLabel})` : ""}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Preparation time */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">
                        Preparation time
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPrepTime(Math.max(1, prepTime - 1))}
                          className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
                          <Minus className="w-4 h-4 text-gray-700" />
                        </button>
                        <span className="text-base font-semibold text-gray-900 min-w-[60px] text-center">
                          {prepTime} mins
                        </span>
                        <button
                          onClick={() => setPrepTime(prepTime + 1)}
                          className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
                          <Plus className="w-4 h-4 text-gray-700" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sticky bottom-0 z-10 px-3 pt-2.5 pb-[calc(0.6rem+env(safe-area-inset-bottom))] sm:px-4 sm:pt-3 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-gray-200 bg-white">
                  <div className="space-y-2.5 sm:space-y-3">
                    <div
                      ref={acceptSliderRef}
                      className="relative h-12 sm:h-14 rounded-2xl overflow-hidden select-none touch-pan-y"
                      style={{ background: BRAND_THEME.gradients.primary }}>
                      <motion.div
                        className="absolute inset-y-0 left-0"
                        style={{ backgroundColor: `${BRAND_THEME.colors.brand.primary}cc` }}
                        initial={{ width: "100%" }}
                        animate={{ width: `${(countdown / 240) * 100}%` }}
                        transition={{ duration: 1, ease: "linear" }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center px-16">
                        <span className="relative z-10 text-sm font-semibold text-white text-center">
                          {isAcceptingOrder
                            ? "Accepting order..."
                            : "Slide to accept"}
                        </span>
                      </div>
                      <motion.button
                        type="button"
                        className="absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-white text-gray-900 shadow-md disabled:cursor-not-allowed"
                        animate={{
                          x: (() => {
                            const sliderWidth =
                              acceptSliderRef.current?.offsetWidth || 320;
                            const handleWidth = 40;
                            const maxTravel = Math.max(
                              sliderWidth - handleWidth - 16,
                              0,
                            );
                            return acceptSwipeProgress * maxTravel;
                          })(),
                        }}
                        transition={{
                          type: "tween",
                          duration: acceptSwipeActiveRef.current ? 0 : 0.3,
                          ease: "easeOut"
                        }}
                        onMouseDown={(e) => handleAcceptSwipeStart(e.clientX)}
                        onTouchStart={(e) =>
                          handleAcceptSwipeStart(e.touches[0].clientX)
                        }
                        onMouseMove={(e) => {
                          if (acceptSwipeActiveRef.current)
                            handleAcceptSwipeMove(e.clientX);
                        }}
                        onTouchMove={(e) =>
                          handleAcceptSwipeMove(e.touches[0].clientX)
                        }
                        onMouseUp={handleAcceptSwipeEnd}
                        onTouchEnd={handleAcceptSwipeEnd}
                        onTouchCancel={handleAcceptSwipeEnd}
                        disabled={isAcceptingOrder}>
                        <span className="text-lg font-bold">›</span>
                      </motion.button>
                    </div>

                    <button
                      onClick={handleCancelOrderClick}
                      disabled={isAcceptingOrder}
                      className="w-full rounded-lg border border-red-400 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60">
                      Cancel order
                    </button>

                    <button
                      onClick={handleNeedHelpClick}
                      disabled={isAcceptingOrder}
                      className="w-full text-center text-xs sm:text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700 transition-colors disabled:opacity-60">
                      Need help with this order
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>

        )}
      </AnimatePresence>

      {/* Reject Order Popup */}
      <AnimatePresence>
        {showRejectPopup && (

            <motion.div
              className="fixed inset-0 z-[70] bg-brand-900/50 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleRejectCancel}>
              <motion.div
                className="w-[95%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-4 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900">
                    Reject Order {(popupOrder || newOrder)?.orderId || "#Order"}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Please select a reason for rejecting this order
                  </p>
                </div>

                {/* Content */}
                <div className="px-4 py-4 max-h-[60vh] overflow-y-auto">
                  <div className="space-y-2">
                    {rejectReasons.map((reason) => (
                      <button
                        key={reason}
                        onClick={() => setRejectReason(reason)}
                        className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                          rejectReason === reason
                            ? "border-black"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}>
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-sm font-medium ${
                              rejectReason === reason
                                ? "text-black"
                                : "text-gray-900"
                            }`}>
                            {reason}
                          </span>
                          {rejectReason === reason && (
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center"
                              style={{ background: BRAND_THEME.gradients.primary }}>
                              <svg
                                className="w-3 h-3 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
                  <button
                    onClick={handleRejectCancel}
                    className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold text-sm hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleRejectConfirm}
                    disabled={!rejectReason}
                    className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-colors ${
                      rejectReason
                        ? "!text-white"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                    style={rejectReason ? { background: BRAND_THEME.gradients.primary } : undefined}>
                    Confirm Rejection
                  </button>
                </div>
              </motion.div>
            </motion.div>

        )}
      </AnimatePresence>

      {/* Cancel Order Popup */}
      <AnimatePresence>
        {showCancelPopup && orderToCancel && (

            <motion.div
              className="fixed inset-0 z-[70] bg-brand-900/50 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCancelPopupClose}>
              <motion.div
                className="w-[95%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-4 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900">
                    Cancel Order {orderToCancel.orderId || "#Order"}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Please provide a reason for cancelling this order
                  </p>
                </div>

                {/* Content */}
                <div className="px-4 py-4">
                  <div className="space-y-3">
                    {rejectReasons.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setCancelReason(reason)}
                        className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                          cancelReason === reason
                            ? "border-red-500 bg-red-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}>
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              cancelReason === reason
                                ? "border-red-500 bg-red-500"
                                : "border-gray-300"
                            }`}>
                            {cancelReason === reason && (
                              <svg
                                className="w-3 h-3 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                          <span
                            className={`text-sm font-medium ${
                              cancelReason === reason
                                ? "text-red-700"
                                : "text-gray-700"
                            }`}>
                            {reason}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
                  <button
                    onClick={handleCancelPopupClose}
                    className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold text-sm hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleCancelConfirm}
                    disabled={!cancelReason}
                    className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-colors ${
                      cancelReason
                        ? "!bg-red-600 !text-white hover:bg-red-700"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}>
                    Confirm Cancellation
                  </button>
                </div>
              </motion.div>
            </motion.div>

        )}
      </AnimatePresence>

      {/* Bottom Sheet for Order Details */}
      <AnimatePresence>
        {isSheetOpen && selectedOrder && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ backgroundColor: `${BRAND_THEME.colors.brand.primary}66` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setIsSheetOpen(false);
              setSelectedOrder(null);
              selectedOrderHydrationRef.current = "";
            }}>
            <motion.div
              className="w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto bg-white rounded-t-3xl p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom)+6rem)] shadow-lg"
              initial={{ y: 80 }}
              animate={{ y: 0 }}
              exit={{ y: 80 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}>
              {/* Drag handle */}
              <div className="flex justify-center mb-3">
                <div className="h-1 w-10 rounded-full bg-gray-300" />
              </div>

              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-sm font-semibold text-black">
                    Order #{selectedOrder.orderId}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedOrder.customerName}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {selectedOrder.type}
                    {selectedOrder.tableOrToken
                      ? ` • ${selectedOrder.tableOrToken}`
                      : ""}
                  </p>
                  {selectedOrder.deliveryPartnerName ? (
                    <p className="text-[11px] text-gray-600 mt-1">
                      Delivery Partner:{" "}
                      <span className="font-semibold text-gray-800">
                        {selectedOrder.deliveryPartnerName}
                      </span>
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border ${
                      selectedOrder.status === "Ready"
                        ? "border-green-500 text-green-600"
                        : "border-gray-800 text-gray-900"
                    }`}>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        selectedOrder.status === "Ready"
                          ? "bg-green-500"
                          : "bg-gray-800"
                      }`}
                    />
                    {selectedOrder.status}
                  </span>
                  <span className="text-[11px] text-gray-500">
                    {selectedOrder.timePlaced}
                  </span>
                </div>
              </div>

              <div className="border-t border-gray-100 my-3" />

              <div className="mb-3">
                <p className="text-xs font-medium text-gray-700 mb-1">Items</p>
                {Array.isArray(selectedOrder.items) &&
                selectedOrder.items.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium">Item</th>
                          <th className="px-2 py-2 text-center font-medium">Qty</th>
                          <th className="px-2 py-2 text-right font-medium">Rate</th>
                          <th className="px-2 py-2 text-right font-medium">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.items.map((item, index) => {
                          const quantity = Math.max(1, Number(item?.quantity || 1));
                          const variantName =
                            item?.variantName ||
                            item?.selectedVariant?.name ||
                            item?.variant?.name ||
                            item?.size ||
                            "-";
                          const unitPrice = Number(
                            item?.price ??
                              item?.unitPrice ??
                              item?.basePrice ??
                              item?.selectedVariant?.price ??
                              0,
                          );
                          const lineTotalRaw = Number(
                            item?.totalPrice ??
                              item?.lineTotal ??
                              item?.subtotal ??
                              unitPrice * quantity,
                          );
                          const lineTotal = Number.isFinite(lineTotalRaw)
                            ? lineTotalRaw
                            : 0;
                          const itemName = item?.name || "Item";
                          const itemDisplayName =
                            variantName && variantName !== "-"
                              ? `${itemName} (${variantName})`
                              : itemName;

                          return (
                            <tr key={`${item?.id || item?.name || "item"}-${index}`} className="border-t border-gray-100">
                              <td className="px-2 py-2 text-gray-800">
                                {itemDisplayName}
                              </td>
                              <td className="px-2 py-2 text-center text-gray-700">
                                {quantity}
                              </td>
                              <td className="px-2 py-2 text-right text-gray-700">
                                Rs {unitPrice.toFixed(2)}
                              </td>
                              <td className="px-2 py-2 text-right text-gray-800">
                                Rs {lineTotal.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">
                    {selectedOrder.itemsSummary}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-500 mb-4">
                {/* Hide ETA for ready orders */}
                {selectedOrder.status !== "ready" && selectedOrder.eta && (
                  <span>
                    ETA:{" "}
                    <span className="font-medium text-black">
                      {selectedOrder.eta}
                    </span>
                  </span>
                )}
                {(() => {
                  const raw = selectedOrder.paymentMethod;
                  const normalized =
                    raw != null ? String(raw).toLowerCase().trim() : "";
                  const isCod = normalized === "cash" || normalized === "cod";
                  return (
                    <span>
                      Payment:{" "}
                      <span
                        className={`font-medium ${isCod ? "text-amber-700" : "text-black"}`}>
                        {isCod ? "Cash on Delivery" : "Paid online"}
                      </span>
                    </span>
                  );
                })()}
              </div>

              <button
                className="w-full text-white py-2.5 rounded-xl text-sm font-medium"
                style={{ background: BRAND_THEME.gradients.primary }}
                onClick={() => {
                  setIsSheetOpen(false);
                  setSelectedOrder(null);
                  selectedOrderHydrationRef.current = "";
                }}>
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation - Sticky */}
      <BottomNavOrders />
    </div>
  );
}


// Order Card Component
function OrderCard({
  orderId,
  mongoId,
  status,
  customerName,
  type,
  tableOrToken,
  timePlaced,
  eta,
  itemsSummary,
  items,
  paymentMethod,
  photoUrl,
  photoAlt,
  deliveryPartnerId,
  deliveryPartnerName,
  dispatchStatus,
  deliveryState,
  onSelect,
  onCancel,
  onMarkReady,
  isMarkingReady = false,
}) {
  const normalizedStatus = String(status || "").toLowerCase();
  const dispatchStatusLower = String(dispatchStatus || "").toLowerCase();
  const deliveryPhase = String(deliveryState?.currentPhase || "").toLowerCase();
  const deliveryStateStatus = String(deliveryState?.status || "").toLowerCase();
  const hasDeliveryProgressAfterAccept =
    deliveryPhase === "at_pickup" ||
    deliveryPhase === "en_route_to_delivery" ||
    deliveryPhase === "at_drop" ||
    deliveryPhase === "delivered" ||
    deliveryStateStatus === "reached_pickup" ||
    deliveryStateStatus === "picked_up" ||
    deliveryStateStatus === "reached_drop" ||
    deliveryStateStatus === "out_for_delivery" ||
    Boolean(deliveryState?.reachedPickupAt) ||
    Boolean(deliveryState?.pickedUpAt) ||
    Boolean(deliveryState?.reachedDropAt) ||
    Boolean(deliveryState?.deliveredAt);
  const isDeliveryAccepted =
    dispatchStatusLower === "accepted" ||
    Boolean(deliveryState?.acceptedAt) ||
    hasDeliveryProgressAfterAccept;
  const isReady = normalizedStatus === "ready";
  const isPreparing = normalizedStatus === "preparing";
  let statusLabel = String(status || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  if (
    normalizedStatus === "out_for_delivery" ||
    normalizedStatus === "picked_up" ||
    normalizedStatus === "en_route_to_delivery"
  ) {
    statusLabel = "Picked Up";
  } else if (
    normalizedStatus === "reached_drop" ||
    normalizedStatus === "at_drop" ||
    normalizedStatus === "at_delivery"
  ) {
    statusLabel = "Picked Up";
  }

  return (
    <div className="w-full bg-white rounded-2xl p-4 mb-3 border border-gray-200 hover:border-gray-400 transition-colors relative">
      {/* Cancel button - only show for preparing orders */}
      {isPreparing && onCancel && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCancel({ orderId, mongoId, customerName });
          }}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors z-10"
          title="Cancel Order">
          <X className="w-4 h-4" />
        </button>
      )}
      <div
        onClick={() =>
          onSelect?.({
            orderId,
            mongoId,
            status,
            customerName,
            type,
            tableOrToken,
            timePlaced,
            eta,
            itemsSummary,
            items,
            paymentMethod,
            deliveryPartnerName,
          })
        }
        className="w-full text-left flex gap-3 items-stretch cursor-pointer">
        {/* Photo */}
        <div className="h-20 w-20 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0 my-auto">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={photoAlt}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center px-2">
              <span className="text-[11px] font-medium text-gray-500 text-center leading-tight">
                {photoAlt}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col justify-between min-h-[80px]">
          {/* Top row */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-black leading-tight">
                Order #{orderId}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">{customerName}</p>
            </div>

            <div className="flex flex-col items-end gap-1" style={{ paddingRight: isPreparing && onCancel ? '32px' : '0' }}>
              <span
                className={`inline-flex items-start gap-1 px-2 py-1 rounded-full text-[11px] font-medium border text-right whitespace-normal break-words max-w-[140px] leading-tight ${
                  isReady
                    ? "border-green-500 text-green-600"
                    : "border-gray-800 text-gray-900"
                }`}>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isReady ? "bg-green-500" : "bg-gray-800"
                  }`}
                />
                {statusLabel}
              </span>
              <span className="text-[11px] text-gray-500 text-right whitespace-normal break-words max-w-[120px] leading-tight">
                {timePlaced}
              </span>
            </div>
          </div>

          {/* Middle row */}
          <div className="mt-2">
            <p className="text-xs text-gray-600 line-clamp-1">{itemsSummary}</p>
          </div>

          {/* Bottom row */}
          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] text-gray-500">
                {type}
                {tableOrToken ? ` • ${tableOrToken}` : ""}
              </p>
              {/* Delivery Assignment Status - Only show for active orders */}
              {(isPreparing || isReady || normalizedStatus === "confirmed") && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      isDeliveryAccepted
                        ? "bg-green-100 text-green-700 border border-green-300"
                        : "bg-orange-100 text-orange-700 border border-orange-300"
                    }`}>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isDeliveryAccepted ? "bg-green-500" : "bg-orange-500"
                      }`}
                    />
                    {isDeliveryAccepted ? "Assigned" : "Not Assigned"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isPreparing && onMarkReady && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkReady({ orderId, mongoId, customerName });
                  }}
                  disabled={isMarkingReady}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-green-600 text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                  {isMarkingReady ? "Marking..." : "Mark Ready"}
                </button>
              )}
              {/* Hide ETA for ready orders */}
              {!isReady && eta && (
                <div className="flex items-baseline gap-1">
                  <span className="text-[11px] text-gray-500">ETA</span>
                  <span className="text-xs font-medium text-black">{eta}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Preparing Orders List
function PreparingOrders({
  onSelectOrder,
  onCancel,
  refreshToken = 0,
  onStatusChanged,
}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [markingReadyOrderIds, setMarkingReadyOrderIds] = useState({});

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        // Fetch all orders and filter for 'preparing' status on frontend
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          // Filter orders with 'preparing' status only
          // 'confirmed' orders should only appear in popup notification, not in preparing list
          // After accepting, order status changes to 'preparing' and then appears here
          const preparingOrders = response.data.data.orders.filter(
            (order) => order.status === "preparing",
          );

          const transformedOrders = preparingOrders.map((order) => {
            const initialETA = order.estimatedDeliveryTime || 30; // in minutes
            const preparingTimestamp = order.tracking?.preparing?.timestamp
              ? new Date(order.tracking.preparing.timestamp)
              : new Date(order.createdAt); // Fallback to createdAt if preparing timestamp not available

            return {
              orderId: order.orderId || order._id,
              mongoId: order._id,
              status: order.status || "preparing",
              customerName: resolveCustomerName(order),
              type:
                order.deliveryFleet === "standard"
                  ? "Home Delivery"
                  : "Express Delivery",
              tableOrToken: null,
              timePlaced: formatOrderDateTime(order.createdAt),
              initialETA, // Store initial ETA in minutes
              preparingTimestamp, // Store when order started preparing
              itemsSummary:
                order.items
                  ?.map((item) => `${item.quantity}x ${item.name}`)
                  .join(", ") || "No items",
              items: Array.isArray(order.items) ? order.items : [],
              photoUrl: order.items?.[0]?.image || null,
              photoAlt: order.items?.[0]?.name || "Order",
              deliveryPartnerId: getDispatchPartnerId(order),
              deliveryPartnerName: getDispatchPartnerName(order),
              dispatchStatus: order.dispatch?.status || null,
              deliveryState: order.deliveryState || null,
              paymentMethod:
                order.paymentMethod || order.payment?.method || null,
            };
          });

          if (isMounted) {
            setOrders(transformedOrders);
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setOrders([]);
            setLoading(false);
          }
        }
      } catch (error) {
        if (!isMounted) return;

        // Don't log network errors, 404, or 401 errors
        // 401 is handled by axios interceptor (token refresh/redirect)
        // 404 means no orders found (normal)
        // ERR_NETWORK means backend is down (expected in dev)
        if (
          error.code !== "ERR_NETWORK" &&
          error.response?.status !== 404 &&
          error.response?.status !== 401
        ) {
          debugError("Error fetching preparing orders:", error);
        }

        if (isMounted) {
          setOrders([]);
          setLoading(false);
        }
      }
    };

    fetchOrders();

    // Update countdown every second
    const countdownIntervalId = setInterval(() => {
      if (isMounted) {
        setCurrentTime(new Date());
      }
    }, 1000);

    return () => {
      isMounted = false;
      if (countdownIntervalId) {
        clearInterval(countdownIntervalId);
      }
    };
  }, [refreshToken]); // Re-fetch only when parent requests it

  // Track which orders have been marked as ready to avoid duplicate API calls
  const markedReadyOrdersRef = useRef(new Set());

  // Auto-mark orders as ready when ETA reaches 0
  useEffect(() => {
    if (!currentTime || orders.length === 0) return;

    const checkAndMarkReady = async () => {
      for (const order of orders) {
        const orderKey = order.mongoId || order.orderId;

        // Skip if already marked as ready
        if (markedReadyOrdersRef.current.has(orderKey)) {
          continue;
        }

        // Calculate remaining ETA
        const elapsedMs = currentTime - order.preparingTimestamp;
        const elapsedMinutes = Math.floor(elapsedMs / 60000);
        const remainingMinutes = Math.max(0, order.initialETA - elapsedMinutes);

        // If ETA has reached 0 (or slightly past), mark as ready
        if (remainingMinutes <= 0 && order.status === "preparing") {
          const elapsedSeconds = Math.floor(elapsedMs / 1000);
          const totalETASeconds = order.initialETA * 60;

          // Mark as ready when ETA time has elapsed (with 2 second buffer)
          if (elapsedSeconds >= totalETASeconds - 2) {
            try {
              debugLog(
                `?? Auto-marking order ${order.orderId} as ready (ETA reached 0)`,
              );
              markedReadyOrdersRef.current.add(orderKey); // Mark as processing
              await restaurantAPI.markOrderReady(
                order.mongoId || order.orderId,
              );
              debugLog(`? Order ${order.orderId} marked as ready`);
              onStatusChanged?.();
              // Order will be removed from preparing list on next fetch
            } catch (error) {
              const status = error.response?.status;
              const msg = (
                error.response?.data?.message ||
                error.message ||
                ""
              ).toLowerCase();
              // If 400 and message says order cannot be marked ready (e.g. already ready),
              // treat as idempotent - backend cron or another client already marked it.
              if (
                status === 400 &&
                (msg.includes("cannot be marked as ready") ||
                  msg.includes("current status"))
              ) {
                // Keep in markedReadyOrdersRef so we don't retry; order will disappear on next fetch
              } else {
                debugError(
                  `? Failed to auto-mark order ${order.orderId} as ready:`,
                  error,
                );
                markedReadyOrdersRef.current.delete(orderKey);
              }
              // Don't show error toast - it will retry on next check (for non-idempotent errors)
            }
          }
        }
      }
    };

    // Check every 2 seconds for orders that need to be marked ready
    const readyCheckInterval = setInterval(checkAndMarkReady, 2000);

    return () => {
      clearInterval(readyCheckInterval);
    };
  }, [currentTime, orders]);

  // Clear marked orders when orders list changes (orders moved to ready)
  useEffect(() => {
    const currentOrderKeys = new Set(orders.map((o) => o.mongoId || o.orderId));
    // Remove keys that are no longer in the preparing orders list
    for (const key of markedReadyOrdersRef.current) {
      if (!currentOrderKeys.has(key)) {
        markedReadyOrdersRef.current.delete(key);
      }
    }
  }, [orders]);

  const handleMarkReady = async ({ orderId, mongoId, customerName }) => {
    const orderKey = mongoId || orderId;
    if (!orderKey || markingReadyOrderIds[orderKey]) return;

    try {
      setMarkingReadyOrderIds((prev) => ({ ...prev, [orderKey]: true }));
      await restaurantAPI.markOrderReady(orderKey);
      setOrders((prev) =>
        prev.filter((order) => (order.mongoId || order.orderId) !== orderKey),
      );
      toast.success(
        `Order ${orderId} marked ready${customerName ? ` for ${customerName}` : ""}`,
      );
      onStatusChanged?.();
    } catch (error) {
      const status = error.response?.status;
      const message =
        error.response?.data?.message || "Failed to mark order as ready";
      if (
        status === 400 &&
        String(message).toLowerCase().includes("current status")
      ) {
        setOrders((prev) =>
          prev.filter((order) => (order.mongoId || order.orderId) !== orderKey),
        );
        toast.success(`Order ${orderId} is already ready`);
        onStatusChanged?.();
      } else {
        toast.error(message);
      }
    } finally {
      setMarkingReadyOrderIds((prev) => {
        const next = { ...prev };
        delete next[orderKey];
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">
            Preparing orders
          </h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Preparing orders</h2>
        <span className="text-xs text-gray-500">{orders.length} active</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No orders in preparation
        </div>
      ) : (
        <div>
          {orders.map((order) => {
            // Calculate remaining ETA (countdown)
            const elapsedMs = currentTime - order.preparingTimestamp;
            const elapsedMinutes = Math.floor(elapsedMs / 60000);
            const remainingMinutes = Math.max(
              0,
              order.initialETA - elapsedMinutes,
            );

            // Format ETA display
            let etaDisplay = "";
            if (remainingMinutes <= 0) {
              const remainingSeconds = Math.max(
                0,
                Math.floor(order.initialETA * 60 - elapsedMs / 1000),
              );
              if (remainingSeconds > 0) {
                etaDisplay = `${remainingSeconds} secs`;
              } else {
                etaDisplay = "0 mins";
              }
            } else {
              etaDisplay = `${remainingMinutes} mins`;
            }

            return (
              <OrderCard
                key={order.orderId || order.mongoId}
                orderId={order.orderId}
                mongoId={order.mongoId}
                status={order.status}
                customerName={order.customerName}
                type={order.type}
                tableOrToken={order.tableOrToken}
                timePlaced={order.timePlaced}
                eta={etaDisplay}
                itemsSummary={order.itemsSummary}
                items={order.items}
                photoUrl={order.photoUrl}
                photoAlt={order.photoAlt}
                paymentMethod={order.paymentMethod}
                deliveryPartnerId={order.deliveryPartnerId}
                deliveryPartnerName={order.deliveryPartnerName}
                dispatchStatus={order.dispatchStatus}
                deliveryState={order.deliveryState}
                onSelect={onSelectOrder}
                onCancel={onCancel}
                onMarkReady={handleMarkReady}
                isMarkingReady={Boolean(
                  markingReadyOrderIds[order.mongoId || order.orderId],
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Ready Orders List
function ReadyOrders({ onSelectOrder, refreshToken = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        // Fetch all orders and filter for 'ready' status on frontend
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          // Filter orders with 'ready' status
          const readyOrders = response.data.data.orders.filter(
            (order) => order.status === "ready",
          );

          const transformedOrders = readyOrders.map((order) => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || "ready",
            customerName: resolveCustomerName(order),
            type:
              order.deliveryFleet === "standard"
                ? "Home Delivery"
                : "Express Delivery",
            tableOrToken: null,
            timePlaced: formatOrderDateTime(order.createdAt),
            eta: null, // Don't show ETA for ready orders
            itemsSummary:
              order.items
                ?.map((item) => `${item.quantity}x ${item.name}`)
                .join(", ") || "No items",
            items: Array.isArray(order.items) ? order.items : [],
            photoUrl: order.items?.[0]?.image || null,
            photoAlt: order.items?.[0]?.name || "Order",
            paymentMethod: order.paymentMethod || order.payment?.method || null,
            deliveryPartnerId: getDispatchPartnerId(order),
            deliveryPartnerName: getDispatchPartnerName(order),
            dispatchStatus: order.dispatch?.status || null,
            deliveryState: order.deliveryState || null,
          }));

          if (isMounted) {
            setOrders(transformedOrders);
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setOrders([]);
            setLoading(false);
          }
        }
      } catch (error) {
        if (!isMounted) return;

        // Don't log network errors repeatedly - they're expected if backend is down
        if (error.code !== "ERR_NETWORK" && error.response?.status !== 404) {
          debugError("Error fetching ready orders:", error);
        }

        if (isMounted) {
          setOrders([]);
          setLoading(false);
        }
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [refreshToken]); // Re-fetch only when parent requests it

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">
            Ready for pickup
          </h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Ready for pickup</h2>
        <span className="text-xs text-gray-500">{orders.length} active</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No orders ready for pickup
        </div>
      ) : (
        <div>
          {orders.map((order) => (
            <OrderCard
              key={order.orderId || order.mongoId}
              {...order}
              onSelect={onSelectOrder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Delivery Progress Orders List
const OutForDeliveryOrders = ({ onSelectOrder, refreshToken = 0 }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        // Fetch all orders and filter for active delivery progress statuses on frontend
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          // Filter orders that are in picked-up delivery stage equivalents
          const outForDeliveryOrders = response.data.data.orders.filter(
            (order) =>
              order.status === "out_for_delivery" ||
              order.status === "picked_up" ||
              order.status === "reached_drop" ||
              order.status === "at_drop" ||
              order.status === "at_delivery",
          );

          const transformedOrders = outForDeliveryOrders.map((order) => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || "picked_up",
            customerName: resolveCustomerName(order),
            type:
              order.deliveryFleet === "standard"
                ? "Home Delivery"
                : "Express Delivery",
            tableOrToken: null,
            timePlaced: formatOrderDateTime(order.createdAt),
            eta: null,
            itemsSummary:
              order.items
                ?.map((item) => `${item.quantity}x ${item.name}`)
                .join(", ") || "No items",
            items: Array.isArray(order.items) ? order.items : [],
            photoUrl: order.items?.[0]?.image || null,
            photoAlt: order.items?.[0]?.name || "Order",
            paymentMethod: order.paymentMethod || order.payment?.method || null,
            deliveryPartnerId: getDispatchPartnerId(order),
            deliveryPartnerName: getDispatchPartnerName(order),
            dispatchStatus: order.dispatch?.status || null,
            deliveryState: order.deliveryState || null,
          }));

          if (isMounted) {
            setOrders(transformedOrders);
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setOrders([]);
            setLoading(false);
          }
        }
      } catch (error) {
        if (!isMounted) return;

        // Don't log network errors repeatedly - they're expected if backend is down
        if (error.code !== "ERR_NETWORK" && error.response?.status !== 404) {
          debugError("Error fetching out for delivery orders:", error);
        }

        if (isMounted) {
          setOrders([]);
          setLoading(false);
        }
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [refreshToken]); // Re-fetch only when parent requests it

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">Delivery progress</h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Delivery progress</h2>
        <span className="text-xs text-gray-500">{orders.length} active</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No delivery progress orders
        </div>
      ) : (
        <div>
          {orders.map((order) => (
            <OrderCard
              key={order.orderId || order.mongoId}
              {...order}
              onSelect={onSelectOrder}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Empty State Component
function EmptyState({ message = "Temporarily closed" }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-12">
      {/* Store Illustration */}
      <div className="mb-6">
        <svg
          width="200"
          height="200"
          viewBox="0 0 200 200"
          className="text-gray-300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg">
          {/* Storefront */}
          <rect
            x="40"
            y="80"
            width="120"
            height="80"
            stroke="currentColor"
            strokeWidth="2"
            fill="white"
          />
          {/* Awning */}
          <path
            d="M30 80 L100 50 L170 80"
            stroke="currentColor"
            strokeWidth="2"
            fill="white"
          />
          {/* Doors */}
          <rect
            x="60"
            y="100"
            width="30"
            height="60"
            stroke="currentColor"
            strokeWidth="2"
            fill="white"
          />
          <rect
            x="110"
            y="100"
            width="30"
            height="60"
            stroke="currentColor"
            strokeWidth="2"
            fill="white"
          />
          {/* Laptop */}
          <rect
            x="70"
            y="140"
            width="40"
            height="25"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="white"
          />
          <text
            x="85"
            y="155"
            fontSize="8"
            fill="currentColor"
            textAnchor="middle">
            CLOSED
          </text>
          {/* Sign */}
          <rect
            x="80"
            y="170"
            width="40"
            height="20"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="white"
          />
        </svg>
      </div>

      {/* Message */}
      <h2 className="text-lg font-semibold text-gray-600 mb-4 text-center">
        {message}
      </h2>

      {/* View Status Button */}
      <button
        className="text-white px-6 py-3 rounded-lg font-medium transition-colors"
        style={{ background: BRAND_THEME.gradients.primary }}>
        View status
      </button>
    </div>
  );
}



