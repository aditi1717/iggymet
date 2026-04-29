import { useMemo, useState, useEffect, useRef, useCallback } from "react"
import { Package, Truck, CheckCircle, Clock, XCircle, Loader2 } from "lucide-react"
import { adminAPI } from "@food/api"
import { API_BASE_URL } from "@food/api/config"
import io from "socket.io-client"
import { toast } from "sonner"
import BRAND_THEME from "@/config/brandTheme"
import OrdersTopbar from "@food/components/admin/orders/OrdersTopbar"
import OrderDetectDeliveryTable from "@food/components/admin/orders/OrderDetectDeliveryTable"
import ViewOrderDetectDeliveryDialog from "@food/components/admin/orders/ViewOrderDetectDeliveryDialog"
import AssignDeliveryPartnerDialog from "@food/components/admin/orders/AssignDeliveryPartnerDialog"
import SettingsDialog from "@food/components/admin/orders/SettingsDialog"
import { useGenericTableManagement } from "@food/components/admin/orders/useGenericTableManagement"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}
const normalizeId = (value) => {
  if (!value) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "number") return String(value)
  if (typeof value === "object") {
    if (value?._id) return normalizeId(value._id)
    if (value?.$oid) return String(value.$oid).trim()
    if (typeof value.toString === "function") {
      const raw = String(value.toString()).trim()
      if (raw && raw !== "[object Object]") return raw
    }
  }
  return ""
}

const getOrderStatus = (order) => String(order?.orderStatus || order?.status || "").toLowerCase()
const isAssignmentEligibleStatus = (status) =>
  ["confirmed", "preparing", "ready", "ready_for_pickup"].includes(String(status || "").toLowerCase())
const isCancelledOrder = (status, cancelledAt) =>
  status === "cancelled" ||
  status === "cancelled_by_user" ||
  status === "cancelled_by_restaurant" ||
  status === "cancelled_by_admin" ||
  Boolean(cancelledAt)

const getDeliveryPartnerFallbackReason = (order) => {
  const history = Array.isArray(order?.statusHistory) ? order.statusHistory : []
  if (!history.length) return null

  // Most recent partner action that returned assignment back to queue.
  const latestPartnerUnassign = [...history]
    .reverse()
    .find((entry) => {
      const byRole = String(entry?.byRole || "").toUpperCase()
      const from = String(entry?.from || "").toLowerCase()
      const to = String(entry?.to || "").toLowerCase()
      return byRole === "DELIVERY_PARTNER" && from === "assigned" && to === "unassigned"
    })

  if (!latestPartnerUnassign) return null

  const note = String(latestPartnerUnassign?.note || "").toLowerCase()
  if (note.includes("timed out") || note.includes("timeout")) return "timed_out"
  if (note.includes("pass") || note.includes("reject")) return "passed"
  return null
}

