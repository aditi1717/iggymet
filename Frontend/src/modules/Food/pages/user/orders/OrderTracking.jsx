import { useParams, useNavigate, Link } from "react-router-dom"
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  ArrowLeft,
  Share2,
  RefreshCw,
  Phone,
  User,
  ChevronRight,
  MessageSquare,
  RotateCcw,
  X,
  Check,
  Shield,
  Receipt,
  CircleSlash,
  Loader2
} from "lucide-react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog"
import { Textarea } from "@food/components/ui/textarea"
import { useOrders } from "@food/context/OrdersContext"
import { useProfile } from "@food/context/ProfileContext"
import { useCart } from "@food/context/CartContext"
import { orderAPI } from "@food/api"
import { useCompanyName } from "@food/hooks/useCompanyName"
import circleIcon from "@food/assets/circleicon.png"
import { RESTAURANT_PIN_SVG, CUSTOMER_PIN_SVG, RIDER_BIKE_SVG } from "@food/constants/mapIcons"
import BRAND_THEME from "@/config/brandTheme"

// Fallback definitions in case imports fail at runtime or are shadowed
const DEFAULT_CUSTOMER_PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#10B981"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11.4.48 1.08.48 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/><circle cx="12" cy="9" r="3" fill="#FFFFFF"/></svg>`;
const SAFE_CUSTOMER_PIN = typeof CUSTOMER_PIN_SVG !== 'undefined' ? CUSTOMER_PIN_SVG : DEFAULT_CUSTOMER_PIN;
const DEFAULT_RESTAURANT_PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#FF6B35"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11.4.48 1.08.48 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/><circle cx="12" cy="9" r="3" fill="#FFFFFF"/></svg>`;
const SAFE_RESTAURANT_PIN = typeof RESTAURANT_PIN_SVG !== 'undefined' ? RESTAURANT_PIN_SVG : DEFAULT_RESTAURANT_PIN;

const debugLog = (...args) => console.log('[OrderTracking]', ...args)
const debugWarn = (...args) => console.warn('[OrderTracking]', ...args)
const debugError = (...args) => console.error('[OrderTracking]', ...args)


