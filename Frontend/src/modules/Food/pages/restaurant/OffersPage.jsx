import { useEffect, useState } from "react"
import { ArrowLeft, Loader2, Trash2, Plus, Clock3, Pencil } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { restaurantAPI } from "@food/api"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Card, CardContent } from "@food/components/ui/card"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"

export default function OffersPage() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState({})

  const fetchOffers = async () => {
    try {
      setLoading(true)
      setError("")
      const res = await restaurantAPI.getRestaurantOffers()
      const list = res?.data?.data?.offers || res?.data?.offers || []
      setOffers(list)
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load offers")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOffers()
  }, [])

  const handleDelete = async (id) => {
    if (!id || deleting[id]) return
    try {
      setDeleting((prev) => ({ ...prev, [id]: true }))
      await restaurantAPI.deleteRestaurantOffer(id)
      setOffers((prev) => prev.filter((o) => String(o.id || o._id) !== String(id)))
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to delete offer")
    } finally {
      setDeleting((prev) => ({ ...prev, [id]: false }))
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-10">
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-40 flex items-center gap-3">
        <button onClick={goBack} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Offers</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-600 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading offers...
          </div>
        ) : offers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">No offers yet. Create one to get started.</p>
          </div>
        ) : (
          offers.map((offer) => (
            <Card key={offer._id || offer.id} className="bg-white shadow-sm border border-gray-100">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold text-gray-900">{offer.title}</div>
                  {/* Approval badge intentionally hidden */}
                </div>
                <div className="text-sm text-gray-700">
                  {offer.discountType === "flat-price"
                    ? `Flat ₹${offer.discountValue} off`
                    : `${offer.discountValue}% off${offer.maxDiscount ? ` (up to ₹${offer.maxDiscount})` : ""}`}
                </div>
                <div className="text-xs text-gray-600 flex items-center gap-1">
                  <Clock3 className="w-4 h-4" />
                  {offer.startDate ? new Date(offer.startDate).toLocaleDateString() : "Starts now"}{" "}
                  to {offer.endDate ? new Date(offer.endDate).toLocaleDateString() : "No expiry"}
                </div>
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => handleDelete(offer._id || offer.id)}
                    disabled={!!deleting[offer._id || offer.id]}
                    className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                    {deleting[offer._id || offer.id] ? "Deleting..." : "Delete"}
                  </button>
                  <button
                    onClick={() => navigate(`/restaurant/offers/${offer._id || offer.id}/edit`)}
                    className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                  >
                    <Pencil className="w-4 h-4" />
                    Edit
                  </button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <button
        onClick={() => navigate("/restaurant/offers/new")}
        className="fixed bottom-20 md:bottom-6 right-4 md:right-6 w-14 h-14 bg-brand-600 hover:bg-brand-700 text-white rounded-full shadow-lg flex items-center justify-center z-40 transition-colors"
      >
        <Plus className="w-6 h-6" />
      </button>

      <BottomNavOrders />
    </div>
  )
}