// Function to map backend order status to frontend display status
const mapOrderStatus = (order) => {
  const status = getOrderStatus(order)
  const { deliveryPartnerName, deliveryState, cancelledAt, dispatch } = order

  if (status === "user_unavailable_review") {
    return "User Unavailable Review"
  }

  if (status === "cancelled_by_user_unavailable") {
    return "User Unavailable"
  }

  // If cancelled, show as Rejected
  if (isCancelledOrder(status, cancelledAt)) {
    return "Rejected"
  }

  // If delivered, show as Ordered Delivered
  if (status === 'delivered') {
    return "Ordered Delivered"
  }

  // Check delivery state phases
  if (deliveryState?.currentPhase === 'at_delivery' || deliveryState?.currentPhase === 'at_drop') {
    return "Reached Drop"
  }

  if (deliveryState?.currentPhase === 'at_pickup') {
    return "Delivery Boy Reached Pickup"
  }

  // Order ID Accepted
  if (deliveryState?.status === 'order_confirmed' || deliveryState?.currentPhase === 'en_route_to_delivery' || deliveryState?.orderIdConfirmedAt) {
    return "Order ID Accepted"
  }

  const partnerFallbackReason = getDeliveryPartnerFallbackReason(order)

  if (isAssignmentEligibleStatus(status) && dispatch?.status === "unassigned" && partnerFallbackReason === "timed_out") {
    return "Delivery Request Timed Out"
  }

  if (isAssignmentEligibleStatus(status) && dispatch?.status === "unassigned" && partnerFallbackReason === "passed") {
    return "Delivery Boy Passed"
  }

  if (isAssignmentEligibleStatus(status) && dispatch?.status === "unassigned") {
    return "Ready for Assignment"
  }

  if (dispatch?.status === "accepted") {
    return "Assignment Accepted"
  }

  // If delivery boy is assigned
  if (deliveryPartnerName) {
    return "Delivery Boy Assigned"
  }

  // Map backend status to frontend status
  const statusMap = {
    'created': 'Ordered',
    'pending': 'Ordered',
    'confirmed': 'Restaurant Accepted',
    'preparing': 'Restaurant Accepted',
    'ready_for_pickup': 'Ready for Assignment',
    'ready': 'Restaurant Accepted',
    'picked_up': 'Order ID Accepted',
    'out_for_delivery': 'Order ID Accepted',
  }

  return statusMap[status] || 'Ordered'
}

