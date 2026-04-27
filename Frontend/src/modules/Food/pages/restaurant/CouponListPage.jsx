import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, MoreVertical, Plus, CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Card, CardContent } from "@food/components/ui/card"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import { formatCurrency } from "@food/utils/currency"
import { restaurantAPI } from "@food/api"
import BRAND_THEME from "@/config/brandTheme"

const badge = (approvalStatus) => {
  const status = approvalStatus || "approved"
  if (status === "approved") return { label: "Approved", className: "bg-green-100 text-green-700" }
  if (status === "pending") return { label: "Pending", className: "bg-amber-100 text-amber-700" }
  return { label: "Rejected", className: "bg-red-100 text-red-700" }
}

export default function CouponListPage() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [openMenuId, setOpenMenuId] = useState(null)
  const [coupons, setCoupons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState({})
  const brandPrimary = BRAND_THEME.colors.brand.primary

  const fetchCoupons = async () => {
    try {
      setLoading(true)
      setError("")
      const res = await restaurantAPI.getCoupons()
      const list = res?.data?.data?.offers || res?.data?.offers || []
      setCoupons(list)
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load coupons")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCoupons()
  }, [])

  const handleDelete = async (id) => {
    if (!id || deleting[id]) return
    try {
      setDeleting((prev) => ({ ...prev, [id]: true }))
      await restaurantAPI.deleteCoupon(id)
      setCoupons((prev) => prev.filter((c) => String(c.id || c._id) !== String(id)))
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to delete coupon")
    } finally {
      setDeleting((prev) => ({ ...prev, [id]: false }))
    }
  }

  const renderAmount = (coupon) => {
    const value = Number(coupon.discountValue || 0)
    if (coupon.discountType === "flat-price") {
      return `${formatCurrency(value)} OFF`
    }
    const max = coupon.maxDiscount ? ` (up to ${formatCurrency(Number(coupon.maxDiscount))})` : ""
    return `${value}% OFF${max}`
  }

  return (
    <div className="min-h-screen overflow-x-hidden pb-24 md:pb-6" style={{ backgroundColor: BRAND_THEME.tokens.app.sectionAltBackground || "#F8FAFC" }}>
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50 flex items-center gap-3 shadow-sm">
        <button onClick={goBack} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Coupon List</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-600 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading coupons...
          </div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">No coupons yet. Create one to get started.</p>
          </div>
        ) : (
          coupons.map((coupon, index) => {
            const status = badge(coupon.approvalStatus)
            const id = String(coupon.id || coupon._id)
            const canDelete = !!coupon.createdByRestaurantId
            const isFinalized = (coupon.approvalStatus || "").toLowerCase() === "approved" || (coupon.approvalStatus || "").toLowerCase() === "rejected"
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="relative"
              >
                <Card className="bg-white shadow-md border border-gray-200 overflow-hidden relative">
                  <CardContent className="p-0">
                    <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                      {(() => {
                        let bg = BRAND_THEME.colors.brand.primarySoft
                        let color = BRAND_THEME.colors.brand.primaryDark
                        if (status.label === "Approved") {
                          bg = BRAND_THEME.colors.semantic.successSoft
                          color = BRAND_THEME.colors.semantic.successDark
                        } else if (status.label === "Rejected") {
                          bg = "#DC2626"
                          color = "#FFFFFF"
                        }
                        return (
                          <span
                            className="px-2.5 py-1 rounded-full text-xs font-semibold"
                            style={{ backgroundColor: bg, color }}
                          >
                            {status.label}
                          </span>
                        )
                      })()}
                      <div className="relative" data-menu-id={id}>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuId(openMenuId === id ? null : id)
                          }}
                          className="p-1.5 bg-orange-100 hover:bg-orange-200 rounded transition-colors"
                        >
                          <MoreVertical className="w-4 h-4 text-[#ff8100]" />
                        </motion.button>

                        <AnimatePresence>
                          {openMenuId === id && (
                            <>
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-40"
                                onClick={() => setOpenMenuId(null)}
                              />
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                                className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-50 min-w-[180px]"
                              >
                                <button
                                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    navigate(`/restaurant/coupon/${id}/edit`)
                                  }}
                                >
                                  Edit Coupon
                                </button>
                                {canDelete && (
                                  <button
                                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                                    disabled={deleting[id]}
                                    onClick={() => {
                                      setOpenMenuId(null)
                                      handleDelete(id)
                                    }}
                                  >
                                    {deleting[id] ? "Deleting..." : "Delete"}
                                  </button>
                                )}
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    <div className="flex">
                      <div
                        className="flex-1 p-4 flex flex-col gap-1 rounded-r-lg"
                        style={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft }}
                      >
                        <div className="text-xs uppercase text-gray-500 tracking-wide">{coupon.couponCode}</div>
                        <div className="text-lg font-semibold text-gray-900 leading-tight">{renderAmount(coupon)}</div>
                        <div className="text-sm text-gray-600">For your restaurant</div>
                      </div>
                      <div className="flex-1 p-4 space-y-2">
                        <div className="text-sm font-semibold text-gray-900">
                          {coupon.couponCode || "—"}
                        </div>
                        <div className="text-xs text-gray-600">
                          {coupon.startDate ? new Date(coupon.startDate).toLocaleDateString() : "Starts now"} 
                          {" to "}
                          {coupon.endDate ? new Date(coupon.endDate).toLocaleDateString() : "No expiry"}
                        </div>
                        <div className="text-xs text-gray-700">
                          Min order: {coupon.minOrderValue ? formatCurrency(coupon.minOrderValue) : "No min"}
                        </div>
                        {coupon.approvalStatus === "rejected" && coupon.rejectionReason ? (
                          <div className="text-xs text-red-600">
                            Reason: {coupon.rejectionReason}
                          </div>
                        ) : null}
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <Clock className="w-4 h-4" />
                          Usage: {coupon.usedCount || 0}{coupon.usageLimit ? ` / ${coupon.usageLimit}` : " (unlimited)"}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })
        )}
      </div>

      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => navigate("/restaurant/coupon/new")}
        className="fixed bottom-20 md:bottom-6 right-4 md:right-6 w-14 h-14 text-white rounded-full shadow-lg flex items-center justify-center z-40 transition-colors"
        style={{ backgroundColor: brandPrimary }}
      >
        <Plus className="w-6 h-6" />
      </motion.button>

      <BottomNavOrders />
    </div>
  )
}
