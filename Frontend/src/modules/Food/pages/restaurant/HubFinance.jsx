import { useState, useMemo, useRef, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Bell, Menu, ChevronDown, Calendar, Download, ArrowRight, FileText } from "lucide-react"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import { restaurantAPI } from "@food/api"
import BRAND_THEME from "@/config/brandTheme"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const getOrderIdentityKey = (order = {}) => {
  const candidate = order?.orderId || order?._id || order?.id || order?.orderMongoId || order?.mongoId
  return candidate ? String(candidate).trim() : ""
}

const getOrderSortTimestamp = (order = {}) => {
  const candidate =
    order?.settledAt ||
    order?.updatedAt ||
    order?.createdAt ||
    order?.deliveredAt ||
    order?.timestamp
  const time = candidate ? new Date(candidate).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

const dedupeOrdersByIdentity = (orders = []) => {
  const keyed = new Map()
  const passthrough = []

  for (const order of Array.isArray(orders) ? orders : []) {
    const key = getOrderIdentityKey(order)
    if (!key) {
      passthrough.push(order)
      continue
    }

    const existing = keyed.get(key)
    if (!existing) {
      keyed.set(key, order)
      continue
    }

    const existingTs = getOrderSortTimestamp(existing)
    const nextTs = getOrderSortTimestamp(order)
    const existingSettled = Boolean(existing?.isSettled === true)
    const nextSettled = Boolean(order?.isSettled === true)

    // Prefer latest entry; if timestamps match, prefer settled snapshot.
    if (nextTs > existingTs || (nextTs === existingTs && nextSettled && !existingSettled)) {
      keyed.set(key, order)
    }
  }

  return [...keyed.values(), ...passthrough]
}


export default function HubFinance() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get("tab")
    return tabParam === "invoices" ? "invoices" : "payouts"
  })
  const [selectedDateRange, setSelectedDateRange] = useState("Last 30 days")
  const [settlementStatusFilter, setSettlementStatusFilter] = useState("all")
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  const [showDateRangePicker, setShowDateRangePicker] = useState(false)
  const downloadMenuRef = useRef(null)
  const dateRangePickerRef = useRef(null)
  const [financeData, setFinanceData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pastCyclesData, setPastCyclesData] = useState(null)
  const [loadingPastCycles, setLoadingPastCycles] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  const [loadingRestaurant, setLoadingRestaurant] = useState(true)
  const ORDERS_PER_PAGE = 20
  const [payoutTablePage, setPayoutTablePage] = useState(1)
  const [invoiceTablePage, setInvoiceTablePage] = useState(1)

  // Fetch finance data on mount
  useEffect(() => {
    const fetchFinanceData = async () => {
      try {
        setLoading(true)
        const response = await restaurantAPI.getFinance()
        if (response.data?.success && response.data?.data) {
          const data = response.data.data
          setFinanceData(data)
          debugLog('? Finance data fetched:', data)
        }
      } catch (error) {
        // Suppress 401 errors as they're handled by axios interceptor (token refresh/redirect)
        if (error.response?.status !== 401) {
          debugError('? Error fetching finance data:', error)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchFinanceData()
  }, [])


  // Fetch restaurant data for header display
  useEffect(() => {
    // Use restaurant data from financeData if available, otherwise fetch separately
    if (financeData?.restaurant) {
      setRestaurantData(financeData.restaurant)
    } else {
      const fetchRestaurantData = async () => {
        try {
          const response = await restaurantAPI.getRestaurantByOwner()
          const data = response?.data?.data?.restaurant || response?.data?.restaurant || response?.data?.data
          if (data) {
            setRestaurantData({
              name: data.name,
              restaurantId: data.restaurantId || data._id,
              address: data.location?.address || data.location?.formattedAddress || data.address || ''
            })
          }
        } catch (error) {
          // Suppress 401 errors as they're handled by axios interceptor
          if (error.response?.status !== 401) {
            debugError('? Error fetching restaurant data:', error)
          }
        }
      }
      fetchRestaurantData()
    }
  }, [financeData])

  // Format restaurant ID to REST###### format (e.g., REST005678)
  const formatRestaurantId = (restaurantId) => {
    if (!restaurantId) return ''
    
    // Extract numeric part from the end (e.g., "REST-1768762345335-5678" -> "5678")
    const strId = String(restaurantId)
    const numericMatch = strId.match(/(\d+)$/)
    
    if (numericMatch) {
      const numericPart = numericMatch[1]
      // Take last 6 digits and pad with zeros if needed
      const lastDigits = numericPart.slice(-6).padStart(6, '0')
      return `REST${lastDigits}`
    }
    
    // Fallback: if no numeric part found, use original
    return strId
  }

  // Get current cycle dates from API response or use default
  const currentCycleDates = useMemo(() => {
    if (financeData?.currentCycle) {
      return {
        start: financeData.currentCycle.start.day,
        end: financeData.currentCycle.end.day,
        month: financeData.currentCycle.start.month,
        year: financeData.currentCycle.start.year
      }
    }
    return {
      start: "15",
      end: "21",
      month: "Dec",
      year: "25"
    }
  }, [financeData])

  const invoiceOrders = useMemo(() => {
    const allOrdersMap = new Map()
    
    // Add current cycle orders first
    const current = financeData?.currentCycle?.orders || []
    current.forEach(order => {
      const id = order.orderId || order._id || order.id
      if (id) {
        allOrdersMap.set(id, order)
      }
    })
    
    // Add past cycles orders, avoiding duplicates already in current map
    const past = pastCyclesData?.orders || []
    past.forEach(order => {
      const id = order.orderId || order._id || order.id
      if (id && !allOrdersMap.has(id)) {
        allOrdersMap.set(id, order)
      }
    })
    
    return Array.from(allOrdersMap.values())
  }, [financeData, pastCyclesData])

  const invoiceSummary = useMemo(() => {
    const earnings = invoiceOrders.reduce((sum, order) => sum + (order.payout || order.restaurantEarning || 0), 0)
    const commission = invoiceOrders.reduce((sum, order) => sum + (order.commission || 0), 0)
    const gross = invoiceOrders.reduce((sum, order) => sum + (order.totalAmount || order.orderTotal || 0), 0)
    return { earnings, commission, gross, count: invoiceOrders.length }
  }, [invoiceOrders])

  const dedupedCurrentCycleOrders = useMemo(
    () => dedupeOrdersByIdentity(financeData?.currentCycle?.orders || []),
    [financeData],
  )

  const dedupedPastCycleOrders = useMemo(
    () => dedupeOrdersByIdentity(pastCyclesData?.orders || []),
    [pastCyclesData],
  )

  const isPastCyclesView = Boolean(pastCyclesData && pastCyclesData.orders)

  const payoutSourceOrders = useMemo(
    () => (isPastCyclesView ? dedupedPastCycleOrders : dedupedCurrentCycleOrders),
    [isPastCyclesView, dedupedPastCycleOrders, dedupedCurrentCycleOrders],
  )

  const payoutUnpaidSummary = useMemo(() => {
    const orders = payoutSourceOrders
    const unpaidOrders = orders.filter((order) => !Boolean(order?.isSettled === true))
    const unpaidAmount = unpaidOrders.reduce(
      (sum, order) => sum + Number(order?.payout || order?.restaurantEarning || 0),
      0
    )
    return { amount: unpaidAmount, count: unpaidOrders.length }
  }, [payoutSourceOrders])

  const handleViewDetails = () => {
    navigate("/restaurant/finance-details", { state: { financeData, restaurantData } })
  }

  const formatMoney = (amount = 0) =>
    `₹${Number(amount || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

  const htmlEscape = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")

  const formatOrderDate = (value) => {
    if (!value) return "N/A"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return "N/A"
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  const formatOrderTime = (value) => {
    if (!value) return "N/A"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return "N/A"
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  }

  const getOrderRouteId = (order = {}) => {
    const candidate =
      order?.orderMongoId ||
      order?.mongoId ||
      order?._id ||
      order?.id ||
      order?.orderId
    return candidate ? String(candidate).trim() : ""
  }

  const handleOrderRowClick = (order = {}) => {
    const routeOrderId = getOrderRouteId(order)
    if (!routeOrderId) return
    navigate(`/restaurant/orders/${encodeURIComponent(routeOrderId)}`)
  }

  const filterOrdersBySettlement = (orders = []) => {
    if (!Array.isArray(orders)) return []
    if (settlementStatusFilter === "all") return orders
    return orders.filter((order) => {
      const isSettled = Boolean(order?.isSettled === true)
      return settlementStatusFilter === "paid" ? isSettled : !isSettled
    })
  }

  const filteredPastCycleOrders = useMemo(
    () => filterOrdersBySettlement(dedupedPastCycleOrders),
    [dedupedPastCycleOrders, settlementStatusFilter]
  )

  const filteredCurrentCycleOrders = useMemo(
    () => filterOrdersBySettlement(dedupedCurrentCycleOrders),
    [dedupedCurrentCycleOrders, settlementStatusFilter]
  )

  const filteredInvoiceOrders = useMemo(
    () => filterOrdersBySettlement(invoiceOrders),
    [invoiceOrders, settlementStatusFilter]
  )

  const activePayoutOrders = isPastCyclesView ? filteredPastCycleOrders : filteredCurrentCycleOrders
  const totalPayoutPages = Math.max(1, Math.ceil(activePayoutOrders.length / ORDERS_PER_PAGE))
  const totalInvoicePages = Math.max(1, Math.ceil(filteredInvoiceOrders.length / ORDERS_PER_PAGE))

  const paginatedPayoutOrders = useMemo(() => {
    const start = (payoutTablePage - 1) * ORDERS_PER_PAGE
    return activePayoutOrders.slice(start, start + ORDERS_PER_PAGE)
  }, [activePayoutOrders, payoutTablePage])

  const paginatedInvoiceOrders = useMemo(() => {
    const start = (invoiceTablePage - 1) * ORDERS_PER_PAGE
    return filteredInvoiceOrders.slice(start, start + ORDERS_PER_PAGE)
  }, [filteredInvoiceOrders, invoiceTablePage])

  useEffect(() => {
    setPayoutTablePage(1)
    setInvoiceTablePage(1)
  }, [settlementStatusFilter, selectedDateRange, activeTab])

  useEffect(() => {
    if (payoutTablePage > totalPayoutPages) {
      setPayoutTablePage(totalPayoutPages)
    }
  }, [payoutTablePage, totalPayoutPages])

  useEffect(() => {
    if (invoiceTablePage > totalInvoicePages) {
      setInvoiceTablePage(totalInvoicePages)
    }
  }, [invoiceTablePage, totalInvoicePages])

  const renderPagination = (currentPage, totalPages, totalItems, onPageChange) => {
    if (totalItems <= ORDERS_PER_PAGE) return null
    const start = (currentPage - 1) * ORDERS_PER_PAGE + 1
    const end = Math.min(currentPage * ORDERS_PER_PAGE, totalItems)
    return (
      <div className="px-4 py-3 border-t border-gray-200 bg-white flex items-center justify-between">
        <p className="text-xs text-gray-600">
          Showing {start}-{end} of {totalItems}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="text-xs text-gray-600">
            Page {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    )
  }

  // Parse date range string to extract start and end dates
  const parseDateRange = (dateRangeStr) => {
    try {
      if (!dateRangeStr || typeof dateRangeStr !== 'string') return null;

      // Handle relative ranges
      const today = new Date();
      if (dateRangeStr === "Last 7 days") {
        const start = new Date();
        start.setDate(today.getDate() - 7);
        return { startDate: start.toISOString(), endDate: today.toISOString() };
      }
      if (dateRangeStr === "Last 30 days" || dateRangeStr === "Last 1 month") {
        const start = new Date();
        start.setDate(today.getDate() - 30);
        return { startDate: start.toISOString(), endDate: today.toISOString() };
      }
      if (dateRangeStr === "This week") {
        const start = new Date();
        const day = today.getDay();
        start.setDate(today.getDate() - day);
        return { startDate: start.toISOString(), endDate: today.toISOString() };
      }
      if (dateRangeStr === "This month") {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { startDate: start.toISOString(), endDate: today.toISOString() };
      }

      const parts = dateRangeStr.split(' - ')
      if (parts.length !== 2) return null
      
      const startStr = parts[0].trim() // "14 Nov"
      const endStr = parts[1].trim().replace("'", " ") // "14 Dec 25"
      
      const currentYear = new Date().getFullYear()
      const startParts = startStr.split(' ')
      const endParts = endStr.split(' ')
      
      if (startParts.length < 2 || endParts.length < 2) return null
      
      const monthMap = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
      }
      
      const startDay = parseInt(startParts[0])
      const startMonth = monthMap[startParts[1]]
      const endDay = parseInt(endParts[0])
      const endMonth = monthMap[endParts[1]]
      const year = endParts.length > 2 ? parseInt('20' + endParts[2]) : currentYear
      
      if (startMonth === undefined || endMonth === undefined || isNaN(startDay) || isNaN(endDay)) {
        return null
      }
      
      const start = new Date(year, startMonth, startDay)
      const end = new Date(year, endMonth, endDay)

      return {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      }
    } catch (error) {
      debugError('Error parsing date range:', error)
      return null
    }
  }

  // Fetch past cycles data when date range changes
  const fetchPastCyclesData = async (startDate, endDate) => {
    if (!startDate || !endDate) {
      setPastCyclesData(null)
      return
    }

    try {
      setLoadingPastCycles(true)
      // Validate dates and format as ISO strings
      const startDateObj = startDate instanceof Date ? startDate : new Date(startDate)
      const endDateObj = endDate instanceof Date ? endDate : new Date(endDate)
      
      // Check if dates are valid
      if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
        debugError('Invalid date values:', { startDate, endDate })
        setPastCyclesData(null)
        return
      }
      
      const startDateISO = startDateObj.toISOString().split('T')[0]
      const endDateISO = endDateObj.toISOString().split('T')[0]
      
      const response = await restaurantAPI.getFinance({
        startDate: startDateISO,
        endDate: endDateISO
      })
      if (response.data?.success && response.data?.data?.pastCycles) {
        setPastCyclesData(response.data.data.pastCycles)
        debugLog('? Past cycles data fetched:', response.data.data.pastCycles)
        debugLog('?? Orders array:', response.data.data.pastCycles?.orders)
        debugLog('?? Total orders:', response.data.data.pastCycles?.totalOrders)
      } else {
        setPastCyclesData(null)
      }
    } catch (error) {
      // Suppress 401 errors as they're handled by axios interceptor (token refresh/redirect)
      if (error.response?.status !== 401) {
        debugError('? Error fetching past cycles data:', error)
      }
      setPastCyclesData(null)
    } finally {
      setLoadingPastCycles(false)
    }
  }

  // Fetch past cycles data on mount and when date range changes
  useEffect(() => {
    const dateRange = parseDateRange(selectedDateRange)
    if (dateRange && dateRange.startDate && dateRange.endDate) {
      fetchPastCyclesData(dateRange.startDate, dateRange.endDate)
    } else {
      // If date range is invalid, don't fetch
      setPastCyclesData(null)
    }
  }, [selectedDateRange])


  // Prepare report data from real finance data
  const getReportData = () => {
    const restaurantName = financeData?.restaurant?.name || "Restaurant"
    const restaurantId = financeData?.restaurant?.restaurantId || "N/A"
    const currentCycle = financeData?.currentCycle || {}
    
    // Get all orders (current cycle + past cycles) - DEDUPLICATED
    const allOrdersMap = new Map()
    
    // Add current cycle orders first
    if (financeData?.currentCycle?.orders && Array.isArray(financeData.currentCycle.orders)) {
      financeData.currentCycle.orders.forEach(order => {
        if (order.orderId) {
          allOrdersMap.set(order.orderId, {
            ...order,
            cycle: 'Current Cycle'
          })
        }
      })
    }
    
    // Add past cycles orders (ignoring duplicates already in current map)
    if (pastCyclesData?.orders && Array.isArray(pastCyclesData.orders)) {
      pastCyclesData.orders.forEach(order => {
        if (order.orderId && !allOrdersMap.has(order.orderId)) {
          allOrdersMap.set(order.orderId, {
            ...order,
            cycle: 'Past Cycle'
          })
        }
      })
    }
    
    const allOrders = Array.from(allOrdersMap.values())
    
    return {
      restaurantName,
      restaurantId,
      dateRange: selectedDateRange,
      currentCycle: {
        start: currentCycleDates.start,
        end: currentCycleDates.end,
        month: currentCycleDates.month,
        year: currentCycleDates.year,
        estimatedPayout: `₹${(currentCycle.estimatedPayout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        orders: currentCycle.totalOrders || 0,
        payoutDate: currentCycle.payoutDate ? new Date(currentCycle.payoutDate).toLocaleDateString('en-IN') : "-"
      },
      pastCycles: pastCyclesData,
      allOrders: allOrders
    }
  }

  // Generate HTML content for the report
  const generateHTMLContent = (reportData) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Finance Report - ${reportData.dateRange}</title>
        <meta charset="UTF-8">
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; 
            padding: 40px;
            color: #333;
            background-color: #fff;
            width: 794px; /* A4 width at 96dpi */
            box-sizing: border-box;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #333;
            padding-bottom: 20px;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            color: #000;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .header p {
            margin: 5px 0;
            font-size: 14px;
            color: #444;
          }
          .section {
            margin-bottom: 30px;
            clear: both;
          }
          .section-title {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 15px;
            color: #000;
            border-left: 4px solid #000;
            padding-left: 10px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px dashed #ddd;
          }
          .current-cycle {
            background-color: #fcfcfc;
            padding: 25px;
            border: 1px solid #eee;
            border-radius: 12px;
            margin-bottom: 25px;
          }
          .payout-amount {
            font-size: 36px;
            font-weight: 800;
            color: #000;
            margin: 10px 0;
          }
          .orders-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin-top: 20px;
            border: 1px solid #000;
          }
          .orders-table th {
            background-color: #f2f2f2;
            padding: 12px 8px;
            text-align: left;
            border: 1px solid #000;
            font-weight: bold;
            font-size: 11px;
            text-transform: uppercase;
          }
          .orders-table td {
            padding: 10px 8px;
            border: 1px solid #000;
            font-size: 11px;
            word-wrap: break-word;
            vertical-align: top;
          }
          .footer {
            margin-top: 50px;
            padding-top: 25px;
            border-top: 1px solid #000;
            text-align: center;
            font-size: 12px;
            color: #555;
          }
          @media print {
            body { padding: 20px; width: auto; }
            .current-cycle { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Finance Report</h1>
          <p>${reportData.restaurantName}</p>
          <p>ID: ${reportData.restaurantId}</p>
          <p>Generated on: ${new Date().toLocaleString('en-IN')}</p>
        </div>

        <div class="section">
          <div class="section-title">Current Cycle</div>
          <div class="current-cycle">
            <p style="font-size: 12px; color: #666; margin: 0 0 5px 0;">
              Est. payout (${reportData.currentCycle.start} - ${reportData.currentCycle.end} ${reportData.currentCycle.month})
            </p>
            <div class="payout-amount">${reportData.currentCycle.estimatedPayout}</div>
            <p style="font-size: 14px; color: #666; margin: 5px 0;">${reportData.currentCycle.orders} orders</p>
            <div class="info-row">
              <div>
                <p class="info-label" style="font-size: 11px; margin: 5px 0;">Payout for</p>
                <p style="margin: 0; font-weight: 600;">${reportData.currentCycle.start} - ${reportData.currentCycle.end} ${reportData.currentCycle.month}'${reportData.currentCycle.year}</p>
              </div>
              <div style="text-align: right;">
                <p class="info-label" style="font-size: 11px; margin: 5px 0;">Payout date</p>
                <p style="margin: 0; font-weight: 600;">${reportData.currentCycle.payoutDate}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Detailed Order Wise Report</div>
          ${reportData.allOrders && reportData.allOrders.length > 0 ? `
            <table class="orders-table">
              <thead>
                <tr>
                  <th style="width: 14%;">Cycle</th>
                  <th style="width: 15%;">Order ID</th>
                  <th style="width: 12%;">Date</th>
                  <th style="width: 28%;">Items</th>
                  <th style="width: 8%;">Qty</th>
                  <th style="width: 11%;">Amount</th>
                  <th style="width: 12%;">Earning</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.allOrders.map(order => {
                  const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN') : (order.deliveredAt ? new Date(order.deliveredAt).toLocaleDateString('en-IN') : 'N/A')
                  const foodItems = order.foodNames || (order.items && order.items.map(item => item.name).join(', ')) || 'N/A'
                  const itemQuantities = order.items ? order.items.map(item => (item.quantity || 1).toString()).join(', ') : 'N/A'
                  const orderAmount = order.totalAmount || order.orderTotal || order.amount || 0
                  const earning = order.payout || order.restaurantEarning || 0
                  
                  return `
                    <tr>
                      <td>${order.cycle || 'N/A'}</td>
                      <td>${order.orderId || 'N/A'}</td>
                      <td>${orderDate}</td>
                      <td>${foodItems}</td>
                      <td>${itemQuantities}</td>
                      <td>₹${orderAmount.toFixed(2)}</td>
                      <td>₹${earning.toFixed(2)}</td>
                    </tr>
                  `
                }).join('')}
              </tbody>
              <tfoot>
                <tr style="background-color: #e8f5e9; font-weight: bold;">
                  <td colspan="5" style="text-align: right;">Total Earnings:</td>
                  <td colspan="2">₹${reportData.allOrders.reduce((sum, order) => sum + (order.payout || order.restaurantEarning || 0), 0).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          ` : `
          <div class="info-row">
            <span class="info-label">Status:</span>
              <span class="info-value">No orders available</span>
          </div>
          `}
        </div>

        <div class="footer">
          <p>This is an auto-generated report. For detailed information, please visit the Finance section.</p>
          <p>Total Orders: ${reportData.allOrders?.length || 0} | Total Earnings: ₹${reportData.allOrders?.reduce((sum, order) => sum + (order.payout || order.restaurantEarning || 0), 0).toFixed(2) || '0.00'}</p>
        </div>
      </body>
      </html>
    `
  }

  // Download PDF report - Direct download without print dialog
  const downloadPDF = async () => {
    try {
      setShowDownloadMenu(false)
      
    const reportData = getReportData()
    const htmlContent = generateHTMLContent(reportData)
    
      debugLog('?? Generating PDF...')
      
      // Create a temporary hidden iframe to render HTML properly
      const iframe = document.createElement('iframe')
      iframe.style.position = 'absolute'
      iframe.style.left = '-9999px'
      iframe.style.top = '0'
      iframe.style.width = '210mm'
      iframe.style.height = '297mm'
      iframe.style.border = 'none'
      document.body.appendChild(iframe)
      
      // Write HTML to iframe
      iframe.contentDocument.open()
      iframe.contentDocument.write(htmlContent)
      iframe.contentDocument.close()
      
      // Wait for iframe content to load
      await new Promise((resolve) => {
        if (iframe.contentDocument.readyState === 'complete') {
          resolve()
        } else {
          iframe.contentWindow.onload = resolve
          setTimeout(resolve, 1000) // Fallback timeout
        }
      })
      
      // Wait a bit more for styles to apply
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Import html2canvas and jsPDF dynamically
      debugLog('?? Loading libraries...')
      const html2canvas = (await import('html2canvas')).default
      const { default: jsPDF } = await import('jspdf')
    
      // Get the body element from iframe
      const iframeBody = iframe.contentDocument.body
      
      debugLog('?? Converting to canvas...')
      // Convert HTML to canvas
      const canvas = await html2canvas(iframeBody, {
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: iframeBody.scrollWidth,
        height: iframeBody.scrollHeight
      })
      
      debugLog('? Canvas created:', canvas.width, 'x', canvas.height)
      
      // Remove temporary iframe
      document.body.removeChild(iframe)
    
      // Calculate PDF dimensions
      const imgWidth = 210 // A4 width in mm
      const pageHeight = 297 // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      
      debugLog('?? PDF dimensions:', imgWidth, 'x', imgHeight, 'mm')
      
      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4')
      let heightLeft = imgHeight
      let position = 0
      
      // Add first page
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
      
      // Add additional pages if content is longer than one page
      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }
      
      // Download PDF
      const fileName = `finance-report-${reportData.dateRange.replace(/\s+/g, '-').replace(/'/g, '')}_${new Date().toISOString().split("T")[0]}.pdf`
      debugLog('?? Downloading PDF:', fileName)
      pdf.save(fileName)
      debugLog('? PDF downloaded successfully!')
    } catch (error) {
      debugError('? Error downloading PDF:', error)
      debugError('Error details:', error.stack)
      alert(`Failed to download PDF: ${error.message}. Please check console for details.`)
    setShowDownloadMenu(false)
    }
  }

  const downloadExcelReport = () => {
    try {
      setShowDownloadMenu(false)
      const reportData = getReportData()
      const orders = Array.isArray(reportData?.allOrders) ? reportData.allOrders : []

      if (!orders.length) {
        alert("No orders available to export.")
        return
      }

      const totals = orders.reduce(
        (acc, order) => {
          acc.orderAmount += Number(order?.totalAmount || order?.orderTotal || order?.amount || 0)
          acc.earning += Number(order?.payout || order?.restaurantEarning || 0)
          return acc
        },
        { orderAmount: 0, earning: 0 },
      )

      const bodyRowsHtml = orders
        .map((order) => {
          const orderDate = order?.createdAt
            ? formatOrderDate(order.createdAt)
            : (order?.deliveredAt ? formatOrderDate(order.deliveredAt) : "N/A")
          const orderTime = order?.createdAt
            ? formatOrderTime(order.createdAt)
            : (order?.deliveredAt ? formatOrderTime(order.deliveredAt) : "N/A")
          const orderAmount = Number(order?.totalAmount || order?.orderTotal || order?.amount || 0)
          const earning = Number(order?.payout || order?.restaurantEarning || 0)
          const isSettled = Boolean(order?.isSettled === true)

          return `
            <tr>
              <td>${htmlEscape(order?.cycle || "N/A")}</td>
              <td>${htmlEscape(order?.orderId || "N/A")}</td>
              <td>${htmlEscape(orderDate)}</td>
              <td>${htmlEscape(orderTime)}</td>
              <td class="num">${htmlEscape(orderAmount.toFixed(2))}</td>
              <td class="num">${htmlEscape(earning.toFixed(2))}</td>
              <td>${isSettled ? "Paid" : "Unpaid"}</td>
            </tr>
          `
        })
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
              tr.total-row td { background: #fef3c7; font-weight: 700; color: #111827; }
              .meta { margin-bottom: 10px; font-family: Calibri, Arial, sans-serif; }
              .meta p { margin: 0 0 4px 0; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="meta">
              <p><strong>Restaurant:</strong> ${htmlEscape(reportData?.restaurantName || "Restaurant")}</p>
              <p><strong>ID:</strong> ${htmlEscape(reportData?.restaurantId || "N/A")}</p>
              <p><strong>Date Range:</strong> ${htmlEscape(reportData?.dateRange || "N/A")}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Cycle</th>
                  <th>Order ID</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Order Amount</th>
                  <th>Your Earning</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${bodyRowsHtml}
                <tr class="total-row">
                  <td>TOTAL</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td class="num">${htmlEscape(totals.orderAmount.toFixed(2))}</td>
                  <td class="num">${htmlEscape(totals.earning.toFixed(2))}</td>
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
      const fileDate = new Date().toISOString().split("T")[0]
      link.href = url
      link.download = `finance-report-${fileDate}.xls`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      debugError("? Error downloading Excel:", error)
      alert(`Failed to download Excel: ${error.message}`)
      setShowDownloadMenu(false)
    }
  }

  // Close download menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target)) {
        setShowDownloadMenu(false)
      }
    }
    
    if (showDownloadMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDownloadMenu])

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Navbar */}
      <div className="sticky bg-white top-0 z-40 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0 flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-lg font-bold text-gray-900 truncate">
                  {restaurantData?.name || financeData?.restaurant?.name || "Restaurant"}
                </p>
                <ChevronDown className="w-4 h-4 text-gray-600 flex-shrink-0" />
              </div>
              <p className="text-xs text-gray-600 mt-0.5">
                {(() => {
                  const restaurantId = restaurantData?.restaurantId || financeData?.restaurant?.restaurantId
                  const address = restaurantData?.address || financeData?.restaurant?.address || ''
                  const parts = []
                  if (restaurantId) {
                    const formattedId = formatRestaurantId(restaurantId)
                    parts.push(`ID: ${formattedId}`)
                  }
                  if (address) {
                    const shortAddress = address.length > 40 ? address.substring(0, 40) + '...' : address
                    parts.push(shortAddress)
                  }
                  return parts.length > 0 ? parts.join(' • ') : 'Loading...'
                })()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <button
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              onClick={() => navigate("/restaurant/notifications")}
            >
              <Bell className="w-5 h-5 text-gray-700" />
            </button>
            <button
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              onClick={() => navigate("/restaurant/explore")}
            >
              <Menu className="w-5 h-5 text-gray-700" />
            </button>
          </div>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div className="px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("payouts")}
            className={`flex-1 py-3 px-4 rounded-full font-medium text-sm transition-colors ${
              activeTab === "payouts"
                ? "text-white"
                : "bg-white text-gray-600 border border-gray-300"
            }`}
            style={activeTab === "payouts" ? { background: BRAND_THEME.gradients.primary } : undefined}
          >
            Payouts
          </button>
          <button
            onClick={() => setActiveTab("invoices")}
            className={`flex-1 py-3 px-4 rounded-full font-medium text-sm transition-colors ${
              activeTab === "invoices"
                ? "text-white"
                : "bg-white text-gray-600 border border-gray-300"
            }`}
            style={activeTab === "invoices" ? { background: BRAND_THEME.gradients.primary } : undefined}
          >
            Invoices & Taxes
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-28">
        {activeTab === "payouts" && (
          <div className="space-y-6">
            {/* Payout summary */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-3">
                {isPastCyclesView ? "Selected range" : "Current cycle"}
              </h2>
              <div className="bg-white rounded-lg p-4">
                {loading ? (
                  <div className="py-8 text-center text-gray-500">Loading...</div>
                ) : (
                  <>
                    <p className="text-4xl font-bold text-gray-900 mb-2">
                      {formatMoney(payoutUnpaidSummary.amount)}
                    </p>
                    <p className="text-sm text-gray-600 mb-4">
                      {payoutUnpaidSummary.count} {payoutUnpaidSummary.count === 1 ? 'unpaid order' : 'unpaid orders'}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Discount Breakdown */}
            {!loading && (
              <div>
                <h2 className="text-base font-bold text-gray-900 mb-3">Discount breakdown</h2>
                <div className="bg-white rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Platform Coupons</span>
                    <span className="text-sm font-semibold text-green-600">
                      ₹{(() => {
                        const total = (payoutSourceOrders || []).reduce((sum, order) => {
                          return sum + (order.pricing?.couponByAdmin || 0)
                        }, 0)
                        return total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      })()}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Your Coupons</span>
                    <span className="text-sm font-semibold text-orange-600">
                      -₹{(() => {
                        const total = (payoutSourceOrders || []).reduce((sum, order) => {
                          return sum + (order.pricing?.couponByRestaurant || 0)
                        }, 0)
                        return total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      })()}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Your Offers</span>
                    <span className="text-sm font-semibold text-purple-600">
                      -₹{(() => {
                        const total = (payoutSourceOrders || []).reduce((sum, order) => {
                          return sum + (order.pricing?.offerByRestaurant || 0)
                        }, 0)
                        return total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      })()}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Commission Paid</span>
                    <span className="text-sm font-semibold text-brand-600">
                      -₹{(() => {
                        const total = (payoutSourceOrders || []).reduce((sum, order) => {
                          return sum + (order.commission || order.pricing?.restaurantCommission || 0)
                        }, 0)
                        return total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      })()}
                    </span>
                  </div>
                  
                  <div className="bg-brand-50 rounded-lg p-3 mt-3">
                    <p className="text-xs text-brand-800">
                      💡 Platform coupons don't affect your payout. Only your coupons and offers are deducted from your earnings.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Past cycles */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-3">Past cycles</h2>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1 relative" ref={dateRangePickerRef}>
                    <button 
                      onClick={() => setShowDateRangePicker(!showDateRangePicker)}
                      className="w-full bg-white rounded-lg px-4 py-3 flex items-center justify-between border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer"
                    >
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-900">{selectedDateRange}</span>
                    </div>
                      <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${showDateRangePicker ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {/* Date Range Picker Dropdown */}
                    <AnimatePresence>
                      {showDateRangePicker && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-lg shadow-lg border border-gray-200 z-[80]"
                        >
                          <div className="p-4">
                            <h3 className="text-sm font-semibold text-gray-900 mb-3">Select Date Range</h3>
                            <div className="space-y-2">
                              {(() => {
                                const getDateRanges = () => {
                                  const today = new Date()
                                  today.setHours(23, 59, 59, 999)

                                  // Last 7 days
                                  const last7DaysStart = new Date(today)
                                  last7DaysStart.setDate(today.getDate() - 7)
                                  last7DaysStart.setHours(0, 0, 0, 0)
                                  
                                  // Last 30 days
                                  const last30DaysStart = new Date(today)
                                  last30DaysStart.setDate(today.getDate() - 30)
                                  last30DaysStart.setHours(0, 0, 0, 0)
                                  
                                  // This week (Monday to Sunday)
                                  const currentDay = today.getDay()
                                  const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1
                                  const thisWeekStart = new Date(today)
                                  thisWeekStart.setDate(today.getDate() - daysFromMonday)
                                  thisWeekStart.setHours(0, 0, 0, 0)
                                  const thisWeekEnd = new Date(thisWeekStart)
                                  thisWeekEnd.setDate(thisWeekStart.getDate() + 6)
                                  thisWeekEnd.setHours(23, 59, 59, 999)
                                  
                                  // Last week
                                  const lastWeekStart = new Date(thisWeekStart)
                                  lastWeekStart.setDate(thisWeekStart.getDate() - 7)
                                  const lastWeekEnd = new Date(thisWeekEnd)
                                  lastWeekEnd.setDate(thisWeekEnd.getDate() - 7)
                                  
                                  // This month
                                  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
                                  const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999)
                                  
                                  // Last month
                                  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
                                  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999)
                                  
                                  return {
                                    today,
                                    last7DaysStart,
                                    last30DaysStart,
                                    thisWeekStart,
                                    thisWeekEnd,
                                    lastWeekStart,
                                    lastWeekEnd,
                                    thisMonthStart,
                                    thisMonthEnd,
                                    lastMonthStart,
                                    lastMonthEnd
                                  }
                                }
                                
                                const formatDateForDisplay = (date) => {
                                  const day = date.getDate()
                                  const month = date.toLocaleString('en-US', { month: 'short' })
                                  const year = date.getFullYear().toString().slice(-2)
                                  return `${day} ${month}'${year}`
                                }
                                
                                const formatDateRange = (start, end) => {
                                  return `${formatDateForDisplay(start)} - ${formatDateForDisplay(end)}`
                                }
                                
                                const ranges = getDateRanges()
                                const dateOptions = [
                                  { 
                                    label: "Last 7 days", 
                                    range: formatDateRange(ranges.last7DaysStart, ranges.today),
                                    startDate: ranges.last7DaysStart,
                                    endDate: ranges.today
                                  },
                                  { 
                                    label: "Last 30 days", 
                                    range: formatDateRange(ranges.last30DaysStart, ranges.today),
                                    startDate: ranges.last30DaysStart,
                                    endDate: ranges.today
                                  },
                                  { 
                                    label: "This week", 
                                    range: formatDateRange(ranges.thisWeekStart, ranges.thisWeekEnd),
                                    startDate: ranges.thisWeekStart,
                                    endDate: ranges.thisWeekEnd
                                  },
                                  { 
                                    label: "Last week", 
                                    range: formatDateRange(ranges.lastWeekStart, ranges.lastWeekEnd),
                                    startDate: ranges.lastWeekStart,
                                    endDate: ranges.lastWeekEnd
                                  },
                                  { 
                                    label: "This month", 
                                    range: formatDateRange(ranges.thisMonthStart, ranges.thisMonthEnd),
                                    startDate: ranges.thisMonthStart,
                                    endDate: ranges.thisMonthEnd
                                  },
                                  { 
                                    label: "Last month", 
                                    range: formatDateRange(ranges.lastMonthStart, ranges.lastMonthEnd),
                                    startDate: ranges.lastMonthStart,
                                    endDate: ranges.lastMonthEnd
                                  }
                                ]
                                
                                return dateOptions.map((option, index) => (
                                  <button
                                    key={index}
                                    onClick={() => {
                                      setSelectedDateRange(option.range)
                                      setShowDateRangePicker(false)
                                      // Fetch data for selected range
                                      fetchPastCyclesData(option.startDate, option.endDate)
                                    }}
                                    className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 transition-colors text-sm"
                                  >
                                    <div className="font-medium text-gray-900">{option.label}</div>
                                    <div className="text-xs text-gray-500">{option.range}</div>
                  </button>
                                ))
                              })()}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="relative" ref={downloadMenuRef}>
                    <button 
                      onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                      className="text-white rounded-lg px-4 py-3 flex items-center justify-center gap-2 transition-colors"
                      style={{ background: BRAND_THEME.gradients.primary }}
                    >
                      <Download className="w-4 h-4" />
                      <span className="text-sm font-medium">Get report</span>
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    
                    <AnimatePresence>
                      {showDownloadMenu && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -10 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="absolute bottom-full right-0 mb-2 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-[80] min-w-[180px]"
                        >
                          <button
                            onClick={downloadExcelReport}
                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <div className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center">
                              <FileText className="w-4 h-4 text-emerald-600" />
                            </div>
                            <span>Download Excel</span>
                          </button>
                          <button
                            onClick={downloadPDF}
                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <div className="w-6 h-6 rounded-md bg-red-50 flex items-center justify-center">
                              <FileText className="w-4 h-4 text-red-600" />
                            </div>
                            <span>Download PDF</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {[
                    { id: "all", label: "All" },
                    { id: "paid", label: "Paid" },
                    { id: "unpaid", label: "Unpaid" },
                  ].map((option) => {
                    const isActive = settlementStatusFilter === option.id
                    return (
                      <button
                        key={option.id}
                        onClick={() => setSettlementStatusFilter(option.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                          isActive
                            ? "bg-gray-900 text-white border-gray-900"
                            : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                {loadingPastCycles ? (
                  <div className="bg-white rounded-lg p-4">
                    <p className="text-sm text-gray-600 text-center">Loading past cycles...</p>
                  </div>
                ) : (
                  <>
                    {/* Show past cycles orders if available */}
                    {pastCyclesData && pastCyclesData.orders && pastCyclesData.orders.length > 0 ? (
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[760px]">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Order ID</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Date</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Time</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide">Your Earning</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {paginatedPayoutOrders.map((order, index) => {
                                const payout = Number(order?.payout || order?.restaurantEarning || 0)
                                const isSettled = Boolean(order?.isSettled === true)
                                return (
                                  <tr
                                    key={order?.orderId || index}
                                    className="hover:bg-gray-50 cursor-pointer"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => handleOrderRowClick(order)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault()
                                        handleOrderRowClick(order)
                                      }
                                    }}
                                  >
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{order?.orderId || "N/A"}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700">{formatOrderDate(order?.createdAt)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700">{formatOrderTime(order?.createdAt)}</td>
                                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{formatMoney(payout)}</td>
                                    <td className="px-4 py-3 text-sm">
                                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isSettled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                        {isSettled ? "Paid" : "Unpaid"}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        {filteredPastCycleOrders.length === 0 && (
                          <div className="px-4 py-5 border-t border-gray-200 bg-white text-center">
                            <p className="text-sm text-gray-500">
                              No {settlementStatusFilter} orders found in this selected range.
                            </p>
                          </div>
                        )}
                        {renderPagination(
                          payoutTablePage,
                          totalPayoutPages,
                          filteredPastCycleOrders.length,
                          setPayoutTablePage
                        )}
                        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                          <p className="text-xs text-gray-600">You will be paid by admin based on the selected weekly or monthly cycle. Once admin completes payment, Unpaid status will automatically change to Paid.</p>
                        </div>
                      </div>
                    ) : (pastCyclesData && pastCyclesData.orders && pastCyclesData.orders.length === 0) ? (
                      <div className="bg-white rounded-lg p-8 text-center border border-dashed border-gray-300">
                        <p className="text-sm text-gray-500 italic">No orders found for this selected range.</p>
                      </div>
                    ) : null}

                    {/* Show current cycle orders if past cycles data is not requested or not being viewed */}
                    {(!pastCyclesData || !pastCyclesData.orders) && !loadingPastCycles && financeData?.currentCycle?.orders && financeData.currentCycle.orders.length > 0 && (
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[760px]">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Order ID</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Date</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Time</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide">Your Earning</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {paginatedPayoutOrders.map((order, index) => {
                                const payout = Number(order?.payout || order?.restaurantEarning || 0)
                                const isSettled = Boolean(order?.isSettled === true)
                                return (
                                  <tr
                                    key={order?.orderId || index}
                                    className="hover:bg-gray-50 cursor-pointer"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => handleOrderRowClick(order)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault()
                                        handleOrderRowClick(order)
                                      }
                                    }}
                                  >
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{order?.orderId || "N/A"}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700">{formatOrderDate(order?.createdAt)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700">{formatOrderTime(order?.createdAt)}</td>
                                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{formatMoney(payout)}</td>
                                    <td className="px-4 py-3 text-sm">
                                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isSettled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                        {isSettled ? "Paid" : "Unpaid"}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        {filteredCurrentCycleOrders.length === 0 && (
                          <div className="px-4 py-5 border-t border-gray-200 bg-white text-center">
                            <p className="text-sm text-gray-500">
                              No {settlementStatusFilter} orders found in the current cycle.
                            </p>
                          </div>
                        )}
                        {renderPagination(
                          payoutTablePage,
                          totalPayoutPages,
                          filteredCurrentCycleOrders.length,
                          setPayoutTablePage
                        )}
                        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                          <p className="text-xs text-gray-600">You will be paid by admin based on the selected weekly or monthly cycle. Once admin completes payment, Unpaid status will automatically change to Paid.</p>
                        </div>
                      </div>
                    )}
                    
                    {(!pastCyclesData || (!pastCyclesData.orders || pastCyclesData.orders.length === 0)) && 
                     (!financeData?.currentCycle?.orders || financeData.currentCycle.orders.length === 0) && 
                     !loadingPastCycles && !loading && (
                      <div className="bg-white rounded-lg p-12 text-center border border-gray-200">
                        <p className="text-gray-400 mb-2">No transaction history available</p>
                        <p className="text-xs text-gray-500">Your earnings and order payouts will appear here.</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "invoices" && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Invoices & Taxes Summary</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-md bg-gray-50 p-3">
                  <p className="text-xs text-gray-600">Orders</p>
                  <p className="text-base font-semibold text-gray-900">{invoiceSummary.count}</p>
                </div>
                <div className="rounded-md bg-gray-50 p-3">
                  <p className="text-xs text-gray-600">Earnings</p>
                  <p className="text-base font-semibold text-gray-900">₹{invoiceSummary.earnings.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="rounded-md bg-gray-50 p-3">
                  <p className="text-xs text-gray-600">Commission</p>
                  <p className="text-base font-semibold text-gray-900">₹{invoiceSummary.commission.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="rounded-md bg-gray-50 p-3">
                  <p className="text-xs text-gray-600">Gross amount</p>
                  <p className="text-base font-semibold text-gray-900">₹{invoiceSummary.gross.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Order invoice details</h3>
              <div className="flex items-center gap-2 mb-3">
                {[
                  { id: "all", label: "All" },
                  { id: "paid", label: "Paid" },
                  { id: "unpaid", label: "Unpaid" },
                ].map((option) => {
                  const isActive = settlementStatusFilter === option.id
                  return (
                    <button
                      key={`invoice-${option.id}`}
                      onClick={() => setSettlementStatusFilter(option.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                        isActive
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
              {loading ? (
                <p className="text-sm text-gray-500">Loading invoice data...</p>
              ) : filteredInvoiceOrders.length === 0 ? (
                <p className="text-sm text-gray-500">No invoice data available for selected range.</p>
              ) : (
                <div className="space-y-2">
                  {paginatedInvoiceOrders.map((order, index) => (
                    <div key={`${order.orderId || index}-invoice`} className="border border-gray-100 rounded-md p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Order: {order.orderId || "N/A"}</p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {order.paymentMethod || "N/A"} | {order.orderStatus || "N/A"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-900">
                            ₹{(order.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-gray-500">Total</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {renderPagination(
                    invoiceTablePage,
                    totalInvoicePages,
                    filteredInvoiceOrders.length,
                    setInvoiceTablePage
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <BottomNavOrders />
    </div>
  )
}