// Function to build status history from order data
const buildStatusHistory = (order) => {
  const history = []
  const { createdAt, tracking, deliveryState, deliveryPartnerName, deliveryPartnerPhone, cancelledAt } = order
  const status = getOrderStatus(order)

  // Format timestamp helper
  const formatTimestamp = (date) => {
    if (!date) return null
    const d = new Date(date)
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  // Ordered - always first
  history.push({
    status: "Ordered",
    timestamp: formatTimestamp(createdAt) || "N/A"
  })

  // Rejected (if cancelled)
  if (isCancelledOrder(status, cancelledAt)) {
    history.push({
      status: "Rejected",
      timestamp: formatTimestamp(cancelledAt) || formatTimestamp(order.updatedAt) || "N/A"
    })
    return history
  }

  if (status === "user_unavailable_review") {
    history.push({
      status: "User Unavailable Review",
      timestamp: formatTimestamp(order?.userUnavailableRequest?.requestedAt) || formatTimestamp(order.updatedAt) || "N/A"
    })
    return history
  }

  if (status === "cancelled_by_user_unavailable") {
    history.push({
      status: "User Unavailable",
      timestamp: formatTimestamp(order?.userUnavailableRequest?.reviewedAt) || formatTimestamp(order.cancelledAt) || formatTimestamp(order.updatedAt) || "N/A"
    })
    return history
  }

  // Restaurant Accepted (confirmed)
  if (tracking?.confirmed?.status && tracking?.confirmed?.timestamp) {
    history.push({
      status: "Restaurant Accepted",
      timestamp: formatTimestamp(tracking.confirmed.timestamp)
    })
  } else if (status === 'confirmed' || status === 'preparing' || status === 'ready' || status === 'ready_for_pickup') {
    history.push({
      status: "Restaurant Accepted",
      timestamp: formatTimestamp(order.updatedAt) || "N/A"
    })
  }

  // Delivery Boy Assigned
  if (deliveryPartnerName) {
    history.push({
      status: "Delivery Boy Assigned",
      timestamp: formatTimestamp(deliveryState?.acceptedAt) || formatTimestamp(order.updatedAt) || "N/A",
      deliveryBoy: deliveryPartnerName || "Delivery Boy",
      deliveryBoyNumber: deliveryPartnerPhone || "N/A"
    })
  }

  const fallbackReason = getDeliveryPartnerFallbackReason(order)
  if (isAssignmentEligibleStatus(status) && String(order?.dispatch?.status || "").toLowerCase() === "unassigned" && fallbackReason === "passed") {
    history.push({
      status: "Delivery Boy Passed",
      timestamp: formatTimestamp(order.updatedAt) || "N/A"
    })
  }
  if (isAssignmentEligibleStatus(status) && String(order?.dispatch?.status || "").toLowerCase() === "unassigned" && fallbackReason === "timed_out") {
    history.push({
      status: "Delivery Request Timed Out",
      timestamp: formatTimestamp(order.updatedAt) || "N/A"
    })
  }

  // Delivery Boy Reached Pickup
  if (deliveryState?.reachedPickupAt) {
    history.push({
      status: "Delivery Boy Reached Pickup",
      timestamp: formatTimestamp(deliveryState.reachedPickupAt)
    })
  } else if (deliveryState?.currentPhase === 'at_pickup') {
    history.push({
      status: "Delivery Boy Reached Pickup",
      timestamp: formatTimestamp(order.updatedAt) || "N/A"
    })
  }

  // Order ID Accepted
  if (deliveryState?.orderIdConfirmedAt) {
    history.push({
      status: "Order ID Accepted",
      timestamp: formatTimestamp(deliveryState.orderIdConfirmedAt)
    })
  } else if (deliveryState?.status === 'order_confirmed' || deliveryState?.currentPhase === 'en_route_to_delivery') {
    history.push({
      status: "Order ID Accepted",
      timestamp: formatTimestamp(order.updatedAt) || "N/A"
    })
  }

  // Reached Drop - must come before Ordered Delivered
  // Check multiple conditions to ensure we catch it even if order is already delivered
  if (deliveryState?.reachedDropAt) {
    // First priority: use reachedDropAt timestamp if available
    history.push({
      status: "Reached Drop",
      timestamp: formatTimestamp(deliveryState.reachedDropAt)
    })
  } else if (
    deliveryState?.currentPhase === 'at_delivery' ||
    deliveryState?.currentPhase === 'at_drop' ||
    deliveryState?.status === 'en_route_to_delivery'
  ) {
    // Second priority: check if currently at delivery phase
    history.push({
      status: "Reached Drop",
      timestamp: formatTimestamp(order.updatedAt) || "N/A"
    })
  } else if (status === 'delivered' && deliveryPartnerName) {
    // Third priority: if order is delivered and delivery boy was assigned,
    // it means reached drop must have happened (can't deliver without reaching drop)
    // Only add if not already added above
    const hasReachedDrop = history.some(h => h.status === "Reached Drop")
    if (!hasReachedDrop) {
      history.push({
        status: "Reached Drop",
        timestamp: formatTimestamp(order.deliveredAt) || formatTimestamp(order.updatedAt) || "N/A"
      })
    }
  }

  // Ordered Delivered - must come after Reached Drop
  if (status === 'delivered' && tracking?.delivered?.timestamp) {
    history.push({
      status: "Ordered Delivered",
      timestamp: formatTimestamp(tracking.delivered.timestamp)
    })
  } else if (status === 'delivered') {
    history.push({
      status: "Ordered Delivered",
      timestamp: formatTimestamp(order.deliveredAt) || formatTimestamp(order.updatedAt) || "N/A"
    })
  }

  return history
}

// Transform backend order to frontend format
const transformOrder = (order, index) => {
  const user = order?.userId && typeof order.userId === "object" ? order.userId : null
  const restaurant = order?.restaurantId && typeof order.restaurantId === "object" ? order.restaurantId : null
  const orderZone = order?.zoneId && typeof order.zoneId === "object" ? order.zoneId : null
  const restaurantZone = restaurant?.zoneId && typeof restaurant.zoneId === "object" ? restaurant.zoneId : null
  const deliveryFromDispatch =
    order?.dispatch?.deliveryPartnerId && typeof order.dispatch.deliveryPartnerId === "object"
      ? order.dispatch.deliveryPartnerId
      : null

  const deliveryBoyName =
    order.deliveryPartnerName ||
    order.deliveryBoyName ||
    deliveryFromDispatch?.name ||
    order.deliveryPartnerId?.name ||
    null

  const deliveryBoyNumber =
    order.deliveryPartnerPhone ||
    order.deliveryBoyNumber ||
    deliveryFromDispatch?.phone ||
    order.deliveryPartnerId?.phone ||
    null

  const normalizedOrder = {
    ...order,
    status: order.status || order.orderStatus,
    deliveryPartnerName: deliveryBoyName,
    deliveryPartnerPhone: deliveryBoyNumber,
  }

  const orderDate = new Date(order.createdAt)
  const dateStr = orderDate.toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  }).toUpperCase()
  const timeStr = orderDate.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  }).toUpperCase()

  const displayStatus = mapOrderStatus(normalizedOrder)
  const statusHistory = buildStatusHistory(normalizedOrder)

  return {
    sl: index + 1,
    orderMongoId: order._id,
    orderId: order.orderId,
    zoneId:
      normalizeId(order?.zoneId?._id) ||
      normalizeId(order?.zoneId) ||
      normalizeId(restaurant?.zoneId?._id) ||
      normalizeId(restaurant?.zoneId) ||
      "",
    zoneName:
      order?.zoneName ||
      order?.zone?.name ||
      order?.zone?.zoneName ||
      order?.zone?.serviceLocation ||
      orderZone?.name ||
      orderZone?.zoneName ||
      orderZone?.serviceLocation ||
      restaurantZone?.name ||
      restaurantZone?.zoneName ||
      restaurantZone?.serviceLocation ||
      "N/A",
    userName: order.customerName || order.userName || user?.name || 'Unknown',
    userNumber: order.customerPhone || order.userNumber || user?.phone || order.deliveryAddress?.phone || 'N/A',
    restaurantName: order.restaurantName || order.restaurant || restaurant?.restaurantName || 'Unknown Restaurant',
    deliveryBoyName,
    deliveryBoyNumber,
    status: displayStatus,
    statusHistory: statusHistory,
    orderDate: dateStr,
    orderTime: timeStr,
    dispatchStatus: order?.dispatch?.status || "unassigned",
    rawOrderStatus: order?.orderStatus || order?.status || "",
    // Keep assign/reassign action visible for admin across order states.
    canAssign: true,
    canResend:
      isAssignmentEligibleStatus(order?.orderStatus || order?.status) &&
      String(order?.dispatch?.status || "").toLowerCase() === "assigned" &&
      Boolean(order?.dispatch?.deliveryPartnerId),
    // Keep original order data for detail view
    originalOrder: order
  }
}

