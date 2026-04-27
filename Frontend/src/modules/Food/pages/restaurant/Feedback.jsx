import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Bell, HelpCircle, Loader2, Menu, Search, SlidersHorizontal, Star, X } from "lucide-react"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import { restaurantAPI } from "@food/api"
import BRAND_THEME from "@/config/brandTheme"

const tabs = [
  { id: "complaints", label: "Complaints" },
  { id: "reviews", label: "Reviews" },
]

const REVIEW_SORT_OPTIONS = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "bestRated", label: "Best Rated" },
  { id: "worstRated", label: "Worst Rated" },
]

const COMPLAINT_STATUS_OPTIONS = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
]

const normalizeOrderStatus = (order) =>
  String(order?.status || order?.orderStatus || "").toLowerCase()

const normalizeRating = (value) => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  if (parsed <= 0) return null
  return Math.min(5, Math.round(parsed * 10) / 10)
}

const extractReviewRating = (order) =>
  normalizeRating(
    order?.review?.rating ??
      order?.ratings?.restaurant?.rating ??
      order?.feedback?.rating ??
      order?.rating
  )

const extractReviewText = (order) => {
  const raw =
    order?.review?.comment ??
    order?.review?.text ??
    order?.ratings?.restaurant?.comment ??
    order?.feedback?.comment ??
    order?.feedback?.text ??
    ""
  const normalized = String(raw || "").trim()
  return normalized || "No review text"
}

const toComparableId = (value) =>
  String(value?._id || value || "").trim()

