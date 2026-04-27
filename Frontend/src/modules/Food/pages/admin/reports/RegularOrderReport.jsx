import { useMemo, useState, useEffect, useRef } from "react"
import { BarChart3, ChevronDown, Settings, FileText, FileSpreadsheet, Code, Loader2 } from "lucide-react"
import { adminAPI } from "@food/api"
import { API_BASE_URL } from "@food/api/config"
import io from "socket.io-client"
import { toast } from "sonner"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@food/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@food/components/ui/dialog"
import { exportReportsToCSV, exportReportsToPDF, exportReportsToJSON } from "@food/components/admin/reports/reportsExportUtils"
import searchIcon from "@food/assets/Dashboard-icons/image8.png"
import exportIcon from "@food/assets/Dashboard-icons/image9.png"
import scheduledIcon from "@food/assets/Dashboard-icons/image24.png"
import pendingIcon from "@food/assets/Dashboard-icons/image25.png"
import acceptedIcon from "@food/assets/Dashboard-icons/image26.png"
import processingIcon from "@food/assets/Dashboard-icons/image27.png"
// Reuse existing icons since image28+ do not exist in assets
import onTheWayIcon from "@food/assets/Dashboard-icons/image24.png"
import deliveredIcon from "@food/assets/Dashboard-icons/image25.png"
import canceledIcon from "@food/assets/Dashboard-icons/image26.png"
import paymentFailedIcon from "@food/assets/Dashboard-icons/image27.png"
import refundedIcon from "@food/assets/Dashboard-icons/image25.png"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


const statusMeta = {
  Scheduled: { label: "Scheduled Orders", color: "text-amber-600", bg: "bg-amber-50", icon: scheduledIcon },
  Pending: { label: "Pending Orders", color: "text-brand-600", bg: "bg-brand-50", icon: pendingIcon },
  Accepted: { label: "Accepted Orders", color: "text-sky-600", bg: "bg-sky-50", icon: acceptedIcon },
  Processing: { label: "Processing Orders", color: "text-indigo-600", bg: "bg-indigo-50", icon: processingIcon },
  Ready: { label: "Ready Orders", color: "text-violet-600", bg: "bg-violet-50", icon: processingIcon },
  "Food On The Way": { label: "Food On The Way", color: "text-cyan-600", bg: "bg-cyan-50", icon: onTheWayIcon },
  Delivered: { label: "Delivered", color: "text-emerald-600", bg: "bg-emerald-50", icon: deliveredIcon },
  Canceled: { label: "Canceled", color: "text-red-600", bg: "bg-red-50", icon: canceledIcon },
  "Payment Failed": { label: "Payment Failed", color: "text-orange-600", bg: "bg-orange-50", icon: paymentFailedIcon },
  Refunded: { label: "Refunded", color: "text-teal-600", bg: "bg-teal-50", icon: refundedIcon },
}

const PAGE_SIZE = 25
const INR_SYMBOL = "\u20B9"
const toAmountNumber = (value) => {
  if (value == null) return 0
  const direct = Number(value)
  if (Number.isFinite(direct)) return direct
  const cleaned = String(value).replace(/[^0-9.-]/g, "")
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}
const htmlEscape = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const mapOrderStatusForReport = (backendStatusRaw, deliveryPhaseRaw = "") => {
  const backendStatus = String(backendStatusRaw || "").toLowerCase()
  const deliveryPhase = String(deliveryPhaseRaw || "").toLowerCase()

  if (!backendStatus || backendStatus === "created" || backendStatus === "placed") return "Pending"
  if (backendStatus === "confirmed" || backendStatus === "accepted") return "Accepted"
  if (backendStatus === "preparing" || backendStatus === "processed") return "Processing"
  if (
    backendStatus === "ready" ||
    backendStatus === "ready_for_pickup" ||
    deliveryPhase === "ready_for_pickup" ||
    deliveryPhase === "at_pickup"
  ) {
    return "Ready"
  }
  if (
    backendStatus === "picked_up" ||
    backendStatus === "out_for_delivery" ||
    backendStatus === "reached_drop" ||
    backendStatus === "at_drop" ||
    backendStatus === "at_delivery"
  ) {
    return "Food On The Way"
  }
  if (backendStatus === "delivered" || backendStatus === "completed") return "Delivered"
  if (
    backendStatus === "cancelled_by_restaurant" ||
    backendStatus === "cancelled_by_user" ||
    backendStatus === "cancelled_by_admin" ||
    backendStatus === "cancelled"
  ) {
    return "Canceled"
  }

  // Keep previous fallback behavior for unknown statuses.
  return String(backendStatusRaw || "")
}

