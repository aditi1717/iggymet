import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { ChevronLeft, Loader2, Send } from "lucide-react"
import { restaurantAPI } from "@food/api"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import BRAND_THEME from "@/config/brandTheme"
import { toast } from "sonner"

const CATEGORY_OPTIONS = [
  { value: "orders", label: "Orders" },
  { value: "payments", label: "Payments" },
  { value: "menu", label: "Menu" },
  { value: "restaurant", label: "Restaurant Profile" },
  { value: "technical", label: "Technical" },
  { value: "other", label: "Other" },
]

const ISSUE_TYPE_OPTIONS = [
  { value: "order_status_issue", label: "Order status issue" },
  { value: "new_order_issue", label: "New order issue" },
  { value: "payment_settlement_issue", label: "Payment / settlement issue" },
  { value: "menu_item_issue", label: "Menu / item issue" },
  { value: "restaurant_profile_issue", label: "Restaurant profile issue" },
  { value: "app_technical_issue", label: "App / technical issue" },
  { value: "other", label: "Other" },
]

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
]

const getStatusStyle = (status) => {
  if (status === "resolved") return "bg-emerald-100 text-emerald-700 border-emerald-200"
  if (status === "in-progress") return "bg-brand-100 text-brand-700 border-brand-200"
  return "bg-amber-100 text-amber-700 border-amber-200"
}

const getIssueLabel = (value) =>
  ISSUE_TYPE_OPTIONS.find((option) => option.value === value)?.label ||
  String(value || "Issue").replace(/_/g, " ")

export default function RestaurantSupport() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState("")
  const [orders, setOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [form, setForm] = useState({
    category: "orders",
    issueType: "",
    description: "",
    orderRef: "",
  })

  const stats = useMemo(() => {
    const total = tickets.length
    const open = tickets.filter((t) => t.status === "open").length
    const inProgress = tickets.filter((t) => t.status === "in-progress").length
    const resolved = tickets.filter((t) => t.status === "resolved").length
    return { total, open, inProgress, resolved }
  }, [tickets])

  const loadTickets = async () => {
    try {
      setLoading(true)
      const response = await restaurantAPI.getSupportTickets({
        status: statusFilter || undefined,
        limit: 100,
        page: 1,
      })
      const list = response?.data?.data?.tickets || []
      setTickets(list)
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load support tickets")
      setTickets([])
    } finally {
      setLoading(false)
    }
  }

  const getOrderCode = (order) =>
    order?.displayOrderId ||
    order?.orderId ||
    order?.mongoId ||
    order?._id ||
    order?.id ||
    ""

  const getOrderLabel = (order) => {
    const code = getOrderCode(order)
    const dateValue = order?.createdAt || order?.updatedAt
    const dateLabel = dateValue ? new Date(dateValue).toLocaleDateString("en-IN") : "No date"
    const amount = Number(order?.pricing?.total ?? order?.totalAmount ?? order?.total ?? 0)
    const status = String(order?.orderStatus || order?.status || "").replace(/_/g, " ")
    return `#${code} | ${dateLabel} | Rs ${amount.toFixed(0)}${status ? ` | ${status}` : ""}`
  }

  const loadOrders = async () => {
    try {
      setLoadingOrders(true)
      const response = await restaurantAPI.getOrders({ page: 1, limit: 100 })
      const list = response?.data?.data?.orders || response?.data?.orders || []
      setOrders(Array.isArray(list) ? list : [])
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load orders")
      setOrders([])
    } finally {
      setLoadingOrders(false)
    }
  }

  useEffect(() => {
    loadTickets()
  }, [statusFilter])

  useEffect(() => {
    loadOrders()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.issueType.trim()) {
      toast.error("Issue type is required")
      return
    }
    if (!form.description.trim()) {
      toast.error("Issue details are required")
      return
    }
    if (!form.orderRef.trim()) {
      toast.error("Order/reference ID is required")
      return
    }
    try {
      setSubmitting(true)
      await restaurantAPI.createSupportTicket({
        category: form.category,
        issueType: form.issueType.trim(),
        description: form.description.trim(),
        orderRef: form.orderRef.trim(),
      })
      toast.success("Support ticket submitted")
      setForm((prev) => ({ ...prev, issueType: "", description: "", orderRef: "" }))
      await loadTickets()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to submit support ticket")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={goBack}
            className="p-1 hover:bg-slate-100 rounded-full transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-6 h-6 text-slate-900" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Support</h1>
            <p className="text-xs text-slate-500">Raise issue and track admin response</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-lg font-bold text-slate-900">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-700">Open</p>
            <p className="text-lg font-bold text-amber-800">{stats.open}</p>
          </div>
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-3">
            <p className="text-xs text-brand-700">In progress</p>
            <p className="text-lg font-bold text-brand-800">{stats.inProgress}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs text-emerald-700">Resolved</p>
            <p className="text-lg font-bold text-emerald-800">{stats.resolved}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Raise support ticket</h2>
          <div className="grid grid-cols-1 gap-3">
            <select
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              required
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <select
            value={form.issueType}
            onChange={(e) => setForm((prev) => ({ ...prev, issueType: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            required
          >
            <option value="">Select issue type</option>
            {ISSUE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={form.orderRef}
            onChange={(e) => setForm((prev) => ({ ...prev, orderRef: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            required
            disabled={loadingOrders}
          >
            <option value="">{loadingOrders ? "Loading orders..." : "Select order ID"}</option>
            {orders.map((order) => {
              const code = getOrderCode(order)
              return (
                <option key={String(order?._id || order?.id || code)} value={String(code)}>
                  {getOrderLabel(order)}
                </option>
              )
            })}
          </select>
          <textarea
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Write the full issue here"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            rows={4}
            maxLength={1000}
            required
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg text-white py-2.5 text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: BRAND_THEME.gradients.primary }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Submit Ticket
          </button>
        </form>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900">My tickets</h2>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="py-8 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading tickets...
            </div>
          ) : tickets.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              No support tickets found.
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div key={ticket._id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-500">
                      #{String(ticket._id).slice(-6)} | {new Date(ticket.createdAt).toLocaleString()}
                    </p>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold capitalize ${getStatusStyle(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {getIssueLabel(ticket.issueType)}
                  </p>
                  {ticket.orderRef ? (
                    <p className="text-xs text-slate-600 mt-1">
                      Order: {ticket.orderRef}
                    </p>
                  ) : null}
                  {ticket.description ? (
                    <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
                      {ticket.description}
                    </p>
                  ) : null}
                  {ticket.adminResponse ? (
                    <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-2.5">
                      <p className="text-[11px] font-semibold text-brand-700 uppercase">Admin response</p>
                      <p className="text-sm text-brand-900 mt-1 whitespace-pre-wrap">{ticket.adminResponse}</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNavOrders />
    </div>
  )
}