export default function Feedback() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get("tab")
  const [activeTab, setActiveTab] = useState(tabFromUrl === "complaints" ? "complaints" : "reviews")

  const [restaurantData, setRestaurantData] = useState(null)
  const [isLoadingRestaurant, setIsLoadingRestaurant] = useState(true)

  const [reviews, setReviews] = useState([])
  const [complaints, setComplaints] = useState([])
  const [isLoadingReviews, setIsLoadingReviews] = useState(true)
  const [isLoadingComplaints, setIsLoadingComplaints] = useState(false)

  const [reviewsSearchQuery, setReviewsSearchQuery] = useState("")
  const [complaintsSearchQuery, setComplaintsSearchQuery] = useState("")

  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [reviewsFilterValues, setReviewsFilterValues] = useState({
    sortBy: "newest",
    rating: "all",
  })

  const [isComplaintsFilterOpen, setIsComplaintsFilterOpen] = useState(false)
  const [complaintsFilterValues, setComplaintsFilterValues] = useState({
    status: "all",
    issueType: "all",
  })

  const touchStartX = useRef(0)
  const touchEndX = useRef(0)
  const touchStartY = useRef(0)
  const isSwiping = useRef(false)

  useEffect(() => {
    if (tabFromUrl === "complaints") {
      setActiveTab("complaints")
    } else {
      setActiveTab("reviews")
    }
  }, [tabFromUrl])

  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setIsLoadingRestaurant(true)
        const response = await restaurantAPI.getCurrentRestaurant()
        if (response.data?.success && response.data.data?.restaurant) {
          setRestaurantData(response.data.data.restaurant)
        }
      } finally {
        setIsLoadingRestaurant(false)
      }
    }

    fetchRestaurantData()
  }, [])

  useEffect(() => {
    const fetchComplaints = async () => {
      if (activeTab !== "complaints") return

      try {
        setIsLoadingComplaints(true)
        const response = await restaurantAPI.getComplaints({})
        if (response?.data?.success && response.data.data?.complaints) {
          setComplaints(response.data.data.complaints)
        } else {
          setComplaints([])
        }
      } catch {
        setComplaints([])
      } finally {
        setIsLoadingComplaints(false)
      }
    }

    fetchComplaints()
  }, [activeTab])

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        setIsLoadingReviews(true)
        let allOrders = []
        let page = 1
        let hasMore = true
        const limit = 1000
        const maxPages = 50

        while (hasMore && page <= maxPages) {
          try {
            const response = await restaurantAPI.getOrders({
              page,
              limit,
              status: "delivered",
            })

            if (response.data?.success && response.data.data?.orders) {
              const orders = response.data.data.orders
              allOrders = [...allOrders, ...orders]
              const totalPages = response.data.data.meta?.totalPages || response.data.data.totalPages || 1
              if (orders.length < limit || (totalPages > 0 && page >= totalPages)) {
                hasMore = false
              } else {
                page += 1
              }
            } else {
              hasMore = false
            }
          } catch {
            hasMore = false
          }
        }

        const transformedReviews = allOrders
          .filter((order) => normalizeOrderStatus(order) === "delivered")
          .map((order, index) => {
            const orderDate = new Date(order.createdAt || order.deliveredAt || Date.now())
            const userName = order.userId?.name || order.customerName || "Customer"
            const userImage = order.userId?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random`
            const rating = extractReviewRating(order)
            const reviewText = extractReviewText(order)
            const userOrdersCount = allOrders.filter((o) => toComparableId(o.userId) === toComparableId(order.userId)).length

            return {
              id: order._id || order.orderId || `review-${index}`,
              orderNumber: order.orderId || order.orderNumber || String(index),
              userName,
              userImage,
              ordersCount: userOrdersCount,
              rating,
              dateISO: orderDate.toISOString(),
              dateLabel: orderDate.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
              reviewText,
            }
          })
          .filter((review) => review.rating !== null || (review.reviewText && review.reviewText !== "No review text"))

        setReviews(transformedReviews)
      } catch {
        setReviews([])
      } finally {
        setIsLoadingReviews(false)
      }
    }

    if (!isLoadingRestaurant) {
      fetchReviews()
    }
  }, [isLoadingRestaurant, restaurantData])

  const complaintIssueTypeOptions = useMemo(() => {
    const values = complaints
      .map((item) => String(item?.issueType || "").trim())
      .filter(Boolean)
    return ["all", ...Array.from(new Set(values))]
  }, [complaints])

  const filteredComplaints = useMemo(() => {
    const query = complaintsSearchQuery.trim().toLowerCase()
    return complaints.filter((complaint) => {
      const status = String(complaint?.status || "open").toLowerCase()
      const issueType = String(complaint?.issueType || "")
      const searchable = [
        complaint?.userId?.name,
        complaint?.description,
        complaint?.orderId?.orderId,
        issueType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      if (complaintsFilterValues.status !== "all" && status !== complaintsFilterValues.status) {
        return false
      }

      if (
        complaintsFilterValues.issueType !== "all" &&
        issueType.toLowerCase() !== complaintsFilterValues.issueType.toLowerCase()
      ) {
        return false
      }

      if (query && !searchable.includes(query)) {
        return false
      }

      return true
    })
  }, [complaints, complaintsSearchQuery, complaintsFilterValues])

  const filteredReviews = useMemo(() => {
    const query = reviewsSearchQuery.trim().toLowerCase()
    const list = reviews.filter((review) => {
      if (
        reviewsFilterValues.rating !== "all" &&
        Number(review.rating || 0) < Number(reviewsFilterValues.rating)
      ) {
        return false
      }

      if (!query) return true

      const searchable = [
        review.userName,
        review.reviewText,
        review.orderNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return searchable.includes(query)
    })

    return [...list].sort((a, b) => {
      const dateA = new Date(a.dateISO)
      const dateB = new Date(b.dateISO)

      if (reviewsFilterValues.sortBy === "newest") return dateB - dateA
      if (reviewsFilterValues.sortBy === "oldest") return dateA - dateB
      if (reviewsFilterValues.sortBy === "bestRated") return (b.rating || 0) - (a.rating || 0)
      if (reviewsFilterValues.sortBy === "worstRated") return (a.rating || 0) - (b.rating || 0)
      return 0
    })
  }, [reviews, reviewsSearchQuery, reviewsFilterValues])

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    setSearchParams(tab === "complaints" ? { tab: "complaints" } : { tab: "reviews" })
  }

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    isSwiping.current = false
  }

  const handleTouchMove = (e) => {
    const deltaX = Math.abs(e.touches[0].clientX - touchStartX.current)
    const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current)
    if (deltaX > deltaY && deltaX > 10) isSwiping.current = true
    if (isSwiping.current) touchEndX.current = e.touches[0].clientX
  }

  const handleTouchEnd = () => {
    if (!isSwiping.current) return

    const swipeDistance = touchStartX.current - touchEndX.current
    if (Math.abs(swipeDistance) <= 50) return

    if (swipeDistance > 0) {
      handleTabChange("reviews")
    } else {
      handleTabChange("complaints")
    }
  }

  return (
    <div
      className="min-h-screen bg-gray-100 flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="sticky bg-white top-0 z-40 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] tracking-wider text-gray-500 uppercase">Showing data for</p>
            <p className="text-md font-bold text-gray-900">{restaurantData?.name || "Restaurant"}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/food/restaurant/notifications")}
              className="p-1 rounded-full hover:bg-gray-100 active:scale-95 transition-all"
              aria-label="Open notifications"
            >
              <Bell className="w-6 h-6 text-gray-700" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/food/restaurant/help-centre/support")}
              className="p-1 rounded-full hover:bg-gray-100 active:scale-95 transition-all"
              aria-label="Open support"
            >
              <HelpCircle className="w-6 h-6 text-gray-700" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/food/restaurant/explore")}
              className="p-1 rounded-full hover:bg-gray-100 active:scale-95 transition-all"
              aria-label="Open explore"
            >
              <Menu className="w-6 h-6 text-gray-700" />
            </button>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
                activeTab === tab.id ? "text-white" : "bg-white text-gray-600 border border-gray-200"
              }`}
              style={activeTab === tab.id ? { background: BRAND_THEME.gradients.primary } : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-3">
        {activeTab === "complaints" ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 bg-white p-3 rounded-xl border border-gray-200 flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={complaintsSearchQuery}
                  onChange={(e) => setComplaintsSearchQuery(e.target.value)}
                  placeholder="Search complaints"
                  className="flex-1 text-sm bg-transparent focus:outline-none"
                />
              </div>
              <button
                onClick={() => setIsComplaintsFilterOpen(true)}
                className="bg-white p-3 rounded-xl border border-gray-200 relative"
                aria-label="Open complaints filter"
              >
                <SlidersHorizontal className="w-4 h-4 text-gray-900" />
                {(complaintsFilterValues.status !== "all" || complaintsFilterValues.issueType !== "all") && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
                )}
              </button>
            </div>

            <AnimatePresence mode="wait">
              {isLoadingComplaints ? (
                <div className="flex justify-center p-10">
                  <Loader2 className="animate-spin text-gray-400" />
                </div>
              ) : filteredComplaints.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                  <p className="text-sm text-gray-500 font-medium">No complaints found</p>
                </div>
              ) : (
                <div className="space-y-2.5 pb-20">
                  {filteredComplaints.map((complaint) => (
                    <div key={complaint._id} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm space-y-2">
                      <div className="flex justify-between items-center">
                        <span
                          className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                            String(complaint.status || "").toLowerCase() === "open"
                              ? "bg-orange-100 text-orange-600"
                              : "bg-green-100 text-green-600"
                          }`}
                        >
                          {complaint.status || "open"}
                        </span>
                        <span className="text-[10px] text-gray-400 font-bold">
                          {new Date(complaint.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-xs text-gray-400">
                          {complaint.userId?.name?.[0] || "U"}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-[13px] leading-tight">{complaint.userId?.name || "Customer"}</p>
                          <p className="text-[10px] text-gray-500 font-bold uppercase">
                            Order #{complaint.orderId?.orderId || "N/A"}
                          </p>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-lg px-3 py-2 relative">
                        <p className="text-[9px] font-black text-red-500 uppercase mb-0.5">{complaint.issueType || "Issue"}</p>
                        <p className="text-[13px] text-gray-800 font-semibold leading-snug">{complaint.description || "-"}</p>
                      </div>

                      {complaint.adminResponse && (
                        <div className="bg-brand-50 rounded-lg px-3 py-2 border border-brand-100">
                          <p className="text-[9px] font-black text-brand-600 uppercase mb-0.5">Admin Response</p>
                          <p className="text-[13px] text-brand-900 font-medium leading-snug">{complaint.adminResponse}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 bg-white p-3 rounded-xl border border-gray-200 flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={reviewsSearchQuery}
                  onChange={(e) => setReviewsSearchQuery(e.target.value)}
                  placeholder="Search reviews"
                  className="flex-1 text-sm bg-transparent focus:outline-none"
                />
              </div>
              <button
                onClick={() => setIsFilterOpen(true)}
                className="bg-white p-3 rounded-xl border border-gray-200 relative"
                aria-label="Open reviews filter"
              >
                <SlidersHorizontal className="w-4 h-4 text-gray-900" />
                {(reviewsFilterValues.sortBy !== "newest" || reviewsFilterValues.rating !== "all") && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
                )}
              </button>
            </div>

            {isLoadingReviews ? (
              <div className="flex justify-center p-10">
                <Loader2 className="animate-spin text-gray-400" />
              </div>
            ) : filteredReviews.length === 0 ? (
              <div className="text-center py-20 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                <p className="text-sm text-gray-500 font-medium">No reviews found</p>
              </div>
            ) : (
              <div className="space-y-2.5 pb-20">
                {filteredReviews.map((review) => (
                  <div key={review.id} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase">
                      <span>Order #{review.orderNumber}</span>
                      <span>{review.dateLabel}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <img src={review.userImage} alt={review.userName} className="w-7 h-7 rounded-full border border-gray-100" />
                      <p className="font-bold text-gray-900 text-[13px] leading-tight">{review.userName}</p>
                      <div className="ml-auto flex items-center gap-1 bg-green-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">
                        {review.rating ?? "-"} <Star className="w-2 h-2 fill-current" />
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-[13px] text-gray-800 font-medium italic leading-snug">"{review.reviewText}"</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-end"
            onClick={() => setIsFilterOpen(false)}
          >
            <motion.div
              initial={{ y: 280 }}
              animate={{ y: 0 }}
              exit={{ y: 280 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="w-full bg-white rounded-t-3xl p-5 space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <p className="font-bold text-gray-900">Reviews Filter</p>
                <button className="p-2" onClick={() => setIsFilterOpen(false)}><X className="w-4 h-4" /></button>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase text-gray-500 font-bold">Sort by</p>
                <div className="grid grid-cols-2 gap-2">
                  {REVIEW_SORT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      className={`p-2.5 rounded-xl border text-sm font-semibold ${
                        reviewsFilterValues.sortBy === option.id
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white text-gray-700"
                      }`}
                      onClick={() => setReviewsFilterValues((prev) => ({ ...prev, sortBy: option.id }))}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase text-gray-500 font-bold">Minimum Rating</p>
                <div className="flex gap-2 flex-wrap">
                  {["all", "1", "2", "3", "4", "5"].map((rating) => (
                    <button
                      key={rating}
                      className={`px-3 py-2 rounded-full border text-sm font-semibold ${
                        reviewsFilterValues.rating === rating
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white text-gray-700"
                      }`}
                      onClick={() => setReviewsFilterValues((prev) => ({ ...prev, rating }))}
                    >
                      {rating === "all" ? "All" : `${rating}+`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  className="py-3 rounded-xl border border-gray-200 text-sm font-semibold"
                  onClick={() => setReviewsFilterValues({ sortBy: "newest", rating: "all" })}
                >
                  Reset
                </button>
                <button
                  className="py-3 rounded-xl text-sm font-semibold text-white"
                  style={{ background: BRAND_THEME.gradients.primary }}
                  onClick={() => setIsFilterOpen(false)}
                >
                  Apply
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isComplaintsFilterOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-end"
            onClick={() => setIsComplaintsFilterOpen(false)}
          >
            <motion.div
              initial={{ y: 280 }}
              animate={{ y: 0 }}
              exit={{ y: 280 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="w-full bg-white rounded-t-3xl p-5 space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <p className="font-bold text-gray-900">Complaints Filter</p>
                <button className="p-2" onClick={() => setIsComplaintsFilterOpen(false)}><X className="w-4 h-4" /></button>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase text-gray-500 font-bold">Status</p>
                <div className="flex gap-2 flex-wrap">
                  {COMPLAINT_STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      className={`px-3 py-2 rounded-full border text-sm font-semibold ${
                        complaintsFilterValues.status === option.id
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white text-gray-700"
                      }`}
                      onClick={() => setComplaintsFilterValues((prev) => ({ ...prev, status: option.id }))}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase text-gray-500 font-bold">Issue Type</p>
                <div className="flex gap-2 flex-wrap max-h-44 overflow-auto">
                  {complaintIssueTypeOptions.map((issueType) => (
                    <button
                      key={issueType}
                      className={`px-3 py-2 rounded-full border text-sm font-semibold ${
                        complaintsFilterValues.issueType === issueType
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white text-gray-700"
                      }`}
                      onClick={() => setComplaintsFilterValues((prev) => ({ ...prev, issueType }))}
                    >
                      {issueType === "all" ? "All" : issueType}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  className="py-3 rounded-xl border border-gray-200 text-sm font-semibold"
                  onClick={() => setComplaintsFilterValues({ status: "all", issueType: "all" })}
                >
                  Reset
                </button>
                <button
                  className="py-3 rounded-xl text-sm font-semibold text-white"
                  style={{ background: BRAND_THEME.gradients.primary }}
                  onClick={() => setIsComplaintsFilterOpen(false)}
                >
                  Apply
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNavOrders />
    </div>
  )
}