const toIdCandidates = (...values) =>
  [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]

export default function RegularOrderReport() {
  const todayDate = new Date().toISOString().split("T")[0]
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [zones, setZones] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [customers, setCustomers] = useState([])
  
  const [filters, setFilters] = useState({
    zone: "All Zones",
    restaurant: "All restaurants",
    customer: "All customers",
    time: "All Time",
    fromDate: "",
    toDate: "",
  })
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [refreshTick, setRefreshTick] = useState(0)
  const hasLoadedOnceRef = useRef(false)

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Fetch zones, restaurants, and customers for filter dropdowns
  useEffect(() => {
    const fetchFilterData = async () => {
      try {
        // Fetch zones
        const zonesRes = await adminAPI.getZones({ limit: 100, isActive: true })
        if (zonesRes.data?.success) {
          setZones(zonesRes.data.data.zones || [])
        }

        // Fetch restaurants
        const restaurantsRes = await adminAPI.getRestaurants({ limit: 100 })
        if (restaurantsRes.data?.success) {
          setRestaurants(restaurantsRes.data.data.restaurants || [])
        }

        // Fetch customers (users) via existing customers API
        const customersRes = await adminAPI.getCustomers({ limit: 100 })
        if (customersRes.data?.success) {
          setCustomers(customersRes.data.data.customers || [])
        }
      } catch (err) {
        debugError("Error fetching filter data:", err)
      }
    }

    fetchFilterData()
  }, [])

  // Calculate date range based on time filter
  const getDateRange = () => {
    const now = new Date()
    let fromDate = null
    let toDate = null

    switch (filters.time) {
      case "Today":
        fromDate = new Date(now.setHours(0, 0, 0, 0))
        toDate = new Date(now.setHours(23, 59, 59, 999))
        break
      case "This Week":
        const weekStart = new Date(now)
        weekStart.setDate(now.getDate() - now.getDay())
        weekStart.setHours(0, 0, 0, 0)
        fromDate = weekStart
        toDate = new Date(now.setHours(23, 59, 59, 999))
        break
      case "This Month":
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1)
        toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        break
      default:
        // All Time - no date filter
        break
    }

    return { fromDate, toDate }
  }

  // Fetch orders from backend
  useEffect(() => {
    const fetchOrders = async () => {
      const isInitialLoad = !hasLoadedOnceRef.current
      if (isInitialLoad) {
        setLoading(true)
      }
      setError(null)
      try {
        if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
          toast.error("Start Date cannot be after End Date")
          setOrders([])
          if (isInitialLoad) {
            setLoading(false)
          }
          return
        }
        if (filters.fromDate && filters.fromDate > todayDate) {
          toast.error("Start Date cannot be in the future")
          setOrders([])
          if (isInitialLoad) {
            setLoading(false)
          }
          return
        }
        if (filters.toDate && filters.toDate > todayDate) {
          toast.error("End Date cannot be in the future")
          setOrders([])
          if (isInitialLoad) {
            setLoading(false)
          }
          return
        }
        const { fromDate, toDate } = getDateRange()
        const hasManualDate = Boolean(filters.fromDate || filters.toDate)
        const params = {
          page: 1,
          limit: 10000, // Fetch all orders for report (can be optimized later)
          search: searchQuery || undefined,
          zone: filters.zone !== "All Zones" ? filters.zone : undefined,
          restaurantId: filters.restaurant !== "All restaurants" ? filters.restaurant : undefined,
          customer: filters.customer !== "All customers" ? filters.customer : undefined,
          startDate: hasManualDate
            ? (filters.fromDate || undefined)
            : (fromDate ? fromDate.toISOString().split('T')[0] : undefined),
          endDate: hasManualDate
            ? (filters.toDate || undefined)
            : (toDate ? toDate.toISOString().split('T')[0] : undefined),
        }

        const response = await adminAPI.getOrders(params)
        
        if (response.data?.success) {
          // Transform backend orders (FoodOrder docs) to report format
          const rawOrders = response.data.data.orders || []
          const transformedOrders = rawOrders.map((order) => {
            const pricing = order.pricing || {}
            const items = Array.isArray(order.items) ? order.items : []

            const itemsSubtotal = items.reduce((sum, item) => {
              const qty = Number(item.quantity || 1)
              const price = Number(item.price || 0)
              return sum + qty * price
            }, 0)

            const subtotal =
              itemsSubtotal > 0
                ? itemsSubtotal
                : Number(pricing.subtotal || 0)

            const deliveryCharge = Number(pricing.deliveryFee || 0)
            const platformFee = Number(pricing.platformFee || 0)
            const vatTax = Number(pricing.tax || 0)
            
            // Discount breakdown
            const couponByAdmin = Number(pricing.couponByAdmin || 0)
            const couponByRestaurant = Number(pricing.couponByRestaurant || 0)
            const offerByRestaurant = Number(pricing.offerByRestaurant || 0)
            const totalDiscount = couponByAdmin + couponByRestaurant + offerByRestaurant
            
            // Admin commission
            const adminCommission = Number(pricing.restaurantCommission || 0)
            
            // Earnings
            const packagingFee = Number(pricing.packagingFee || 0)
            const restaurantEarning = Math.max(0, subtotal + packagingFee - adminCommission - couponByRestaurant - offerByRestaurant)
            const deliveryBoyEarning = Number(order.riderEarning || 0)
            
            const computedTotal =
              subtotal + deliveryCharge + platformFee + vatTax - totalDiscount

            const totalAmount =
              pricing.total != null
                ? Number(pricing.total)
                : computedTotal

            const restaurantName =
              order.restaurantId?.restaurantName ||
              order.restaurantName ||
              ""

            const customerName =
              order.userId?.name ||
              order.customerName ||
              "N/A"

            const displayStatus = mapOrderStatusForReport(
              order.orderStatus || order.status,
              order?.deliveryState?.currentPhase,
            )

            return {
              mongoId: order._id || order.id || "",
              orderId: order.orderId,
              restaurant: restaurantName,
              customerName,
              totalItemAmount: subtotal,
              couponByAdmin,
              couponByRestaurant,
              offerByRestaurant,
              restaurantEarning,
              adminCommission,
              deliveryBoyEarning,
              vatTax,
              deliveryCharge,
              platformFee,
              totalAmount,
              orderStatus: displayStatus,
            }
          })
          setOrders(transformedOrders)
        } else {
          setError(response.data?.message || "Failed to fetch orders")
          toast.error(response.data?.message || "Failed to fetch orders")
        }
      } catch (err) {
        debugError("Error fetching orders:", err)
        setError(err.response?.data?.message || "Failed to fetch orders")
        toast.error(err.response?.data?.message || "Failed to fetch orders")
      } finally {
        if (isInitialLoad) {
          setLoading(false)
          hasLoadedOnceRef.current = true
        }
      }
    }

    fetchOrders()
  }, [filters, searchQuery, refreshTick])

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
      setRefreshTick((prev) => prev + 1)
    }

    const applyLiveStatusUpdate = (payload = {}) => {
      const targetOrderIds = toIdCandidates(
        payload.orderId,
        payload.displayOrderId,
        payload.orderMongoId,
        payload.mongoId,
        payload._id,
        payload.id,
      )
      const nextStatus = mapOrderStatusForReport(
        payload.orderStatus ||
          payload.status ||
          payload.newStatus ||
          payload.currentStatus ||
          payload.updatedStatus,
        payload?.deliveryState?.currentPhase || payload.currentPhase || payload.phase,
      )

      if (targetOrderIds.length === 0 || !nextStatus) {
        requestRefresh()
        return
      }

      setOrders((prev) =>
        prev.map((order) => {
          const orderIds = toIdCandidates(order.orderId, order.mongoId, order.id, order._id)
          const isSameOrder = orderIds.some((id) => targetOrderIds.includes(id))
          if (!isSameOrder) return order
          if (order.orderStatus === nextStatus) return order
          return { ...order, orderStatus: nextStatus }
        }),
      )

      // Keep server as source of truth for totals/pagination consistency.
      requestRefresh()
    }

    socket.on("connect", requestRefresh)
    socket.on("reconnect", requestRefresh)
    socket.on("order_status_update", applyLiveStatusUpdate)
    socket.on("admin_order_status_updated", applyLiveStatusUpdate)
    socket.on("order_updated", applyLiveStatusUpdate)
    socket.on("order_deleted", requestRefresh)
    socket.on("admin_new_order", requestRefresh)

    return () => {
      socket.off("connect", requestRefresh)
      socket.off("reconnect", requestRefresh)
      socket.off("order_status_update", applyLiveStatusUpdate)
      socket.off("admin_order_status_updated", applyLiveStatusUpdate)
      socket.off("order_updated", applyLiveStatusUpdate)
      socket.off("order_deleted", requestRefresh)
      socket.off("admin_new_order", requestRefresh)
      socket.disconnect()
    }
  }, [])

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders
    const q = searchQuery.toLowerCase().trim()
    return orders.filter((o) =>
      String(o.orderId || "")
        .toLowerCase()
        .includes(q),
    )
  }, [orders, searchQuery])

  const handleExport = (format) => {
    if (filteredOrders.length === 0) {
      alert("No data to export")
      return
    }
    const headers = [
      { key: "orderId", label: "Order ID" },
      { key: "restaurant", label: "Restaurant" },
      { key: "customerName", label: "Customer Name" },
      { key: "totalItemAmount", label: "Total Item Amount" },
      { key: "couponByAdmin", label: "Coupon by Admin" },
      { key: "couponByRestaurant", label: "Coupon by Restaurant" },
      { key: "offerByRestaurant", label: "Offer by Restaurant" },
      { key: "restaurantEarning", label: "Restaurant Earning" },
      { key: "adminCommission", label: "Admin Commission" },
      { key: "deliveryBoyEarning", label: "Delivery Boy Earning" },
      { key: "vatTax", label: "VAT/Tax" },
      { key: "deliveryCharge", label: "Delivery Charge" },
      { key: "platformFee", label: "Platform Fee" },
      { key: "totalAmount", label: "Order Amount" },
      { key: "orderStatus", label: "Status" },
    ]
    if (format === "excel") {
      const totals = filteredOrders.reduce(
        (acc, order) => {
          acc.totalItemAmount += toAmountNumber(order.totalItemAmount)
          acc.couponByAdmin += toAmountNumber(order.couponByAdmin)
          acc.couponByRestaurant += toAmountNumber(order.couponByRestaurant)
          acc.offerByRestaurant += toAmountNumber(order.offerByRestaurant)
          acc.restaurantEarning += toAmountNumber(order.restaurantEarning)
          acc.adminCommission += toAmountNumber(order.adminCommission)
          acc.deliveryBoyEarning += toAmountNumber(order.deliveryBoyEarning)
          acc.vatTax += toAmountNumber(order.vatTax)
          acc.deliveryCharge += toAmountNumber(order.deliveryCharge)
          acc.platformFee += toAmountNumber(order.platformFee)
          acc.totalAmount += toAmountNumber(order.totalAmount)
          return acc
        },
        {
          totalItemAmount: 0,
          couponByAdmin: 0,
          couponByRestaurant: 0,
          offerByRestaurant: 0,
          restaurantEarning: 0,
          adminCommission: 0,
          deliveryBoyEarning: 0,
          vatTax: 0,
          deliveryCharge: 0,
          platformFee: 0,
          totalAmount: 0,
        },
      )

      const bodyRowsHtml = filteredOrders
        .map(
          (order) => `
            <tr>
              <td>${htmlEscape(order.orderId || "-")}</td>
              <td>${htmlEscape(order.restaurant || "-")}</td>
              <td>${htmlEscape(order.customerName || "-")}</td>
              <td class="num">${htmlEscape(toAmountNumber(order.totalItemAmount).toFixed(2))}</td>
              <td class="num">${htmlEscape(toAmountNumber(order.couponByAdmin).toFixed(2))}</td>
              <td class="num">${htmlEscape(toAmountNumber(order.couponByRestaurant).toFixed(2))}</td>
              <td class="num">${htmlEscape(toAmountNumber(order.offerByRestaurant).toFixed(2))}</td>
              <td class="num">${htmlEscape(toAmountNumber(order.restaurantEarning).toFixed(2))}</td>
              <td class="num">${htmlEscape(toAmountNumber(order.adminCommission).toFixed(2))}</td>
              <td class="num">${htmlEscape(toAmountNumber(order.deliveryBoyEarning).toFixed(2))}</td>
              <td class="num">${htmlEscape(toAmountNumber(order.vatTax).toFixed(2))}</td>
              <td class="num">${htmlEscape(toAmountNumber(order.deliveryCharge).toFixed(2))}</td>
              <td class="num">${htmlEscape(toAmountNumber(order.platformFee).toFixed(2))}</td>
              <td class="num">${htmlEscape(toAmountNumber(order.totalAmount).toFixed(2))}</td>
              <td>${htmlEscape(order.orderStatus || "-")}</td>
            </tr>
          `,
        )
        .join("")

      const xlsHtml = `
        <html>
          <head>
            <meta charset="UTF-8" />
            <style>
              table { border-collapse: collapse; width: 100%; font-family: Calibri, Arial, sans-serif; font-size: 12px; }
              th, td { border: 1px solid #d1d5db; padding: 8px; }
              th { background: #f3f4f6; font-weight: 700; text-align: left; }
              td.num { text-align: right; }
              tr.total-row td { background: #dbeafe; color: #1e3a8a; font-weight: 700; }
            </style>
          </head>
          <body>
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Restaurant</th>
                  <th>Customer Name</th>
                  <th>Total Item Amount</th>
                  <th>Coupon by Admin</th>
                  <th>Coupon by Restaurant</th>
                  <th>Offer by Restaurant</th>
                  <th>Restaurant Earning</th>
                  <th>Admin Commission</th>
                  <th>Delivery Boy Earning</th>
                  <th>VAT/Tax</th>
                  <th>Delivery Charge</th>
                  <th>Platform Fee</th>
                  <th>Order Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${bodyRowsHtml}
                <tr class="total-row">
                  <td>TOTAL</td>
                  <td>${htmlEscape(`${filteredOrders.length} orders`)}</td>
                  <td></td>
                  <td class="num">${htmlEscape(totals.totalItemAmount.toFixed(2))}</td>
                  <td class="num">${htmlEscape(totals.couponByAdmin.toFixed(2))}</td>
                  <td class="num">${htmlEscape(totals.couponByRestaurant.toFixed(2))}</td>
                  <td class="num">${htmlEscape(totals.offerByRestaurant.toFixed(2))}</td>
                  <td class="num">${htmlEscape(totals.restaurantEarning.toFixed(2))}</td>
                  <td class="num">${htmlEscape(totals.adminCommission.toFixed(2))}</td>
                  <td class="num">${htmlEscape(totals.deliveryBoyEarning.toFixed(2))}</td>
                  <td class="num">${htmlEscape(totals.vatTax.toFixed(2))}</td>
                  <td class="num">${htmlEscape(totals.deliveryCharge.toFixed(2))}</td>
                  <td class="num">${htmlEscape(totals.platformFee.toFixed(2))}</td>
                  <td class="num">${htmlEscape(totals.totalAmount.toFixed(2))}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </body>
        </html>
      `

      const blob = new Blob([xlsHtml], { type: "application/vnd.ms-excel;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `regular-order-report-${new Date().toISOString().slice(0, 10)}.xls`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success("Excel downloaded")
      return
    }

    switch (format) {
      case "csv": exportReportsToCSV(filteredOrders, headers, "regular_order_report"); break
      case "pdf": exportReportsToPDF(filteredOrders, headers, "regular_order_report", "Regular Order Report"); break
      case "json": exportReportsToJSON(filteredOrders, "regular_order_report"); break
    }
  }

  const handleFilterApply = () => {
    // Filters are already applied via useMemo
  }

  const handleResetFilters = () => {
    setFilters({
      zone: "All Zones",
      restaurant: "All restaurants",
      customer: "All customers",
      time: "All Time",
      fromDate: "",
      toDate: "",
    })
  }

  const activeFiltersCount =
    (filters.zone !== "All Zones" ? 1 : 0) +
    (filters.restaurant !== "All restaurants" ? 1 : 0) +
    (filters.customer !== "All customers" ? 1 : 0) +
    (filters.time !== "All Time" ? 1 : 0) +
    (filters.fromDate ? 1 : 0) +
    (filters.toDate ? 1 : 0)

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE))

  const paginatedOrders = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages)
    const start = (safePage - 1) * PAGE_SIZE
    return filteredOrders.slice(start, start + PAGE_SIZE)
  }, [filteredOrders, currentPage, totalPages])

  const statusCounts = useMemo(
    () =>
      filteredOrders.reduce(
        (acc, order) => {
          acc.total += 1
          if (acc[order.orderStatus] != null) {
            acc[order.orderStatus] += 1
          } else if (order.orderStatus === "Cancelled - User Unavailable") {
            acc.Canceled += 1
          }
          return acc
        },
        {
          total: 0,
          Scheduled: 0,
          Pending: 0,
          Accepted: 0,
          Processing: 0,
          Ready: 0,
          "Food On The Way": 0,
          Delivered: 0,
          Canceled: 0,
          "Payment Failed": 0,
          Refunded: 0,
        }
      ),
    [filteredOrders]
  )

  const formatAmount = (amount) =>
    `${INR_SYMBOL}${Number(amount || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setCurrentPage(1)
  }

  const handleTimeFilterChange = (value) => {
    setFilters((prev) => ({
      ...prev,
      time: value,
      fromDate: "",
      toDate: "",
    }))
    setCurrentPage(1)
  }

  const handleDateFilterChange = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      time: "All Time",
    }))
    setCurrentPage(1)
  }

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return
    setCurrentPage(newPage)
  }

  const renderStatusRow = (statusKey) => {
    const meta = statusMeta[statusKey]
    if (!meta) return null
    return (
      <div
        key={statusKey}
        className="flex items-center justify-between bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center overflow-hidden`}>
            <img src={meta.icon} alt={meta.label} className="w-5 h-5 object-contain" />
          </div>
          <span className="text-[11px] font-medium text-slate-800">{meta.label}</span>
        </div>
          <span className={`text-xs font-semibold ${meta.color}`}>{statusCounts[statusKey] || 0}</span>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-2 lg:p-3 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
          <p className="text-gray-600">Loading orders...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-2 lg:p-3 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-2">Error: {error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-2 lg:p-3 bg-slate-50 min-h-screen">
      <div className="w-full mx-auto">
        {/* Page Header */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
              <BarChart3 className="w-3.5 h-3.5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">Order Report</h1>
          </div>
        </div>

        {/* Search Data Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 mb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <select
                value={filters.zone}
                onChange={(e) => handleFilterChange("zone", e.target.value)}
                className="w-full px-2.5 py-1.5 pr-5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs appearance-none cursor-pointer"
              >
                <option value="All Zones">All Zones</option>
                {zones.map((zone) => (
                  <option key={zone._id} value={zone.name}>
                    {zone.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>

            <div className="relative flex-1 min-w-0">
              <select
                value={filters.restaurant}
                onChange={(e) => handleFilterChange("restaurant", e.target.value)}
                className="w-full px-2.5 py-1.5 pr-5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs appearance-none cursor-pointer"
              >
                <option value="All restaurants">All restaurants</option>
                {restaurants.map((restaurant) => (
                  <option key={restaurant._id} value={restaurant._id}>
                    {restaurant.restaurantName || restaurant.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>

            <div className="relative flex-1 min-w-0">
              <select
                value={filters.customer}
                onChange={(e) => handleFilterChange("customer", e.target.value)}
                className="w-full px-2.5 py-1.5 pr-5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs appearance-none cursor-pointer"
              >
                <option value="All customers">All customers</option>
                {customers.map((customer) => (
                  <option key={customer._id} value={customer.name}>
                    {customer.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>

            <div className="relative flex-1 min-w-0">
              <select
                value={filters.time}
                onChange={(e) => handleTimeFilterChange(e.target.value)}
                className="w-full px-2.5 py-1.5 pr-5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs appearance-none cursor-pointer"
              >
                <option key="all-time" value="All Time">All Time</option>
                <option key="today" value="Today">Today</option>
                <option key="this-week" value="This Week">This Week</option>
                <option key="this-month" value="This Month">This Month</option>
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>

            <div className="flex-1 min-w-0">
              <input
                type="date"
                value={filters.fromDate}
                onChange={(e) => handleDateFilterChange("fromDate", e.target.value)}
                max={todayDate}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs"
                placeholder="Start Date"
              />
            </div>

            <div className="flex-1 min-w-0">
              <input
                type="date"
                value={filters.toDate}
                onChange={(e) => handleDateFilterChange("toDate", e.target.value)}
                max={todayDate}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-xs"
                placeholder="End Date"
              />
            </div>

            <button 
              onClick={handleResetFilters}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all whitespace-nowrap"
            >
              Reset
            </button>
            <button 
              onClick={handleFilterApply}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-all whitespace-nowrap relative ${
                activeFiltersCount > 0 ? "ring-2 ring-brand-300" : ""
              }`}
            >
              Filter
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-white rounded-full text-[8px] flex items-center justify-center font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Status Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 mb-3">
          {renderStatusRow("Scheduled")}
          {renderStatusRow("Pending")}
          {renderStatusRow("Processing")}
          {renderStatusRow("Ready")}
          {renderStatusRow("Food On The Way")}
          {renderStatusRow("Accepted")}
          {renderStatusRow("Delivered")}
          {renderStatusRow("Canceled")}
          {renderStatusRow("Payment Failed")}
          {renderStatusRow("Refunded")}
        </div>

        {/* Total Orders & Table */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <h2 className="text-base font-bold text-slate-900">
              Total Orders <span className="text-brand-600">{statusCounts.total}</span>
            </h2>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-initial min-w-[180px]">
                <input
                  type="text"
                  placeholder="Search by Order ID"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="pl-7 pr-2 py-1.5 w-full text-[11px] rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
                <img src={searchIcon} alt="Search" className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3" />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 flex items-center gap-1 transition-all">
                    <img src={exportIcon} alt="Export" className="w-3 h-3" />
                    <span>Export</span>
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
                  <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExport("csv")} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("excel")} className="cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export as Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("pdf")} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("json")} className="cursor-pointer">
                    <Code className="w-4 h-4 mr-2" />
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all"
              >
                <Settings className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full min-w-[1400px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider w-[3%]">
                    SI
                  </th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider w-[7%]">
                    Order Id
                  </th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider w-[8%]">
                    Restaurant
                  </th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider w-[8%]">
                    Customer Name
                  </th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider w-[7%]">
                    Total Item Amount
                  </th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider w-[6%]">
                    Coupon by Admin
                  </th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider w-[6%]">
                    Coupon by Restaurant
                  </th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider w-[6%]">
                    Offer by Restaurant
                  </th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider w-[7%]">
                    Restaurant Earning
                  </th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider w-[6%]">
                    Admin Commission
                  </th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider w-[6%]">
                    Delivery Boy Earning
                  </th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider w-[5%]">
                    Vat/Tax
                  </th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider w-[6%]">
                    Delivery Charge
                  </th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider w-[6%]">
                    Platform Fee
                  </th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider w-[7%]">
                    Order Amount
                  </th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider w-[5%]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {paginatedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
                        <p className="text-sm text-slate-500">No orders match your filters</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedOrders.map((order, index) => (
                    <tr key={order.orderId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] font-medium text-slate-700">
                          {(currentPage - 1) * PAGE_SIZE + index + 1}
                        </span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-brand-600 hover:underline cursor-pointer">{order.orderId}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700 truncate block">{order.restaurant}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700 truncate block">{order.customerName}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatAmount(order.totalItemAmount)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-green-600 font-medium">{formatAmount(order.couponByAdmin)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-orange-600 font-medium">{formatAmount(order.couponByRestaurant)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-purple-600 font-medium">{formatAmount(order.offerByRestaurant)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-emerald-600 font-semibold">{formatAmount(order.restaurantEarning)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-brand-600 font-semibold">{formatAmount(order.adminCommission)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-amber-600 font-semibold">{formatAmount(order.deliveryBoyEarning)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatAmount(order.vatTax)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatAmount(order.deliveryCharge)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatAmount(order.platformFee)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] font-medium text-slate-900">{formatAmount(order.totalAmount)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-slate-100 text-slate-700">
                          {order.orderStatus}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3">
            <p className="text-[10px] text-slate-500">
              Showing{" "}
              <span className="font-semibold text-slate-700">
                {paginatedOrders.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1} -{" "}
                {(currentPage - 1) * PAGE_SIZE + paginatedOrders.length}
              </span>{" "}
              of <span className="font-semibold text-slate-700">{filteredOrders.length}</span> orders
            </p>

            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-[10px] rounded border border-slate-300 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Prev
              </button>
              {Array.from({ length: totalPages }).map((_, idx) => (
                <button
                  key={idx + 1}
                  onClick={() => handlePageChange(idx + 1)}
                  className={`w-6 h-6 text-[10px] rounded border ${
                    currentPage === idx + 1
                      ? "bg-brand-600 border-brand-600 text-white"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-[10px] rounded border border-slate-300 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md bg-white p-0 opacity-0 data-[state=open]:opacity-100 data-[state=closed]:opacity-0 transition-opacity duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:scale-100 data-[state=closed]:scale-100">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Report Settings
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            <p className="text-sm text-slate-700">
              Regular order report settings and preferences will be available here.
            </p>
          </div>
          <div className="px-6 pb-6 flex items-center justify-end">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-md"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}





