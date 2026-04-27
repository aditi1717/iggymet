import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, CheckCircle2 } from "lucide-react"
import { Input } from "@food/components/ui/input"
import { Textarea } from "@food/components/ui/textarea"
import { Button } from "@food/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@food/components/ui/select"
import { supportAPI } from "@food/api"
import BRAND_THEME from "@/config/brandTheme"

const COMPLAINT_TYPE_OPTIONS = [
  { value: "food_quality", label: "Food Quality" },
  { value: "wrong_item", label: "Wrong Item" },
  { value: "missing_item", label: "Missing Item" },
  { value: "delivery_issue", label: "Delivery Issue" },
  { value: "packaging", label: "Packaging" },
  { value: "pricing", label: "Pricing" },
  { value: "service", label: "Service" },
  { value: "other", label: "Other" },
]

const getTicketOrderId = (ticket) => {
  const raw = ticket?.orderId
  if (!raw) return ""
  if (typeof raw === "object") return String(raw?._id || raw?.id || "")
  return String(raw)
}

export default function SubmitComplaint() {
  const navigate = useNavigate()
  const { orderId = "" } = useParams()
  const routeOrderId = String(orderId || "").trim()
  const [form, setForm] = useState({ subject: "", description: "", orderId: routeOrderId })
  const [existingTicket, setExistingTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setForm((prev) => ({ ...prev, orderId: routeOrderId }))
  }, [routeOrderId])

  useEffect(() => {
    let isMounted = true

    const loadExistingTicket = async () => {
      if (!routeOrderId) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await supportAPI.getMyTickets({ limit: 50, page: 1 })
        const tickets = response?.data?.data?.tickets || response?.data?.tickets || []
        const found = tickets.find((ticket) => {
          return ticket?.type === "order" && getTicketOrderId(ticket) === routeOrderId
        })

        if (!isMounted) return
        if (found) {
          setExistingTicket(found)
          setForm({
            subject: found.issueType || "Restaurant Complaint",
            description: found.description || "",
            orderId: routeOrderId,
          })
        }
      } catch (err) {
        if (isMounted) {
          setError(err?.response?.data?.message || "Failed to check existing complaint")
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadExistingTicket()
    return () => {
      isMounted = false
    }
  }, [routeOrderId])

  const isReadOnly = Boolean(existingTicket)
  const isValid = useMemo(() => {
    const hasValidType = COMPLAINT_TYPE_OPTIONS.some((option) => option.value === form.subject)
    return routeOrderId && hasValidType && form.description.trim().length >= 10
  }, [form.description, form.subject, routeOrderId])

  const handleChange = (key, value) => {
    if (isReadOnly) return
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async () => {
    if (isReadOnly) return
    if (!routeOrderId) {
      setError("Order ID missing. Please open complaint from your delivered order.")
      return
    }
    if (!isValid) {
      setError("Please select complaint type and add description (min 10 chars)")
      return
    }

    setError("")
    setSubmitting(true)
    try {
      const response = await supportAPI.createTicket({
        type: "order",
        orderId: routeOrderId,
        issueType: form.subject.trim(),
        description: form.description.trim(),
      })
      const ticket = response?.data?.data?.ticket
      if (!response?.data?.success || !ticket) {
        throw new Error(response?.data?.message || "Failed to submit complaint")
      }

      setExistingTicket(ticket)
      setForm({
        subject: ticket.issueType || form.subject,
        description: ticket.description || form.description,
        orderId: routeOrderId,
      })
      toast.success(response?.data?.data?.alreadyExists ? "Complaint already submitted" : "Complaint submitted")
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to submit complaint")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-gray-100 p-6 sm:p-8 space-y-6">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mt-1 h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-700"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-gray-900">Restaurant Complaint</h1>
            <p className="text-sm text-gray-600">
              {isReadOnly ? "Complaint already submitted for this order." : "Tell us what went wrong with this order."}
            </p>
          </div>
        </div>

        {isReadOnly && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-4 flex gap-3 text-green-800">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Already submitted</p>
              <p className="text-xs mt-1 capitalize">Status: {existingTicket?.status || "open"}</p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Order ID</label>
            <Input value={form.orderId} readOnly className="bg-slate-50" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Complaint Type</label>
            <Select
              value={form.subject}
              onValueChange={(value) => handleChange("subject", value)}
              disabled={isReadOnly}
            >
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Select complaint type" />
              </SelectTrigger>
              <SelectContent>
                {COMPLAINT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Description</label>
            <Textarea
              rows={5}
              value={form.description}
              readOnly={isReadOnly}
              onChange={(e) => handleChange("description", e.target.value)}
              placeholder="Describe the issue in detail"
            />
          </div>

          {existingTicket?.adminResponse ? (
            <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
              <p className="text-xs font-bold text-brand-700 uppercase tracking-wide">Admin response</p>
              <p className="text-sm text-brand-900 mt-1 whitespace-pre-wrap">{existingTicket.adminResponse}</p>
            </div>
          ) : null}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <Button
          disabled={loading || submitting || isReadOnly || !isValid}
          onClick={handleSubmit}
          className="w-full h-12 text-white font-semibold disabled:opacity-60"
          style={{ background: BRAND_THEME.gradients.primary, boxShadow: `0 12px 28px -18px ${BRAND_THEME.colors.brand.primaryDark}` }}
        >
          {loading ? "Checking..." : submitting ? "Submitting..." : isReadOnly ? "Complaint Submitted" : "Submit Complaint"}
        </Button>
      </div>
    </div>
  )
}
