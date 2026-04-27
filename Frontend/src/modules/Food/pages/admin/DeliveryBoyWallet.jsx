import { useState, useEffect } from "react"
import { Search, PiggyBank, Loader2, Package, RefreshCw, HandCoins, Download } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import BRAND_THEME from "@/config/brandTheme"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


const formatCurrency = (amount) => {
  if (amount == null) return "\u20B90.00"
  return `\u20B9${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const toNumber = (...values) => {
  for (const value of values) {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return 0
}

const normalizePhone = (value) => String(value || "").replace(/\D/g, "")
const normalizeKey = (value) => String(value || "").trim().toLowerCase()
const htmlEscape = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const normalizeWalletRow = (row = {}) => {
  const totalEarning = toNumber(row.totalEarning, row.totalEarned, row.totalEarnings, row.earning)
  const paidAmount = toNumber(row.paid, row.paidAmount, row.totalWithdrawn, row.alreadyWithdraw)
  const directUnpaid = toNumber(row.unpaid, row.unpaidAmount, row.payableNow)
  const cashInHand = toNumber(row.cashInHand, row.cash_in_hand, row.cashCollected)
  const totalCashOrders = toNumber(row.totalCashOrders, row.totalCodOrders, row.codOrders, row.cashOrdersCount, row.codCount)
  const totalOnlineOrders = toNumber(
    row.totalOnlineOrders,
    row.onlineOrders,
    row.onlineOrdersCount,
    row.onlineCount,
    row.digitalOrdersCount,
  )

  return {
    ...row,
    name: row.name || row.deliveryPartnerName || row.deliveryBoyName || row.userName || "â€”",
    deliveryIdString: row.deliveryIdString || row.deliveryId || row.deliveryPartnerId || row.partnerId || "â€”",
    pocketBalance: toNumber(row.pocketBalance, row.totalBalance),
    cashCollected: toNumber(row.cashCollected, row.totalCashCollected, row.collectedCash),
    cashInHand,
    cashSubmittedToAdmin: toNumber(row.cashSubmittedToAdmin, row.totalSubmittedToAdmin, row.collectedByAdmin),
    totalEarning,
    bonus: toNumber(row.bonus, row.joiningBonusAmount),
    paid: paidAmount,
    unpaid: directUnpaid > 0 ? directUnpaid : Math.max(0, totalEarning - paidAmount),
    totalCashOrders,
    totalOnlineOrders,
  }
}

const getTotalCashAmount = (wallet = {}) =>
  (() => {
    const grossCash = toNumber(
      wallet?.totalCash,
      wallet?.totalCashCollected,
      wallet?.grossCashCollected,
      wallet?.cashCollected,
      wallet?.collectedCash,
    )

    // Total cash should mean gross COD collected, not gross + submitted (which double-counts).
    if (grossCash > 0) return Math.max(0, grossCash)

    // Fallback only when gross value is unavailable.
    return Math.max(
      0,
      toNumber(wallet?.cashInHand) +
        toNumber(wallet?.cashSubmittedToAdmin, wallet?.totalSubmittedToAdmin, wallet?.collectedByAdmin),
    )
  })()

const getPaidAmount = (wallet = {}) =>
  Math.max(0, toNumber(wallet?.paid, wallet?.paidAmount, wallet?.totalWithdrawn, wallet?.alreadyWithdraw))

const getUnpaidAmount = (wallet = {}) =>
  Math.max(
    0,
    toNumber(wallet?.unpaid, wallet?.unpaidAmount, wallet?.payableNow, toNumber(wallet?.totalEarning) - getPaidAmount(wallet)),
  )

export default function DeliveryBoyWallet() {
  const todayDate = new Date().toISOString().split("T")[0]
  const [wallets, setWallets] = useState([])
  const [summary, setSummary] = useState({
    totalCollectedByDeliveryBoys: 0,
    totalCashInHand: 0,
    totalSubmittedToAdmin: 0,
    totalEarning: 0,
    totalPaid: 0,
    totalUnpaid: 0,
    totalCodOrders: 0,
    totalOnlineOrders: 0,
    loading: true,
  })
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filters, setFilters] = useState({
    time: "All Time",
    fromDate: "",
    toDate: "",
  })
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const limit = 20

  const getAutoDateRange = (timeValue) => {
    const now = new Date()
    const end = new Date(now)
    const start = new Date(now)

    if (timeValue === "This Week") {
      const day = start.getDay()
      const diff = day === 0 ? 6 : day - 1
      start.setDate(start.getDate() - diff)
    } else if (timeValue === "This Month") {
      start.setDate(1)
    } else {
      return { fromDate: "", toDate: "" }
    }

    return {
      fromDate: start.toISOString().split("T")[0],
      toDate: end.toISOString().split("T")[0],
    }
  }

  const fetchWallets = async (overrides = {}) => {
    const p = overrides.page || page
    const searchValue = overrides.searchQuery ?? searchQuery
    const filtersValue = overrides.filters ?? filters
    const selectedTime = filtersValue?.time || "All Time"
    const manualFromDate = filtersValue?.fromDate || ""
    const manualToDate = filtersValue?.toDate || ""
    const autoDates = getAutoDateRange(selectedTime)
    const resolvedFromDate = manualFromDate || autoDates.fromDate || ""
    const resolvedToDate = manualToDate || autoDates.toDate || ""

    try {
      setLoading(true)

      if (resolvedFromDate && resolvedToDate && resolvedFromDate > resolvedToDate) {
        toast.error("Start Date cannot be after End Date")
        setWallets([])
        setTotal(0)
        setPages(1)
        setLoading(false)
        return
      }

      if (resolvedFromDate && resolvedFromDate > todayDate) {
        toast.error("Start Date cannot be in the future")
        setWallets([])
        setTotal(0)
        setPages(1)
        setLoading(false)
        return
      }

      if (resolvedToDate && resolvedToDate > todayDate) {
        toast.error("End Date cannot be in the future")
        setWallets([])
        setTotal(0)
        setPages(1)
        setLoading(false)
        return
      }

      const res = await adminAPI.getDeliveryWallets({
        search: searchValue.trim() || undefined,
        page: p,
        limit,
      })
      if (res?.data?.success) {
        const data = res.data.data
        const walletRows = (data?.wallets || data?.rows || data?.deliveryPartners || []).map(normalizeWalletRow)
        let partnerMap = new Map()

        try {
          const partnersRes = await adminAPI.getDeliveryPartners({
            page: 1,
            limit: 1000,
            search: searchValue.trim() || undefined,
          })
          if (partnersRes?.data?.success) {
            const partners = partnersRes?.data?.data?.deliveryPartners || []
            partnerMap = new Map()
            partners.forEach((partner) => {
              const partnerData = {
                  name: partner.name || partner.deliveryPartnerName || partner.fullName || "â€”",
                  phone: partner.phone || "",
                  cashInHand: toNumber(
                    partner.cashInHand,
                    partner.walletSummary?.cashInHand,
                    partner.walletSummary?.cashCollected,
                  ),
                }

              const keys = [
                String(partner._id || ""),
                String(partner.id || ""),
                String(partner.deliveryId || ""),
                String(partner.deliveryIdString || ""),
                normalizePhone(partner.phone),
                String(partner.name || "").trim().toLowerCase(),
              ].filter(Boolean)

              keys.forEach((key) => {
                partnerMap.set(String(key).trim().toLowerCase(), partnerData)
              })
            })
          }
        } catch (partnerError) {
          debugWarn("Delivery partners merge failed:", partnerError)
        }

        let nextRows = walletRows
        const allZeroOrMissingEarning = walletRows.length > 0 && walletRows.every((row) => toNumber(row.totalEarning) <= 0)
        const walletRowsMissing = walletRows.length === 0

        // Fallback: if wallet endpoint returns rows but earnings are empty/zero, enrich from earnings API.
        if (allZeroOrMissingEarning || walletRowsMissing) {
          try {
            const earningsPeriod = selectedTime === "This Week" ? "week" : selectedTime === "This Month" ? "month" : "all"
            const earningsRes = await adminAPI.getDeliveryEarnings({
              page: 1,
              limit: 1000,
              period: earningsPeriod,
              search: searchValue.trim() || undefined,
              fromDate: resolvedFromDate || undefined,
              toDate: resolvedToDate || undefined,
            })

            const earningsRows = earningsRes?.data?.data?.earnings || []
            if (earningsRows.length > 0) {
              const earningsMap = new Map()
              earningsRows.forEach((item) => {
                const partnerKey = String(item.deliveryPartnerId || item.deliveryId || item.deliveryIdString || item.deliveryPartnerName || "").trim().toLowerCase()
                if (!partnerKey) return
                const prev = earningsMap.get(partnerKey) || {
                  totalEarning: 0,
                  name: item.deliveryPartnerName || "â€”",
                  deliveryIdString: item.deliveryIdString || item.deliveryId || item.deliveryPartnerId || "â€”",
                }
                prev.totalEarning += toNumber(item.amount)
                earningsMap.set(partnerKey, prev)
              })

              if (walletRowsMissing) {
                nextRows = Array.from(earningsMap.values()).map((entry, index) => ({
                  walletId: `earnings-fallback-${index}`,
                  deliveryId: entry.deliveryIdString,
                  deliveryIdString: entry.deliveryIdString,
                  name: entry.name,
                  pocketBalance: 0,
                  cashCollected: 0,
                  cashInHand: 0,
                  totalEarning: toNumber(entry.totalEarning),
                  bonus: 0,
                  paid: 0,
                  unpaid: toNumber(entry.totalEarning),
                  totalCashOrders: 0,
                  totalOnlineOrders: 0,
                }))
              } else {
                nextRows = walletRows.map((row) => {
                  const keyCandidates = [
                    String(row.deliveryId || ""),
                    String(row.deliveryIdString || ""),
                    String(row.deliveryPartnerId || ""),
                    normalizePhone(row.deliveryIdString),
                    normalizePhone(row.phone),
                    String(row.name || ""),
                  ].map((key) => String(key || "").trim().toLowerCase())
                  const match = keyCandidates
                    .map((k) => earningsMap.get(k))
                    .find(Boolean)
                  if (!match) return row
                  const totalEarning = toNumber(match.totalEarning, row.totalEarning)
                  const paid = toNumber(row.paid, row.paidAmount, row.totalWithdrawn)
                  return {
                    ...row,
                    totalEarning,
                    unpaid: Math.max(0, totalEarning - paid),
                    totalCashOrders: toNumber(row.totalCashOrders),
                    totalOnlineOrders: toNumber(row.totalOnlineOrders),
                  }
                })
              }
            }
          } catch (fallbackError) {
            // Keep wallet response as source if fallback fails.
            debugWarn("Earnings fallback failed:", fallbackError)
          }
        }

        if (partnerMap.size > 0) {
          nextRows = nextRows.map((row) => {
            const keyCandidates = [
              String(row.deliveryId || ""),
              String(row.deliveryPartnerId || ""),
              String(row.walletId || ""),
              String(row.deliveryIdString || ""),
              normalizePhone(row.deliveryIdString),
              normalizePhone(row.phone),
              String(row.name || "").trim().toLowerCase(),
            ].filter(Boolean).map((key) => String(key || "").trim().toLowerCase())
            const partnerMatch = keyCandidates.map((key) => partnerMap.get(key)).find(Boolean)
            if (!partnerMatch) return row
            const cashInHand = toNumber(row.cashInHand, partnerMatch.cashInHand)
            return {
              ...row,
              name: row.name === "â€”" ? partnerMatch.name : row.name,
              cashInHand,
            }
          })
        }

        try {
          const orderStatsMap = new Map()
          let nextOrdersPage = 1
          let totalOrderPages = 1
          let guard = 0

          do {
            const ordersRes = await adminAPI.getOrders({
              page: nextOrdersPage,
              limit: 100,
              status: "delivered",
              fromDate: resolvedFromDate || undefined,
              toDate: resolvedToDate || undefined,
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
              const method = String(order?.payment?.method || order?.paymentMethod || "").trim().toLowerCase()
              if (!method) return

              const isCod = ["cash", "cod"].includes(method)
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

              const earningAmount = toNumber(
                order?.riderEarning,
                order?.deliveryPartnerSettlement,
                order?.pricing?.deliveryFee,
              )

              const keys = [
                normalizeKey(partnerId),
                normalizeKey(order?.assignedDeliveryPartnerId),
                normalizePhone(partnerPhone),
                normalizeKey(partnerName),
              ].filter(Boolean)

              keys.forEach((key) => {
                const prev = orderStatsMap.get(key) || { cash: 0, online: 0, earning: 0 }
                if (isCod) prev.cash += 1
                else prev.online += 1
                prev.earning += earningAmount
                orderStatsMap.set(key, prev)
              })
            })

            totalOrderPages = Number(ordersRes?.data?.data?.meta?.totalPages || ordersRes?.data?.meta?.totalPages || 1)
            nextOrdersPage += 1
            guard += 1
          } while (nextOrdersPage <= totalOrderPages && guard < 100)

          if (orderStatsMap.size > 0) {
            nextRows = nextRows.map((row) => {
              const keyCandidates = [
                normalizeKey(row.deliveryId),
                normalizeKey(row.deliveryPartnerId),
                normalizeKey(row.walletId),
                normalizeKey(row.deliveryIdString),
                normalizePhone(row.deliveryIdString),
                normalizePhone(row.phone),
                normalizeKey(row.name),
              ].filter(Boolean)

              const statsMatch = keyCandidates.map((key) => orderStatsMap.get(key)).find(Boolean)
              if (!statsMatch) return row
              const totalEarning = toNumber(statsMatch.earning)
              const paid = getPaidAmount(row)

              return {
                ...row,
                totalCashOrders: toNumber(statsMatch.cash),
                totalOnlineOrders: toNumber(statsMatch.online),
                totalEarning,
                unpaid: Math.max(0, totalEarning - paid),
              }
            })
          }
        } catch (ordersCountError) {
          debugWarn("Delivery order counts merge failed:", ordersCountError)
        }

        const derivedTotal = data?.pagination?.total || nextRows.length || 0
        const derivedPages = data?.pagination?.pages || Math.max(1, Math.ceil(derivedTotal / limit))
        setWallets(nextRows)
        setTotal(derivedTotal)
        setPages(derivedPages)
      } else {
        toast.error(res?.data?.message || "Failed to fetch delivery boy wallets")
        setWallets([])
      }
    } catch (err) {
      debugError("Error fetching delivery boy wallets:", err)
      toast.error(err?.response?.data?.message || "Failed to fetch delivery boy wallets")
      setWallets([])
    } finally {
      setLoading(false)
    }
  }

  const fetchSummary = async () => {
    try {
      setSummary((prev) => ({ ...prev, loading: true }))

      const walletsRes = await adminAPI.getDeliveryWallets({ page: 1, limit: 1000 })

      const walletRows = (walletsRes?.data?.data?.wallets || []).map(normalizeWalletRow)
      const totalCashInHand = walletRows.reduce((sum, row) => sum + toNumber(row.cashInHand), 0)
      const totalPaid = walletRows.reduce((sum, row) => sum + getPaidAmount(row), 0)

      const totalSubmittedToAdmin = walletRows.reduce(
        (sum, row) => sum + toNumber(row.cashSubmittedToAdmin, row.totalSubmittedToAdmin),
        0,
      )
      const totalCollectedByDeliveryBoys = totalCashInHand + totalSubmittedToAdmin

      let totalCodOrders = 0
      let totalOnlineOrders = 0
      let totalEarningFromDeliveredOrders = 0
      let nextPage = 1
      let totalPages = 1
      let guard = 0

      do {
        const ordersRes = await adminAPI.getOrders({ page: nextPage, limit: 100, status: "delivered" })
        const orderRows =
          ordersRes?.data?.data?.orders ??
          ordersRes?.data?.orders ??
          ordersRes?.data?.data?.docs ??
          ordersRes?.data?.data?.data ??
          ordersRes?.data?.data ??
          []

        const safeRows = Array.isArray(orderRows) ? orderRows : []

        safeRows.forEach((order) => {
          const method = String(order?.payment?.method || order?.paymentMethod || "").trim().toLowerCase()
          if (!method) return

          const isCod = ["cash", "cod"].includes(method)
          if (isCod) totalCodOrders += 1
          else totalOnlineOrders += 1

          totalEarningFromDeliveredOrders += toNumber(
            order?.riderEarning,
            order?.deliveryPartnerSettlement,
            order?.pricing?.deliveryFee,
          )
        })

        totalPages = Number(ordersRes?.data?.data?.meta?.totalPages || ordersRes?.data?.meta?.totalPages || 1)
        nextPage += 1
        guard += 1
      } while (nextPage <= totalPages && guard < 100)

      const totalEarning = toNumber(totalEarningFromDeliveredOrders)
      const totalUnpaid = Math.max(0, totalEarning - totalPaid)

      setSummary({
        totalCollectedByDeliveryBoys,
        totalCashInHand,
        totalSubmittedToAdmin,
        totalEarning,
        totalPaid,
        totalUnpaid,
        totalCodOrders,
        totalOnlineOrders,
        loading: false,
      })
    } catch (error) {
      debugWarn("Summary fetch failed:", error)
      setSummary((prev) => ({ ...prev, loading: false }))
    }
  }

  useEffect(() => {
    fetchWallets()
  }, [page])

  useEffect(() => {
    fetchSummary()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      fetchWallets({ page: 1 })
    }, 500)
    return () => clearTimeout(t)
  }, [searchQuery])

  const handleTimeFilterChange = (value) => {
    const nextFilters = {
      ...filters,
      time: value,
      fromDate: "",
      toDate: "",
    }
    setFilters(nextFilters)
    setPage(1)
    fetchWallets({ page: 1, filters: nextFilters })
  }

  const handleDateFilterChange = (key, value) => {
    const nextFilters = {
      ...filters,
      [key]: value,
      time: "All Time",
    }
    setFilters(nextFilters)
    setPage(1)
    fetchWallets({ page: 1, filters: nextFilters })
  }

  const handleReset = () => {
    const resetFilters = { time: "All Time", fromDate: "", toDate: "" }
    setFilters(resetFilters)
    setSearchQuery("")
    setPage(1)
    fetchWallets({ page: 1, filters: resetFilters, searchQuery: "" })
  }

  const isQuickTimeActive = filters.time !== "All Time"
  const isDateRangeActive = Boolean(filters.fromDate || filters.toDate)

  const handleDownloadExcel = () => {
    if (!wallets.length) {
      toast.error("No rows to export")
      return
    }

    const totals = wallets.reduce(
      (acc, wallet) => {
        acc.totalCashOrders += toNumber(wallet.totalCashOrders)
        acc.totalOnlineOrders += toNumber(wallet.totalOnlineOrders)
        acc.totalCash += getTotalCashAmount(wallet)
        acc.cashInHand += toNumber(wallet.cashInHand)
        acc.takenByAdmin += toNumber(wallet.cashSubmittedToAdmin)
        acc.totalEarning += toNumber(wallet.totalEarning)
        acc.paid += getPaidAmount(wallet)
        acc.unpaid += getUnpaidAmount(wallet)
        return acc
      },
      {
        totalCashOrders: 0,
        totalOnlineOrders: 0,
        totalCash: 0,
        cashInHand: 0,
        takenByAdmin: 0,
        totalEarning: 0,
        paid: 0,
        unpaid: 0,
      },
    )

    const bodyRowsHtml = wallets
      .map(
        (wallet, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${htmlEscape(wallet.name || "-")}</td>
            <td>${htmlEscape(wallet.deliveryIdString || "-")}</td>
            <td class="num">${htmlEscape(toNumber(wallet.totalCashOrders).toFixed(0))}</td>
            <td class="num">${htmlEscape(toNumber(wallet.totalOnlineOrders).toFixed(0))}</td>
            <td class="num">${htmlEscape(getTotalCashAmount(wallet).toFixed(2))}</td>
            <td class="num">${htmlEscape(toNumber(wallet.cashInHand).toFixed(2))}</td>
            <td class="num">${htmlEscape(toNumber(wallet.cashSubmittedToAdmin).toFixed(2))}</td>
            <td class="num">${htmlEscape(toNumber(wallet.totalEarning).toFixed(2))}</td>
            <td class="num">${htmlEscape(getPaidAmount(wallet).toFixed(2))}</td>
            <td class="num">${htmlEscape(getUnpaidAmount(wallet).toFixed(2))}</td>
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
                <th>#</th>
                <th>Name</th>
                <th>ID</th>
                <th>Total COD orders</th>
                <th>Total online orders</th>
                <th>Total cash</th>
                <th>Cash in hand</th>
                <th>Taken by admin</th>
                <th>Total earning</th>
                <th>Paid</th>
                <th>Unpaid</th>
              </tr>
            </thead>
            <tbody>
              ${bodyRowsHtml}
              <tr class="total-row">
                <td>TOTAL</td>
                <td>${htmlEscape(`${wallets.length} rows`)}</td>
                <td></td>
                <td class="num">${htmlEscape(totals.totalCashOrders.toFixed(0))}</td>
                <td class="num">${htmlEscape(totals.totalOnlineOrders.toFixed(0))}</td>
                <td class="num">${htmlEscape(totals.totalCash.toFixed(2))}</td>
                <td class="num">${htmlEscape(totals.cashInHand.toFixed(2))}</td>
                <td class="num">${htmlEscape(totals.takenByAdmin.toFixed(2))}</td>
                <td class="num">${htmlEscape(totals.totalEarning.toFixed(2))}</td>
                <td class="num">${htmlEscape(totals.paid.toFixed(2))}</td>
                <td class="num">${htmlEscape(totals.unpaid.toFixed(2))}</td>
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
    link.download = `delivery-report-${stamp}.xls`
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
            <PiggyBank className="w-5 h-5" style={{ color: BRAND_THEME.colors.brand.primary }} />
            <h1 className="text-2xl font-bold text-slate-900">Delivery Report</h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            View each delivery partner&apos;s report with totals and payout status.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col gap-4 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Time</label>
                <select
                  value={filters.time}
                  onChange={(e) => handleTimeFilterChange(e.target.value)}
                  disabled={isDateRangeActive}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                >
                  <option value="All Time">All Time</option>
                  <option value="This Week">This Week</option>
                  <option value="This Month">This Month</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Start Date</label>
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) => handleDateFilterChange("fromDate", e.target.value)}
                  disabled={isQuickTimeActive}
                  max={todayDate}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">End Date</label>
                <input
                  type="date"
                  value={filters.toDate}
                  onChange={(e) => handleDateFilterChange("toDate", e.target.value)}
                  disabled={isQuickTimeActive}
                  max={todayDate}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-slate-700 text-white hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reset
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Wallets</h2>
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                {total}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadExcel}
                className="px-4 py-2.5 text-sm font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download Excel
              </button>
              <div className="relative flex-1 sm:flex-initial min-w-[200px] max-w-xs">
                <input
                  type="text"
                  placeholder="Search by name, ID, phone"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            </div>
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-4" />
              <p className="text-slate-600">Loading walletsâ€¦</p>
            </div>
          ) : (
            <div className="overflow-x-auto pb-2">
              <table className="w-full min-w-[1450px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">#</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">ID</th>
                    <th className="px-3 py-4 w-[120px] text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Total COD orders</th>
                    <th className="px-3 py-4 w-[130px] text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Total online orders</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Total cash</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Cash in hand</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Taken by admin</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Total earning</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Paid</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Unpaid</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {wallets.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <Package className="w-16 h-16 text-slate-400 mb-4" />
                          <p className="text-lg font-semibold text-slate-700">No wallets</p>
                          <p className="text-sm text-slate-500">No delivery boys found.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    wallets.map((w, i) => (
                      <tr key={w.walletId || w.deliveryId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{(page - 1) * limit + i + 1}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{w.name || "â€”"}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{w.deliveryIdString || "â€”"}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{Number(w.totalCashOrders || 0).toLocaleString("en-IN")}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{Number(w.totalOnlineOrders || 0).toLocaleString("en-IN")}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatCurrency(getTotalCashAmount(w))}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatCurrency(w.cashInHand)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatCurrency(w.cashSubmittedToAdmin)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatCurrency(w.totalEarning)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatCurrency(getPaidAmount(w))}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatCurrency(getUnpaidAmount(w))}</td>
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
                Page {page} of {pages} Â· {total} total
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
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