export default function OrderDetectDelivery() {
  const [visibleColumns, setVisibleColumns] = useState({
    si: true,
    orderId: true,
    zone: true,
    userInfo: true,
    restaurantName: true,
    deliveryBoy: true,
    status: true,
    actions: true,
  })

  const [orders, setOrders] = useState([])
  const [zones, setZones] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false)
  const [selectedOrderForAssignment, setSelectedOrderForAssignment] = useState(null)
  const [actionLoadingKey, setActionLoadingKey] = useState("")
  const orderStatusRef = useRef(new Map())

  const fetchOrders = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setIsLoading(true)
      setError(null)
      const params = {
        page: 1,
        limit: 1000,
      }

      const response = await adminAPI.getOrders(params)

      if (response.data?.success && response.data?.data?.orders) {
        const transformedOrders = response.data.data.orders.map((order, index) =>
          transformOrder(order, index)
        )
        setOrders(transformedOrders)
      } else {
        debugError("Failed to fetch orders:", response.data)
        setError(response.data?.message || "Failed to fetch orders")
        toast.error("Failed to fetch orders")
        setOrders([])
      }
    } catch (error) {
      debugError("Error fetching orders:", error)
      setError(error.response?.data?.message || "Failed to fetch orders")
      toast.error(error.response?.data?.message || "Failed to fetch orders")
      setOrders([])
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [])

  // Fetch orders from backend
  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    const fetchZones = async () => {
      try {
        const response = await adminAPI.getZones({ page: 1, limit: 1000, isActive: true })
        if (response?.data?.success && response?.data?.data?.zones) {
          setZones(response.data.data.zones)
        } else {
          setZones([])
        }
      } catch (zoneError) {
        debugWarn("Failed to load zones for order detect filter:", zoneError)
        setZones([])
      }
    }
    fetchZones()
  }, [])

  useEffect(() => {
    if (!Array.isArray(orders) || orders.length === 0) return

    const nextMap = new Map(orderStatusRef.current)
    for (const order of orders) {
      const key = String(order?.orderMongoId || order?.orderId || "").trim()
      if (!key) continue

      const currentStatus = String(order?.status || "").trim()
      const previousStatus = nextMap.get(key)
      const isPassedNow = currentStatus === "Delivery Boy Passed"
      const wasPassedBefore = previousStatus === "Delivery Boy Passed"
      const isTimedOutNow = currentStatus === "Delivery Request Timed Out"
      const wasTimedOutBefore = previousStatus === "Delivery Request Timed Out"

      if (isPassedNow && !wasPassedBefore) {
        toast.error(
          `Delivery boy passed order #${order?.orderId || key}. Please reassign.`,
        )
      }
      if (isTimedOutNow && !wasTimedOutBefore) {
        toast.warning(
          `Delivery request timed out for order #${order?.orderId || key}. Please reassign.`,
        )
      }

      nextMap.set(key, currentStatus)
    }

    orderStatusRef.current = nextMap
  }, [orders])

  useEffect(() => {
    const backendUrl = String(API_BASE_URL || "")
      .replace(/\/api\/v1\/?$/i, "")
      .replace(/\/api\/?$/i, "")
      .replace(/\/$/, "")
    if (!backendUrl || !backendUrl.startsWith("http")) return undefined

    const token =
      localStorage.getItem("admin_accessToken") ||
      localStorage.getItem("accessToken")
    if (!token) return undefined

    const socket = io(backendUrl, {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
      auth: { token },
      reconnection: true,
    })

    let lastRefreshAt = 0
    const requestRefresh = () => {
      const now = Date.now()
      if (now - lastRefreshAt < 800) return
      lastRefreshAt = now
      fetchOrders({ silent: true })
    }

    socket.on("connect", requestRefresh)
    socket.on("reconnect", requestRefresh)
    socket.on("order_status_update", requestRefresh)
    socket.on("admin_order_status_updated", requestRefresh)
    socket.on("order_updated", requestRefresh)
    socket.on("admin_new_order", requestRefresh)
    socket.on("order_deleted", requestRefresh)

    return () => {
      socket.off("connect", requestRefresh)
      socket.off("reconnect", requestRefresh)
      socket.off("order_status_update", requestRefresh)
      socket.off("admin_order_status_updated", requestRefresh)
      socket.off("order_updated", requestRefresh)
      socket.off("admin_new_order", requestRefresh)
      socket.off("order_deleted", requestRefresh)
      socket.disconnect()
    }
  }, [fetchOrders])

  // Keep action availability (like resend/reassign after timeout) fresh.
  useEffect(() => {
    const id = setInterval(() => {
      fetchOrders({ silent: true })
    }, 3000)
    return () => clearInterval(id)
  }, [fetchOrders])

  const {
    searchQuery,
    setSearchQuery,
    isFilterOpen,
    setIsFilterOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isViewOrderOpen,
    setIsViewOrderOpen,
    selectedOrder,
    filters,
    setFilters,
    filteredData,
    activeFiltersCount,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
  } = useGenericTableManagement(
    orders,
    "Order Detect Delivery",
    ["orderId", "zoneName", "userName", "userNumber", "restaurantName", "deliveryBoyName", "status"]
  )

  // Statistics
  const stats = useMemo(() => {
    const total = orders.length
    const ordered = filteredData.filter(o => o.status === "Ordered").length
    const restaurantAccepted = filteredData.filter(o => o.status === "Restaurant Accepted" || o.status === "Accepted").length
    const rejected = filteredData.filter(o => o.status === "Rejected").length
    const userUnavailable = filteredData.filter(
      (o) => o.status === "User Unavailable Review" || o.status === "User Unavailable"
    ).length
    const readyForAssignment = filteredData.filter(o => o.status === "Ready for Assignment").length
    const deliveryBoyAssigned = filteredData.filter(o => o.status === "Delivery Boy Assigned").length
    const assignmentAccepted = filteredData.filter(o => o.status === "Assignment Accepted").length
    const reachedPickup = filteredData.filter(o => o.status === "Delivery Boy Reached Pickup" || o.status === "Reached Pickup").length
    const orderIdAccepted = filteredData.filter(o => o.status === "Order ID Accepted").length
    const reachedDrop = filteredData.filter(o => o.status === "Reached Drop").length
    const delivered = filteredData.filter(o => o.status === "Ordered Delivered").length
    
    return { total, ordered, restaurantAccepted, rejected, userUnavailable, readyForAssignment, deliveryBoyAssigned, assignmentAccepted, reachedPickup, orderIdAccepted, reachedDrop, delivered }
  }, [filteredData, orders.length])

  const zoneNameById = useMemo(() => {
    const map = new Map()
    for (const zone of zones) {
      const zid = normalizeId(zone?._id || zone?.id)
      if (!zid) continue
      const label =
        zone?.name || zone?.zoneName || zone?.serviceLocation || ""
      if (label) map.set(zid, label)
    }
    return map
  }, [zones])

  const tableOrders = useMemo(() => {
    return filteredData.map((order) => {
      if (order?.zoneName && order.zoneName !== "N/A") return order
      const resolvedZoneName = zoneNameById.get(normalizeId(order?.zoneId))
      return {
        ...order,
        zoneName: resolvedZoneName || "N/A",
      }
    })
  }, [filteredData, zoneNameById])

  const handleOpenAssignDialog = (order) => {
    setSelectedOrderForAssignment(order)
    setIsAssignDialogOpen(true)
  }

  const handleResend = async (order) => {
    if (!order?.orderMongoId) return
    setSelectedOrderForAssignment(order)
    setIsAssignDialogOpen(true)
    toast.info("Reassign delivery partner for this order")
  }

  const handleAdminStatusChange = async (order, nextStatus) => {
    const orderId = String(order?.orderMongoId || "").trim()
    if (!orderId) return
    if (!["picked_up", "delivered"].includes(String(nextStatus || "").toLowerCase())) return

    const loadingKey = `status:${orderId}`
    setActionLoadingKey(loadingKey)
    try {
      const response = await adminAPI.updateOrderStatus(orderId, { orderStatus: nextStatus })
      if (!response?.data?.success) {
        throw new Error(response?.data?.message || "Failed to update status")
      }
      toast.success(
        nextStatus === "picked_up"
          ? `Order #${order.orderId} marked as Picked Up`
          : `Order #${order.orderId} marked as Delivered`,
      )
      await fetchOrders({ silent: true })
    } catch (statusError) {
      toast.error(statusError?.response?.data?.message || statusError?.message || "Failed to update status")
    } finally {
      setActionLoadingKey("")
    }
  }

  const resetColumns = () => {
    setVisibleColumns({
      si: true,
      orderId: true,
      zone: true,
      userInfo: true,
      restaurantName: true,
      deliveryBoy: true,
      status: true,
      actions: true,
    })
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          <p className="text-slate-600 font-medium">Loading orders...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error && orders.length === 0) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Error Loading Orders</h3>
          <p className="text-sm text-slate-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <OrdersTopbar 
        title="Order Detect Delivery" 
        count={orders.length} 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onFilterClick={() => setIsFilterOpen(true)}
        activeFiltersCount={activeFiltersCount}
        onExport={handleExport}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
              Zone Filter
            </label>
            <select
              value={filters.zoneId || ""}
              onChange={(e) => setFilters((prev) => ({ ...prev, zoneId: e.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">All Zones</option>
              {zones.map((zone) => {
                const zoneId = String(zone?._id || zone?.id || "")
                const zoneLabel = zone?.name || zone?.zoneName || zone?.serviceLocation || "Unnamed Zone"
                return (
                  <option key={zoneId} value={zoneId}>
                    {zoneLabel}
                  </option>
                )
              })}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, zoneId: "" }))}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
            >
              Clear Zone Filter
            </button>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Total Orders</p>
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            </div>
            <div className="p-3 bg-brand-50 rounded-lg">
              <Package className="w-6 h-6" style={{ color: BRAND_THEME.colors.brand.primary }} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Ordered</p>
              <p className="text-2xl font-bold" style={{ color: BRAND_THEME.colors.brand.primary }}>{stats.ordered}</p>
            </div>
            <div className="p-3 bg-brand-50 rounded-lg">
              <Clock className="w-6 h-6" style={{ color: BRAND_THEME.colors.brand.primary }} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Restaurant Accepted</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.restaurantAccepted}</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Rejected</p>
              <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
            </div>
            <div className="p-3 bg-red-50 rounded-lg">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">User Unavailable</p>
              <p className="text-2xl font-bold text-amber-600">{stats.userUnavailable}</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Ready For Assignment</p>
              <p className="text-2xl font-bold text-violet-600">{stats.readyForAssignment}</p>
            </div>
            <div className="p-3 rounded-lg bg-violet-50">
              <Truck className="w-6 h-6 text-violet-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Delivery Boy Assigned</p>
              <p className="text-2xl font-bold text-purple-600">{stats.deliveryBoyAssigned}</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <Truck className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Assignment Accepted</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.assignmentAccepted}</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Delivery Boy Reached Pickup</p>
              <p className="text-2xl font-bold text-orange-600">{stats.reachedPickup}</p>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg">
              <Package className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Order ID Accepted</p>
              <p className="text-2xl font-bold text-indigo-600">{stats.orderIdAccepted}</p>
            </div>
            <div className="p-3 bg-indigo-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Reached Drop</p>
              <p className="text-2xl font-bold text-amber-600">{stats.reachedDrop}</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg">
              <Truck className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Delivered</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.delivered}</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </div>
      </div>

      <SettingsDialog
        isOpen={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        visibleColumns={visibleColumns}
        toggleColumn={toggleColumn}
        resetColumns={resetColumns}
        columnsConfig={{
          si: "Serial Number",
          orderId: "Order ID",
          zone: "Zone",
          userInfo: "User Name & Number",
          restaurantName: "Restaurant Name",
          deliveryBoy: "Delivery Boy Name & Number",
          status: "Status",
          actions: "Actions",
        }}
      />
      <ViewOrderDetectDeliveryDialog
        isOpen={isViewOrderOpen}
        onOpenChange={setIsViewOrderOpen}
        order={selectedOrder}
      />
      <AssignDeliveryPartnerDialog
        isOpen={isAssignDialogOpen}
        onOpenChange={setIsAssignDialogOpen}
        order={selectedOrderForAssignment}
        onAssigned={() => fetchOrders({ silent: true })}
      />
      <OrderDetectDeliveryTable 
        orders={tableOrders} 
        visibleColumns={visibleColumns}
        onViewOrder={handleViewOrder}
        onPrintOrder={handlePrintOrder}
        onAssignOrder={handleOpenAssignDialog}
        onResendOrder={handleResend}
        onAdminStatusChange={handleAdminStatusChange}
        actionLoadingKey={actionLoadingKey}
      />
    </div>
  )
}


