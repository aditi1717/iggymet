import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Search, Receipt, Loader2, Package } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const formatCurrency = (amount) => {
  if (amount == null) return "\u20B90.00"
  return `\u20B9${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatDate = (d) => {
  if (!d) return "-"
  try {
    return new Date(d).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  } catch {
    return String(d)
  }
}

const formatStatusLabel = (status) => {
  if (status === "Completed") return "Paid"
  if (status === "Pending") return "Unpaid"
  return status || "-"
}

const getStatusClasses = (status) => {
  if (status === "Completed") return "bg-green-100 text-green-700"
  if (status === "Pending") return "bg-amber-100 text-amber-700"
  if (status === "Failed") return "bg-red-100 text-red-700"
  return "bg-slate-100 text-slate-700"
}

export default function CashLimitSettlement() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [zones, setZones] = useState([])
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "")
  const [statusFilter, setStatusFilter] = useState((searchParams.get("status") || "").toLowerCase())
  const [zoneFilter, setZoneFilter] = useState(searchParams.get("zoneId") || "")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const limit = 20

  const fetchData = async (overrides = {}) => {
    const p = overrides.page || page
    try {
      setLoading(true)
      const res = await adminAPI.getCashLimitSettlements({
        search: searchQuery.trim() || undefined,
        status: statusFilter || undefined,
        zoneId: zoneFilter || undefined,
        page: p,
        limit,
      })
      if (res?.data?.success) {
        const data = res.data.data
        setTransactions(data?.transactions || [])
        setTotal(data?.pagination?.total || 0)
        setPages(data?.pagination?.pages || 1)
      } else {
        toast.error(res?.data?.message || "Failed to fetch settlements")
        setTransactions([])
      }
    } catch (err) {
      debugError("Error fetching cash limit settlements:", err)
      toast.error(err?.response?.data?.message || "Failed to fetch settlements")
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const loadZones = async () => {
      try {
        const res = await adminAPI.getZones({ page: 1, limit: 1000, isActive: true })
        const zoneRows = res?.data?.data?.zones || res?.data?.data?.rows || []
        setZones(Array.isArray(zoneRows) ? zoneRows : [])
      } catch (error) {
        debugWarn("Failed to load zones:", error)
        setZones([])
      }
    }
    loadZones()
  }, [])

  useEffect(() => {
    fetchData()
  }, [page])

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      fetchData({ page: 1 })
    }, 400)
    return () => clearTimeout(t)
  }, [searchQuery, statusFilter, zoneFilter])

  useEffect(() => {
    const nextParams = new URLSearchParams()
    if (searchQuery.trim()) nextParams.set("search", searchQuery.trim())
    if (statusFilter) nextParams.set("status", statusFilter)
    if (zoneFilter) nextParams.set("zoneId", zoneFilter)
    setSearchParams(nextParams, { replace: true })
  }, [searchQuery, setSearchParams, statusFilter, zoneFilter])

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3">
            <Receipt className="w-5 h-5 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900">Cash To Admin History</h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Delivery partner Razorpay deposits collected against COD cash in hand. Paid entries reduce cash in hand and increase admin-collected COD.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Transactions</h2>
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                {total}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial min-w-[220px] max-w-xs">
                <input
                  type="text"
                  placeholder="Search by name or phone"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
              <select
                value={zoneFilter}
                onChange={(e) => setZoneFilter(e.target.value)}
                className="px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              >
                <option value="">All zones</option>
                {zones.map((zone) => {
                  const zoneId = String(zone?._id || "")
                  const zoneLabel = zone?.name || zone?.zoneName || zone?.serviceLocation || "Unnamed Zone"
                  return (
                    <option key={zoneId} value={zoneId}>
                      {zoneLabel}
                    </option>
                  )
                })}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              >
                <option value="">All status</option>
                <option value="completed">Paid</option>
                <option value="pending">Unpaid</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-4" />
              <p className="text-slate-600">Loading...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">#</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Delivery</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Zone</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Phone</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Method</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Razorpay</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <Package className="w-16 h-16 text-slate-400 mb-4" />
                          <p className="text-lg font-semibold text-slate-700">No transactions</p>
                          <p className="text-sm text-slate-500">No cash to admin Razorpay transactions found for this filter.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx, i) => (
                      <tr key={tx.id || i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">
                          {(page - 1) * limit + i + 1}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                          {formatDate(tx.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">
                          {tx.deliveryName || "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                          {tx.zoneName || "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                          {tx.deliveryPhone || tx.deliveryIdString || "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">
                          {formatCurrency(tx.amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getStatusClasses(tx.status)}`}>
                            {formatStatusLabel(tx.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                          {tx.paymentMethod ? String(tx.paymentMethod).toUpperCase() : "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 font-mono">
                          {tx.razorpayPaymentId ? tx.razorpayPaymentId.slice(0, 12) + "..." : "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
              <p className="text-sm text-slate-600">
                Page {page} of {pages} · {total} total
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
