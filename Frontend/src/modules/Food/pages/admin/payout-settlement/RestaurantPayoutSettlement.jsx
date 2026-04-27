import { useEffect, useMemo, useState } from "react"
import { CalendarRange, CheckCircle2, CircleDollarSign, Download, Loader2, Receipt, Search } from "lucide-react"
import { toast } from "sonner"
import { adminAPI } from "@food/api"

const todayISO = new Date().toISOString().split("T")[0]

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

const htmlEscape = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

export default function RestaurantPayoutSettlement() {
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [fromTime, setFromTime] = useState("00:00")
  const [toTime, setToTime] = useState("23:59")
  const [isAutoWindow, setIsAutoWindow] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.totalEarning += Number(row.totalEarning || 0)
        acc.totalPaid += Number(row.alreadyPaid || 0)
        acc.totalPending += Number(row.payableNow || 0)
        return acc
      },
      { totalEarning: 0, totalPaid: 0, totalPending: 0 },
    )
  }, [rows])

  const hasWindow = Boolean(fromDate && toDate && fromTime && toTime)

  const fetchPreview = async ({ forceAutoWindow = false } = {}) => {
    try {
      setLoading(true)
      const params = {
        beneficiaryType: "restaurant",
        search: searchQuery.trim() || undefined,
        page: 1,
        limit: 500,
      }
      if (!forceAutoWindow && hasWindow) {
        params.fromDate = fromDate
        params.toDate = toDate
        params.fromTime = fromTime
        params.toTime = toTime
      }
      const response = await adminAPI.getPayoutSettlementPreview({
        ...params,
      })

      if (response?.data?.success) {
        setRows(response?.data?.data?.rows || [])
        const windowInfo = response?.data?.data?.window || {}
        if (windowInfo.fromDate) setFromDate(windowInfo.fromDate)
        if (windowInfo.toDate) setToDate(windowInfo.toDate)
        if (windowInfo.fromTime) setFromTime(windowInfo.fromTime)
        if (windowInfo.toTime) setToTime(windowInfo.toTime)
        setIsAutoWindow(Boolean(windowInfo.isAuto))
      } else {
        setRows([])
        toast.error(response?.data?.message || "Failed to fetch settlement preview")
      }
    } catch (error) {
      setRows([])
      toast.error(error?.response?.data?.message || "Failed to fetch settlement preview")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPreview({ forceAutoWindow: true })
  }, [])

  useEffect(() => {
    if (!hasWindow) return
    const timer = setTimeout(() => {
      fetchPreview()
    }, 350)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleMarkAllPaid = async () => {
    if (!hasWindow) {
      toast.error("Settlement window is not ready yet")
      return
    }
    if (Number(summary.totalPending || 0) <= 0) {
      toast.info("No unpaid amount in current list")
      return
    }

    const beneficiaryIds = rows
      .filter((row) => Number(row.payableNow || 0) > 0)
      .map((row) => row.beneficiaryId)

    const confirmText = `Mark all as paid for ${beneficiaryIds.length} restaurants (${toCurrency(summary.totalPending)}) for ${fromDate} to ${toDate}?`
    if (!window.confirm(confirmText)) return

    try {
      setSaving(true)
      const response = await adminAPI.markAllPayoutSettlementsPaid({
        beneficiaryType: "restaurant",
        fromDate,
        toDate,
        fromTime,
        toTime,
        beneficiaryIds,
        payoutMethod: "manual",
        note: `Batch settlement from ${fromDate} ${fromTime} to ${toDate} ${toTime}`,
      })

      if (response?.data?.success) {
        const settledAt = response?.data?.data?.settledAt
        const successMsg = settledAt
          ? `Payouts marked paid. Next cycle can start after ${toDisplayDate(settledAt)}`
          : (response?.data?.message || "Payouts marked paid successfully")
        toast.success(successMsg)
        await fetchPreview({ forceAutoWindow: true })
      } else {
        toast.error(response?.data?.message || "Failed to mark payouts paid")
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to mark payouts paid")
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadExcel = () => {
    if (!rows.length) {
      toast.error("No rows to export")
      return
    }

    const totalOrders = rows.reduce((sum, row) => sum + Number(row.ordersCount || 0), 0)
    const bodyRowsHtml = rows
      .map(
        (row) => `
          <tr>
            <td>${htmlEscape(row.beneficiaryName || "-")}</td>
            <td>${htmlEscape(row.beneficiaryId || "-")}</td>
            <td class="num">${htmlEscape(Number(row.ordersCount || 0).toFixed(0))}</td>
            <td class="num">${htmlEscape(Number(row.totalEarning || 0).toFixed(2))}</td>
            <td class="num">${htmlEscape(Number(row.alreadyPaid || 0).toFixed(2))}</td>
            <td class="num">${htmlEscape(Number(row.payableNow || 0).toFixed(2))}</td>
            <td>${htmlEscape(toDisplayDate(row.lastSettledToDate))}</td>
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
                <th>Restaurant</th>
                <th>Restaurant ID</th>
                <th>Orders</th>
                <th>Total Earning</th>
                <th>Paid</th>
                <th>Unpaid</th>
                <th>Last Settled</th>
              </tr>
            </thead>
            <tbody>
              ${bodyRowsHtml}
              <tr class="total-row">
                <td>TOTAL</td>
                <td>${htmlEscape(`${rows.length} restaurants`)}</td>
                <td class="num">${htmlEscape(totalOrders.toFixed(0))}</td>
                <td class="num">${htmlEscape(Number(summary.totalEarning || 0).toFixed(2))}</td>
                <td class="num">${htmlEscape(Number(summary.totalPaid || 0).toFixed(2))}</td>
                <td class="num">${htmlEscape(Number(summary.totalPending || 0).toFixed(2))}</td>
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
    link.download = `restaurant-settlement-${new Date().toISOString().slice(0, 10)}.xls`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast.success("Excel downloaded")
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
              <h1 className="text-2xl font-bold text-slate-900">Restaurant Settlement</h1>
              <p className="text-sm text-slate-600 mt-1">Date range select karke restaurant wise pending payout settle karein.</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Settlement Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Auto Start</label>
              <div className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-slate-50 text-sm text-slate-700">
                {fromDate && fromTime ? `${fromDate} ${fromTime}` : "Calculating..."}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Auto End</label>
              <div className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-slate-50 text-sm text-slate-700">
                {toDate && toTime ? `${toDate} ${toTime}` : "Calculating..."}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Search Restaurant</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Name ya ID search karein"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {isAutoWindow
              ? "Window is auto-managed. Next cycle starts automatically after previous settlement time."
              : "Using current locked window from preview."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-slate-600">
              <CircleDollarSign className="w-4 h-4" />
              <p className="text-sm font-medium">Total Earning</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{toCurrency(summary.totalEarning)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              <p className="text-sm font-medium">Total Paid</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-700">{toCurrency(summary.totalPaid)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-amber-700">
              <CalendarRange className="w-4 h-4" />
              <p className="text-sm font-medium">Pending (Unpaid)</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-amber-700">{toCurrency(summary.totalPending)}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mb-4">
          <button
            type="button"
            onClick={handleDownloadExcel}
            disabled={loading || rows.length === 0}
            className="px-4 py-2.5 text-sm font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Download Excel
          </button>
          <button
            type="button"
            onClick={handleMarkAllPaid}
            disabled={loading || saving || Number(summary.totalPending || 0) <= 0}
            className="px-4 py-2.5 text-sm font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Mark All Paid
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Restaurant</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Orders</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Total Earning</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Paid</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Unpaid</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Last Settled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-14 text-center text-sm text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading settlement preview...
                      </span>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-14 text-center text-sm text-slate-500">
                      No restaurant found for current filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.beneficiaryId} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-slate-900">{row.beneficiaryName}</p>
                        <p className="text-xs text-slate-500">{row.beneficiaryId}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">{row.ordersCount}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-900">{toCurrency(row.totalEarning)}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-emerald-700">{toCurrency(row.alreadyPaid)}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-amber-700">{toCurrency(row.payableNow)}</td>
                      <td className="px-5 py-4 text-sm text-slate-700">{toDisplayDate(row.lastSettledToDate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
