import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useLocation } from "react-router-dom"
import { Search, Pencil, Trash2, X, Loader2 } from "lucide-react"
import { adminAPI } from "@food/api"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function Coupons() {
  const location = useLocation()
  const isOffersOnly = location.pathname.toLowerCase().includes("/offers")
  const [searchQuery, setSearchQuery] = useState("")
  const [offers, setOffers] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [submitSuccess, setSubmitSuccess] = useState("")
  const [viewOnly, setViewOnly] = useState(false)
  const [updatingCartVisibility, setUpdatingCartVisibility] = useState({})
  const [deletingOffer, setDeletingOffer] = useState({})
  const [editingOfferId, setEditingOfferId] = useState(null)
  const [errors, setErrors] = useState({})
  const [pendingOffers, setPendingOffers] = useState([])
  const [loadingPending, setLoadingPending] = useState(false)
  const [pendingError, setPendingError] = useState("")
  const [processingPending, setProcessingPending] = useState({})
  const [viewOfferModal, setViewOfferModal] = useState(null)
  const formTopRef = useRef(null)
  const [formData, setFormData] = useState({
    couponCode: "",
    discountType: "percentage",
    discountValue: "",
    customerScope: "all",
    restaurantScope: "all",
    restaurantId: "",
    endDate: "",
    startDate: "",
    minOrderValue: "",
    maxDiscount: "",
    usageLimit: "",
    perUserLimit: "",
  })

  const fetchOffers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      if (isOffersOnly) {
        setOffers([])
      } else {
        const response = await adminAPI.getAllOffers({})
        if (response?.data?.success) {
          const list = response.data.data.offers || []
          const nonPending = Array.isArray(list)
            ? list.filter((o) => (o.approvalStatus || "approved") !== "pending")
            : []
          setOffers(nonPending)
        } else {
          setError("Failed to fetch offers")
        }
      }
    } catch (err) {
      debugError("Error fetching offers:", err)
      setError(err?.response?.data?.message || "Failed to fetch offers")
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPendingOffers = useCallback(async () => {
    // For offers-only view, we no longer show admin approval; skip fetching.
    if (isOffersOnly) {
      setPendingOffers([])
      setLoadingPending(false)
      setPendingError("")
      return
    }
    try {
      setLoadingPending(true)
      setPendingError("")
      const res = await adminAPI.getPendingRestaurantOffers({ limit: 100 })
      const list = res?.data?.data?.offers || res?.data?.offers || []
      setPendingOffers(list)
    } catch (err) {
      setPendingError(err?.response?.data?.message || "Failed to load pending coupons")
    } finally {
      setLoadingPending(false)
    }
  }, [])

  useEffect(() => {
    fetchOffers()
    fetchPendingOffers()
  }, [fetchOffers, fetchPendingOffers])

  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        const response = await adminAPI.getRestaurants({ page: 1, limit: 200 })
        if (response?.data?.success) {
          const list = response?.data?.data?.restaurants || []
          // Backend returns `restaurantName`; normalize to `name` for this dropdown without affecting other pages.
          const normalized = Array.isArray(list)
            ? list.map((r) => ({
              ...r,
              name: r?.name || r?.restaurantName || "",
            }))
            : []
          setRestaurants(normalized)
        }
      } catch (err) {
        debugError("Error fetching restaurants:", err)
      }
    }

    fetchRestaurants()
  }, [])

  const todayYMD = () => {
    const d = new Date()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${d.getFullYear()}-${m}-${day}`
  }

  const validateForm = (draft) => {
    const e = {}
    const f = draft || formData
    const pct = f.discountType === "percentage"
    const value = Number(f.discountValue)
    if (!String(f.couponCode || "").trim()) e.couponCode = "Coupon code is required"
    if (!Number.isFinite(value) || value <= 0) e.discountValue = "Discount must be greater than 0"
    if (pct && (f.maxDiscount === "" || f.maxDiscount === null || f.maxDiscount === undefined)) {
      e.maxDiscount = "Max discount is required for percentage coupons"
    }
    if (f.minOrderValue !== "" && Number(f.minOrderValue) <= 0) e.minOrderValue = "Min order must be greater than 0"
    if (pct && f.maxDiscount !== "" && Number(f.maxDiscount) <= 0) e.maxDiscount = "Max discount must be greater than 0"
    if (f.usageLimit !== "" && Number(f.usageLimit) < 1) e.usageLimit = "Usage limit must be at least 1"
    if (f.perUserLimit !== "" && Number(f.perUserLimit) < 1) e.perUserLimit = "Per user limit must be at least 1"
    if (f.usageLimit !== "" && f.perUserLimit !== "" && Number(f.usageLimit) < Number(f.perUserLimit)) {
      e.usageLimit = "Usage limit cannot be less than per user limit"
    }
    const start = f.startDate ? new Date(`${f.startDate}T00:00:00`) : null
    const end = f.endDate ? new Date(`${f.endDate}T00:00:00`) : null
    const now = new Date()
    if (end && end < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      e.endDate = "End date cannot be in the past"
    }
    if (start && end && start > end) {
      e.startDate = "Start date must be before end date"
      e.endDate = "End date must be after start date"
    }
    setErrors(e)
    return { valid: Object.keys(e).length === 0, e }
  }

  const handleFormChange = (field, rawValue) => {
    let value = rawValue
    if (field === "couponCode") {
      value = String(value || "").toUpperCase()
    }
    if (field === "discountType") {
      // When switching to flat-price, clear and disable maxDiscount
      if (value === "flat-price") {
        setFormData((prev) => {
          const next = { ...prev, discountType: value, maxDiscount: "" }
          validateForm(next)
          return next
        })
        if (submitError) setSubmitError("")
        if (submitSuccess) setSubmitSuccess("")
        return
      }
    }
    const next = { ...formData, [field]: value }
    // Date constraints
    if (field === "startDate" && next.endDate) {
      // Ensure startDate <= endDate
      const s = next.startDate ? new Date(`${next.startDate}T00:00:00`) : null
      const e = new Date(`${next.endDate}T00:00:00`)
      if (s && s > e) {
        // keep but will show error
      }
    }
    if (field === "endDate" && next.startDate) {
      const s = new Date(`${next.startDate}T00:00:00`)
      const e = next.endDate ? new Date(`${next.endDate}T00:00:00`) : null
      if (e && e < s) {
        // keep but will show error
      }
    }
    setFormData(next)
    validateForm(next)
    if (submitError) {
      setSubmitError("")
    }
    if (submitSuccess) {
      setSubmitSuccess("")
    }
  }

  const resetForm = () => {
    setFormData({
      couponCode: "",
      discountType: "percentage",
      discountValue: "",
      customerScope: "all",
      restaurantScope: "all",
      restaurantId: "",
      endDate: "",
      startDate: "",
      minOrderValue: "",
      maxDiscount: "",
      usageLimit: "",
      perUserLimit: "",
    })
    setEditingOfferId(null)
    setErrors({})
  }

  const handleEditClick = (offer) => {
    setIsAddOpen(true)
    setViewOnly(false)
    setSubmitError("")
    setSubmitSuccess("")
    try {
      const isFlat = offer.discountType === "flat-price"
      const discountValueRaw = isFlat
        ? (offer.discountValue ?? (Number(offer.originalPrice || 0) - Number(offer.discountedPrice || 0)))
        : (offer.discountPercentage ?? offer.discountValue ?? 0)
      const discountValue = Number(discountValueRaw)

      const startIso = offer.startDate ? new Date(offer.startDate) : null
      const endIso = offer.endDate ? new Date(offer.endDate) : null
      const safeStart = startIso && !Number.isNaN(startIso.getTime()) ? startIso.toISOString().split("T")[0] : ""
      const safeEnd = endIso && !Number.isNaN(endIso.getTime()) ? endIso.toISOString().split("T")[0] : ""

      setFormData({
        couponCode: offer.couponCode || "",
        discountType: offer.discountType || "percentage",
        discountValue: Number.isFinite(discountValue) ? discountValue : "",
        customerScope: offer.customerGroup === "new" ? "first-time" : (offer.customerScope || "all"),
        restaurantScope: offer.restaurantScope || "all",
        restaurantId: offer.restaurantId || "",
        endDate: safeEnd,
        startDate: safeStart,
        minOrderValue: offer.minOrderValue ?? "",
        maxDiscount: offer.maxDiscount ?? "",
        usageLimit: offer.usageLimit ?? "",
        perUserLimit: offer.perUserLimit ?? "",
      })
      setEditingOfferId(offer.offerId || offer._id)
    } catch (err) {
      debugError("Edit failed:", err)
      setSubmitError(err?.message || "Unable to open edit form")
    } finally {
      if (formTopRef.current) {
        formTopRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" })
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (viewOnly) {
      setSubmitError("View mode only. Close the form to continue.")
      return
    }
    setSubmitError("")
    setSubmitSuccess("")
    const { valid } = validateForm()
    if (!valid) {
      setSubmitError("Please fix the highlighted errors")
      return
    }

    if (!formData.couponCode.trim()) {
      setSubmitError("Coupon code is required")
      return
    }

    const parsedDiscountValue = Number(formData.discountValue)
    if (!Number.isFinite(parsedDiscountValue) || parsedDiscountValue <= 0) {
      setSubmitError("Discount value must be greater than 0")
      return
    }

    if (formData.restaurantScope === "selected" && !formData.restaurantId) {
      setSubmitError("Please select a restaurant")
      return
    }

    try {
      setIsSubmitting(true)
      const payload = {
        couponCode: formData.couponCode.trim(),
        discountType: formData.discountType,
        discountValue: parsedDiscountValue,
        customerScope: formData.customerScope,
        restaurantScope: formData.restaurantScope,
        restaurantId: formData.restaurantScope === "selected" ? formData.restaurantId : undefined,
        endDate: formData.endDate || undefined,
        startDate: formData.startDate || undefined,
        minOrderValue: formData.minOrderValue !== "" ? Number(formData.minOrderValue) : undefined,
        maxDiscount: formData.discountType === "percentage" && formData.maxDiscount !== "" ? Number(formData.maxDiscount) : undefined,
        usageLimit: formData.usageLimit !== "" ? Number(formData.usageLimit) : undefined,
        perUserLimit: formData.perUserLimit !== "" ? Number(formData.perUserLimit) : undefined,
      }

      if (editingOfferId) {
        await adminAPI.updateAdminOffer(editingOfferId, payload)
        setSubmitSuccess("Coupon updated successfully")
      } else {
        await adminAPI.createAdminOffer(payload)
        setSubmitSuccess("Coupon created successfully")
      }

      resetForm()
      setIsAddOpen(false)
      await fetchOffers()
    } catch (err) {
      debugError("Error saving coupon:", err)
      setSubmitError(err?.response?.data?.message || "Failed to save coupon")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleShowInCart = async (offerId, itemId, currentValue) => {
    const key = `${offerId}-${itemId}`
    try {
      setUpdatingCartVisibility((prev) => ({ ...prev, [key]: true }))
      const nextValue = !currentValue
      await adminAPI.updateAdminOfferCartVisibility(offerId, itemId, nextValue)
      setOffers((prev) =>
        prev.map((offer) =>
          offer.offerId === offerId && offer.dishId === itemId
            ? { ...offer, showInCart: nextValue }
            : offer,
        ),
      )
    } catch (err) {
      debugError("Error updating cart visibility:", err)
    } finally {
      setUpdatingCartVisibility((prev) => ({ ...prev, [key]: false }))
    }
  }

  const handleDeleteOffer = async (offerId) => {
    if (!offerId) return
    if (deletingOffer[offerId]) return
    try {
      setDeletingOffer((prev) => ({ ...prev, [offerId]: true }))
      await adminAPI.deleteAdminOffer(offerId)
      setOffers((prev) => prev.filter((o) => o.offerId !== offerId))
    } catch (err) {
      debugError("Error deleting offer:", err)
    } finally {
      setDeletingOffer((prev) => ({ ...prev, [offerId]: false }))
    }
  }

  const handleApprovePending = async (offerId) => {
    if (!offerId || processingPending[offerId]) return
    try {
      setProcessingPending((prev) => ({ ...prev, [offerId]: true }))
      await adminAPI.approveRestaurantOffer(offerId)
      setPendingOffers((prev) => prev.filter((p) => String(p._id) !== String(offerId)))
      await fetchOffers()
    } catch (err) {
      setPendingError(err?.response?.data?.message || "Failed to approve coupon")
    } finally {
      setProcessingPending((prev) => ({ ...prev, [offerId]: false }))
    }
  }

  const handleApproveOfferPending = async (offerId) => {
    if (!offerId || processingPending[offerId]) return
    try {
      setProcessingPending((prev) => ({ ...prev, [offerId]: true }))
      await adminAPI.approveRestaurantProductOffer(offerId)
      setPendingOffers((prev) => prev.filter((p) => String(p._id) !== String(offerId)))
    } catch (err) {
      setPendingError(err?.response?.data?.message || "Failed to approve offer")
    } finally {
      setProcessingPending((prev) => ({ ...prev, [offerId]: false }))
    }
  }

  const handleRejectOfferPending = async (offerId) => {
    if (!offerId || processingPending[offerId]) return
    const reason = window.prompt("Enter rejection reason", "") || ""
    try {
      setProcessingPending((prev) => ({ ...prev, [offerId]: true }))
      await adminAPI.rejectRestaurantProductOffer(offerId, reason)
      setPendingOffers((prev) => prev.filter((p) => String(p._id) !== String(offerId)))
    } catch (err) {
      setPendingError(err?.response?.data?.message || "Failed to reject offer")
    } finally {
      setProcessingPending((prev) => ({ ...prev, [offerId]: false }))
    }
  }

  const handleViewOfferPending = (offer) => {
    if (!offer) return
    setViewOfferModal(offer)
  }

  const handleViewPending = (offer) => {
    try {
      setFormData({
        couponCode: offer.couponCode || "",
        discountType: offer.discountType || "percentage",
        discountValue: offer.discountValue != null ? Number(offer.discountValue) : "",
        customerScope: offer.customerScope || "all",
        restaurantScope: offer.restaurantScope || "selected",
        restaurantId: offer.restaurantId || "",
        endDate: offer.endDate ? new Date(offer.endDate).toISOString().split("T")[0] : "",
        startDate: offer.startDate ? new Date(offer.startDate).toISOString().split("T")[0] : "",
        minOrderValue: offer.minOrderValue ?? "",
        maxDiscount: offer.maxDiscount ?? "",
        usageLimit: offer.usageLimit ?? "",
        perUserLimit: offer.perUserLimit ?? "",
      })
      setEditingOfferId(null)
      setViewOnly(true)
      setIsAddOpen(true)
      setSubmitError("")
      setSubmitSuccess("")
      if (formTopRef.current) {
        formTopRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" })
      }
    } catch (err) {
      setSubmitError(err?.message || "Unable to open view")
    }
  }

  const handleRejectPending = async (offerId) => {
    if (!offerId || processingPending[offerId]) return
    const reason = window.prompt("Enter rejection reason", "") || ""
    try {
      setProcessingPending((prev) => ({ ...prev, [offerId]: true }))
      await adminAPI.rejectRestaurantOffer(offerId, reason)
      setPendingOffers((prev) => prev.filter((p) => String(p._id) !== String(offerId)))
    } catch (err) {
      setPendingError(err?.response?.data?.message || "Failed to reject coupon")
    } finally {
      setProcessingPending((prev) => ({ ...prev, [offerId]: false }))
    }
  }

  // Filter offers based on search query
  const filteredOffers = useMemo(() => {
    if (!searchQuery.trim()) {
      return offers
    }
    
    const query = searchQuery.toLowerCase().trim()
    return offers.filter(offer =>
      offer.restaurantName?.toLowerCase().includes(query) ||
      offer.dishName?.toLowerCase().includes(query) ||
      offer.couponCode?.toLowerCase().includes(query)
    )
  }, [offers, searchQuery])

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
            <h1 className="text-2xl font-bold text-slate-900">
              {isOffersOnly ? "Restaurant Offers" : "Coupons"}
            </h1>
            {!isOffersOnly && (
              <button
                type="button"
                onClick={() => {
                  if (isAddOpen) {
                    resetForm()
                  }
                  setIsAddOpen((prev) => !prev)
                  setSubmitError("")
                  setSubmitSuccess("")
                }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                  isAddOpen 
                    ? "bg-slate-100 text-slate-700 hover:bg-slate-200" 
                    : "bg-brand-600 text-white hover:bg-brand-700"
                }`}
              >
                {isAddOpen ? (
                  <>
                    <X className="w-4 h-4" />
                    Cancel
                  </>
                ) : (
                  "Add Coupon"
                )}
              </button>
            )}
          </div>

      {isAddOpen && !isOffersOnly && (
        <form
          ref={formTopRef}
          onSubmit={handleSubmit}
          className="border border-slate-200 rounded-xl p-4 mb-5 bg-slate-50 relative"
        >
              <h3 className="text-base font-semibold text-slate-900 mb-3">
                {editingOfferId ? "Edit Coupon" : "Create Coupon"}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Coupon Code</label>
                  <input
                    type="text"
                    value={formData.couponCode}
                    onChange={(e) => handleFormChange("couponCode", e.target.value)}
                    placeholder="e.g. NEWUSER50"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Discount Type</label>
                  <select
                    value={formData.discountType}
                    onChange={(e) => handleFormChange("discountType", e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  >
                    <option value="percentage">Percentage</option>
                    <option value="flat-price">Flat Amount</option>
                  </select>
                </div>

                <div title={formData.discountType === "flat-price" ? "Max discount is not applicable for flat coupons" : ""}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {formData.discountType === "percentage" ? "Discount (%)" : "Discount Amount"}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={formData.discountValue}
                    onChange={(e) => handleFormChange("discountValue", e.target.value)}
                    placeholder={formData.discountType === "percentage" ? "e.g. 20" : "e.g. 100"}
                    className={`w-full px-3 py-2.5 text-sm rounded-lg border ${errors.discountValue ? "border-red-500" : "border-slate-300"} bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500`}
                  />
                  {errors.discountValue && <p className="mt-1 text-xs text-red-600">{errors.discountValue}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Customer Scope</label>
                  <select
                    value={formData.customerScope}
                    onChange={(e) => handleFormChange("customerScope", e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  >
                    <option value="all">All Users</option>
                    <option value="first-time">First-time Users</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Restaurant Scope</label>
                  <select
                    value={formData.restaurantScope}
                    onChange={(e) => handleFormChange("restaurantScope", e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  >
                    <option value="all">All Restaurants</option>
                    <option value="selected">Selected Restaurant</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Expiry Date (Optional)</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => handleFormChange("endDate", e.target.value)}
                  min={formData.startDate || todayYMD()}
                  className={`w-full px-3 py-2.5 text-sm rounded-lg border ${errors.endDate ? "border-red-500" : "border-slate-300"} bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500`}
                  />
                {errors.endDate && <p className="mt-1 text-xs text-red-600">{errors.endDate}</p>}
                </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Start Date (Optional)</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => handleFormChange("startDate", e.target.value)}
                  min={todayYMD()}
                  className={`w-full px-3 py-2.5 text-sm rounded-lg border ${errors.startDate ? "border-red-500" : "border-slate-300"} bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500`}
                />
                {errors.startDate && <p className="mt-1 text-xs text-red-600">{errors.startDate}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Min Order Value (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.minOrderValue}
                  onChange={(e) => handleFormChange("minOrderValue", e.target.value)}
                  placeholder="e.g. 199"
                  className={`w-full px-3 py-2.5 text-sm rounded-lg border ${errors.minOrderValue ? "border-red-500" : "border-slate-300"} bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500`}
                />
                {errors.minOrderValue && <p className="mt-1 text-xs text-red-600">{errors.minOrderValue}</p>}
              </div>

                <div title={formData.discountType === "flat-price" ? "Max discount is not applicable for flat coupons" : ""}>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Max Discount (₹, optional)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                    value={formData.maxDiscount}
                    onChange={(e) => handleFormChange("maxDiscount", e.target.value)}
                  placeholder="e.g. 100"
                    disabled={formData.discountType === "flat-price"}
                    className={`w-full px-3 py-2.5 text-sm rounded-lg border ${errors.maxDiscount ? "border-red-500" : "border-slate-300"} bg-white disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500`}
                />
                  {formData.discountType === "percentage" && errors.maxDiscount && <p className="mt-1 text-xs text-red-600">{errors.maxDiscount}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Usage Limit (global)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.usageLimit}
                  onChange={(e) => handleFormChange("usageLimit", e.target.value)}
                  placeholder="e.g. 1000"
                  className={`w-full px-3 py-2.5 text-sm rounded-lg border ${errors.usageLimit ? "border-red-500" : "border-slate-300"} bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500`}
                />
                {errors.usageLimit && <p className="mt-1 text-xs text-red-600">{errors.usageLimit}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Per User Limit</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.perUserLimit}
                  onChange={(e) => handleFormChange("perUserLimit", e.target.value)}
                  placeholder="e.g. 1"
                  className={`w-full px-3 py-2.5 text-sm rounded-lg border ${errors.perUserLimit ? "border-red-500" : "border-slate-300"} bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500`}
                />
                {errors.perUserLimit && <p className="mt-1 text-xs text-red-600">{errors.perUserLimit}</p>}
              </div>

                {formData.restaurantScope === "selected" && (
                  <div className="md:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Select Restaurant</label>
                    <select
                      value={formData.restaurantId}
                      onChange={(e) => handleFormChange("restaurantId", e.target.value)}
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    >
                      <option value="">Choose a restaurant</option>
                      {restaurants.map((restaurant) => (
                        <option key={restaurant._id} value={restaurant._id}>
                          {restaurant.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {submitError && (
                <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm animate-shake">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                  {submitError}
                </div>
              )}

          {submitSuccess && (
            <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-emerald-700 text-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              {submitSuccess}
            </div>
          )}

          <div className="mt-4">
            <button
              type="submit"
              disabled={viewOnly || isSubmitting || Object.keys(errors).length > 0}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {viewOnly
                ? "Close view mode to edit"
                : isSubmitting
                ? editingOfferId
                  ? "Updating..."
                  : "Creating..."
                : editingOfferId
                ? "Update Coupon"
                : "Create Coupon"}
            </button>
          </div>
          </form>
        )}

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder={isOffersOnly ? "Search by restaurant name or product..." : "Search by restaurant name, dish name, or coupon code..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
        </div>

        {/* Pending approvals */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4 gap-2">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {isOffersOnly ? "Pending Restaurant Offers" : "Pending Restaurant Coupons"}
              </h2>
              <p className="text-xs text-slate-500">
                {isOffersOnly
                  ? "Approve or reject offers submitted by restaurants."
                  : "Approve or reject coupons submitted by restaurants."}
              </p>
            </div>
            <button
              type="button"
              onClick={fetchPendingOffers}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
              disabled={loadingPending}
            >
              Refresh
            </button>
          </div>

        {loadingPending ? (
          <div className="flex items-center gap-2 text-slate-600 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading pending {isOffersOnly ? "offers" : "coupons"}...
          </div>
        ) : pendingError ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{pendingError}</div>
        ) : pendingOffers.length === 0 ? (
          <p className="text-sm text-slate-500">No pending {isOffersOnly ? "offers" : "coupons"} right now.</p>
        ) : (
          <div className="space-y-3">
            {pendingOffers.map((offer) => (
              <div
                key={offer._id}
                className="border border-slate-200 rounded-lg p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-slate-900">
                      {isOffersOnly ? (offer.title || "Offer") : (offer.couponCode || "Coupon")}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">pending</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    {offer.restaurantName || "Selected restaurant"} • {offer.discountType === "flat-price"
                      ? `₹${offer.discountValue} OFF`
                      : `${offer.discountValue}% OFF${offer.maxDiscount ? ` (up to ₹${offer.maxDiscount})` : ""}`}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Created: {offer.createdAt ? new Date(offer.createdAt).toLocaleString() : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => (isOffersOnly ? handleViewOfferPending(offer) : handleViewPending(offer))}
                    className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                    disabled={processingPending[offer._id]}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => (isOffersOnly ? handleApproveOfferPending(offer._id) : handleApprovePending(offer._id))}
                    disabled={processingPending[offer._id]}
                    className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 disabled:opacity-60"
                  >
                    {processingPending[offer._id] ? "Approving..." : "Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => (isOffersOnly ? handleRejectOfferPending(offer._id) : handleRejectPending(offer._id))}
                    disabled={processingPending[offer._id]}
                    className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm font-semibold hover:bg-red-100 disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        </div>

        {/* Offer view modal */}
        {viewOfferModal && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
            onClick={() => setViewOfferModal(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 relative border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="absolute right-4 top-4 text-slate-500 hover:text-slate-700"
                onClick={() => setViewOfferModal(null)}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="text-xl font-bold text-slate-900 mb-4">Offer Details</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">Title</p>
                  <p className="font-semibold text-slate-900">{viewOfferModal.title || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">Restaurant</p>
                  <p className="font-semibold text-slate-900">{viewOfferModal.restaurantName || "Selected restaurant"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">Product</p>
                  <p className="font-semibold text-slate-900">{viewOfferModal.productName || viewOfferModal.dishName || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">Discount</p>
                  <p className="font-semibold text-slate-900">
                    {viewOfferModal.discountType === "flat-price"
                      ? `₹${viewOfferModal.discountValue || 0} OFF`
                      : `${viewOfferModal.discountValue || 0}% OFF${
                          viewOfferModal.maxDiscount ? ` (up to ₹${viewOfferModal.maxDiscount})` : ""
                        }`}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">Usage Limit (global)</p>
                  <p className="font-semibold text-slate-900">{viewOfferModal.usageLimit ?? "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">Per User Limit</p>
                  <p className="font-semibold text-slate-900">{viewOfferModal.perUserLimit ?? "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">Start Date</p>
                  <p className="font-semibold text-slate-900">
                    {viewOfferModal.startDate ? new Date(viewOfferModal.startDate).toLocaleDateString() : "Starts now"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">End Date</p>
                  <p className="font-semibold text-slate-900">
                    {viewOfferModal.endDate ? new Date(viewOfferModal.endDate).toLocaleDateString() : "No expiry"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">Approval Status</p>
                  <p className="font-semibold text-slate-900 capitalize">{viewOfferModal.approvalStatus || "pending"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">Created At</p>
                  <p className="font-semibold text-slate-900">
                    {viewOfferModal.createdAt ? new Date(viewOfferModal.createdAt).toLocaleString() : "—"}
                  </p>
                </div>
              </div>

              {viewOfferModal.rejectionReason && (
                <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  <p className="font-semibold">Reject reason</p>
                  <p>{viewOfferModal.rejectionReason}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {!isOffersOnly && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900">
              Offers List
            </h2>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
              {filteredOffers.length} {filteredOffers.length === 1 ? 'offer' : 'offers'}
            </span>
          </div>

          {loading ? (
            <div className="text-center py-20">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
              <p className="text-sm text-slate-500 mt-4">Loading offers...</p>
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-lg font-semibold text-red-600 mb-1">Error</p>
              <p className="text-sm text-slate-500">{error}</p>
            </div>
          ) : filteredOffers.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-lg font-semibold text-slate-700 mb-1">No Offers Found</p>
              <p className="text-sm text-slate-500">
                {searchQuery ? "No offers match your search criteria" : "No offers have been created yet"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">SI</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">Restaurant</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">Dish</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">Coupon Code</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">Customer Scope</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">Discount</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">Price</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">Min Order</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">Usage</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">Show In Cart</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">Valid Until</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filteredOffers.map((offer) => (
                    <tr key={`${offer.offerId}-${offer.dishId}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-700">{offer.sl}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-900">
                          {offer.restaurantScope === "all" || offer.restaurantName === "All Restaurants" ? "All Restaurants" : offer.restaurantName}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          {offer.dishName}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-mono font-semibold text-brand-600 bg-brand-50 px-2 py-1 rounded whitespace-nowrap">
                          {offer.couponCode}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          offer.customerGroup === "new"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-slate-100 text-slate-700"
                        }`}>
                          {offer.customerGroup === "new" ? "First-time Users" : "All Users"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700 whitespace-nowrap">
                          {offer.discountType === 'flat-price'
                            ? `\u20B9${offer.originalPrice - offer.discountedPrice} OFF`
                            : `${offer.discountPercentage}% OFF${Number(offer.maxDiscount) ? ` (up to \u20B9${Number(offer.maxDiscount)})` : ""}`}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700">
                          {offer.dishId === "all"
                            ? (Number(offer.minOrderValue) ? `Min \u20B9${Number(offer.minOrderValue)}` : "All Items")
                            : (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400 line-through">{"\u20B9"}{offer.originalPrice}</span>
                                <span className="text-sm font-semibold text-green-600">{"\u20B9"}{offer.discountedPrice}</span>
                              </div>
                            )}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700">
                          {Number(offer.minOrderValue) ? `\u20B9${Number(offer.minOrderValue)}` : "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700">
                          {`${Number(offer.usedCount || 0)} / ${Number(offer.usageLimit || 0) > 0 ? Number(offer.usageLimit) : "∞"}`}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {(() => {
                          const expired = offer.endDate ? (new Date(offer.endDate).getTime() < new Date(new Date().toDateString()).getTime()) : false
                          const status = expired ? 'expired' : (offer.status || 'inactive')
                          const cls =
                            status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : status === 'paused'
                              ? 'bg-orange-100 text-orange-700'
                              : status === 'expired'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                          return (
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}>
                              {status}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleShowInCart(offer.offerId, offer.dishId, offer.showInCart !== false)}
                          disabled={!!updatingCartVisibility[`${offer.offerId}-${offer.dishId}`]}
                          className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors ${
                            offer.showInCart !== false ? "bg-green-600" : "bg-slate-300"
                          } disabled:opacity-60`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              offer.showInCart !== false ? "translate-x-7" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700 whitespace-nowrap">
                          {offer.endDate
                            ? (() => {
                                const d = new Date(offer.endDate)
                                const dd = String(d.getDate()).padStart(2, '0')
                                const month = d.toLocaleString('en-US', { month: 'short' })
                                const yyyy = d.getFullYear()
                                return `${dd} ${month} ${yyyy}`
                              })()
                            : 'No expiry'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditClick(offer)}
                            className="p-1.5 rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOffer(offer.offerId)}
                            disabled={!!deletingOffer[offer.offerId]}
                            className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-60"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  )
}
