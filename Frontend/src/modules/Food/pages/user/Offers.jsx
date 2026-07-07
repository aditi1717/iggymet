import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Star, Clock, Tag, Sparkles, Percent, Filter, SlidersHorizontal, X } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Card, CardContent } from "@food/components/ui/card"
import api, { restaurantAPI } from "@food/api"
import { API_BASE_URL } from "@food/api/config"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { toast } from "sonner"
import { RestaurantGridSkeleton } from "@food/components/ui/loading-skeletons"
import { useDelayedLoading } from "@food/hooks/useDelayedLoading"
import BRAND_THEME from "@/config/brandTheme"

// Import banner image
import offerBanner from "@food/assets/offerpagebanner.png"
const debugLog = (...args) => { }
const debugWarn = (...args) => { }
const debugError = (...args) => { }


export default function Offers() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const [offers, setOffers] = useState([])
  const [groupedOffers, setGroupedOffers] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const showOffersSkeleton = useDelayedLoading(loading)
  const [bannerUrl, setBannerUrl] = useState("")

  // Tab State
  const [activeTab, setActiveTab] = useState("coupons") // "coupons" or "offers"
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)

  // Coupon Filters
  const [couponScopeFilter, setCouponScopeFilter] = useState("all") // "all", "global", "restaurant"
  const [couponDiscountFilter, setCouponDiscountFilter] = useState("all") // "all", "percentage", "flat"
  const [couponUserFilter, setCouponUserFilter] = useState("all") // "all", "first-time"

  // Offer Filters
  const [offerFoodTypeFilter, setOfferFoodTypeFilter] = useState("all") // "all", "veg", "non-veg"
  const [offerSortFilter, setOfferSortFilter] = useState("default") // "default", "price-asc", "price-desc", "rating-desc"

  const backendOrigin = (API_BASE_URL || "").replace(/\/api\/v1\/?$/, "")

  const resolveImageUrl = (url) => {
    if (typeof url !== "string") return ""
    const trimmed = url.trim()
    if (!trimmed) return ""
    if (/^(https?:|\/\/|data:|blob:)/i.test(trimmed)) return trimmed
    if (!backendOrigin) return trimmed
    return `${backendOrigin.replace(/\/$/, "")}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`
  }

  // Fetch Offers banner URL
  useEffect(() => {
    const fetchBanner = async () => {
      try {
        const response = await api.get('/food/landing/settings/public')
        const data = response?.data?.data || response?.data
        if (data?.offersBannerUrl) {
          setBannerUrl(data.offersBannerUrl)
        }
      } catch (err) {
        debugError('Error fetching Offers page banner settings:', err)
      }
    }
    fetchBanner()
  }, [])

  // Fetch offers from API
  useEffect(() => {
    const fetchOffers = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await restaurantAPI.getPublicOffers()
        const data = response?.data?.data

        if (data) {
          setOffers(data.allOffers || [])
          setGroupedOffers(data.groupedByOffer || {})
        }
      } catch (err) {
        debugError('Error fetching offers:', err)
        debugError('Error details:', err?.response?.data || err?.message)
        const errorMessage = err?.response?.data?.message || err?.message || 'Failed to load offers'
        setError(errorMessage)
        toast.error(errorMessage)
      } finally {
        setLoading(false)
      }
    }

    fetchOffers()
  }, [])

  // Filter coupons based on state
  const filteredCoupons = offers.filter((o) => {
    // 1. Scope
    if (couponScopeFilter === "global" && o.restaurantScope !== "all") return false
    if (couponScopeFilter === "restaurant" && o.restaurantScope !== "selected") return false

    // 2. Discount Type
    if (couponDiscountFilter === "percentage" && o.discountType !== "percentage") return false
    if (couponDiscountFilter === "flat" && o.discountType !== "flat-price") return false

    // 3. User Scope
    if (couponUserFilter === "first-time" && o.customerScope !== "first-time") return false

    return true
  })

  // Filter & Sort Grouped Offers
  const filteredGroupedOffers = {}
  Object.entries(groupedOffers).forEach(([offerText, dishes]) => {
    let filteredDishes = dishes.filter((dish) => {
      if (offerFoodTypeFilter === "veg" && dish.foodType !== "Veg") return false
      if (offerFoodTypeFilter === "non-veg" && dish.foodType !== "Non-Veg") return false
      return true
    })

    if (filteredDishes.length > 0) {
      if (offerSortFilter === "price-asc") {
        filteredDishes = [...filteredDishes].sort((a, b) => a.discountedPrice - b.discountedPrice)
      } else if (offerSortFilter === "price-desc") {
        filteredDishes = [...filteredDishes].sort((a, b) => b.discountedPrice - a.discountedPrice)
      } else if (offerSortFilter === "rating-desc") {
        filteredDishes = [...filteredDishes].sort((a, b) => (b.restaurantRating || 0) - (a.restaurantRating || 0))
      }
      filteredGroupedOffers[offerText] = filteredDishes
    }
  })

  // Count helpers
  const totalFilteredProductOffersCount = Object.values(filteredGroupedOffers).reduce((sum, list) => sum + list.length, 0)

  return (
    <div className={`min-h-screen ${BRAND_THEME.tokens.homepage.shared.pageBackground}`}>
      {/* Banner Section */}
      <div className="relative w-full overflow-hidden">
        {/* Back Button */}
        <button
          onClick={goBack}
          className="absolute top-4 left-4 md:top-6 md:left-6 z-20 w-10 h-10 md:w-12 md:h-12 bg-gray-800/60 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-gray-800/80 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 md:h-6 md:w-6 text-white" />
        </button>

        {/* Banner Image */}
        <img
          src={resolveImageUrl(bannerUrl) || offerBanner}
          alt="Great Offers"
          className="w-full h-auto block"
        />
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 md:py-8 lg:py-10 space-y-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Loading State */}
          {showOffersSkeleton && <RestaurantGridSkeleton count={4} compact />}

          {/* Error State */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-red-500 dark:text-red-400 text-center">{error}</p>
              <Button onClick={() => window.location.reload()} className="mt-4">Retry</Button>
            </div>
          )}

          {/* Offers Sections */}
          {!showOffersSkeleton && !error && (
            <>
              {/* Formal Tab Switcher */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 w-full mb-6">
                <button
                  onClick={() => setActiveTab("coupons")}
                  className={`px-6 py-3 text-sm sm:text-base font-extrabold transition-all relative ${
                    activeTab === "coupons"
                      ? "text-slate-900 dark:text-white font-black"
                      : "text-slate-500 dark:text-slate-455 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Coupons ({filteredCoupons.length})
                  </div>
                  {activeTab === "coupons" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600 rounded-full" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("offers")}
                  className={`px-6 py-3 text-sm sm:text-base font-extrabold transition-all relative ${
                    activeTab === "offers"
                      ? "text-slate-900 dark:text-white font-black"
                      : "text-slate-500 dark:text-slate-455 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Percent className="h-4 w-4" />
                    Product Offers ({totalFilteredProductOffersCount})
                  </div>
                  {activeTab === "offers" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600 rounded-full" />
                  )}
                </button>
              </div>

              {/* Single Filter Button */}
              <div className="flex justify-between items-center bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800/60 px-4 py-3 rounded-2xl shadow-sm">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 select-none">
                  <SlidersHorizontal className="h-4 w-4 text-slate-400" />
                  Showing {activeTab === "coupons" ? filteredCoupons.length : totalFilteredProductOffersCount} items
                </div>
                
                <button
                  onClick={() => setIsFilterModalOpen(true)}
                  className={`text-xs px-4 py-1.5 rounded-full font-bold transition-all border flex items-center gap-1.5 select-none cursor-pointer ${
                    (activeTab === "coupons"
                      ? (couponScopeFilter !== "all" ? 1 : 0) + (couponDiscountFilter !== "all" ? 1 : 0) + (couponUserFilter !== "all" ? 1 : 0)
                      : (offerFoodTypeFilter !== "all" ? 1 : 0) + (offerSortFilter !== "default" ? 1 : 0)) > 0
                      ? "border-red-600 bg-red-50 dark:bg-red-950/20 text-red-650 dark:text-red-400 font-extrabold"
                      : "border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-white dark:bg-slate-950 hover:bg-slate-50"
                  }`}
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filter
                  {(activeTab === "coupons"
                    ? (couponScopeFilter !== "all" ? 1 : 0) + (couponDiscountFilter !== "all" ? 1 : 0) + (couponUserFilter !== "all" ? 1 : 0)
                    : (offerFoodTypeFilter !== "all" ? 1 : 0) + (offerSortFilter !== "default" ? 1 : 0)) > 0 && (
                    <span className="h-4.5 min-w-4.5 px-1 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center">
                      {activeTab === "coupons"
                        ? (couponScopeFilter !== "all" ? 1 : 0) + (couponDiscountFilter !== "all" ? 1 : 0) + (couponUserFilter !== "all" ? 1 : 0)
                        : (offerFoodTypeFilter !== "all" ? 1 : 0) + (offerSortFilter !== "default" ? 1 : 0)}
                    </span>
                  )}
                </button>
              </div>

              {/* Render Tab Contents */}
              {activeTab === "coupons" ? (
                <section className="space-y-6 pt-4">
                  {filteredCoupons.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                      {filteredCoupons.map((o) => (
                        <Link
                          key={o.id || o.offerId}
                          to={o.restaurantId ? `/user/restaurants/${o.restaurantSlug || o.restaurantId}` : '/user'}
                          className="flex bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 group select-none cursor-pointer h-36 relative"
                        >
                          {/* Left Side: Image of Restaurant with Overlay Tag */}
                          <div className="relative w-36 h-full overflow-hidden flex-shrink-0">
                            <img
                              src={o.restaurantImage ? resolveImageUrl(o.restaurantImage) : "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop"}
                              alt={o.restaurantName || "Offer Image"}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                            {/* Dark overlay gradient */}
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent"></div>
                            
                            {/* Coupon overlayed tag */}
                            <div className="absolute bottom-2.5 left-2.5 right-2.5 text-white">
                              <span className="block text-[10px] text-red-400 font-extrabold uppercase tracking-wider mb-0.5">COUPON</span>
                              <span className="block text-sm sm:text-base font-black leading-tight truncate">
                                {o.title || "SPECIAL"}
                              </span>
                            </div>
                          </div>

                          {/* Right Side: Restaurant Info & Coupon Code details */}
                          <div className="flex-1 p-3 flex flex-col justify-between overflow-hidden">
                            <div className="space-y-1">
                              {/* Category Badge */}
                              <div className="flex items-center justify-between">
                                <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${o.restaurantId ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400' : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                                  {o.restaurantId ? '🔥 Restaurant Deal' : '🌍 Global Deal'}
                                </span>
                                {o.customerScope === 'first-time' && (
                                  <span className="text-[8px] bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 font-bold px-1.5 py-0.5 rounded">
                                    First Order
                                  </span>
                                )}
                              </div>

                              {/* Restaurant Name */}
                              <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm sm:text-base truncate leading-snug">
                                {o.restaurantName || "All Restaurants"}
                              </h3>

                              {/* Rating and Delivery details */}
                              {o.restaurantId && (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                    <span className="flex items-center gap-0.5 text-slate-700 dark:text-slate-200">
                                      <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                                      {o.restaurantRating > 0 ? o.restaurantRating.toFixed(1) : "New"}
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center gap-0.5">
                                      <Clock className="h-3 w-3 text-red-500" />
                                      {o.deliveryTime || "Fast Delivery"}
                                    </span>
                                  </div>
                                  {o.restaurantCuisines && o.restaurantCuisines.length > 0 && (
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate font-medium">
                                      {o.restaurantCuisines.slice(0, 3).join(", ")}
                                    </p>
                                  )}
                                </div>
                              )}
                              {!o.restaurantId && (
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                  Applicable across all ordering stores
                                </p>
                              )}
                            </div>

                            {/* Coupon Code Area & Expiry */}
                            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60">
                              <div className="flex flex-col">
                                {o.minOrderValue > 0 ? (
                                  <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                                    Min order: ₹{o.minOrderValue}
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                                    No min order
                                  </span>
                                )}
                                {o.endDate && (
                                  <span className="text-[8px] text-slate-400 dark:text-slate-500 font-normal">
                                    Exp: {new Date(o.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                              </div>

                              <code className="text-[10px] sm:text-xs font-mono font-extrabold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-2.5 py-1.5 rounded-lg border border-dashed border-red-300 dark:border-red-900 text-center tracking-wider hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                                {o.couponCode}
                              </code>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-850">
                      <Tag className="h-10 w-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                      <p className="text-slate-500 dark:text-slate-400 font-bold">No coupons match your filter criteria</p>
                      <button
                        onClick={() => {
                          setCouponScopeFilter("all")
                          setCouponDiscountFilter("all")
                          setCouponUserFilter("all")
                        }}
                        className="text-xs text-red-600 dark:text-red-400 font-extrabold underline mt-1.5"
                      >
                        Reset filters
                      </button>
                    </div>
                  )}
                </section>
              ) : (
                <section className="space-y-8 pt-4">
                  {totalFilteredProductOffersCount > 0 ? (
                    Object.entries(filteredGroupedOffers).map(([offerText, dishes]) => (
                      <div key={offerText} className="space-y-4">
                        <div className="flex flex-col items-center justify-center text-center space-y-1 mb-1">
                          <span className="px-2.5 py-0.5 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-[9px] font-black rounded-full uppercase tracking-widest border border-red-100/50 dark:border-red-500/20">
                            Dishes Under Offer
                          </span>
                          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5">
                            <Sparkles className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            {offerText}
                          </h2>
                          <div className="w-10 h-0.5 bg-red-600 rounded-full"></div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                          {dishes.map((dish) => (
                            <Link
                              key={dish.id}
                              to={`/user/restaurants/${dish.restaurantSlug || dish.restaurantId}`}
                              className="w-full"
                            >
                              <div className="group bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col h-full relative">
                                {/* Image Container */}
                                <div className="relative h-24 sm:h-28 overflow-hidden">
                                  <img
                                    src={dish.dishImage || dish.restaurantImage || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop"}
                                    alt={dish.dishName}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent"></div>

                                  {/* Tag Offer Badge */}
                                  <div className="absolute top-2 left-2 bg-gradient-to-r from-red-600 to-rose-500 text-white text-[9px] font-black uppercase px-1.5 py-0.5 rounded shadow-sm flex items-center gap-0.5">
                                    <Tag className="h-2 w-2 fill-white" />
                                    {dish.offer}
                                  </div>

                                  {/* Rating Capsule on Image */}
                                  <div className="absolute bottom-2 right-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-slate-900 dark:text-white text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow-sm">
                                    <Star className="h-2.5 w-2.5 text-yellow-500 fill-yellow-500" />
                                    {dish.restaurantRating > 0 ? dish.restaurantRating.toFixed(1) : "New"}
                                  </div>

                                  {/* Veg/Non-Veg Badge overlay */}
                                  <div className="absolute top-2 right-2 bg-white dark:bg-slate-900 p-0.5 rounded shadow-sm">
                                    <span className={`h-2.5 w-2.5 rounded-full inline-block border border-white dark:border-slate-800 ${dish.foodType === 'Veg' ? 'bg-green-500' : 'bg-red-600'}`} />
                                  </div>
                                </div>

                                {/* Details */}
                                <div className="p-2.5 flex-1 flex flex-col justify-between">
                                  <div className="space-y-0.5">
                                    <span className="text-[9px] text-red-600 dark:text-red-400 font-bold uppercase tracking-wider block truncate">
                                      {dish.restaurantName}
                                    </span>
                                    <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-xs sm:text-sm line-clamp-1 leading-tight">
                                      {dish.dishName}
                                    </h3>
                                  </div>

                                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                                    <div className="flex flex-col">
                                      <div className="flex items-baseline gap-1">
                                        <span className="text-xs sm:text-sm font-black text-slate-950 dark:text-white">
                                          ₹{dish.discountedPrice}
                                        </span>
                                        {dish.originalPrice > dish.discountedPrice && (
                                          <span className="text-[10px] line-through text-slate-400 dark:text-slate-500 font-bold">
                                            ₹{dish.originalPrice}
                                          </span>
                                        )}
                                      </div>
                                      {dish.originalPrice > dish.discountedPrice && (
                                        <span className="text-[8px] text-green-600 dark:text-green-400 font-black">
                                          Save ₹{dish.originalPrice - dish.discountedPrice}
                                        </span>
                                      )}
                                    </div>

                                    {/* Delivery capsule */}
                                    <div className="flex items-center gap-0.5 text-[9px] text-slate-600 dark:text-slate-300 font-bold bg-slate-50 dark:bg-slate-800/50 px-1 py-0.5 rounded-lg border border-slate-100 dark:border-slate-800/40">
                                      <Clock className="h-2.5 w-2.5 text-red-600" />
                                      <span>{dish.deliveryTime || "Fast"}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                      <Percent className="h-10 w-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                      <p className="text-slate-500 dark:text-slate-400 font-bold">No product offers match your filter criteria</p>
                      <button
                        onClick={() => {
                          setOfferFoodTypeFilter("all")
                          setOfferSortFilter("default")
                        }}
                        className="text-xs text-red-600 dark:text-red-400 font-extrabold underline mt-1.5"
                      >
                        Reset filters
                      </button>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* Filter Modal */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in select-none">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-2xl animate-scale-up">
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/80">
              <h3 className="font-black text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <Filter className="h-4.5 w-4.5 text-red-650" />
                Filter {activeTab === "coupons" ? "Coupons" : "Dishes"}
              </h3>
              <button
                onClick={() => setIsFilterModalOpen(false)}
                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5 overflow-y-auto max-h-[60vh]">
              {activeTab === "coupons" ? (
                <>
                  {/* Coupon Scope */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Coupon Scope
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "all", label: "All" },
                        { id: "global", label: "Global Deals" },
                        { id: "restaurant", label: "Restaurant Specific" }
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setCouponScopeFilter(opt.id)}
                          className={`text-xs py-2.5 px-1.5 rounded-xl font-bold transition-all border text-center cursor-pointer ${
                            couponScopeFilter === opt.id
                              ? "border-slate-850 dark:border-slate-200 text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800"
                              : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-950 hover:bg-slate-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Discount Type */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Discount Type
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "all", label: "All Types" },
                        { id: "percentage", label: "Percentage (%)" },
                        { id: "flat", label: "Flat Discount" }
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setCouponDiscountFilter(opt.id)}
                          className={`text-xs py-2.5 px-1.5 rounded-xl font-bold transition-all border text-center cursor-pointer ${
                            couponDiscountFilter === opt.id
                              ? "border-slate-850 dark:border-slate-200 text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800"
                              : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-950 hover:bg-slate-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* User Scope */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Target Users
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: "all", label: "All Users" },
                        { id: "first-time", label: "First Order Only" }
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setCouponUserFilter(opt.id)}
                          className={`text-xs py-2.5 px-2.5 rounded-xl font-bold transition-all border text-center cursor-pointer ${
                            couponUserFilter === opt.id
                              ? "border-slate-850 dark:border-slate-200 text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800"
                              : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-950 hover:bg-slate-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Food Type */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Food Preference
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "all", label: "All Foods" },
                        { id: "veg", label: "Veg Only" },
                        { id: "non-veg", label: "Non-Veg" }
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setOfferFoodTypeFilter(opt.id)}
                          className={`text-xs py-2.5 px-1.5 rounded-xl font-bold transition-all border text-center cursor-pointer ${
                            offerFoodTypeFilter === opt.id
                              ? "border-slate-850 dark:border-slate-200 text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800"
                              : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-950 hover:bg-slate-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sorting options */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Sort By
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: "default", label: "Default" },
                        { id: "price-asc", label: "Price: Low to High" },
                        { id: "price-desc", label: "Price: High to Low" },
                        { id: "rating-desc", label: "Rating: High to Low" }
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setOfferSortFilter(opt.id)}
                          className={`text-xs py-2.5 px-2 rounded-xl font-bold transition-all border text-center cursor-pointer ${
                            offerSortFilter === opt.id
                              ? "border-slate-850 dark:border-slate-200 text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800"
                              : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-950 hover:bg-slate-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between p-6 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/60 animate-fade-in-up">
              <button
                onClick={() => {
                  if (activeTab === "coupons") {
                    setCouponScopeFilter("all")
                    setCouponDiscountFilter("all")
                    setCouponUserFilter("all")
                  } else {
                    setOfferFoodTypeFilter("all")
                    setOfferSortFilter("default")
                  }
                }}
                className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white font-extrabold transition-colors cursor-pointer"
              >
                Clear All
              </button>
              <button
                onClick={() => setIsFilterModalOpen(false)}
                className="px-6 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-black rounded-xl shadow-md transition-colors cursor-pointer"
              >
                Apply Filters
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