// Section item component
const SectionItem = ({ icon: Icon, iconNode, title, subtitle, onClick, showArrow = true, rightContent }) => (
  <motion.button
    onClick={onClick}
    className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left border-b border-dashed border-gray-200 last:border-0"
    whileTap={{ scale: 0.99 }}
  >
    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
      {iconNode ? (
        <div
          className="w-6 h-6 flex-shrink-0 flex items-center justify-center [&_svg]:w-full [&_svg]:h-full [&_svg]:block"
        >
          {iconNode}
        </div>
      ) : (
        <Icon className="w-5 h-5 text-gray-600 flex-shrink-0" />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-medium text-gray-900 truncate">{title}</p>
      {subtitle && <p className="text-sm text-gray-500 truncate">{subtitle}</p>}
    </div>
    {rightContent || (showArrow && <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />)}
  </motion.button>
)

const getRestaurantCoordsFromOrder = (apiOrder, fallback = null) => {
  if (
    apiOrder?.restaurantId?.location?.coordinates &&
    Array.isArray(apiOrder.restaurantId.location.coordinates) &&
    apiOrder.restaurantId.location.coordinates.length >= 2
  ) {
    return apiOrder.restaurantId.location.coordinates
  }
  if (apiOrder?.restaurantId?.location?.latitude && apiOrder?.restaurantId?.location?.longitude) {
    return [apiOrder.restaurantId.location.longitude, apiOrder.restaurantId.location.latitude]
  }
  if (
    apiOrder?.restaurant?.location?.coordinates &&
    Array.isArray(apiOrder.restaurant.location.coordinates) &&
    apiOrder.restaurant.location.coordinates.length >= 2
  ) {
    return apiOrder.restaurant.location.coordinates
  }
  return fallback || null
}

const getRestaurantAddressFromOrder = (apiOrder, previousOrder = null, explicitRestaurantAddress = null) => {
  if (explicitRestaurantAddress && String(explicitRestaurantAddress).trim()) {
    return String(explicitRestaurantAddress).trim()
  }

  const location = apiOrder?.restaurantId?.location || apiOrder?.restaurant?.location || {}

  if (location?.formattedAddress && String(location.formattedAddress).trim()) {
    return String(location.formattedAddress).trim()
  }
  if (location?.address && String(location.address).trim()) {
    return String(location.address).trim()
  }
  if (location?.addressLine1 && String(location.addressLine1).trim()) {
    return String(location.addressLine1).trim()
  }

  const parts = [location?.street, location?.area, location?.city, location?.state, location?.zipCode]
    .map((value) => (value == null ? '' : String(value).trim()))
    .filter(Boolean)

  if (parts.length > 0) return parts.join(', ')

  return previousOrder?.restaurantAddress || apiOrder?.restaurantAddress || apiOrder?.restaurant?.address || 'Restaurant location'
}

const getCustomerCoordsFromApiOrder = (apiOrder, previousOrder = null) => {
  const addr = apiOrder?.address || apiOrder?.deliveryAddress || {}
  const fromLoc = addr?.location?.coordinates
  if (Array.isArray(fromLoc) && fromLoc.length >= 2) return fromLoc
  const flat = addr?.coordinates
  if (Array.isArray(flat) && flat.length >= 2) return flat
  const prev = previousOrder?.address?.coordinates || previousOrder?.address?.location?.coordinates
  if (Array.isArray(prev) && prev.length >= 2) return prev
  return null
}

const toFiniteNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const getNormalizedFoodType = (item = {}) =>
  String(item?.foodType || item?.type || item?.category || "")
    .trim()
    .toLowerCase()

const isItemVeg = (item = {}) => {
  const normalizedFoodType = getNormalizedFoodType(item)
  if (normalizedFoodType === "veg" || normalizedFoodType === "vegetarian") return true
  if (
    normalizedFoodType === "non-veg" ||
    normalizedFoodType === "non veg" ||
    normalizedFoodType === "nonveg" ||
    normalizedFoodType === "egg"
  ) {
    return false
  }
  if (item?.isVeg === true) return true
  if (item?.isVeg === false) return false
  return false
}

const getOrderItemVariantLabel = (item = {}) => {
  const parts = [
    item?.variantName,
    item?.selectedVariant?.name,
    item?.variant?.name,
    typeof item?.size === "string" ? item.size : item?.size?.name,
    item?.portion,
  ]
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter(Boolean)

  const addons = Array.isArray(item?.addons)
    ? item.addons
        .map((addon) => {
          const addonName =
            addon?.name || addon?.title || addon?.addonName || "Add-on"
          const addonQty = Math.max(1, Number(addon?.quantity || 1))
          return addonQty > 1 ? `${addonName} x${addonQty}` : addonName
        })
        .filter(Boolean)
    : []

  if (addons.length > 0) {
    parts.push(`Add-ons: ${addons.join(", ")}`)
  }

  return parts.join(" | ")
}

const getDueAmountFromOrder = (apiOrder, previousOrder = null) => {
  const directDueCandidates = [
    apiOrder?.pricing?.previousDue,
    apiOrder?.previousDue,
    apiOrder?.dueAmount,
    apiOrder?.pricing?.dueAmount,
  ]

  for (const candidate of directDueCandidates) {
    const amount = toFiniteNumber(candidate)
    if (amount !== null && amount > 0) return amount
  }

  // Fallback: infer due from payable amount when backend omits explicit previousDue.
  const payableAmount = toFiniteNumber(apiOrder?.payment?.amountDue)
  const orderTotal = toFiniteNumber(
    apiOrder?.pricing?.total ??
      apiOrder?.totalAmount ??
      apiOrder?.total ??
      previousOrder?.totalAmount ??
      previousOrder?.total
  )
  if (payableAmount !== null && orderTotal !== null && payableAmount > orderTotal) {
    return payableAmount - orderTotal
  }

  const previousDue = toFiniteNumber(previousOrder?.dueAmount)
  return previousDue !== null && previousDue > 0 ? previousDue : 0
}

const getPayableAmountFromOrder = (apiOrder, previousOrder = null, dueAmount = 0) => {
  const orderTotal =
    toFiniteNumber(
      apiOrder?.pricing?.total ??
        apiOrder?.totalAmount ??
        apiOrder?.total ??
        previousOrder?.totalAmount ??
        previousOrder?.total,
    ) || 0

  const payableCandidates = [
    apiOrder?.payment?.amountDue,
    apiOrder?.pricing?.amountDue,
    apiOrder?.amountDue,
    previousOrder?.payableAmount,
  ]

  for (const candidate of payableCandidates) {
    const amount = toFiniteNumber(candidate)
    if (amount !== null && amount > 0) {
      return amount
    }
  }

  return orderTotal + Math.max(0, Number(dueAmount) || 0)
}

const getDueLabelFromOrder = (apiOrder, previousOrder = null, dueAmount = 0) => {
  if (!(Number(dueAmount) > 0)) return "Previous Due"

  const noResponseMeta = apiOrder?.noResponseMeta || previousOrder?.noResponseMeta || null
  if (noResponseMeta?.isUserUnavailable) {
    const dueStatus = String(noResponseMeta?.dueStatus || "").toLowerCase()
    return dueStatus === "settled" ? "Recovered Penalty" : "User Unavailable Penalty"
  }

  return "Penalty / Previous Due"
}

const transformOrderForTracking = (apiOrder, previousOrder = null, explicitRestaurantCoords = null, explicitRestaurantAddress = null) => {
  const restaurantCoords = explicitRestaurantCoords || getRestaurantCoordsFromOrder(apiOrder, previousOrder?.restaurantLocation?.coordinates)
  const restaurantAddress = getRestaurantAddressFromOrder(apiOrder, previousOrder, explicitRestaurantAddress)
  // API returns `deliveryAddress`; some paths use `address`
  const addr = apiOrder?.address || apiOrder?.deliveryAddress || {}
  const customerCoordsResolved = getCustomerCoordsFromApiOrder(apiOrder, previousOrder)
  const dueAmount = getDueAmountFromOrder(apiOrder, previousOrder)
  const dueLabel = getDueLabelFromOrder(apiOrder, previousOrder, dueAmount)
  const payableAmount = getPayableAmountFromOrder(apiOrder, previousOrder, dueAmount)

  return {
    id: apiOrder?.orderId || apiOrder?._id,
    mongoId: apiOrder?._id || null,
    orderId: apiOrder?.orderId || apiOrder?._id,
    restaurant:
      apiOrder?.restaurantName ||
      apiOrder?.restaurantId?.restaurantName ||
      apiOrder?.restaurantId?.name ||
      (typeof apiOrder?.restaurant === 'string' ? apiOrder.restaurant : null) ||
      apiOrder?.restaurant?.restaurantName ||
      apiOrder?.restaurant?.name ||
      previousOrder?.restaurant ||
      'Restaurant',
    restaurantPhone:
      apiOrder?.restaurantPhone ||
      apiOrder?.restaurantId?.phone ||
      apiOrder?.restaurantId?.ownerPhone ||
      apiOrder?.restaurant?.phone ||
      apiOrder?.restaurant?.ownerPhone ||
      previousOrder?.restaurantPhone ||
      '',
    restaurantAddress,
    restaurantId: apiOrder?.restaurantId || previousOrder?.restaurantId || null,
    userId: apiOrder?.userId || previousOrder?.userId || null,
    userName:
      apiOrder?.userName ||
      apiOrder?.customerName ||
      addr?.fullName ||
      addr?.name ||
      apiOrder?.userId?.name ||
      apiOrder?.userId?.fullName ||
      previousOrder?.userName ||
      '',
    userPhone:
      apiOrder?.userPhone ||
      apiOrder?.customerPhone ||
      addr?.phone ||
      apiOrder?.userId?.phone ||
      previousOrder?.userPhone ||
      '',
    address: {
      street: addr?.street || previousOrder?.address?.street || '',
      city: addr?.city || previousOrder?.address?.city || '',
      state: addr?.state || previousOrder?.address?.state || '',
      zipCode: addr?.zipCode || previousOrder?.address?.zipCode || '',
      additionalDetails: addr?.additionalDetails || previousOrder?.address?.additionalDetails || '',
      formattedAddress: addr?.formattedAddress ||
        (addr?.street && addr?.city
          ? `${addr.street}${addr.additionalDetails ? `, ${addr.additionalDetails}` : ''}, ${addr.city}${addr.state ? `, ${addr.state}` : ''}${addr.zipCode ? ` ${addr.zipCode}` : ''}`
          : previousOrder?.address?.formattedAddress || addr?.city || ''),
      coordinates: customerCoordsResolved || addr?.location?.coordinates || previousOrder?.address?.coordinates || null
    },
    restaurantLocation: {
      coordinates: restaurantCoords
    },
    items:
      apiOrder?.items?.map((item) => {
        const quantity = Math.max(1, Number(item?.quantity || 1))
        const unitPrice = Number(
          item?.price ?? item?.unitPrice ?? item?.basePrice ?? 0,
        )
        return {
          ...item,
          name: item?.name || item?.title || "Item",
          variantName: getOrderItemVariantLabel(item),
          quantity,
          price: unitPrice,
          isVeg: isItemVeg(item),
        }
      }) || previousOrder?.items || [],
    total: apiOrder?.pricing?.total || previousOrder?.total || 0,
    // Backend canonical field is orderStatus; keep legacy `status` for UI compatibility.
    status: apiOrder?.orderStatus || apiOrder?.status || previousOrder?.status || 'pending',
    deliveryPartner: apiOrder?.deliveryPartnerId ? {
      name: apiOrder.deliveryPartnerId.name || apiOrder.deliveryPartnerId.fullName || 'Delivery Partner',
      phone: apiOrder.deliveryPartnerId.phone || apiOrder.deliveryPartnerId.phoneNumber || '',
      avatar: apiOrder.deliveryPartnerId.avatar || apiOrder.deliveryPartnerId.profilePicture || null
    } : (previousOrder?.deliveryPartner || null),
    deliveryPartnerId: apiOrder?.deliveryPartnerId?._id || apiOrder?.deliveryPartnerId || apiOrder?.dispatch?.deliveryPartnerId?._id || apiOrder?.dispatch?.deliveryPartnerId || apiOrder?.assignmentInfo?.deliveryPartnerId || null,
    dispatch: apiOrder?.dispatch || previousOrder?.dispatch || null,
    assignmentInfo: apiOrder?.assignmentInfo || previousOrder?.assignmentInfo || null,
    tracking: apiOrder?.tracking || previousOrder?.tracking || {},
    deliveryState: apiOrder?.deliveryState || previousOrder?.deliveryState || null,
    createdAt: apiOrder?.createdAt || previousOrder?.createdAt || null,
    totalAmount: apiOrder?.pricing?.total || apiOrder?.totalAmount || previousOrder?.totalAmount || 0,
    deliveryFee: apiOrder?.pricing?.deliveryFee || apiOrder?.deliveryFee || previousOrder?.deliveryFee || 0,
    gst: apiOrder?.pricing?.tax || apiOrder?.pricing?.gst || apiOrder?.gst || apiOrder?.tax || previousOrder?.gst || 0,
    packagingFee: apiOrder?.pricing?.packagingFee || apiOrder?.packagingFee || 0,
    platformFee: apiOrder?.pricing?.platformFee || apiOrder?.platformFee || 0,
    discount: apiOrder?.pricing?.discount || apiOrder?.discount || 0,
    subtotal: apiOrder?.pricing?.subtotal || apiOrder?.subtotal || 0,
    note: typeof apiOrder?.note === "string" ? apiOrder.note : (previousOrder?.note || ""),
    restaurantNote:
      typeof apiOrder?.restaurantNote === "string"
        ? apiOrder.restaurantNote
        : (previousOrder?.restaurantNote || ""),
    customerNote:
      typeof apiOrder?.customerNote === "string"
        ? apiOrder.customerNote
        : (previousOrder?.customerNote || ""),
    sendCutlery:
      typeof apiOrder?.sendCutlery === "boolean"
        ? apiOrder.sendCutlery
        : previousOrder?.sendCutlery,
    dueAmount,
    dueLabel,
    payableAmount,
    noResponseMeta: apiOrder?.noResponseMeta || previousOrder?.noResponseMeta || null,
    paymentMethod: apiOrder?.paymentMethod || apiOrder?.payment?.method || previousOrder?.paymentMethod || null,
    payment: apiOrder?.payment || previousOrder?.payment || null,
    // Preserve delivery OTP code received via socket event.
    // API responses intentionally strip the secret code for security,
    // so without preserving it the UI would lose the OTP on each poll refresh.
    deliveryVerification: (() => {
      const prevDV = previousOrder?.deliveryVerification || null
      const apiDV = apiOrder?.deliveryVerification || null
      const handoverOtp = apiOrder?.handoverOtp || null
      
      if (!prevDV && !apiDV && !handoverOtp) return null

      const prevDropOtp = prevDV?.dropOtp || null
      const apiDropOtp = apiDV?.dropOtp || null
      
      const merged = {
        ...(prevDV || {}),
        ...(apiDV || {})
      }

      // Prioritize: 1. Real-time handoverOtp from current API response
      // 2. Previously preserved code in local state (from socket or earlier poll)
      // 3. Nested code field in API response (if ever present)
      const finalCode = handoverOtp || prevDropOtp?.code || apiDropOtp?.code

      if (finalCode || prevDropOtp?.required || apiDropOtp?.required) {
        merged.dropOtp = {
          ...(prevDropOtp || {}),
          ...(apiDropOtp || {}),
          code: finalCode
        }
      }
      return merged
    })()
  }
}

/**
 * Backend uses `orderStatus` (created, confirmed, preparing, ready_for_pickup, picked_up, delivered, cancelled_*).
 * This page used to read legacy `status` only — so UI never updated. Map canonical + legacy values to tracking steps.
 */
function mapBackendOrderStatusToUi(raw) {
  const s = String(raw || "").toLowerCase()
  if (!s || s === "pending" || s === "created") return "placed"
  if (s === "confirmed" || s === "accepted") return "confirmed"
  if (s === "preparing" || s === "processed") return "preparing"
  if (s === "ready" || s === "ready_for_pickup" || s === "reached_pickup" || s === "order_confirmed") return "ready"
  if (s === "picked_up" || s === "out_for_delivery" || s === "en_route_to_delivery") return "on_way"
  if (s === "reached_drop" || s === "at_drop" || s === "at_delivery") return "at_drop"
  if (s === "delivered" || s === "completed") return "delivered"
  if (s.includes("cancelled") || s === "cancelled") return "cancelled"
  return "placed"
}

function mapOrderToTrackingUiStatus(orderLike) {
  if (!orderLike) return "placed"
  const statusRaw = orderLike.status || orderLike.orderStatus
  const phase = orderLike.deliveryState?.currentPhase

  // Terminal states handled first
  if (isFoodOrderCancelledStatus(statusRaw)) return "cancelled"
  if (statusRaw === "delivered" || statusRaw === "completed") return "delivered"

  // Live Ride / Phase-based mapping (Highest priority for precision)
  const isRiderAccepted =
    orderLike.dispatch?.status === "accepted" ||
    orderLike.assignmentInfo?.status === "accepted" ||
    orderLike.deliveryPartner?.status === "accepted" ||
    Boolean(orderLike.dispatch?.acceptedAt) ||
    Boolean(orderLike.deliveryState?.acceptedAt);

  // Until rider accepts, keep customer in pre-delivery stage.
  if (
    !isRiderAccepted &&
    (String(statusRaw) === "ready_for_pickup" || String(statusRaw) === "ready")
  ) {
    return "ready_waiting"
  }
  
  if (phase === "reached_drop" || phase === "at_drop" || statusRaw === "at_drop") return "at_drop"
  if (phase === "en_route_to_delivery" || statusRaw === "picked_up" || statusRaw === "out_for_delivery") return "on_way"
  if (phase === "at_pickup" && orderLike.deliveryPartnerId && isRiderAccepted) return "at_pickup"
  if (phase === "en_route_to_pickup" && orderLike.deliveryPartnerId && isRiderAccepted) return "assigned"

  // Fallback to basic status mapping
  return mapBackendOrderStatusToUi(statusRaw)
}

function getUserFacingOrderStatusLabel(rawStatus) {
  const s = String(rawStatus || "").toLowerCase()
  if (s === "picked_up" || s === "out_for_delivery" || s === "en_route_to_delivery") return "Picked Up"
  if (s === "reached_drop" || s === "at_drop" || s === "at_delivery") return "Picked Up"
  if (s === "delivered" || s === "completed") return "Delivered"
  if (s === "ready_for_pickup" || s === "ready") return "Ready"
  if (s === "preparing") return "Preparing"
  if (s === "confirmed" || s === "accepted") return "Accepted"
  if (s.includes("cancelled") || s === "cancelled") return "Cancelled"
  return String(rawStatus || "Pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

/** Prefer live delivery phase when present (socket / polling include deliveryState). */
function isFoodOrderCancelledStatus(statusRaw) {
  const s = String(statusRaw || "").toLowerCase()
  return s === "cancelled" || s.includes("cancelled")
}

function normalizeLookupId(value) {
  if (value == null) return ""
  const raw = String(value).trim()
  if (!raw || raw === "undefined" || raw === "null") return ""
  return raw
}

function extractOrderFromDetailsResponse(response) {
  const data = response?.data
  if (data?.data?.order) return data.data.order
  if (data?.order) return data.order
  if (data?.data && typeof data.data === "object" && !Array.isArray(data.data)) {
    return data.data
  }
  return null
}

function shouldFallbackToOrderList(error) {
  const status = Number(error?.response?.status)
  return status === 400 || status === 404
}

export default function OrderTracking() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const { orderId } = useParams()
  const { getOrderById } = useOrders()
  const { profile, getDefaultAddress } = useProfile()
  const { replaceCart } = useCart()
  const [isSocketConnected, setIsSocketConnected] = useState(
    typeof window !== "undefined" ? Boolean(window.orderSocketConnected) : false
  )
  
  // State for order data
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [orderStatus, setOrderStatus] = useState('placed')
  const [estimatedTime, setEstimatedTime] = useState(29)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [cancellationReason, setCancellationReason] = useState("")
  const [isCancelling, setIsCancelling] = useState(false)
  const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false)
  const [deliveryInstructions, setDeliveryInstructions] = useState("")
  const [isUpdatingInstructions, setIsUpdatingInstructions] = useState(false)
  const [resolvedLookupId, setResolvedLookupId] = useState("")
  const lastRealtimeRefreshRef = useRef(0)
  const trackingOrderIdsRef = useRef(new Set())
  const terminalPollStopRef = useRef(false)
  const lookupIdsRef = useRef([])
  const isInitialPollRequestedRef = useRef(null)
  const lastPollExecutionRef = useRef(0)
  const lastNetworkFetchAtRef = useRef(0)
  const activeFetchPromiseRef = useRef(null)
  const latestOrderRef = useRef(null)
  const latestRefreshStateRef = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined") return undefined
    const syncSocketState = () => setIsSocketConnected(Boolean(window.orderSocketConnected))
    const handleSocketStateChange = (event) => {
      setIsSocketConnected(Boolean(event?.detail?.connected))
    }
    syncSocketState()
    window.addEventListener("userSocketConnectionChange", handleSocketStateChange)
    return () => {
      window.removeEventListener("userSocketConnectionChange", handleSocketStateChange)
    }
  }, [])

  useEffect(() => {
    latestOrderRef.current = order
  }, [order])

  useEffect(() => {
    latestRefreshStateRef.current = isRefreshing
  }, [isRefreshing])


  // --------------------------------------------------------------------------
  // DATA FETCHING & POLLING STABILITY (FIXED FOR HAMMERING)
  // --------------------------------------------------------------------------

  // Socket notifications include order ids — keep a set so events match this page.
  useEffect(() => {
    const s = trackingOrderIdsRef.current
    s.add(String(orderId))
    if (order?.orderId) s.add(String(order.orderId))
    if (order?.mongoId) s.add(String(order.mongoId))
    if (order?.id) s.add(String(order.id))
  }, [orderId, order?.orderId, order?.mongoId, order?.id])

  useEffect(() => {
    const ids = [
      resolvedLookupId,
      orderId,
      order?.orderId,
      order?.mongoId,
      order?._id,
      order?.id,
    ]
      .map(normalizeLookupId)
      .filter(Boolean)
    lookupIdsRef.current = Array.from(new Set(ids))
  }, [orderId, resolvedLookupId, order?.orderId, order?.mongoId, order?._id, order?.id])

  // Stability Nuke: Move function bodies into a ref-protected execute flow
  const stableOpsRef = useRef({
    resolveOrderFromList: async (rawLookupId) => {
      const needle = normalizeLookupId(rawLookupId)
      if (!needle) return null
      const maxPages = 1
      const limit = 20

      for (let page = 1; page <= maxPages; page += 1) {
        const listResponse = await orderAPI.getOrders({ page, limit })
        let orders = []
        if (listResponse?.data?.success && listResponse?.data?.data?.orders) {
          orders = listResponse.data.data.orders || []
        } else if (listResponse?.data?.orders) {
          orders = listResponse.data.orders || []
        } else if (Array.isArray(listResponse?.data?.data?.data)) {
          orders = listResponse.data.data.data || []
        } else if (Array.isArray(listResponse?.data?.data)) {
          orders = listResponse.data.data || []
        }

        const matched = (orders || []).find((o) => {
          const candidates = [o?._id, o?.id, o?.orderId, o?.mongoId].map(normalizeLookupId)
          return candidates.includes(needle)
        })
        if (matched) return matched
        const totalPages = Number(listResponse?.data?.data?.pagination?.pages) || Number(listResponse?.data?.data?.totalPages) || 1
        if (page >= totalPages) break
      }
      return null
    },
    fetchOrderDetailsWithFallback: async (options = {}) => {
      const lookupIds = lookupIdsRef.current
      if (lookupIds.length === 0) throw new Error("Order id required")
      let lastError = null
      for (const id of lookupIds) {
        try {
          // Double guard against hammer
          return await orderAPI.getOrderDetails(id, options)
        } catch (err) {
          lastError = err
          if (err?.response?.status === 400 || err?.response?.status === 404) continue
          throw err
        }
      }
      throw lastError || new Error("Failed to fetch order details")
    }
  });

  const resolveOrderFromList = useCallback((id) => stableOpsRef.current.resolveOrderFromList(id), [])
  const fetchOrderDetailsWithFallback = useCallback((opts) => stableOpsRef.current.fetchOrderDetailsWithFallback(opts), [])
  const refreshOrderData = useCallback(async ({
    isInitial = false,
    force = false,
    allowListFallback = true,
  } = {}) => {
    if (!orderId) return null
    if (activeFetchPromiseRef.current) return activeFetchPromiseRef.current
    if (terminalPollStopRef.current && !isInitial) return null

    const now = Date.now()
    const minFetchGap = force ? 1000 : 2000
    if (!isInitial && now - lastNetworkFetchAtRef.current < minFetchGap) {
      return null
    }

    if (isInitial) {
      const rawContext = getOrderById(orderId)
      if (rawContext) {
        setOrder((prev) => transformOrderForTracking(rawContext, prev))
        setLoading(false)
      }
    }

    lastNetworkFetchAtRef.current = now

    const task = (async () => {
      try {
        const response = await fetchOrderDetailsWithFallback({ force })
        let finalOrderData = extractOrderFromDetailsResponse(response)

        if (!finalOrderData && allowListFallback) {
          const matchedOrder = await resolveOrderFromList(orderId)
          if (matchedOrder) finalOrderData = matchedOrder
        }

        if (finalOrderData) {
          setOrder((prev) => {
            const transformedOrder = transformOrderForTracking(finalOrderData, prev)
            const ui = mapOrderToTrackingUiStatus(transformedOrder)
            terminalPollStopRef.current = ui === 'delivered' || ui === 'cancelled'
            return transformedOrder
          })
          setError(null)
          return response
        }

        if (isInitial && !latestOrderRef.current) {
          setError(response?.data?.message || 'Order not found')
          terminalPollStopRef.current = true
        }

        return response
      } catch (err) {
        if (isInitial && !latestOrderRef.current && allowListFallback && shouldFallbackToOrderList(err)) {
          try {
            const matchedOrder = await resolveOrderFromList(orderId)
            if (matchedOrder) {
              setOrder((prev) => transformOrderForTracking(matchedOrder, prev))
              setError(null)
              return { data: { success: true, data: { order: matchedOrder } } }
            }
          } catch {
            // Fall through to shared error handling.
          }
        }

        if (isInitial && !latestOrderRef.current) {
          setError(err.response?.data?.message || 'Failed to fetch order details')
          terminalPollStopRef.current = true
        }

        throw err
      } finally {
        if (isInitial) setLoading(false)
        activeFetchPromiseRef.current = null
      }
    })()

    activeFetchPromiseRef.current = task
    return task
  }, [orderId, getOrderById, fetchOrderDetailsWithFallback, resolveOrderFromList])

  const handleBackToOrders = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate("/food/orders")
  }, [navigate])

  const handleOpenRestaurantComplaint = useCallback(() => {
    const orderMongoId = order?.mongoId || order?._id || order?.orderMongoId || order?.id || orderId
    if (!orderMongoId) {
      toast.error("Order ID not available. Please refresh the page.")
      return
    }

    navigate(`/food/complaints/submit/${encodeURIComponent(String(orderMongoId))}`)
  }, [navigate, order?.mongoId, order?._id, order?.orderMongoId, order?.id, orderId])

  const handleOpenInvoice = useCallback(() => {
    const invoiceOrderId = order?.mongoId || order?._id || order?.orderMongoId || order?.id || order?.orderId || orderId
    if (!invoiceOrderId) {
      toast.error("Order ID not available. Please refresh the page.")
      return
    }

    navigate(`/food/orders/${encodeURIComponent(String(invoiceOrderId))}/invoice`)
  }, [navigate, order?.mongoId, order?._id, order?.orderMongoId, order?.id, order?.orderId, orderId])

  const handleReorder = useCallback(() => {
    const items = Array.isArray(order?.items) ? order.items : []
    const restaurantRef = order?.restaurantId
    const restaurantTarget =
      order?.restaurantSlug ||
      order?.restaurant?.slug ||
      (restaurantRef && typeof restaurantRef === "object"
        ? restaurantRef.slug || restaurantRef._id || restaurantRef.id
        : restaurantRef)

    if (!restaurantTarget || !items.length) {
      toast.error("Order items or restaurant information not available")
      return
    }

    const reorderItems = items
      .map((item, index) => {
        const itemId = item?.id || item?.itemId || item?._id || item?.foodId
        if (!itemId) return null

        return {
          id: itemId,
          name: item?.name || item?.foodName || "Item",
          price: Number(item?.price) || 0,
          image: item?.image || "",
          restaurant: order?.restaurant || order?.restaurantName || "Restaurant",
          restaurantId: restaurantRef,
          description: item?.description || "",
          isVeg: isItemVeg(item),
          quantity: Math.max(1, Number(item?.quantity || item?.qty) || 1),
          reorderIndex: index,
        }
      })
      .filter(Boolean)

    if (!reorderItems.length) {
      toast.error("No reorderable items found in this order")
      return
    }

    replaceCart(reorderItems)
    toast.success("Items added to cart")
    navigate(`/food/restaurants/${encodeURIComponent(String(restaurantTarget))}`)
  }, [navigate, order, replaceCart])

  const defaultAddress = getDefaultAddress()

  const isAdminAccepted = useMemo(() => {
    const status = order?.status
    return [
      "confirmed",
      "preparing",
      "ready",
      "ready_for_pickup",
      "picked_up",
    ].includes(status)
  }, [order?.status])

  // Single source of truth: backend order.status (+ deliveryState phase for live ride)
  useEffect(() => {
    if (!order) return
    const nextStatus = mapOrderToTrackingUiStatus(order)
    
    // Notify user when a rider accepts their order
    if (orderStatus === 'ready_waiting' && nextStatus === 'assigned') {
      toast.success("Delivery partner assigned! They are on their way to pick up your order.");
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
    
    setOrderStatus(nextStatus)
  }, [
    order?.status,
    order?.deliveryState?.currentPhase,
    order?.deliveryState?.status,
    order?.deliveryPartnerId,
    order?.dispatch?.status,
    orderStatus
  ])

  const normalizedBackendOrderStatus = useMemo(
    () => String(order?.orderStatus || order?.status || "").toLowerCase(),
    [order?.orderStatus, order?.status],
  )

  const isCancelledOrder = useMemo(
    () =>
      isFoodOrderCancelledStatus(normalizedBackendOrderStatus) ||
      orderStatus === "cancelled",
    [normalizedBackendOrderStatus, orderStatus],
  )

  const isDeliveredLikeOrder = useMemo(
    () =>
      orderStatus === "delivered" ||
      ["delivered", "completed"].includes(normalizedBackendOrderStatus) ||
      Boolean(order?.deliveredAt),
    [orderStatus, normalizedBackendOrderStatus, order?.deliveredAt],
  )

  const canShowCancelOrderAction = useMemo(
    () => !isAdminAccepted && !isCancelledOrder && !isDeliveredLikeOrder,
    [isAdminAccepted, isCancelledOrder, isDeliveredLikeOrder],
  )
  const hasDeliveryInstructions = useMemo(
    () => Boolean(String(order?.note || "").trim()),
    [order?.note],
  )
  const canManageDeliveryInstructions = useMemo(
    () => !isCancelledOrder && !isDeliveredLikeOrder,
    [isCancelledOrder, isDeliveredLikeOrder],
  )

  const handleCallRestaurant = (e) => {
    // Prevent event bubbling if necessary
    if (e && e.stopPropagation) e.stopPropagation();

    const rawPhone =
      order?.restaurantPhone ||
      order?.restaurantId?.phone ||
      order?.restaurantId?.ownerPhone ||
      order?.restaurantId?.contact?.phone ||
      order?.restaurant?.phone ||
      order?.restaurant?.ownerPhone ||
      order?.restaurantId?.location?.phone ||
      '';

    const cleanPhone = String(rawPhone).replace(/[^\d+]/g, '');
    
    if (!cleanPhone || cleanPhone.length < 5) {
      toast.error('Restaurant phone number not available');
      return;
    }

    debugLog('?? Attempting to call restaurant:', cleanPhone);
    
    // Most compatible way to trigger dialer on overall mobile/web environments:
    // Create a temporary hidden anchor and programmatically click it.
    try {
      const link = document.createElement('a');
      link.href = `tel:${cleanPhone}`;
      link.setAttribute('target', '_self');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      debugError('Call failed via link click:', err);
      // Last-ditch fallback
      window.location.assign(`tel:${cleanPhone}`);
    }
  };

  const handleCallRider = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    
    const rawPhone = order?.deliveryPartner?.phone || '';
    const cleanPhone = String(rawPhone).replace(/[^\d+]/g, '');

    if (!cleanPhone || cleanPhone.length < 5) {
      toast.error('Rider phone number not available');
      return;
    }

    debugLog('?? Attempting to call rider:', cleanPhone);
    
    try {
      const link = document.createElement('a');
      link.href = `tel:${cleanPhone}`;
      link.setAttribute('target', '_self');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      debugError('Call failed via link click:', err);
      window.location.assign(`tel:${cleanPhone}`);
    }
  };

  // Poll for order updates (especially when delivery partner accepts)

  const pollRef = useRef(null);

  // Main fetch & polling core logic. (Isolated from socket connection stat-changes)
  useEffect(() => {
    if (!orderId) return;

    const poll = async (isInitial = false) => {
      const now = Date.now();
      if (isInitial && now - lastPollExecutionRef.current < 1000) return;
      if (isInitial) lastPollExecutionRef.current = now;
      try {
        await refreshOrderData({ isInitial, force: false });
      } catch {
        // Initial-load error state is handled inside refreshOrderData.
      }
    };

    pollRef.current = poll;
    terminalPollStopRef.current = false;

    if (isInitialPollRequestedRef.current !== orderId) {
      isInitialPollRequestedRef.current = orderId;
      poll(true);
    }

    return undefined;
  }, [orderId, refreshOrderData]);

  // Interval Manager (dynamically adapts based on socket connection state independently)
  useEffect(() => {
    if (!orderId) return;

    const tick = () => {
      if (terminalPollStopRef.current) return;
      if (document.hidden) return;
      // Delegate to the latest instance of our polling function capturing current state
      if (pollRef.current) pollRef.current(false);
    };
    
    const pollInterval = (isSocketConnected || window.orderSocketConnected) ? 15000 : 8000;
    const interval = setInterval(tick, pollInterval);

    return () => clearInterval(interval);
  }, [orderId, isSocketConnected]);

  useEffect(() => {
    if (!order) return
    const ui = mapOrderToTrackingUiStatus(order)
    terminalPollStopRef.current = ui === 'delivered' || ui === 'cancelled'
  }, [order])
  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setEstimatedTime((prev) => Math.max(0, prev - 1))
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  // Listen for order status updates from socket (e.g., "Delivery partner on the way")
  useEffect(() => {
    const handleOrderStatusNotification = (event) => {
      const payload = event?.detail || {};
      const { message, status, estimatedDeliveryTime, orderId: evtOrderId, orderMongoId } = payload;

      const evtKeys = [evtOrderId, orderMongoId, payload?._id].filter(Boolean).map(String)
      const idMatches =
        evtKeys.length === 0 ||
        evtKeys.some((k) => String(k) === String(orderId)) ||
        evtKeys.some((k) => trackingOrderIdsRef.current.has(k))

      debugLog('?? Order status notification received:', { message, status, idMatches });

      if (idMatches) {
        const next = mapOrderToTrackingUiStatus({
          status,
          orderStatus: payload.orderStatus || status,
          deliveryState: payload.deliveryState,
        });
        setOrderStatus(next);

        // Pull latest order state without refresh spam on bursty socket events.
        const now = Date.now();
        if (now - lastRealtimeRefreshRef.current > 3000 && !latestRefreshStateRef.current) {
          lastRealtimeRefreshRef.current = now;
          handleRefresh();
        }
      }

      // Toast is already shown by useUserNotifications hook via socket.
      // Only vibrate here to avoid duplicate notifications.
      if (message && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    };

    // Listen for order status updates emitted at window level
    window.addEventListener('orderStatusNotification', handleOrderStatusNotification);

    return () => {
      window.removeEventListener('orderStatusNotification', handleOrderStatusNotification);
    };
  }, [orderId])

  const handleCancelOrder = () => {
    // Check if order can be cancelled (only Razorpay orders that aren't delivered/cancelled)
    if (!order) return;

    if (isAdminAccepted) {
      toast.error('Order can be cancelled only before restaurant accepts it.');
      return;
    }

    if (isCancelledOrder) {
      toast.error('Order is already cancelled');
      return;
    }

    if (isDeliveredLikeOrder) {
      toast.error('Cannot cancel a delivered order');
      return;
    }

    // Allow cancellation for all payment methods (Razorpay, COD, Wallet)
    // Only restrict if order is already cancelled or delivered (checked above)

    setShowCancelDialog(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancellationReason.trim()) {
      toast.error('Please provide a reason for cancellation');
      return;
    }

    setIsCancelling(true);
    try {
      const cancelLookupId =
        lookupIdsRef.current[0] || normalizeLookupId(orderId)
      const response = await orderAPI.cancelOrder(cancelLookupId, { reason: cancellationReason.trim() });
      if (response.data?.success) {
        const cancelledOrderKeys = [
          cancelLookupId,
          order?._id,
          order?.mongoId,
          order?.orderId,
          order?.id,
          orderId,
        ]
          .filter(Boolean)
          .map((value) => String(value).trim())
          .filter(Boolean);
        if (typeof window !== "undefined") {
          window.__suppressUserCancelToast = {
            keys: Array.from(new Set(cancelledOrderKeys)),
            at: Date.now(),
          };
        }

        const paymentMethod = order?.payment?.method || order?.paymentMethod;
        const successMessage = response.data?.message ||
          (paymentMethod === 'cash' || paymentMethod === 'cod'
            ? 'Order cancelled successfully. No refund required as payment was not made.'
            : 'Order cancelled successfully. Refund will be processed after admin approval.');
        toast.dismiss("order-placement-success");
        toast.success(successMessage, { id: "order-cancel-success" });
        setShowCancelDialog(false);
        setCancellationReason("");
        // Refresh order data
        await refreshOrderData({ force: true });
      } else {
        toast.error(response.data?.message || 'Failed to cancel order');
      }
    } catch (error) {
      debugError('Error cancelling order:', error);
      toast.error(error.response?.data?.message || 'Failed to cancel order');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleUpdateInstructions = async () => {
    if (!canManageDeliveryInstructions) {
      toast.error("Delivery instructions can only be added for active orders");
      return;
    }
    if (hasDeliveryInstructions) {
      toast.error("Delivery instructions can only be added once");
      return;
    }
    try {
      setIsUpdatingInstructions(true);
      const response = await orderAPI.updateOrderInstructions(resolvedLookupId || orderId, deliveryInstructions);
      if (response.data?.success) {
        toast.success("Delivery instructions updated");
        setIsInstructionsModalOpen(false);
        const updatedOrder = response.data.data?.order;
        if (updatedOrder) {
          setOrder(prev => transformOrderForTracking(updatedOrder, prev));
        } else {
          setOrder(prev => ({ ...prev, note: deliveryInstructions }));
        }
      } else {
        toast.error(response.data?.message || "Failed to update instructions");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update instructions");
    } finally {
      setIsUpdatingInstructions(false);
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Track my order from ${order?.restaurant || companyName}`,
          text: `Hey! Track my order from ${order?.restaurant || companyName} with ID #${order?.orderId || order?.id}.`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success("Tracking link copied to clipboard!");
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        debugError('Error sharing:', error);
        toast.error("Failed to share link");
      }
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refreshOrderData({ force: true })
    } catch (err) {
      debugError('Error refreshing order:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  // --------------------------------------------------------------------------
  // RENDER (Final JSX)
  // --------------------------------------------------------------------------

  // Loading state (moved after hooks)
  if (loading) {
    return (
      <AnimatedPage className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-lg mx-auto text-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading order details...</p>
        </div>
      </AnimatedPage>
    )
  }

  // Error state (moved after hooks)
  if (error || !order) {
    return (
      <AnimatedPage className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-lg mx-auto text-center py-20">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold mb-4">Order Not Found</h1>
          <p className="text-gray-600 mb-6">{error || 'The order you\'re looking for doesn\'t exist.'}</p>
          <Link to="/food/orders">
            <Button>Back to Orders</Button>
          </Link>
        </div>
      </AnimatedPage>
    )
  }

  const statusConfig = {
    placed: {
      title: "Order Placed",
      subtitle: "Waiting for restaurant to accept",
      color: BRAND_THEME.colors.brand.primary,
      iconType: 'food'
    },
    confirmed: {
      title: "Order Confirmed",
      subtitle: "Restaurant has accepted your order",
      color: BRAND_THEME.colors.brand.primary,
      iconType: 'food'
    },
    preparing: {
      title: "Food is being prepared",
      subtitle: typeof estimatedTime === 'number' ? `Arriving in ${estimatedTime} mins` : "Cooking your meal",
      color: BRAND_THEME.colors.brand.primary,
      iconType: 'food'
    },
    ready_waiting: {
      title: "Food is ready!",
      subtitle: "Searching for a delivery partner",
      color: BRAND_THEME.colors.brand.primary,
      iconType: 'food'
    },
    assigned: {
      title: "Rider is arriving",
      subtitle: "A delivery partner is arriving at the restaurant",
      color: BRAND_THEME.colors.brand.primary,
      iconType: 'rider'
    },
    at_pickup: {
      title: "Rider at restaurant",
      subtitle: "Rider is waiting for your order",
      color: BRAND_THEME.colors.brand.primary,
      iconType: 'rider'
    },
    ready: {
      title: "Handover in progress",
      subtitle: "Rider is picking up your order",
      color: BRAND_THEME.colors.brand.primary,
      iconType: 'rider'
    },
    on_way: {
      title: "Picked Up",
      subtitle: typeof estimatedTime === 'number' ? `Arriving in ${estimatedTime} mins` : "Rider picked your order and is on the way",
      color: BRAND_THEME.colors.brand.primary,
      iconType: 'rider'
    },
    at_drop: {
      title: "Picked Up",
      subtitle: typeof estimatedTime === 'number' ? `Arriving in ${estimatedTime} mins` : "Rider picked your order and is on the way",
      color: BRAND_THEME.colors.brand.primary,
      iconType: 'rider'
    },
    delivered: {
      title: "Order delivered",
      subtitle: "Enjoy your meal!",
      color: "bg-green-600",
      iconType: 'delivered'
    },
    cancelled: {
      title: "Order cancelled",
      subtitle: "This order has been cancelled",
      color: "bg-red-600",
      iconType: 'cancelled'
    }
  }

  const currentStatus = statusConfig[orderStatus] || statusConfig.placed
  const isRiderAcceptedForUi =
    order?.dispatch?.status === "accepted" ||
    order?.assignmentInfo?.status === "accepted" ||
    Boolean(order?.dispatch?.acceptedAt) ||
    Boolean(order?.deliveryState?.acceptedAt)
  const isDeliveredOrder =
    orderStatus === "delivered" ||
    order?.status === "delivered" ||
    Boolean(order?.deliveredAt)

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#0a0a0a]">
      {/* Green Header */}
      <motion.div
        className={`${!currentStatus.color.startsWith('#') ? currentStatus.color : ''} text-white sticky top-0 z-40`}
        style={{ backgroundColor: currentStatus.color.startsWith('#') ? currentStatus.color : undefined }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Navigation bar */}
        <div className="flex items-center justify-between px-4 py-3">
          <motion.button
            type="button"
            aria-label="Back to orders"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/80 text-black shadow-sm"
            whileTap={{ scale: 0.9 }}
            onClick={handleBackToOrders}
          >
            <ArrowLeft className="w-6 h-6" />
          </motion.button>
          <h2 className="font-semibold text-lg text-black">{order.restaurant}</h2>
          <motion.button
            className="w-10 h-10 flex items-center justify-center cursor-pointer"
            whileTap={{ scale: 0.9 }}
            onClick={handleShare}
          >
            <Share2 className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Status section - hidden for success milestones as requested */}
        {!['at_pickup', 'ready', 'on_way', 'at_drop', 'delivered'].includes(orderStatus) && (
          <div className="px-4 pb-4 text-center">
            <motion.h1
              className="text-2xl font-bold mb-3 text-black"
              key={currentStatus.title}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {currentStatus.title}
            </motion.h1>

            {/* Status pill */}
            <motion.div
              className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <span className="text-sm text-black">{currentStatus.subtitle}</span>
              {orderStatus === 'preparing' && (
                <>
                  <span className="w-1 h-1 rounded-full bg-white" />
                  <span className="text-sm text-black">On time</span>
                </>
              )}
              <motion.button
                onClick={handleRefresh}
                className="ml-1"
                animate={{ rotate: isRefreshing ? 360 : 0 }}
                transition={{ duration: 0.5 }}
              >
              <RefreshCw className="w-4 h-4" />
            </motion.button>
          </motion.div>
        </div>
      )}
      </motion.div>

      {/* Map removed from user order tracking page as requested */}

      {/* Scrollable Content */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 space-y-4 md:space-y-6 pb-24 md:pb-32">
        {/* Dynamic Status Card */}
        <motion.div
          className="bg-white rounded-xl p-4 shadow-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm border border-gray-100 ${
              currentStatus.iconType === 'rider' ? 'bg-brand-50' : 
              currentStatus.iconType === 'cancelled' ? 'bg-red-50' : 
              currentStatus.iconType === 'delivered' ? 'bg-green-50' : 
              'bg-brand-50'
            }`}>
              {currentStatus.iconType === 'rider' ? (
                <div 
                  dangerouslySetInnerHTML={{ __html: RIDER_BIKE_SVG.replace(/width="\d+"/, 'width="100%"').replace(/height="\d+"/, 'height="100%"') }} 
                  className="w-full h-full" 
                />
              ) : currentStatus.iconType === 'cancelled' ? (
                <div className="w-full h-full flex items-center justify-center p-2 text-red-500">
                  <X className="w-full h-full" />
                </div>
              ) : currentStatus.iconType === 'delivered' ? (
                <div className="w-full h-full flex items-center justify-center p-2 text-green-500">
                  <Check className="w-full h-full" />
                </div>
              ) : (
                <img
                  src={circleIcon}
                  alt={currentStatus.title}
                  className="w-10 h-10 object-contain"
                />
              )}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 leading-tight">{currentStatus.title}</p>
              <p className="text-sm text-gray-500 mt-1 leading-snug">{currentStatus.subtitle}</p>
            </div>
          </div>
        </motion.div>

        {/* Delivery Partner Info */}
        {order?.deliveryPartnerId &&
          isRiderAcceptedForUi &&
          !isDeliveredOrder &&
          orderStatus !== "cancelled" && (
          <motion.div
            className="bg-white rounded-xl shadow-sm overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
          >
            <div className="flex items-center gap-3 p-4 border-b border-dashed border-gray-200">
              <div className="w-12 h-12 rounded-full bg-brand-50 overflow-hidden flex items-center justify-center flex-shrink-0 border border-brand-100 p-1">
                {order.deliveryPartner?.avatar ? (
                  <img src={order.deliveryPartner.avatar} alt="Rider" className="w-full h-full object-cover" />
                ) : (
                  <div 
                    dangerouslySetInnerHTML={{ __html: RIDER_BIKE_SVG.replace(/width="\d+"/, 'width="100%"').replace(/height="\d+"/, 'height="100%"') }} 
                    className="w-full h-full p-1" 
                  />
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{order.deliveryPartner?.name || 'Delivery Partner'}</p>
                <p className="text-sm text-gray-500">Your delivery partner is arriving</p>
              </div>
              <motion.button
                className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center"
                onClick={handleCallRider}
                whileTap={{ scale: 0.9 }}
              >
                <Phone className="w-5 h-5 text-brand-600" />
              </motion.button>
            </div>
            {order?.note && (
              <div className="bg-brand-50/50 p-3 mx-4 mb-4 rounded-lg flex items-start gap-2 border border-brand-100">
                <MessageSquare className="w-4 h-4 text-brand-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-brand-600 uppercase tracking-wider mb-0.5">Instruction for Rider</p>
                  <p className="text-xs text-gray-700 leading-relaxed font-medium">"{order.note}"</p>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Delivery Partner Safety */}
        <motion.button
          onClick={() => navigate("/food/profile/delivery-safety")}
          className="w-full bg-white rounded-xl p-4 shadow-sm flex items-center gap-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          whileTap={{ scale: 0.99 }}
        >
          <Shield className="w-6 h-6 text-gray-600" />
          <span className="flex-1 text-left font-medium text-gray-900">
            Learn about delivery partner safety
          </span>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </motion.button>

        {/* Delivery Details Banner */}
        <motion.div
          className="bg-brand-50 rounded-xl p-4 text-center border border-brand-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
        >
          <p className="text-brand-800 font-medium">
            All your delivery details in one place ??
          </p>
        </motion.div>

        {/* Contact & Address Section */}
        <motion.div
          className="bg-white rounded-xl shadow-sm overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <SectionItem
            icon={User}
            title={
              order?.userName ||
              order?.userId?.fullName ||
              order?.userId?.name ||
              profile?.fullName ||
              profile?.name ||
              'Customer'
            }
            subtitle={
              order?.userPhone ||
              order?.userId?.phone ||
              profile?.phone ||
              defaultAddress?.phone ||
              'Phone number not available'
            }
            showArrow={false}
          />
          <SectionItem
            iconNode={
              <div
                dangerouslySetInnerHTML={{ __html: SAFE_CUSTOMER_PIN }}
                className="w-6 h-6 [&_svg]:w-full [&_svg]:h-full [&_svg]:block"
              />
            }
            title="Delivery at Location"
            subtitle={(() => {
              // Priority 1: Use order address formattedAddress (live location address)
              if (order?.address?.formattedAddress && order.address.formattedAddress !== "Select location") {
                return order.address.formattedAddress
              }

              // Priority 2: Build full address from order address parts
              if (order?.address) {
                const orderAddressParts = []
                if (order.address.street) orderAddressParts.push(order.address.street)
                if (order.address.additionalDetails) orderAddressParts.push(order.address.additionalDetails)
                if (order.address.city) orderAddressParts.push(order.address.city)
                if (order.address.state) orderAddressParts.push(order.address.state)
                if (order.address.zipCode) orderAddressParts.push(order.address.zipCode)
                if (orderAddressParts.length > 0) {
                  return orderAddressParts.join(', ')
                }
              }

              // Priority 3: Use defaultAddress formattedAddress (live location address)
              if (defaultAddress?.formattedAddress && defaultAddress.formattedAddress !== "Select location") {
                return defaultAddress.formattedAddress
              }

              // Priority 4: Build full address from defaultAddress parts
              if (defaultAddress) {
                const defaultAddressParts = []
                if (defaultAddress.street) defaultAddressParts.push(defaultAddress.street)
                if (defaultAddress.additionalDetails) defaultAddressParts.push(defaultAddress.additionalDetails)
                if (defaultAddress.city) defaultAddressParts.push(defaultAddress.city)
                if (defaultAddress.state) defaultAddressParts.push(defaultAddress.state)
                if (defaultAddress.zipCode) defaultAddressParts.push(defaultAddress.zipCode)
                if (defaultAddressParts.length > 0) {
                  return defaultAddressParts.join(', ')
                }
              }

              return 'Add delivery address'
            })()}
            showArrow={false}
          />
          {canManageDeliveryInstructions && !hasDeliveryInstructions && (
            <SectionItem
              icon={MessageSquare}
              title="Add delivery instructions"
              subtitle=""
              onClick={() => {
                setDeliveryInstructions("");
                setIsInstructionsModalOpen(true);
              }}
            />
          )}
          {canManageDeliveryInstructions && hasDeliveryInstructions && (
            <SectionItem
              icon={MessageSquare}
              title="Delivery instructions added"
              subtitle={order.note.substring(0, 35) + (order.note.length > 35 ? "..." : "")}
              showArrow={false}
            />
          )}
        </motion.div>

        {/* Restaurant Section */}
        <motion.div
          className="bg-white rounded-xl shadow-sm overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75 }}
        >
          <div className="flex items-center gap-3 p-4 border-b border-dashed border-gray-200">
            <div className="w-12 h-12 rounded-full bg-brand-100 overflow-hidden flex items-center justify-center flex-shrink-0">
              {order?.restaurantLogo || order?.restaurantId?.logo || order?.restaurantId?.profileImage ? (
                <img
                  src={order?.restaurantLogo || order?.restaurantId?.logo || order?.restaurantId?.profileImage}
                  alt={order.restaurant}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  dangerouslySetInnerHTML={{ __html: SAFE_RESTAURANT_PIN }}
                  className="w-7 h-7 [&_svg]:w-full [&_svg]:h-full [&_svg]:block"
                />
              )}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{order.restaurant}</p>
              <p className="text-sm text-gray-500">{order.restaurantAddress || 'Restaurant location'}</p>
            </div>
            <motion.button
              className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center"
              onClick={handleCallRestaurant}
              whileTap={{ scale: 0.9 }}
            >
              <Phone className="w-5 h-5" style={{ color: BRAND_THEME.tokens.orders.primaryText }} />
            </motion.button>
          </div>

          {/* Order Items */}
          <div
            className="p-4 border-b border-dashed border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => setShowOrderDetails(true)}
          >
            <div className="flex items-start gap-3">
              <Receipt className="w-5 h-5 text-gray-500 mt-0.5" />
              <div className="flex-1">
                <div className="mt-2 space-y-1">
                  {order?.items?.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className={`w-4 h-4 rounded border ${isItemVeg(item) ? "border-green-600" : "border-red-600"} flex items-center justify-center`}>
                        <span className={`w-2 h-2 rounded-full ${isItemVeg(item) ? "bg-green-600" : "bg-red-600"}`} />
                      </span>
                      <span>
                        {item.quantity} x {item.name}
                        {(() => {
                          const variantLabel = getOrderItemVariantLabel(item)
                          return variantLabel ? ` (${variantLabel})` : ""
                        })()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </div>

          {isDeliveredLikeOrder && (
            <SectionItem
              icon={MessageSquare}
              title="Restaurant Complaint"
              subtitle="Raise or view complaint for this order"
              onClick={handleOpenRestaurantComplaint}
            />
          )}
        </motion.div>

        {canShowCancelOrderAction && (
          <motion.div
            className="bg-white rounded-xl shadow-sm overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            <SectionItem
              icon={CircleSlash}
              title="Cancel order"
              subtitle=""
              onClick={handleCancelOrder}
            />
          </motion.div>
        )}

      </div>

      {isDeliveredLikeOrder && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 p-4 shadow-[0_-12px_30px_-24px_rgba(15,23,42,0.55)]">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleReorder}
                className={`flex-1 ${BRAND_THEME.tokens.orders.primaryButton} py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors`}
              >
                <RotateCcw className="w-4 h-4" />
                Reorder
              </button>
              <button
                type="button"
                onClick={handleOpenInvoice}
                className={`flex-1 ${BRAND_THEME.tokens.orders.primaryButtonAlt} py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors`}
              >
                <Receipt className="w-4 h-4" />
                Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="sm:max-w-xl w-[95%] max-w-[600px] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-gray-100">
            <DialogTitle className="text-xl font-bold text-gray-900">
              Cancel Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-6 py-5">
            <div className="space-y-2 w-full">
              <Textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="e.g., Changed my mind, Wrong address, etc."
                className="w-full min-h-[120px] resize-none border-2 border-gray-300 rounded-xl px-5 py-4 text-sm leading-6 focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed disabled:border-gray-200"
                disabled={isCancelling}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCancelDialog(false);
                  setCancellationReason("");
                }}
                disabled={isCancelling}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmCancel}
                disabled={isCancelling || !cancellationReason.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  'Confirm Cancellation'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={showOrderDetails} onOpenChange={setShowOrderDetails}>
        <DialogContent className="max-w-[calc(100vw-32px)] sm:max-w-md bg-white rounded-2xl p-0 overflow-hidden border-none outline-none">
          <DialogHeader className="p-6 pb-4 border-b border-gray-100 pr-12">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold text-gray-900">Order Details</DialogTitle>
            </div>
          </DialogHeader>

          <div className="p-6 pt-4 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Order Meta Info */}
            <div className="flex flex-col gap-1 b">
              <div className="flex items-center gap-4 mt-2">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Date & Time</p>
                  <p className="text-sm font-medium text-gray-900">
                    {order?.createdAt ? new Date(order.createdAt).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    }) : 'N/A'}
                  </p>
                </div>
                <div className="h-8 w-px bg-gray-100" />
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Status</p>
                  <span className="text-sm font-bold text-green-600 uppercase">
                    {getUserFacingOrderStatusLabel(order?.orderStatus || order?.status)}
                  </span>
                </div>
              </div>
            </div>

            {/* Delivery Instructions Section */}
            {order?.note && (
              <div className="bg-brand-50/50 rounded-xl p-4 border border-brand-100 flex gap-3">
                <MessageSquare className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-brand-600 font-bold uppercase tracking-wider mb-1">Delivery Instructions</p>
                  <p className="text-sm text-gray-800 leading-relaxed font-medium capitalize">
                    {order.note}
                  </p>
                </div>
              </div>
            )}

            {/* Items Section */}
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Order Items</p>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Item</th>
                      <th className="px-3 py-2 text-right font-semibold">Qty</th>
                      <th className="px-3 py-2 text-right font-semibold">Rate</th>
                      <th className="px-3 py-2 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order?.items?.map((item, index) => {
                      const quantity = Math.max(1, Number(item?.quantity || 1))
                      const unitPrice = Number(
                        item?.price ?? item?.unitPrice ?? item?.basePrice ?? 0,
                      )
                      const lineTotal = Number(
                        item?.totalPrice ??
                          item?.lineTotal ??
                          item?.subtotal ??
                          (unitPrice * quantity),
                      )
                      const variantLabel = getOrderItemVariantLabel(item)
                      const itemLabel = `${item?.name || "Item"}${
                        variantLabel ? ` (${variantLabel})` : ""
                      }`

                      return (
                        <tr key={index} className="border-t border-gray-100 align-top">
                          <td className="px-3 py-2.5">
                            <div className="flex items-start gap-2">
                              <span className={`mt-1 h-2.5 w-2.5 rounded-full ${isItemVeg(item) ? "bg-green-600" : "bg-red-600"}`} />
                              <span className="font-medium text-gray-900">{itemLabel}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-700">{quantity}</td>
                          <td className="px-3 py-2.5 text-right text-gray-700">{"\u20B9"}{unitPrice.toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{"\u20B9"}{lineTotal.toFixed(2)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bill Summary */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-1">Bill Summary</p>
              
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Item Total</span>
                <span className="text-gray-900 font-medium">{"\u20B9"}{Number(order?.subtotal || 0).toFixed(2)}</span>
              </div>

              {Number(order?.dueAmount) > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">{order?.dueLabel || "Previous Due"}</span>
                  <span className="text-gray-900 font-medium">{"\u20B9"}{Number(order.dueAmount).toFixed(2)}</span>
                </div>
              )}

              {Number(order?.packagingFee) > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Packaging Charges</span>
                  <span className="text-gray-900 font-medium">{"\u20B9"}{Number(order.packagingFee).toFixed(2)}</span>
                </div>
              )}

              {Number(order?.platformFee) > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Platform Fee</span>
                  <span className="text-gray-900 font-medium">{"\u20B9"}{Number(order.platformFee).toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Delivery Fee</span>
                <span className="text-gray-900 font-medium">{"\u20B9"}{Number(order?.deliveryFee || 0).toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Taxes & Charges (GST)</span>
                <span className="text-gray-900 font-medium">{"\u20B9"}{Number(order?.gst || 0).toFixed(2)}</span>
              </div>

              {Number(order?.discount) > 0 && (
                <div className="flex justify-between items-center text-sm text-green-600 font-medium">
                  <span>Discount Applied</span>
                  <span>-{"\u20B9"}{Number(order.discount).toFixed(2)}</span>
                </div>
              )}

              <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                <span className="text-base font-bold text-gray-900">Total Amount</span>
                <span className="text-lg font-bold text-gray-900">{"\u20B9"}{Number((order?.payableAmount ?? order?.totalAmount) || 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Method */}
            {order?.paymentMethod && (
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-gray-600">
                  <Shield className="w-4 h-4" />
                  <span className="text-sm font-medium">Payment Method</span>
                </div>
                <span className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                  {order.paymentMethod}
                </span>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-gray-100">
            <Button
              onClick={() => setShowOrderDetails(false)}
              className="w-full bg-gray-900 text-white font-bold h-12 rounded-xl"
            >
              Okay
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delivery Instructions Modal */}
      <Dialog open={isInstructionsModalOpen} onOpenChange={setIsInstructionsModalOpen}>
        <DialogContent className="sm:max-w-md w-[95vw] rounded-3xl p-6 border-0 shadow-2xl bg-white max-h-[90vh] overflow-y-auto z-[200]">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: BRAND_THEME.tokens.orders.primaryGradient }}>
              Delivery Instructions
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Add instructions for the delivery partner to help them find your address or know where to leave your order.
            </p>
            <Textarea
              value={deliveryInstructions}
              onChange={(e) => setDeliveryInstructions(e.target.value)}
              placeholder="E.g. Ring the doorbell, leave at the front desk..."
              className="min-h-[120px] resize-none border-gray-200 focus:ring-brand-500 rounded-xl bg-gray-50 text-base"
            />
            <Button 
              onClick={handleUpdateInstructions} 
              disabled={isUpdatingInstructions}
              className={`w-full ${BRAND_THEME.tokens.orders.primaryButton} font-bold h-12 rounded-xl border-none`}
            >
              {isUpdatingInstructions ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Save Instructions"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

