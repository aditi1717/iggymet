import { useState, useMemo, useEffect } from "react"
import { Search, Download, ChevronDown, Filter, Briefcase, RefreshCw, Settings, ArrowUpDown, FileText, FileSpreadsheet, Code, Loader2, Star } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@food/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@food/components/ui/dialog"
import { exportReportsToCSV, exportReportsToPDF, exportReportsToJSON } from "@food/components/admin/reports/reportsExportUtils"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

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


export default function RestaurantReport() {
  const todayDate = new Date().toISOString().split("T")[0]
  const [searchQuery, setSearchQuery] = useState("")
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    zone: "All Zones",
    all: "All",
    time: "All Time",
    fromDate: "",
    toDate: "",
  })
  const [zones, setZones] = useState([])
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Fetch zones for filter dropdown
  useEffect(() => {
    const fetchZones = async () => {
      try {
        const response = await adminAPI.getZones({ limit: 1000 })
        if (response?.data?.success && response.data.data?.zones) {
          setZones(response.data.data.zones)
        }
      } catch (error) {
        debugError("Error fetching zones:", error)
      }
    }
    fetchZones()
  }, [])

  // Fetch restaurant report data
  useEffect(() => {
    const fetchRestaurantReport = async () => {
      try {
        setLoading(true)
        if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
          toast.error("Start Date cannot be after End Date")
          setRestaurants([])
          setLoading(false)
          return
        }
        if (filters.fromDate && filters.fromDate > todayDate) {
          toast.error("Start Date cannot be in the future")
          setRestaurants([])
          setLoading(false)
          return
        }
        if (filters.toDate && filters.toDate > todayDate) {
          toast.error("End Date cannot be in the future")
          setRestaurants([])
          setLoading(false)
          return
        }
        
        const params = {
          zone: filters.zone !== "All Zones" ? filters.zone : undefined,
          all: filters.all !== "All" ? filters.all : undefined,
          time: filters.time !== "All Time" ? filters.time : undefined,
          fromDate: filters.fromDate || undefined,
          toDate: filters.toDate || undefined,
          search: searchQuery || undefined
        }

        const response = await adminAPI.getRestaurantReport(params)

        if (response?.data?.success && response.data.data) {
          setRestaurants(response.data.data.restaurants || [])
        } else {
          setRestaurants([])
          if (response?.data?.message) {
            toast.error(response.data.message)
          }
        }
      } catch (error) {
        debugError("Error fetching restaurant report:", error)
        toast.error("Failed to fetch restaurant report")
        setRestaurants([])
      } finally {
        setLoading(false)
      }
    }

    fetchRestaurantReport()
  }, [filters, searchQuery])

  const filteredRestaurants = useMemo(() => {
    return restaurants // Backend already filters, so just return restaurants
  }, [restaurants])

  const totalRestaurants = filteredRestaurants.length

  const handleReset = () => {
    setFilters({
      zone: "All Zones",
      all: "All",
      time: "All Time",
      fromDate: "",
      toDate: "",
    })
    setSearchQuery("")
  }

  const handleTimeFilterChange = (value) => {
    setFilters((prev) => ({
      ...prev,
      time: value,
      fromDate: "",
      toDate: "",
    }))
  }

  const handleDateFilterChange = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      time: "All Time",
    }))
  }

  const handleExport = (format) => {
    if (filteredRestaurants.length === 0) {
      alert("No data to export")
      return
    }
    const headers = [
      { key: "sl", label: "SL" },
      { key: "restaurantName", label: "Restaurant Name" },
      { key: "totalFood", label: "Total Food" },
      { key: "totalOrder", label: "Total Order" },
      { key: "totalAdminCommission", label: "Admin Commission" },
      { key: "totalCouponByAdmin", label: "Coupon by Admin" },
      { key: "totalCouponByRestaurant", label: "Coupon by Restaurant" },
      { key: "totalOfferByRestaurant", label: "Offer by Restaurant" },
      { key: "totalGST", label: "GST" },
      { key: "totalRestaurantEarning", label: "Total Restaurant Earning" },
      { key: "paidRestaurantEarning", label: "Paid To Restaurant" },
      { key: "unpaidRestaurantEarning", label: "Unpaid To Restaurant" },
      { key: "totalDeliveryCharge", label: "Delivery Charges" },
      { key: "totalPlatformFee", label: "Platform Fees" },
      { key: "totalOrderAmount", label: "Total Order Amount" },
      { key: "averageRatings", label: "Average Ratings" },
    ]
    if (format === "excel") {
      const metrics = filteredRestaurants.reduce(
        (acc, item) => {
          acc.totalFood += toAmountNumber(item.totalFood)
          acc.totalOrder += toAmountNumber(item.totalOrder)
          acc.totalAdminCommission += toAmountNumber(item.totalAdminCommission)
          acc.totalCouponByAdmin += toAmountNumber(item.totalCouponByAdmin)
          acc.totalCouponByRestaurant += toAmountNumber(item.totalCouponByRestaurant)
          acc.totalOfferByRestaurant += toAmountNumber(item.totalOfferByRestaurant)
          acc.totalGST += toAmountNumber(item.totalGST)
          acc.totalRestaurantEarning += toAmountNumber(item.totalRestaurantEarning)
          acc.paidRestaurantEarning += toAmountNumber(item.paidRestaurantEarning)
          acc.unpaidRestaurantEarning += toAmountNumber(item.unpaidRestaurantEarning)
          acc.totalDeliveryCharge += toAmountNumber(item.totalDeliveryCharge)
          acc.totalPlatformFee += toAmountNumber(item.totalPlatformFee)
          acc.totalOrderAmount += toAmountNumber(item.totalOrderAmount)
          if (toAmountNumber(item.averageRatings) > 0) {
            acc.ratingsTotal += toAmountNumber(item.averageRatings)
            acc.ratingsCount += 1
          }
          return acc
        },
        {
          totalFood: 0,
          totalOrder: 0,
          totalAdminCommission: 0,
          totalCouponByAdmin: 0,
          totalCouponByRestaurant: 0,
          totalOfferByRestaurant: 0,
          totalGST: 0,
          totalRestaurantEarning: 0,
          paidRestaurantEarning: 0,
          unpaidRestaurantEarning: 0,
          totalDeliveryCharge: 0,
          totalPlatformFee: 0,
          totalOrderAmount: 0,
          ratingsTotal: 0,
          ratingsCount: 0,
        },
      )

      const bodyRowsHtml = filteredRestaurants
        .map(
          (item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${htmlEscape(item.restaurantName || "-")}</td>
            <td class="num">${htmlEscape(item.totalFood ?? 0)}</td>
            <td class="num">${htmlEscape(item.totalOrder ?? 0)}</td>
            <td class="num">${htmlEscape(item.totalAdminCommission ?? 0)}</td>
            <td class="num">${htmlEscape(item.totalCouponByAdmin ?? 0)}</td>
            <td class="num">${htmlEscape(item.totalCouponByRestaurant ?? 0)}</td>
            <td class="num">${htmlEscape(item.totalOfferByRestaurant ?? 0)}</td>
            <td class="num">${htmlEscape(item.totalGST ?? 0)}</td>
            <td class="num">${htmlEscape(item.totalRestaurantEarning ?? 0)}</td>
            <td class="num">${htmlEscape(item.paidRestaurantEarning ?? 0)}</td>
            <td class="num">${htmlEscape(item.unpaidRestaurantEarning ?? 0)}</td>
            <td class="num">${htmlEscape(item.totalDeliveryCharge ?? 0)}</td>
            <td class="num">${htmlEscape(item.totalPlatformFee ?? 0)}</td>
            <td class="num">${htmlEscape(item.totalOrderAmount ?? 0)}</td>
            <td class="num">${htmlEscape(item.averageRatings ?? 0)}</td>
          </tr>`,
        )
        .join("")

      const avgRating = metrics.ratingsCount > 0 ? metrics.ratingsTotal / metrics.ratingsCount : 0

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
                  <th>SL</th>
                  <th>Restaurant Name</th>
                  <th>Total Food</th>
                  <th>Total Order</th>
                  <th>Admin Commission</th>
                  <th>Coupon by Admin</th>
                  <th>Coupon by Restaurant</th>
                  <th>Offer by Restaurant</th>
                  <th>GST</th>
                  <th>Total Restaurant Earning</th>
                  <th>Paid To Restaurant</th>
                  <th>Unpaid To Restaurant</th>
                  <th>Delivery Charges</th>
                  <th>Platform Fees</th>
                  <th>Total Order Amount</th>
                  <th>Average Ratings</th>
                </tr>
              </thead>
              <tbody>
                ${bodyRowsHtml}
                <tr class="total-row">
                  <td>TOTAL</td>
                  <td>${htmlEscape(`${filteredRestaurants.length} restaurants`)}</td>
                  <td class="num">${htmlEscape(metrics.totalFood.toFixed(0))}</td>
                  <td class="num">${htmlEscape(metrics.totalOrder.toFixed(0))}</td>
                  <td class="num">${htmlEscape(metrics.totalAdminCommission.toFixed(2))}</td>
                  <td class="num">${htmlEscape(metrics.totalCouponByAdmin.toFixed(2))}</td>
                  <td class="num">${htmlEscape(metrics.totalCouponByRestaurant.toFixed(2))}</td>
                  <td class="num">${htmlEscape(metrics.totalOfferByRestaurant.toFixed(2))}</td>
                  <td class="num">${htmlEscape(metrics.totalGST.toFixed(2))}</td>
                  <td class="num">${htmlEscape(metrics.totalRestaurantEarning.toFixed(2))}</td>
                  <td class="num">${htmlEscape(metrics.paidRestaurantEarning.toFixed(2))}</td>
                  <td class="num">${htmlEscape(metrics.unpaidRestaurantEarning.toFixed(2))}</td>
                  <td class="num">${htmlEscape(metrics.totalDeliveryCharge.toFixed(2))}</td>
                  <td class="num">${htmlEscape(metrics.totalPlatformFee.toFixed(2))}</td>
                  <td class="num">${htmlEscape(metrics.totalOrderAmount.toFixed(2))}</td>
                  <td class="num">${htmlEscape(avgRating.toFixed(2))}</td>
                </tr>
              </tbody>
            </table>
          </body>
        </html>
      `

      const blob = new Blob([xlsHtml], { type: "application/vnd.ms-excel;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      const stamp = new Date().toISOString().slice(0, 10)
      link.href = url
      link.download = `restaurant-report-${stamp}.xls`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success("Excel downloaded")
      return
    }

    switch (format) {
      case "csv": exportReportsToCSV(filteredRestaurants, headers, "restaurant_report"); break
      case "pdf": exportReportsToPDF(filteredRestaurants, headers, "restaurant_report", "Restaurant Report"); break
      case "json": exportReportsToJSON(filteredRestaurants, "restaurant_report"); break
    }
  }

  const handleFilterApply = () => {
    // Filters are already applied via useMemo
  }

  const activeFiltersCount =
    (filters.zone !== "All Zones" ? 1 : 0) +
    (filters.all !== "All" ? 1 : 0) +
    (filters.time !== "All Time" ? 1 : 0) +
    (filters.fromDate ? 1 : 0) +
    (filters.toDate ? 1 : 0)

    const renderStars = (rating, reviews) => {
    if (!rating || rating === 0) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-slate-400">No Ratings</span>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-1.5">
         <div className="flex items-center text-amber-500">
           <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 fill-current" viewBox="0 0 24 24">
             <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
           </svg>
         </div>
         <span className="font-bold text-slate-800">{Number(rating).toFixed(1)}</span>
         <span className="text-slate-500 text-xs font-semibold">({reviews || 0})</span>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
          <p className="text-gray-600">Loading restaurant report...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Restaurant Report</h1>
          </div>
        </div>

        {/* Search Data Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Search Data</h3>
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 flex-1">
              <div className="relative">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Zone
                </label>
                <select
                  value={filters.zone}
                  onChange={(e) => setFilters(prev => ({ ...prev, zone: e.target.value }))}
                  className="w-full px-4 py-2.5 pr-8 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="All Zones">All Zones</option>
                  {zones.map(zone => (
                    <option key={zone._id} value={zone.name}>{zone.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>

              <div className="relative">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  All
                </label>
                <select
                  value={filters.all}
                  onChange={(e) => setFilters(prev => ({ ...prev, all: e.target.value }))}
                  className="w-full px-4 py-2.5 pr-8 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="All">All</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
                <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>

              <div className="relative">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Time
                </label>
                <select
                  value={filters.time}
                  onChange={(e) => handleTimeFilterChange(e.target.value)}
                  className="w-full px-4 py-2.5 pr-8 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="All Time">All Time</option>
                  <option value="Today">Today</option>
                  <option value="This Week">This Week</option>
                  <option value="This Month">This Month</option>
                  <option value="This Year">This Year</option>
                </select>
                <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) => handleDateFilterChange("fromDate", e.target.value)}
                  max={todayDate}
                  className="w-full px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={filters.toDate}
                  onChange={(e) => handleDateFilterChange("toDate", e.target.value)}
                  max={todayDate}
                  className="w-full px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="flex items-end gap-3">
              <button
                onClick={handleReset}
                className="px-6 py-2.5 text-sm font-medium rounded-lg bg-slate-600 text-white hover:bg-slate-700 transition-all flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reset
              </button>
              <button 
                onClick={handleFilterApply}
                className={`px-6 py-2.5 text-sm font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-all flex items-center gap-2 relative ${
                  activeFiltersCount > 0 ? "ring-2 ring-brand-300" : ""
                }`}
              >
                <Filter className="w-4 h-4" />
                Filter
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">
                    {activeFiltersCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Restaurant Report Table Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold text-slate-900">Restaurant Report Table {totalRestaurants}</h2>

            <div className="flex items-center gap-3">
              <div className="relative flex-1 sm:flex-initial min-w-[250px]">
                <input
                  type="text"
                  placeholder="Ex: search restaurant nam"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-4 pr-10 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all">
                    <Download className="w-4 h-4" />
                    <span className="text-black font-bold">Export</span>
                    <ChevronDown className="w-3 h-3" />
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
                className="p-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[2000px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>SL</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>Restaurant Name</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <span>Total Food</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <span>Total Order</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <span>Admin Commission</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <span>Coupon by Admin</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <span>Coupon by Restaurant</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <span>Offer by Restaurant</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <span>GST</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <span>Total Restaurant Earning</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <span>Paid</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <span>Unpaid</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <span>Delivery Charges</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <span>Platform Fees</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <span>Total Order Amount</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center justify-end gap-1">
                      <span>Average Ratings</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredRestaurants.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
                        <p className="text-sm text-slate-500">No restaurants match your search</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRestaurants.map((restaurant) => (
                    <tr key={restaurant.sl} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-700">{restaurant.sl}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center flex-shrink-0">
                            {restaurant.icon ? (
                              <img
                                src={restaurant.icon}
                                alt={restaurant.restaurantName}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.src = "https://via.placeholder.com/32"
                                }}
                              />
                            ) : (
                              <div className="w-full h-full bg-slate-300 flex items-center justify-center text-xs text-slate-600 font-semibold">
                                {restaurant.restaurantName.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <span className="text-sm font-medium text-slate-900">{restaurant.restaurantName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right tabular-nums">
                        <span className="text-sm text-slate-700">{restaurant.totalFood}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right tabular-nums">
                        <span className="text-sm text-slate-700">{restaurant.totalOrder}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right tabular-nums">
                        <span className="text-sm font-semibold text-brand-600">{restaurant.totalAdminCommission}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right tabular-nums">
                        <span className="text-sm font-medium text-green-600">{restaurant.totalCouponByAdmin}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right tabular-nums">
                        <span className="text-sm font-medium text-orange-600">{restaurant.totalCouponByRestaurant}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right tabular-nums">
                        <span className="text-sm font-medium text-purple-600">{restaurant.totalOfferByRestaurant}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right tabular-nums">
                        <span className="text-sm text-slate-700">{restaurant.totalGST}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right tabular-nums">
                        <span className="text-sm font-semibold text-slate-900">{restaurant.totalRestaurantEarning}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right tabular-nums">
                        <span className="text-sm font-semibold text-emerald-600">{restaurant.paidRestaurantEarning}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right tabular-nums">
                        <span className="text-sm font-semibold text-orange-600">{restaurant.unpaidRestaurantEarning}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right tabular-nums">
                        <span className="text-sm text-slate-700">{restaurant.totalDeliveryCharge}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right tabular-nums">
                        <span className="text-sm text-slate-700">{restaurant.totalPlatformFee}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right tabular-nums">
                        <span className="text-sm font-medium text-slate-900">{restaurant.totalOrderAmount}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex justify-end">
                          {renderStars(restaurant.averageRatings, restaurant.reviews)}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
              Restaurant report settings and preferences will be available here.
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

