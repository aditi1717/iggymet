import { useEffect, useMemo, useState } from "react"
import { supportAPI } from "@food/api"
import { toast } from "sonner"

export default function SupportTickets() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: "", type: "", source: "user" })
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [modalDraft, setModalDraft] = useState({ status: "open", adminResponse: "" })

  const stats = useMemo(() => {
    const total = tickets.length
    const open = tickets.filter((t) => t.status === "open").length
    const inProgress = tickets.filter((t) => t.status === "in-progress").length
    const resolved = tickets.filter((t) => t.status === "resolved").length
    return { total, open, inProgress, resolved }
  }, [tickets])

  const getUserDetails = (ticket) => {
    const user = ticket?.user || {}
    const name = user.name || ticket?.userName || ""
    const phone = user.phone || ticket?.userPhone || ""
    const id = ticket?.userId ? String(ticket.userId).slice(-6) : ""
    return {
      name: name || (id ? `#${id}` : "-"),
      phone: phone || "-",
    }
  }

  const getUserLabel = (ticket) => {
    const user = getUserDetails(ticket)
    if (user.name !== "-" && user.phone !== "-") return `${user.name} (${user.phone})`
    if (user.name !== "-") return user.name
    return user.phone
  }

  const getRestaurantLabel = (ticket) => {
    const restaurant = ticket?.restaurant || {}
    const name = restaurant.name || restaurant.restaurantName || ticket?.restaurantName || ""
    const city = restaurant.city || ""
    if (name && city) return `${name} (${city})`
    if (name) return name
    if (ticket?.restaurantId) return `#${String(ticket.restaurantId).slice(-6)}`
    return "-"
  }

  const getIssueLabel = (value) =>
    String(value || "Issue")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())

  const getOrderLabel = (ticket) => {
    if (ticket?.orderRef) return ticket.orderRef
    const order = ticket?.orderId || {}
    if (typeof order === "string") return order.slice(-6)
    return order.displayOrderId || order.orderId || String(order._id || "").slice(-6)
  }

  const getUserTicketType = (ticket) => {
    const type = String(ticket?.type || ticket?.issueType || "other").toLowerCase()
    if (type.includes("order")) return "Order"
    if (type.includes("restaurant")) return "Restaurant"
    return "Other"
  }

  const getTicketTitle = (ticket) => {
    if (!ticket) return "Support Ticket"
    return ticket.subject || getIssueLabel(ticket.issueType || ticket.category || ticket.type)
  }

  const shouldShowRestaurantInModal = (ticket) => {
    if (!ticket) return false
    return ticket.source === "restaurant" || ticket.type === "restaurant" || Boolean(ticket.restaurantId)
  }

  const formatDate = (date) => {
    if (!date) return "-"
    const parsed = new Date(date)
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString()
  }

  const setSourceFilter = (source) => {
    setFilters((prev) => ({
      ...prev,
      source,
      type: source === "restaurant" ? "" : prev.type,
    }))
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await supportAPI.getSupportTicketsAdmin(filters)
      const list = res?.data?.data?.tickets || res?.data?.tickets || []
      setTickets(list)
    } catch {
      toast.error("Failed to load tickets")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 200)
    return () => clearTimeout(timer)
  }, [filters.status, filters.type, filters.source])

  const openTicketModal = (ticket) => {
    setSelectedTicket(ticket)
    setModalDraft({
      status: ticket.status || "open",
      adminResponse: ticket.adminResponse || "",
    })
  }

  const closeTicketModal = () => {
    setSelectedTicket(null)
    setModalDraft({ status: "open", adminResponse: "" })
  }

  const update = async (id, patch) => {
    const ticket = tickets.find((t) => String(t._id) === String(id))
    try {
      const res = await supportAPI.updateSupportTicketAdmin(id, { ...patch, source: ticket?.source || filters.source || "user" })
      const updatedTicket = res?.data?.data?.ticket || res?.data?.ticket || null
      toast.success("Updated")
      setTickets((prev) =>
        prev.map((t) => (String(t._id) === String(id) ? { ...t, ...patch, ...(updatedTicket || {}) } : t)),
      )
      if (selectedTicket && String(selectedTicket._id) === String(id)) {
        setSelectedTicket((prev) => ({ ...prev, ...patch, ...(updatedTicket || {}) }))
      }
    } catch {
      toast.error("Failed to update")
    }
  }

  const saveModalChanges = async () => {
    if (!selectedTicket?._id) return
    await update(selectedTicket._id, {
      status: modalDraft.status,
      adminResponse: modalDraft.adminResponse.trim(),
    })
    closeTicketModal()
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Support Tickets</h1>
              <p className="text-sm text-slate-500 mt-1">Review and respond to user and restaurant support tickets.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={filters.status}
                onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">All Status</option>
                <option value="open">Open</option>
                <option value="in-progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
              <select
                value={filters.type}
                onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                disabled={filters.source === "restaurant"}
              >
                <option value="">All Types</option>
                <option value="order">Order</option>
                <option value="restaurant">Restaurant</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 rounded-xl bg-slate-50 p-1 border border-slate-200">
            {[
              { value: "user", label: "User Tickets", description: "Issues raised from user app" },
              { value: "restaurant", label: "Restaurant Tickets", description: "Issues raised from restaurant panel" },
            ].map((tab) => {
              const active = filters.source === tab.value
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setSourceFilter(tab.value)}
                  className={`flex-1 min-w-[220px] rounded-lg px-4 py-3 text-left transition ${active
                      ? "bg-white shadow-sm border border-brand-200 text-brand-700"
                      : "text-slate-600 hover:bg-white/70 border border-transparent"
                    }`}
                >
                  <span className="block text-sm font-semibold">{tab.label}</span>
                  <span className="block text-xs mt-0.5">{tab.description}</span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-3 text-xs">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              Total {stats.total}
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Open {stats.open}
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
              <span className="w-2 h-2 rounded-full bg-brand-500" />
              In progress {stats.inProgress}
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Resolved {stats.resolved}
            </span>
          </div>
        </div>

        <div className="mb-3">
          <h2 className="text-base font-semibold text-slate-900">
            {filters.source === "restaurant" ? "Restaurant Support Tickets" : "User Support Tickets"}
          </h2>
          <p className="text-sm text-slate-500">
            {filters.source === "restaurant"
              ? "Only tickets raised by restaurants are shown here."
              : "Only tickets raised by users/customers are shown here."}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-600">
                  <th className="px-4 py-3">Id</th>
                  {filters.source === "restaurant" ? (
                    <th className="px-4 py-3">Restaurant</th>
                  ) : (
                    <>
                      <th className="px-4 py-3">User Name</th>
                      <th className="px-4 py-3">Mobile Number</th>
                    </>
                  )}
                  <th className="px-4 py-3">{filters.source === "restaurant" ? "Category" : "Type"}</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={filters.source === "restaurant" ? 6 : 7} className="px-4 py-6 text-center text-slate-500">Loading...</td></tr>
                ) : tickets.length === 0 ? (
                  <tr><td colSpan={filters.source === "restaurant" ? 6 : 7} className="px-4 py-6 text-center text-slate-500">No tickets</td></tr>
                ) : tickets.map((ticket) => (
                  <tr key={ticket._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">#{String(ticket._id).slice(-6)}</td>
                    {filters.source === "restaurant" ? (
                      <td className="px-4 py-3 text-sm text-slate-700">{getRestaurantLabel(ticket)}</td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{getUserDetails(ticket).name}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{getUserDetails(ticket).phone}</td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {filters.source === "restaurant" ? getIssueLabel(ticket.category || "other") : getUserTicketType(ticket)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${ticket.status === "resolved"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : ticket.status === "in-progress"
                              ? "bg-brand-50 text-brand-700 border border-brand-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                      >
                        {String(ticket.status || "open").replace("-", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{formatDate(ticket.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
                        onClick={() => openTicketModal(ticket)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedTicket ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                  #{String(selectedTicket._id).slice(-6)} - {selectedTicket.source === "restaurant" ? "Restaurant Ticket" : "User Ticket"}
                </p>
                <h3 className="text-lg font-semibold text-slate-900 mt-1">{getTicketTitle(selectedTicket)}</h3>
                <p className="text-sm text-slate-500 mt-1">Created {formatDate(selectedTicket.createdAt)}</p>
              </div>
              <button
                type="button"
                onClick={closeTicketModal}
                className="rounded-full w-9 h-9 grid place-items-center border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Close ticket details"
              >
                x
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase font-semibold text-slate-500">Raised By</p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">
                    {selectedTicket.source === "restaurant" ? getRestaurantLabel(selectedTicket) : getUserLabel(selectedTicket)}
                  </p>
                </div>
                {shouldShowRestaurantInModal(selectedTicket) ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase font-semibold text-slate-500">Restaurant</p>
                    <p className="text-sm font-semibold text-slate-900 mt-1">{getRestaurantLabel(selectedTicket)}</p>
                  </div>
                ) : null}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase font-semibold text-slate-500">
                    {selectedTicket.source === "restaurant" ? "Category" : "Type"}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">
                    {selectedTicket.source === "restaurant"
                      ? getIssueLabel(selectedTicket.category || "other")
                      : getUserTicketType(selectedTicket)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase font-semibold text-slate-500">Order</p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">
                    {getOrderLabel(selectedTicket) ? `#${getOrderLabel(selectedTicket)}` : "-"}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">Issue Details</p>
                <div className="mt-3 space-y-3 text-sm text-slate-700">
                  <div>
                    <span className="font-medium text-slate-900">Issue: </span>
                    {getIssueLabel(selectedTicket.issueType || selectedTicket.category || selectedTicket.type)}
                  </div>
                  {selectedTicket.subject ? (
                    <div>
                      <span className="font-medium text-slate-900">Subject: </span>
                      {selectedTicket.subject}
                    </div>
                  ) : null}
                  <div className="whitespace-pre-wrap rounded-lg bg-slate-50 border border-slate-200 p-3 leading-6">
                    {selectedTicket.description || "No description provided."}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">Admin Action</p>
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">Status</span>
                    <select
                      value={modalDraft.status}
                      onChange={(e) => setModalDraft((prev) => ({ ...prev, status: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                    >
                      <option value="open">Open</option>
                      <option value="in-progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">Response</span>
                    <textarea
                      value={modalDraft.adminResponse}
                      onChange={(e) => setModalDraft((prev) => ({ ...prev, adminResponse: e.target.value }))}
                      rows={5}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none"
                      placeholder="Write response for this ticket"
                    />
                    <span className="text-xs text-slate-500 mt-1 block">
                      This response will be visible to the {selectedTicket.source === "restaurant" ? "restaurant" : "user"}.
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeTicketModal}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveModalChanges}
                className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
              >
                Save Response
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
