import { useState, useMemo, useEffect } from "react"
import { Search, Download, ChevronDown, Eye, User, Star, ArrowUpDown, Settings, FileText, FileSpreadsheet, Loader2, Check, Columns, ExternalLink, Calendar, MapPin, CreditCard, Mail, Phone, Bike, FileCheck, Pencil, Save, Trash2, X } from "lucide-react"
import { adminAPI } from "@food/api"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@food/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@food/components/ui/dialog"
import { exportDeliverymenToExcel, exportDeliverymenToPDF } from "@food/components/admin/deliveryman/deliverymanExportUtils"
import { toast } from "sonner"
const debugError = () => {}


const formatCurrency = (amount) => {
  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount)) return "\u20B90.00"
  return `\u20B9${numericAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const toNumber = (...values) => {
  for (const value of values) {
    const numericValue = Number(value)
    if (Number.isFinite(numericValue)) return numericValue
  }
  return 0
}

const normalizePhone = (value) => String(value || "").replace(/\D/g, "")
const normalizeKey = (value) => String(value || "").trim().toLowerCase()

const getTotalOrdersCount = (partner = {}, wallet = {}) => {
  const directOrders = toNumber(
    partner.totalOrders,
    partner.ordersCompleted,
    partner.completedOrders,
    partner.totalTrips,
    partner.totalTrip,
    partner.tripCount,
    partner.orderCount,
    partner.ordersCount,
    wallet.totalOrders,
    wallet.ordersCount,
    wallet.orderCount,
  )
  if (directOrders > 0) return directOrders

  const cashOrders = toNumber(
    wallet.totalCashOrders,
    wallet.totalCodOrders,
    wallet.codOrders,
    wallet.cashOrdersCount,
    wallet.codCount,
  )
  const onlineOrders = toNumber(
    wallet.totalOnlineOrders,
    wallet.onlineOrders,
    wallet.onlineOrdersCount,
    wallet.onlineCount,
    wallet.digitalOrdersCount,
  )
  return cashOrders + onlineOrders
}

export default function DeliverymanList() {
  const [searchQuery, setSearchQuery] = useState("")
  const [deliverymen, setDeliverymen] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [viewDetails, setViewDetails] = useState(null)
  const [editingDeliveryId, setEditingDeliveryId] = useState(null)
  const [editValues, setEditValues] = useState({ pocketBalance: "", cashInHand: "" })
  const [savingDeliveryId, setSavingDeliveryId] = useState(null)
  const [deletingDeliveryId, setDeletingDeliveryId] = useState(null)
  const [zones, setZones] = useState([])
  const [zonesLoading, setZonesLoading] = useState(false)
  const [isZoneDialogOpen, setIsZoneDialogOpen] = useState(false)
  const [selectedDeliveryForZone, setSelectedDeliveryForZone] = useState(null)
  const [selectedZoneId, setSelectedZoneId] = useState("")
  const [savingZoneForDeliveryId, setSavingZoneForDeliveryId] = useState(null)
  const [visibleColumns, setVisibleColumns] = useState({
    si: true,
    name: true,
    contact: true,
    zone: true,
    totalOrders: true,
    availabilityStatus: true,
    actions: true,
  })

  const fetchAllWalletRows = async (search = "") => {
    const walletLimit = 100
    let currentPage = 1
    let totalPages = 1
    const allRows = []

    do {
      const response = await adminAPI.getDeliveryBoyWallets({
        search: search || undefined,
        page: currentPage,
        limit: walletLimit,
      })

      if (!response?.data?.success) {
        break
      }

      const data = response.data.data || {}
      const rows = data.wallets || []
      allRows.push(...rows)
      totalPages = Number(data.pagination?.pages) || 1
      currentPage += 1
    } while (currentPage <= totalPages)

    return allRows
  }

  const fetchZones = async () => {
    try {
      setZonesLoading(true)
      const response = await adminAPI.getZones({ page: 1, limit: 1000 })
      const list = response?.data?.data?.zones || []
      setZones(Array.isArray(list) ? list : [])
    } catch (err) {
      debugError("Error fetching zones:", err)
      setZones([])
    } finally {
      setZonesLoading(false)
    }
  }

  // Fetch delivery partners from API
  const fetchDeliverymen = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const params = {
        page: 1,
        limit: 1000, // Get all for now
      }

      // Add search to params if provided
      if (searchQuery.trim()) {
        params.search = searchQuery.trim()
      }

      const [partnersResponse, walletRowsResult] = await Promise.allSettled([
        adminAPI.getDeliveryPartners(params),
        fetchAllWalletRows(searchQuery.trim()),
      ])

      if (partnersResponse.status === "fulfilled" && partnersResponse.value?.data?.success) {
        const partners = partnersResponse.value.data.data.deliveryPartners || []
        const walletRows = walletRowsResult.status === "fulfilled" ? walletRowsResult.value || [] : []

        const walletMap = new Map()
        walletRows.forEach((wallet) => {
          const keys = [
            String(wallet?.deliveryId || ""),
            String(wallet?.deliveryPartnerId || ""),
            String(wallet?.partnerId || ""),
            String(wallet?.walletId || ""),
            String(wallet?.deliveryIdString || ""),
            normalizePhone(wallet?.deliveryIdString),
          ]
            .filter(Boolean)
            .map(normalizeKey)

          keys.forEach((key) => {
            walletMap.set(key, wallet)
          })
        })

        const mergedPartners = partners.map((partner) => {
          const walletKeys = [
            String(partner?._id || ""),
            String(partner?.id || ""),
            String(partner?.deliveryId || ""),
            String(partner?.deliveryIdString || ""),
            normalizePhone(partner?.phone),
            String(partner?.name || ""),
          ]
            .filter(Boolean)
            .map(normalizeKey)
          const wallet = walletKeys.map((key) => walletMap.get(key)).find(Boolean)
          return {
            ...partner,
            walletSummary: wallet || null,
            totalOrders: getTotalOrdersCount(partner, wallet || {}),
pocketBalance: wallet?.pocketBalance || 0,
cashInHand: wallet?.cashCollected || 0,
remainingCashLimit: wallet?.remainingCashLimit || 0,
totalEarning: wallet?.totalEarning || 0,
bonus: wallet?.bonus || 0,
totalWithdrawn: wallet?.totalWithdrawn || 0,
availableCashLimit: wallet?.availableCashLimit || 0,
          }
        })

        // Fallback: derive order counts directly from orders list for accurate totals.
        let partnersWithOrderCounts = mergedPartners
        try {
          const orderCountMap = new Map()
          let nextOrdersPage = 1
          let totalOrderPages = 1
          let guard = 0

          do {
            const ordersRes = await adminAPI.getOrders({
              page: nextOrdersPage,
              limit: 100,
            })

            const orderRows =
              ordersRes?.data?.data?.orders ??
              ordersRes?.data?.orders ??
              ordersRes?.data?.data?.docs ??
              ordersRes?.data?.data?.data ??
              ordersRes?.data?.data ??
              []
            const safeRows = Array.isArray(orderRows) ? orderRows : []

            safeRows.forEach((order) => {
              const dispatchPartner = order?.dispatch?.deliveryPartnerId
              const directPartner = order?.deliveryPartnerId

              const partnerId =
                (dispatchPartner && typeof dispatchPartner === "object"
                  ? dispatchPartner?._id || dispatchPartner?.id
                  : dispatchPartner) ||
                (directPartner && typeof directPartner === "object" ? directPartner?._id || directPartner?.id : directPartner)

              const partnerPhone =
                order?.deliveryPartnerPhone ||
                (dispatchPartner && typeof dispatchPartner === "object" ? dispatchPartner?.phone : "") ||
                (directPartner && typeof directPartner === "object" ? directPartner?.phone : "")

              const partnerName =
                order?.deliveryPartnerName ||
                (dispatchPartner && typeof dispatchPartner === "object" ? dispatchPartner?.name : "") ||
                (directPartner && typeof directPartner === "object" ? directPartner?.name : "")

              const keys = [
                normalizeKey(partnerId),
                normalizeKey(order?.assignedDeliveryPartnerId),
                normalizePhone(partnerPhone),
                normalizeKey(partnerName),
              ].filter(Boolean)

              keys.forEach((key) => {
                orderCountMap.set(key, toNumber(orderCountMap.get(key), 0) + 1)
              })
            })

            totalOrderPages = Number(ordersRes?.data?.data?.meta?.totalPages || ordersRes?.data?.meta?.totalPages || 1)
            nextOrdersPage += 1
            guard += 1
          } while (nextOrdersPage <= totalOrderPages && guard < 100)

          if (orderCountMap.size > 0) {
            partnersWithOrderCounts = mergedPartners.map((partner) => {
              const keys = [
                normalizeKey(partner?._id),
                normalizeKey(partner?.deliveryId),
                normalizePhone(partner?.phone),
                normalizeKey(partner?.name),
              ].filter(Boolean)

              const mappedTotalOrders = keys.map((key) => orderCountMap.get(key)).find((count) => Number.isFinite(Number(count)))
              if (!Number.isFinite(Number(mappedTotalOrders))) return partner

              return {
                ...partner,
                totalOrders: toNumber(mappedTotalOrders),
              }
            })
          }
        } catch (orderCountError) {
          debugError("Order count mapping failed:", orderCountError)
        }

        setDeliverymen(partnersWithOrderCounts)
      } else {
        setError("Failed to fetch delivery partners")
        setDeliverymen([])
      }
    } catch (err) {
      debugError("Error fetching delivery partners:", err)
      
      // Better error handling
      let errorMessage = "Failed to fetch delivery partners. Please try again."
      
      if (err.code === 'ERR_NETWORK') {
        errorMessage = "Network error. Please check if backend server is running."
      } else if (err.response?.status === 401) {
        errorMessage = "Unauthorized. Please login again."
      } else if (err.response?.status === 403) {
        errorMessage = "Access denied. You don't have permission to view this."
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message
      } else if (err.message) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
      setDeliverymen([])
    } finally {
      setLoading(false)
    }
  }

  // Fetch on mount
  useEffect(() => {
    fetchDeliverymen()
    fetchZones()
  }, [])

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDeliverymen()
    }, 500) // Wait 500ms after user stops typing

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  const filteredDeliverymen = useMemo(() => {
    // Backend already handles search, but we can do client-side filtering if needed
    return deliverymen
  }, [deliverymen])

  const handleView = async (deliveryman) => {
    try {
      setLoading(true)
      const response = await adminAPI.getDeliveryPartnerById(deliveryman._id)
      
      if (response.data && response.data.success) {
        setViewDetails({
          ...response.data.data.delivery,
          walletSummary: deliveryman.walletSummary || null,
pocketBalance: deliveryman.pocketBalance || 0,
cashInHand: deliveryman.cashInHand || 0,
remainingCashLimit: deliveryman.remainingCashLimit || 0,
totalEarning: deliveryman.totalEarning || 0,
bonus: deliveryman.bonus || 0,
totalWithdrawn: deliveryman.totalWithdrawn || 0,
availableCashLimit: deliveryman.availableCashLimit || 0,
        })
        setIsViewOpen(true)
      } else {
        alert("Failed to load details")
      }
    } catch (err) {
      debugError("Error fetching details:", err)
      alert(err.response?.data?.message || "Failed to load details")
    } finally {
      setLoading(false)
    }
  }

  const handleExportPDF = () => {
    if (filteredDeliverymen.length === 0) {
      alert("No data to export")
      return
    }
    exportDeliverymenToPDF(filteredDeliverymen)
  }

  const handleExportExcel = () => {
    if (filteredDeliverymen.length === 0) {
      alert("No data to export")
      return
    }
    exportDeliverymenToExcel(filteredDeliverymen)
  }

  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({ ...prev, [columnKey]: !prev[columnKey] }))
  }

  const resetColumns = () => {
    setVisibleColumns({
      si: true,
      name: true,
      contact: true,
      zone: true,
      totalOrders: true,
      availabilityStatus: true,
      actions: true,
    })
  }

  const columnsConfig = {
    si: "Serial Number",
    name: "Name",
    contact: "Contact",
    zone: "Zone",
    totalOrders: "Total Orders",
    availabilityStatus: "Availability Status",
    actions: "Actions",
  }

  const startEditingWallet = (deliveryman) => {
    setEditingDeliveryId(String(deliveryman._id))
    setEditValues({
      pocketBalance: String(Number(deliveryman.pocketBalance) || 0),
      cashInHand: String(Number(deliveryman.cashInHand) || 0),
    })
  }

  const cancelEditingWallet = () => {
    setEditingDeliveryId(null)
    setEditValues({ pocketBalance: "", cashInHand: "" })
  }

  const updateWalletFieldValue = (field, value) => {
    setEditValues((prev) => ({ ...prev, [field]: value }))
  }

  const saveWalletChanges = async (deliveryman) => {
    const nextPocketBalance = Number(editValues.pocketBalance)
    const nextCashInHand = Number(editValues.cashInHand)

    if (!Number.isFinite(nextPocketBalance) || nextPocketBalance < 0) {
      toast.error("Pocket balance must be a valid non-negative number")
      return
    }

    if (!Number.isFinite(nextCashInHand) || nextCashInHand < 0) {
      toast.error("Cash in hand must be a valid non-negative number")
      return
    }

    try {
      setSavingDeliveryId(String(deliveryman._id))
      const response = await adminAPI.updateDeliveryBoyWallet({
        walletId: deliveryman.walletSummary?.walletId,
        deliveryId: deliveryman._id,
        pocketBalance: nextPocketBalance,
        cashInHand: nextCashInHand,
      })

      if (!response?.data?.success) {
        toast.error(response?.data?.message || "Failed to update wallet")
        return
      }

      const updatedWallet = response.data.data || {}
      setDeliverymen((prev) =>
        prev.map((item) =>
          String(item._id) === String(deliveryman._id)
            ? {
                ...item,
                pocketBalance: updatedWallet.pocketBalance ?? nextPocketBalance,
                cashInHand: updatedWallet.cashInHand ?? nextCashInHand,
                remainingCashLimit: updatedWallet.remainingCashLimit ?? item.remainingCashLimit,
                availableCashLimit: updatedWallet.availableCashLimit ?? item.availableCashLimit,
                walletSummary: {
                  ...(item.walletSummary || {}),
                  walletId: updatedWallet.walletId || item.walletSummary?.walletId,
                  pocketBalance: updatedWallet.pocketBalance ?? nextPocketBalance,
                  cashCollected: updatedWallet.cashInHand ?? nextCashInHand,
                  remainingCashLimit: updatedWallet.remainingCashLimit ?? item.remainingCashLimit,
                  availableCashLimit: updatedWallet.availableCashLimit ?? item.availableCashLimit,
                },
              }
            : item,
        ),
      )

      setViewDetails((prev) => {
        if (!prev || String(prev._id) !== String(deliveryman._id)) {
          return prev
        }

        return {
          ...prev,
          pocketBalance: updatedWallet.pocketBalance ?? nextPocketBalance,
          cashInHand: updatedWallet.cashInHand ?? nextCashInHand,
          remainingCashLimit: updatedWallet.remainingCashLimit ?? prev.remainingCashLimit,
          availableCashLimit: updatedWallet.availableCashLimit ?? prev.availableCashLimit,
          walletSummary: {
            ...(prev.walletSummary || {}),
            walletId: updatedWallet.walletId || prev.walletSummary?.walletId,
            pocketBalance: updatedWallet.pocketBalance ?? nextPocketBalance,
            cashCollected: updatedWallet.cashInHand ?? nextCashInHand,
            remainingCashLimit: updatedWallet.remainingCashLimit ?? prev.remainingCashLimit,
            availableCashLimit: updatedWallet.availableCashLimit ?? prev.availableCashLimit,
          },
        }
      })

      toast.success("Wallet updated")
      cancelEditingWallet()
    } catch (err) {
      debugError("Error updating delivery wallet:", err)
      toast.error(err.response?.data?.message || "Failed to update wallet")
    } finally {
      setSavingDeliveryId(null)
    }
  }

  const handleDelete = async (deliveryman) => {
    const deliverymanId = String(deliveryman?._id || "")
    if (!deliverymanId) {
      toast.error("Delivery partner not found")
      return
    }

    const confirmed = window.confirm(
      `Deactivate ${deliveryman?.name || "this delivery partner"}?\n\nThis will block the account and log them out, while preserving profile, wallet, and history.`,
    )

    if (!confirmed) {
      return
    }

    try {
      setDeletingDeliveryId(deliverymanId)
      const response = await adminAPI.deleteDeliveryPartner(deliverymanId)

      if (!response?.data?.success) {
        toast.error(response?.data?.message || "Failed to deactivate delivery partner")
        return
      }

      const wasViewingDeletedPartner = Boolean(
        viewDetails && String(viewDetails._id) === deliverymanId,
      )
      setDeliverymen((prev) => prev.filter((item) => String(item._id) !== deliverymanId))
      setViewDetails((prev) => (prev && String(prev._id) === deliverymanId ? null : prev))
      if (wasViewingDeletedPartner) {
        setIsViewOpen(false)
      }
      toast.success(response?.data?.message || "Delivery partner deactivated successfully")
    } catch (err) {
      debugError("Error deleting delivery partner:", err)
      toast.error(err?.response?.data?.message || "Failed to deactivate delivery partner")
    } finally {
      setDeletingDeliveryId(null)
    }
  }

  const handleOpenZoneDialog = (deliveryman) => {
    setSelectedDeliveryForZone(deliveryman)
    setSelectedZoneId(String(deliveryman?.zoneId || ""))
    setIsZoneDialogOpen(true)
  }

  const handleSaveZone = async () => {
    const deliverymanId = String(selectedDeliveryForZone?._id || "")
    if (!deliverymanId) return
    if (!selectedZoneId) {
      toast.error("Please select a zone")
      return
    }

    try {
      setSavingZoneForDeliveryId(deliverymanId)
      const response = await adminAPI.updateDeliveryPartnerZone(deliverymanId, selectedZoneId)
      const partner = response?.data?.data?.partner
      if (!response?.data?.success || !partner) {
        toast.error(response?.data?.message || "Failed to update zone")
        return
      }

      const nextZoneId = String(partner?.zoneId?._id || partner?.zoneId || selectedZoneId)
      const nextZoneLabel =
        partner?.zoneId?.name ||
        partner?.zoneId?.zoneName ||
        partner?.zoneId?.serviceLocation ||
        selectedDeliveryForZone?.zone ||
        "N/A"

      setDeliverymen((prev) =>
        prev.map((item) =>
          String(item._id) === deliverymanId
            ? { ...item, zoneId: nextZoneId, zone: nextZoneLabel }
            : item,
        ),
      )
      setViewDetails((prev) =>
        prev && String(prev._id) === deliverymanId
          ? { ...prev, zoneId: nextZoneId, zone: nextZoneLabel }
          : prev,
      )

      toast.success("Zone assigned successfully")
      setIsZoneDialogOpen(false)
      setSelectedDeliveryForZone(null)
      setSelectedZoneId("")
    } catch (err) {
      debugError("Error updating delivery partner zone:", err)
      toast.error(err?.response?.data?.message || "Failed to assign zone")
    } finally {
      setSavingZoneForDeliveryId(null)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-slate-600" />
              <h1 className="text-2xl font-bold text-slate-900">Deliveryman List</h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1 sm:flex-initial min-w-[250px]">
                <input
                  type="text"
                  placeholder="Search by name or restaur..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>

              <button
                onClick={handleExportPDF}
                className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all"
                title="Export as PDF"
              >
                <FileText className="w-4 h-4" />
                <span className="text-black font-bold">PDF</span>
              </button>
              <button
                onClick={handleExportExcel}
                className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all"
                title="Export as Excel"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span className="text-black font-bold">Excel</span>
              </button>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">Deliveryman</span>
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                {filteredDeliverymen.length}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={fetchDeliverymen}
                className="mt-2 text-sm text-red-600 underline hover:text-red-800"
              >
                Retry
              </button>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-[#2979fb]" />
                <span className="ml-3 text-sm text-slate-600">Loading delivery partners...</span>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {visibleColumns.si && (
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                        <div className="flex items-center gap-2">
                          <span>SI</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                        </div>
                      </th>
                    )}
                    {visibleColumns.name && (
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                        <div className="flex items-center gap-2">
                          <span>Name</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                        </div>
                      </th>
                    )}
                    {visibleColumns.contact && (
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                        <div className="flex items-center gap-2">
                          <span>Contact</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                        </div>
                      </th>
                    )}
                    {visibleColumns.zone && (
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                        <div className="flex items-center gap-2">
                          <span>Zone</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                        </div>
                      </th>
                    )}
                    {visibleColumns.totalOrders && (
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                        <div className="flex items-center gap-2">
                          <span>Total Orders</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                        </div>
                      </th>
                    )}
                    {visibleColumns.availabilityStatus && (
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                        <div className="flex items-center gap-2">
                          <span>Availability Status</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400 cursor-pointer hover:text-slate-600" />
                        </div>
                      </th>
                    )}
                    {visibleColumns.actions && (
                      <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filteredDeliverymen.length === 0 ? (
                    <tr>
                      <td colSpan={Object.values(visibleColumns).filter(v => v).length} className="px-6 py-8 text-center text-slate-500">
                        {error ? "Error loading delivery partners" : "No delivery partners found"}
                      </td>
                    </tr>
                  ) : (
                    filteredDeliverymen.map((dm) => (
                      <tr key={dm._id} className="hover:bg-slate-50 transition-colors">
                        {visibleColumns.si && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-slate-700">{dm.sl}</span>
                          </td>
                        )}
                        {visibleColumns.name && (
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center shrink-0 overflow-hidden cursor-pointer hover:opacity-80 transition-all border border-slate-100"
                                onClick={() => handleView(dm)}
                              >
                                {(dm.profileImage?.url ?? dm.profilePhoto) ? (
                                  <img
                                    src={dm.profileImage?.url ?? dm.profilePhoto}
                                    alt={dm.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span className="text-sm font-medium text-slate-500">
                                    {dm.name?.trim() ? dm.name.slice(0, 2).toUpperCase() : "?"}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span 
                                  className="text-sm font-medium text-slate-900 cursor-pointer hover:text-[#2979fb] transition-colors"
                                  onClick={() => handleView(dm)}
                                >
                                  {dm.name}
                                </span>
                                {dm.rating > 0 && (
                                  <div className="flex items-center gap-1">
                                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                    <span className="text-xs text-slate-600">{dm.rating.toFixed(1)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        )}
                        {visibleColumns.contact && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="text-sm text-slate-700">{dm.email}</span>
                              <span className="text-xs text-slate-500">{dm.phone}</span>
                            </div>
                          </td>
                        )}
                        {visibleColumns.zone && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-slate-700">{dm.zone}</span>
                          </td>
                        )}
                        {visibleColumns.totalOrders && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-slate-700">{dm.totalOrders || 0}</span>
                          </td>
                        )}
                        {visibleColumns.availabilityStatus && (
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs">
                                Active Status: <span className={`${dm.status === 'Online' ? 'text-[#2979fb]' : 'text-slate-600'} underline`}>{dm.status}</span>
                              </span>
                            </div>
                          </td>
                        )}
                        {visibleColumns.actions && (
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => handleView(dm)}
                                className="p-1.5 rounded bg-brand-50 text-[#2979fb] hover:bg-brand-100 transition-colors" 
                                title="View Details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenZoneDialog(dm)}
                                className="p-1.5 rounded bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors"
                                title="Assign Zone"
                              >
                                <MapPin className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(dm)}
                                disabled={deletingDeliveryId === String(dm._id)}
                                className="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                                title="Delete Delivery Partner"
                              >
                                {deletingDeliveryId === String(dm._id) ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* View Details Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-3xl bg-white p-0 opacity-0 data-[state=open]:opacity-100 data-[state=closed]:opacity-0 transition-opacity duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:scale-100 data-[state=closed]:scale-100 max-h-[85vh] overflow-y-auto">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200">
            <DialogTitle className="text-xl font-bold text-slate-900">Delivery Partner Details</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            {viewDetails ? (
              <div className="space-y-6 mt-4">
                {/* Profile Image & Basic Info */}
                <div className="flex items-start gap-6 pb-6 border-b border-slate-200">
                  <div className="flex-shrink-0">
                    {viewDetails.profileImage?.url ? (
                      <img 
                        src={viewDetails.profileImage.url} 
                        alt={viewDetails.name}
                        className="w-24 h-24 rounded-full object-cover border-2 border-slate-200"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center">
                        <User className="w-12 h-12 text-slate-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
                        <User className="w-3 h-3" /> Name
                      </label>
                      <p className="text-sm font-medium text-slate-900 mt-1">{viewDetails.name || "N/A"}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
                        <Mail className="w-3 h-3" /> Email
                      </label>
                      <p className="text-sm text-slate-900 mt-1">{viewDetails.email || "N/A"}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Phone
                      </label>
                      <p className="text-sm text-slate-900 mt-1">{viewDetails.phone || "N/A"}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase">Delivery ID</label>
                      <p className="text-sm font-medium text-slate-900 mt-1">{viewDetails.deliveryId || "N/A"}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase">Status</label>
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${
                        viewDetails.status === 'pending' ? 'bg-brand-100 text-brand-700' :
                        viewDetails.status === 'approved' || viewDetails.status === 'active' ? 'bg-green-100 text-green-700' :
                        viewDetails.status === 'blocked' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {viewDetails.status === 'blocked' ? 'Rejected' : (viewDetails.status?.charAt(0).toUpperCase() + viewDetails.status?.slice(1) || "N/A")}
                      </span>
                    </div>
                    {viewDetails.rejectionReason && (
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase text-red-600">Rejection Reason</label>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-1">
                          <p className="text-sm text-red-700 whitespace-pre-wrap">{viewDetails.rejectionReason}</p>
                        </div>
                      </div>
                    )}
                    {viewDetails.dateOfBirth && (
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Date of Birth
                        </label>
                        <p className="text-sm text-slate-900 mt-1">
                          {new Date(viewDetails.dateOfBirth).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    )}
                    {viewDetails.gender && (
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase">Gender</label>
                        <p className="text-sm text-slate-900 mt-1 capitalize">{viewDetails.gender || "N/A"}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Location Details */}
                {viewDetails.location && (
                  <div className="pb-6 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <MapPin className="w-4 h-4" /> Location Details
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {viewDetails.location.addressLine1 && (
                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-slate-500 uppercase">Address Line 1</label>
                          <p className="text-sm text-slate-900 mt-1">{viewDetails.location.addressLine1}</p>
                        </div>
                      )}
                      {viewDetails.location.addressLine2 && (
                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-slate-500 uppercase">Address Line 2</label>
                          <p className="text-sm text-slate-900 mt-1">{viewDetails.location.addressLine2}</p>
                        </div>
                      )}
                      {viewDetails.location.area && (
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase">Area</label>
                          <p className="text-sm text-slate-900 mt-1">{viewDetails.location.area}</p>
                        </div>
                      )}
                      {viewDetails.location.city && (
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase">City</label>
                          <p className="text-sm text-slate-900 mt-1">{viewDetails.location.city}</p>
                        </div>
                      )}
                      {viewDetails.location.state && (
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase">State</label>
                          <p className="text-sm text-slate-900 mt-1">{viewDetails.location.state}</p>
                        </div>
                      )}
                      {viewDetails.location.zipCode && (
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase">Zip Code</label>
                          <p className="text-sm text-slate-900 mt-1">{viewDetails.location.zipCode}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Vehicle Details */}
                {viewDetails.vehicle && (
                  <div className="pb-6 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <Bike className="w-4 h-4" /> Vehicle Details
                    </h3>
                    <div className="grid grid-cols-4 gap-4">
                      {viewDetails.vehicle.brand && (
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase">Brand</label>
                          <p className="text-sm text-slate-900 mt-1">{viewDetails.vehicle.brand}</p>
                        </div>
                      )}
                      {viewDetails.vehicle.model && (
                        <div className="text-right col-span-1">
                          <label className="text-xs font-semibold text-slate-500 uppercase">Model</label>
                          <p className="text-xs text-slate-900 mt-1">{viewDetails.vehicle.model}</p>
                        </div>
                      )}
                      {viewDetails.vehicle.number && (
                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-slate-500 uppercase">Vehicle Number</label>
                          <p className="text-sm text-slate-900 mt-1">{viewDetails.vehicle.number}</p>
                        </div>
                      )}
                      {viewDetails.vehicle.type && (
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase">Vehicle Type</label>
                          <p className="text-sm text-slate-900 mt-1 capitalize">{viewDetails.vehicle.type}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Pocket Details */}
                <div className="pb-6 border-b border-slate-200">
                  <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Pocket Details
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase">Total Earning</label>
                      <p className="text-sm font-medium text-slate-900 mt-1">
                        {formatCurrency(viewDetails.totalEarning || viewDetails.walletSummary?.totalEarning)}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase">Bonus</label>
                      <p className="text-sm font-medium text-slate-900 mt-1">
                        {formatCurrency(viewDetails.bonus || viewDetails.walletSummary?.bonus)}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase">Total Withdrawn</label>
                      <p className="text-sm font-medium text-slate-900 mt-1">
                        {formatCurrency(viewDetails.totalWithdrawn || viewDetails.walletSummary?.totalWithdrawn)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Documents */}
                {viewDetails.documents && (
                  <div className="pb-6 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <FileCheck className="w-4 h-4" /> Documents
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Aadhar */}
                      {viewDetails.documents.aadhar && (
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase">Aadhar Card</label>
                          <div className="mt-2">
                            {viewDetails.documents.aadhar.number && (
                              <p className="text-sm text-slate-700 mb-1">Number: {viewDetails.documents.aadhar.number}</p>
                            )}
                            {viewDetails.documents.aadhar.document && (
                              <a 
                                href={viewDetails.documents.aadhar.document} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-[#2979fb] hover:text-brand-700"
                              >
                                <ExternalLink className="w-3 h-3" /> View Document
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      {/* PAN */}
                      {viewDetails.documents.pan && (
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase">PAN Card</label>
                          <div className="mt-2">
                            {viewDetails.documents.pan.number && (
                              <p className="text-sm text-slate-700 mb-1">Number: {viewDetails.documents.pan.number}</p>
                            )}
                            {viewDetails.documents.pan.document && (
                              <a 
                                href={viewDetails.documents.pan.document} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-[#2979fb] hover:text-brand-700"
                              >
                                <ExternalLink className="w-3 h-3" /> View Document
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Driving License */}
                      {viewDetails.documents.drivingLicense && (
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase">Driving License</label>
                          <div className="mt-2">
                            {viewDetails.documents.drivingLicense.number && (
                              <p className="text-sm text-slate-700 mb-1">Number: {viewDetails.documents.drivingLicense.number}</p>
                            )}
                            {viewDetails.documents.drivingLicense.expiryDate && (
                              <p className="text-xs text-slate-500 mb-1">
                                Expiry: {new Date(viewDetails.documents.drivingLicense.expiryDate).toLocaleDateString('en-GB')}
                              </p>
                            )}
                            {viewDetails.documents.drivingLicense.document && (
                              <a 
                                href={viewDetails.documents.drivingLicense.document} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-[#2979fb] hover:text-brand-700"
                              >
                                <ExternalLink className="w-3 h-3" /> View Document
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Vehicle RC */}
                      {viewDetails.documents.vehicleRC && (viewDetails.documents.vehicleRC.number || viewDetails.documents.vehicleRC.document) && (
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase">Vehicle RC</label>
                          <div className="mt-2">
                            {viewDetails.documents.vehicleRC.number && (
                              <p className="text-sm text-slate-700 mb-1">Number: {viewDetails.documents.vehicleRC.number}</p>
                            )}
                            {viewDetails.documents.vehicleRC.document && (
                              <a 
                                href={viewDetails.documents.vehicleRC.document} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-[#2979fb] hover:text-brand-700"
                              >
                                <ExternalLink className="w-3 h-3" /> View Document
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Bank Details */}
                {viewDetails.documents?.bankDetails && (
                  <div className="pb-6 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" /> Bank Details
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {viewDetails.documents.bankDetails.accountHolderName && (
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase">Account Holder Name</label>
                          <p className="text-sm text-slate-900 mt-1">{viewDetails.documents.bankDetails.accountHolderName}</p>
                        </div>
                      )}
                      {viewDetails.documents.bankDetails.accountNumber && (
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase">Account Number</label>
                          <p className="text-sm text-slate-900 mt-1">{viewDetails.documents.bankDetails.accountNumber}</p>
                        </div>
                      )}
                      {viewDetails.documents.bankDetails.ifscCode && (
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase">IFSC Code</label>
                          <p className="text-sm text-slate-900 mt-1">{viewDetails.documents.bankDetails.ifscCode}</p>
                        </div>
                      )}
                      {viewDetails.documents.bankDetails.bankName && (
                        <div>
                          <label className="text-xs font-semibold text-slate-500 uppercase">Bank Name</label>
                          <p className="text-sm text-slate-900 mt-1">{viewDetails.documents.bankDetails.bankName}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Additional Info */}
                <div className="grid grid-cols-2 gap-4">
                  {viewDetails.signupMethod && (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase">Signup Method</label>
                      <p className="text-sm text-slate-900 mt-1 capitalize">{viewDetails.signupMethod}</p>
                    </div>
                  )}
                  {viewDetails.phoneVerified !== undefined && (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase">Phone Verified</label>
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${
                        viewDetails.phoneVerified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {viewDetails.phoneVerified ? 'Verified' : 'Not Verified'}
                      </span>
                    </div>
                  )}
                  {viewDetails.createdAt && (
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase">Joined Date</label>
                      <p className="text-sm text-slate-900 mt-1">
                        {new Date(viewDetails.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-[#2979fb]" />
              </div>
            )}
          </div>
          <DialogFooter className="px-6 pb-6 border-t border-slate-200">
            <button
              onClick={() => setIsViewOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md bg-white p-0 opacity-0 data-[state=open]:opacity-100 data-[state=closed]:opacity-0 transition-opacity duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:scale-100 data-[state=closed]:scale-100">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Table Settings
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Columns className="w-4 h-4" />
                Visible Columns
              </h3>
              <div className="space-y-2">
                {Object.entries(columnsConfig).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={() => toggleColumn(key)}
                      className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                    />
                    <span className="text-sm text-slate-700">{label}</span>
                    {visibleColumns[key] && (
                      <Check className="w-4 h-4 text-emerald-600 ml-auto" />
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={resetColumns}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
              >
                Reset
              </button>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-md"
              >
                Apply
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isZoneDialogOpen} onOpenChange={setIsZoneDialogOpen}>
        <DialogContent className="max-w-md bg-white p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200">
            <DialogTitle className="text-lg font-semibold text-slate-900">Assign Zone</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-slate-600">
              {selectedDeliveryForZone?.name
                ? `Select zone for ${selectedDeliveryForZone.name}.`
                : "Select a zone for this delivery partner."}
            </p>
            <select
              value={selectedZoneId}
              onChange={(e) => setSelectedZoneId(e.target.value)}
              disabled={zonesLoading || savingZoneForDeliveryId === String(selectedDeliveryForZone?._id || "")}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="">{zonesLoading ? "Loading zones..." : "Select zone"}</option>
              {zones.map((zone) => {
                const id = String(zone?._id || zone?.id || "")
                if (!id) return null
                const label = zone?.name || zone?.zoneName || zone?.serviceLocation || id
                return (
                  <option key={id} value={id}>
                    {label}
                  </option>
                )
              })}
            </select>
          </div>
          <DialogFooter className="px-6 pb-6 pt-1">
            <button
              type="button"
              onClick={() => {
                setIsZoneDialogOpen(false)
                setSelectedDeliveryForZone(null)
                setSelectedZoneId("")
              }}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveZone}
              disabled={!selectedZoneId || savingZoneForDeliveryId === String(selectedDeliveryForZone?._id || "")}
              className="px-4 py-2 rounded-lg bg-[#2979fb] text-sm font-medium text-white hover:bg-[#1565C0] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingZoneForDeliveryId === String(selectedDeliveryForZone?._id || "") ? "Saving..." : "Save Zone"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
