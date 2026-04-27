import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Loader2, MessageSquareText, Star } from "lucide-react"
import { deliveryAPI } from "@food/api"
import { toast } from "sonner"
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation"

const formatDateTime = (value) => {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const RatingStars = ({ rating = 0 }) => {
  const count = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)))
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={`h-3.5 w-3.5 ${index < count ? "fill-emerald-500 text-emerald-500" : "fill-gray-100 text-gray-200"}`}
        />
      ))}
    </div>
  )
}

export const ProfileReviewsV2 = () => {
  const goBack = useDeliveryBackNavigation()
  const [reviews, setReviews] = useState([])
  const [summary, setSummary] = useState({ averageRating: 0, totalRatings: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        setLoading(true)
        const response = await deliveryAPI.getReviews({ limit: 200, page: 1 })
        const data = response?.data?.data || {}
        setReviews(Array.isArray(data.reviews) ? data.reviews : [])
        setSummary({
          averageRating: Number(data.averageRating || 0),
          totalRatings: Number(data.totalRatings || data.total || 0),
        })
      } catch (error) {
        toast.error("Failed to load reviews")
        setReviews([])
      } finally {
        setLoading(false)
      }
    }

    fetchReviews()
  }, [])

  const averageLabel = useMemo(() => {
    return summary.averageRating > 0 ? summary.averageRating.toFixed(1) : "-"
  }, [summary.averageRating])

  return (
    <div className="min-h-screen bg-slate-50 pb-8 font-poppins">
      <div className="fixed top-0 z-50 flex w-full items-center gap-2 border-b border-gray-100 bg-white px-4 py-4 shadow-sm">
        <button onClick={goBack} className="rounded-full p-1 hover:bg-gray-50" aria-label="Go back">
          <ArrowLeft className="h-5 w-5 text-gray-950" />
        </button>
        <div>
          <h1 className="text-lg font-black text-gray-950">My Reviews</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Customer feedback</p>
        </div>
      </div>

      <div className="space-y-2.5 px-4 pt-20">
        <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Average Rating</p>
              <div className="mt-1.5 flex items-end gap-2">
                <span className="text-3xl font-black text-gray-950">{averageLabel}</span>
                <span className="pb-1 text-sm font-bold text-gray-400">/ 5</span>
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Star className="h-6 w-6 fill-emerald-500" />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-50 pt-3">
            <RatingStars rating={summary.averageRating} />
            <span className="text-xs font-bold text-gray-500">{summary.totalRatings} reviews</span>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-24">
            <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Loading reviews...</p>
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gray-50">
              <MessageSquareText className="h-9 w-9 text-gray-200" />
            </div>
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-950">No Reviews Yet</h3>
            <p className="mt-2 text-xs font-medium text-gray-400">Delivered orders ke baad customer rating dega, yahan show hoga.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {reviews.map((review, index) => (
              <div key={`${review.orderId || "review"}-${index}`} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-black text-gray-950">{review.customer || "Customer"}</p>
                    <p className="mt-0.5 truncate text-[10px] font-semibold text-gray-400">
                      #{review.orderId || "N/A"} - {review.restaurant || "Restaurant"}
                    </p>
                  </div>
                  <div className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">
                    {Number(review.rating || 0).toFixed(1)}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <RatingStars rating={review.rating} />
                  <span className="text-[10px] font-bold text-gray-400">{formatDateTime(review.submittedAt || review.deliveredAt)}</span>
                </div>

                <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-[13px] font-medium leading-snug text-gray-700">
                  {review.review || "No written review"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProfileReviewsV2

