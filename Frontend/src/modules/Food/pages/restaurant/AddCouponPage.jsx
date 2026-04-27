import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Calendar, Loader2, Wand2, Info, CheckCircle2, XCircle } from "lucide-react"
import { Card, CardContent } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { restaurantAPI } from "@food/api"
import BRAND_THEME from "@/config/brandTheme"

const discountTypes = [
  { value: "percentage", label: "Percentage (%)" },
  { value: "flat-price", label: "Flat Amount" },
]

const defaultForm = {
  couponCode: "",
  discountType: "percentage",
  discountValue: "",
  maxDiscount: "",
  minOrderValue: "",
  usageLimit: "",
  perUserLimit: "",
  startDate: "",
  endDate: "",
  customerScope: "all",
}

export default function AddCouponPage(props) {
  const { mode = "create", couponId } = props || {}
  const isEditMode = mode === "edit" && couponId

  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [form, setForm] = useState(defaultForm)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [approvalStatus, setApprovalStatus] = useState("")

  const brand = useMemo(() => ({
    primary: BRAND_THEME.colors.brand.primary,
    primaryDark: BRAND_THEME.colors.brand.primaryDark,
    primarySoft: BRAND_THEME.colors.brand.primarySoft,
    border: BRAND_THEME.colors.neutral.border
  }), [])

  // Prefill when editing (loads from list API and matches id)
  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!isEditMode) return
      try {
        setLoading(true)
        const res = await restaurantAPI.getCoupons()
        const list = res?.data?.data?.offers || res?.data?.offers || []
        const match = list.find((o) => String(o.id || o._id) === String(couponId))
        if (match && mounted) {
          setForm({
            couponCode: match.couponCode || "",
            discountType: match.discountType || "percentage",
            discountValue: match.discountValue != null ? String(match.discountValue) : "",
            maxDiscount: match.maxDiscount != null ? String(match.maxDiscount) : "",
            minOrderValue: match.minOrderValue != null ? String(match.minOrderValue) : "",
            usageLimit: match.usageLimit != null ? String(match.usageLimit) : "",
            perUserLimit: match.perUserLimit != null ? String(match.perUserLimit) : "",
            startDate: match.startDate ? new Date(match.startDate).toISOString().slice(0, 10) : "",
            endDate: match.endDate ? new Date(match.endDate).toISOString().slice(0, 10) : "",
            customerScope: match.customerScope || "all",
          })
          setApprovalStatus(match.approvalStatus || "")
        }
      } catch (err) {
        setError(err?.response?.data?.message || "Failed to load coupon")
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [isEditMode, couponId])

  const today = useMemo(() => {
    const d = new Date()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${d.getFullYear()}-${m}-${day}`
  }, [])

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError("")
    setSuccess("")
  }

  const validate = () => {
    if (!form.couponCode.trim()) return "Coupon code is required"
    const value = Number(form.discountValue)
    if (!Number.isFinite(value) || value <= 0) return "Discount must be greater than 0"
    if (form.discountType === "percentage") {
      const max = form.maxDiscount === "" ? value : Number(form.maxDiscount)
      if (!Number.isFinite(max) || max <= 0) return "Max discount is required for percentage coupons"
    }
    if (form.minOrderValue && Number(form.minOrderValue) < 0) return "Min order cannot be negative"
    if (form.usageLimit === "") return "Usage limit is required"
    if (Number(form.usageLimit) <= 0) return "Usage limit must be greater than 0"
    if (form.perUserLimit === "") return "Per user limit is required"
    if (Number(form.perUserLimit) <= 0) return "Per user limit must be greater than 0"
    if (Number(form.usageLimit) <= Number(form.perUserLimit)) return "Total usage limit must be greater than per-user limit"
    if (form.startDate && form.endDate && new Date(form.endDate) <= new Date(form.startDate)) {
      return "End date must be after start date"
    }
    return ""
  }

  const buildPayload = () => {
    const discountValueNum = Number(form.discountValue)
    const maxDiscountNum =
      form.discountType === "percentage"
        ? (form.maxDiscount === "" ? discountValueNum : Number(form.maxDiscount))
        : undefined
    const base = {
      couponCode: form.couponCode.trim().toUpperCase(),
      discountType: form.discountType,
      discountValue: discountValueNum,
      customerScope: form.customerScope,
      restaurantScope: "selected",
      minOrderValue: form.minOrderValue === "" ? undefined : Number(form.minOrderValue),
      maxDiscount: form.discountType === "percentage" ? maxDiscountNum : undefined,
      usageLimit: Number(form.usageLimit),
      perUserLimit: Number(form.perUserLimit),
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
    }
    return base
  }

  const handleSubmit = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setSaving(true)
      const payload = buildPayload()
      if (isEditMode) {
        await restaurantAPI.updateCoupon(couponId, payload)
        setSuccess("Coupon updated and resubmitted for approval")
      } else {
        await restaurantAPI.createCoupon(payload)
        setSuccess("Coupon submitted for approval")
      }
      navigate("/restaurant/coupon")
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to save coupon")
    } finally {
      setSaving(false)
    }
  }

  const generateCouponCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    let code = ""
    for (let i = 0; i < 8; i += 1) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    updateField("couponCode", code)
  }

  return (
    <div
      className="min-h-screen pb-24 md:pb-10"
      style={{ backgroundColor: BRAND_THEME.tokens.app.sectionAltBackground || "#F8FAFC" }}
    >
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-40 flex items-center gap-3">
        <button onClick={goBack} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">
          {isEditMode ? "Edit Coupon" : "Add Coupon"}
        </h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        {approvalStatus && (
          <div className="flex items-center gap-2 text-sm px-4 py-3 rounded-lg bg-white border border-gray-200">
            {approvalStatus === "approved" && <CheckCircle2 className="w-4 h-4 text-green-600" />}
            {approvalStatus === "pending" && <Info className="w-4 h-4 text-amber-500" />}
            {approvalStatus === "rejected" && <XCircle className="w-4 h-4 text-red-600" />}
            <span className="text-gray-700">Status: {approvalStatus}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <XCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 text-sm px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
            <CheckCircle2 className="w-4 h-4" />
            <span>{success}</span>
          </div>
        )}

        <Card className="bg-white shadow-sm border border-gray-100">
          <CardContent className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Coupon Code *</label>
              <div className="flex gap-2">
                <Input
                  value={form.couponCode}
                  onChange={(e) => updateField("couponCode", e.target.value.toUpperCase())}
                  placeholder="e.g. SAVE50"
                  className="flex-1"
                  disabled={loading || saving}
                />
                <button
                  onClick={generateCouponCode}
                  type="button"
                  className="p-2.5 rounded-lg transition-colors flex items-center justify-center text-white shadow-md"
                  style={{ backgroundColor: brand.primary }}
                >
                  <Wand2 className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Discount Type</label>
                <select
                  value={form.discountType}
                  onChange={(e) => updateField("discountType", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
                  disabled={loading || saving}
                >
                  {discountTypes.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Discount Value *</label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.discountValue}
                  onChange={(e) => updateField("discountValue", e.target.value)}
                  placeholder={form.discountType === "percentage" ? "e.g. 20" : "e.g. 100"}
                  disabled={loading || saving}
                />
              </div>
            </div>

            {form.discountType === "percentage" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Discount *</label>
                <Input
                  type="number"
                  min="1"
                  value={form.maxDiscount}
                  onChange={(e) => updateField("maxDiscount", e.target.value)}
                  placeholder="e.g. 150"
                  disabled={loading || saving}
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Min Order (optional)</label>
                <Input
                  type="number"
                  min="0"
                  value={form.minOrderValue}
                  onChange={(e) => updateField("minOrderValue", e.target.value)}
                  placeholder="e.g. 299"
                  disabled={loading || saving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Usage Limit *</label>
                <Input
                  type="number"
                  min="1"
                  value={form.usageLimit}
                  onChange={(e) => updateField("usageLimit", e.target.value)}
                  disabled={loading || saving}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Per User Limit *</label>
                <Input
                  type="number"
                  min="1"
                  value={form.perUserLimit}
                  onChange={(e) => updateField("perUserLimit", e.target.value)}
                  disabled={loading || saving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Customer Scope</label>
                <select
                  value={form.customerScope}
                  onChange={(e) => updateField("customerScope", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
                  disabled={loading || saving}
                >
                  <option value="all">All customers</option>
                  <option value="first-time">First-time users</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Date (optional)</label>
                <div className="relative">
                  <Input
                    type="date"
                    min={today}
                    value={form.startDate}
                    onChange={(e) => updateField("startDate", e.target.value)}
                    className="pr-3"
                    disabled={loading || saving}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">End Date (optional)</label>
                <div className="relative">
                  <Input
                    type="date"
                    min={form.startDate || today}
                    value={form.endDate}
                    onChange={(e) => updateField("endDate", e.target.value)}
                    className="pr-3"
                    disabled={loading || saving}
                  />
                </div>
              </div>
            </div>

          </CardContent>
        </Card>
      </div>

      <div className="relative mt-6 z-40 px-4 md:px-0">
        <Button
          onClick={handleSubmit}
          disabled={saving || loading}
          className="w-full text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
          style={{ backgroundColor: brand.primary, boxShadow: BRAND_THEME.tokens.motion?.shadow?.glow }}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEditMode ? "Update & Resubmit" : "Submit for Approval"}
        </Button>
        <p className="text-xs text-gray-500 mt-2 text-center">
          Admin approval is required before this coupon becomes active.
        </p>
      </div>

      <BottomNavOrders />
    </div>
  )
}

