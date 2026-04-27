import { useEffect, useState } from "react"
import { ChevronDown, Loader2, Receipt, Search } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const toCurrency = (amount = 0) =>
  `Rs ${Number(amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const toDisplayDate = (value = "") => {
  if (!value) return "-"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "-"
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

const beneficiaryNames = (row) => {
  const list = Array.isArray(row?.beneficiaries) ? row.beneficiaries : []
  const names = list.map((item) => String(item?.beneficiaryName || "").trim()).filter(Boolean)
  return names.length ? names.join(", ") : ""
}

export default function DeliverySettlementHistory() {
  const [searchQuery, setSearchQuery] = useState("")
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  const [selectedBatchId, setSelectedBatchId] = useState("")
  const [details, setDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  const fetchHistory = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getPayoutSettlementHistory({
        beneficiaryType: "delivery",
        search: searchQuery.trim() || undefined,
        page: 1,
        limit: 50,
      })
      if (response?.data?.success) {
        setRows(response?.data?.data?.rows || [])
      } else {
        setRows([])
      }
    } catch (error) {
      setRows([])
      toast.error(error?.response?.data?.message || "Failed to fetch settlement history")
    } finally {
      setLoading(false)
    }
  }

  const fetchBatchDetails = async (batchId) => {
    if (!batchId) return
    try {
      setDetailsLoading(true)
      const response = await adminAPI.getPayoutSettlementHistoryBatchDetails(batchId, {
        beneficiaryType: "delivery",
      })
      if (response?.data?.success) {
        setDetails(response?.data?.data || null)
      } else {
        setDetails(null)
      }
    } catch (error) {
      setDetails(null)
      toast.error(error?.response?.data?.message || "Failed to fetch batch details")
    } finally {
      setDetailsLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchHistory()
    }, 350)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleOpenBatch = async (row) => {
    const batchId = String(row?.batchId || "")
    if (!batchId) {
      toast.info("Details are unavailable for legacy settlement entry")
      return
    }
    if (selectedBatchId === batchId) {
      setSelectedBatchId("")
      setDetails(null)
      return
    }
    setSelectedBatchId(batchId)
    await fetchBatchDetails(batchId)
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Delivery Settlement History</h1>
              <p className="text-sm text-slate-600 mt-1">All paid settlement batches with exact time and details.</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Search</label>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by note, reference, delivery partner, or id"
              className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Settled At</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Window</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Partners</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Orders</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">COD Orders</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">COD Amount</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Total Paid</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Paid By</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-14 text-center text-sm text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading settlement history...
                      </span>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-14 text-center text-sm text-slate-500">
                      No settlement history found.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
                    <tr key={`${row.paidAt || "na"}-${index}`} className="hover:bg-slate-50">
                      <td className="px-5 py-4 text-sm text-slate-700">{toDisplayDate(row.paidAt)}</td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        <div className="flex flex-col">
                          <span>{toDisplayDate(row.fromAt)}</span>
                          <span className="text-xs text-slate-500">to {toDisplayDate(row.toAt)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        <div className="flex flex-col">
                          <span>{Number(row.restaurantsCount || row.partnersCount || 0)}</span>
                          {beneficiaryNames(row) ? <span className="text-xs text-slate-500">{beneficiaryNames(row)}</span> : null}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">{Number(row.totalOrders || 0)}</td>
                      <td className="px-5 py-4 text-sm text-slate-700">{Number(row.totalCodOrders || 0)}</td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        {Number(row.totalCodOrders || 0) > 0 ? toCurrency(row.totalCodAmount) : "NIL"}
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-emerald-700">{toCurrency(row.totalPaidAmount)}</td>
                      <td className="px-5 py-4 text-sm text-slate-700">{row.paidByAdminName || "-"}</td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => handleOpenBatch(row)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 inline-flex items-center gap-1"
                        >
                          {selectedBatchId === row.batchId ? "Hide" : "View"}
                          <ChevronDown className={`w-3 h-3 transition-transform ${selectedBatchId === row.batchId ? "rotate-180" : ""}`} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selectedBatchId ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Batch Paid Details</h3>
              {details ? (
                <p className="text-xs text-slate-500 mt-1">
                  {toDisplayDate(details.fromAt)} to {toDisplayDate(details.toAt)} | Paid at {toDisplayDate(details.paidAt)}
                </p>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Delivery Partner</th>
                    <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Orders</th>
                    <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">COD Orders</th>
                    <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">COD Amount</th>
                    <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Gross</th>
                    <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Paid</th>
                    <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Reference</th>
                    <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailsLoading ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-14 text-center text-sm text-slate-500">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading batch details...
                        </span>
                      </td>
                    </tr>
                  ) : !details?.rows?.length ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-14 text-center text-sm text-slate-500">
                        No paid rows found for this batch.
                      </td>
                    </tr>
                  ) : (
                    details.rows.map((row) => (
                      <tr key={row.settlementId} className="hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-slate-900">{row.beneficiaryName}</p>
                          <p className="text-xs text-slate-500">{row.beneficiaryId}</p>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">{Number(row.ordersCount || 0)}</td>
                        <td className="px-5 py-4 text-sm text-slate-700">{Number(row.codOrdersCount || 0)}</td>
                        <td className="px-5 py-4 text-sm text-slate-700">
                          {Number(row.codOrdersCount || 0) > 0 ? toCurrency(row.codAmount) : "NIL"}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">{toCurrency(row.grossAmount)}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-emerald-700">{toCurrency(row.paidAmount)}</td>
                        <td className="px-5 py-4 text-sm text-slate-700">{row.referenceNumber || "-"}</td>
                        <td className="px-5 py-4 text-sm text-slate-700">{row.note || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
