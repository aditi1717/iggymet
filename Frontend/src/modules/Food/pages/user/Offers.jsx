import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Star, Clock, Tag, Sparkles, Percent } from "lucide-react"
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
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function Offers() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const [offers, setOffers] = useState([])
  const [groupedOffers, setGroupedOffers] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const showOffersSkeleton = useDelayedLoading(loading)
  const [bannerUrl, setBannerUrl] = useState("")

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
      <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 md:py-8 lg:py-10 space-y-6 md:space-y-8">
        <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
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
            {/* Grouped Offers Sections */}
            {Object.keys(groupedOffers).length > 0 && Object.entries(groupedOffers).map(([offerText, dishes]) => (
              <section key={offerText} className="space-y-4 pt-4">
                <div className="flex flex-col items-center justify-center text-center space-y-1 mb-1">
                  <span className="px-2.5 py-0.5 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-[9px] font-black rounded-full uppercase tracking-widest border border-red-100/50 dark:border-red-500/20">
                    Dishes Under Offer
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5">
                    {offerText}
                  </h2>
                  <div className="w-10 h-0.5 bg-red-600 rounded-full"></div>
                </div>
                
                {/* Restaurant Cards - Grid Layout */}
                <div 
                  className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4"
                >
                  {dishes.slice(0, 12).map((dish) => (
                    <Link 
                      key={dish.id} 
                      to={`/user/restaurants/${dish.restaurantSlug}`}
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
                          {/* Glossy dark gradient overlay at bottom of image */}
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent"></div>
                          
                          {/* Tag Offer Badge */}
                          <div className="absolute top-2 left-2 bg-gradient-to-r from-red-600 to-rose-500 text-white text-[9px] font-black uppercase px-1.5 py-0.5 rounded shadow-sm flex items-center gap-0.5">
                            <Tag className="h-2 w-2 fill-white" />
                            {dish.offer}
                          </div>
                          
                          {/* Rating Capsule on Image */}
                          <div className="absolute bottom-2 right-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-slate-900 dark:text-white text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow-sm">
                            <Star className="h-2.5 w-2.5 text-yellow-500 fill-yellow-500" />
                            {dish.restaurantRating?.toFixed(1) || '0.0'}
                          </div>
                        </div>
                        
                        {/* Restaurant & Dish Details */}
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
                            {/* Pricing with savings */}
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
                              <span>{dish.deliveryTime}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}

            {/* Coupon-style offers (admin created) */}
            {offers.length > 0 && (
              <section className="space-y-6 pt-8">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                  Available Coupons
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {offers.map((o) => (
                    <Link 
                      key={o.id || o.offerId} 
                      to={o.restaurantId ? `/user/restaurants/${o.restaurantSlug || o.restaurantId}` : '/user'}
                      className="relative flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition-all duration-300 group select-none cursor-pointer"
                    >
                      {/* Left ticket punch notch */}
                      <div className="absolute left-[-10px] top-1/2 -translate-y-1/2 w-5 h-5 bg-slate-50 dark:bg-slate-950 rounded-full border border-slate-200 dark:border-slate-800 z-10"></div>
                      {/* Right ticket punch notch */}
                      <div className="absolute right-[-10px] top-1/2 -translate-y-1/2 w-5 h-5 bg-slate-50 dark:bg-slate-950 rounded-full border border-slate-200 dark:border-slate-800 z-10"></div>
                      
                      {/* Left Section (Offer Value) */}
                      <div className="w-[45%] flex flex-col items-center justify-center p-4 bg-red-500/5 dark:bg-red-500/10 border-r border-dashed border-slate-200 dark:border-slate-800 text-center relative">
                        <div className="text-[10px] text-red-500 dark:text-red-400 font-extrabold uppercase tracking-widest mb-1">Coupon</div>
                        <div className="text-xl sm:text-2xl font-black text-red-600 dark:text-red-400 leading-tight">
                          {o.title || "Offer"}
                        </div>
                        {o.minOrderValue > 0 && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 font-medium">
                            Min order: ₹{o.minOrderValue}
                          </div>
                        )}
                      </div>

                      {/* Right Section (Details & Code) */}
                      <div className="flex-1 flex flex-col justify-between p-4 pl-5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold px-2 py-0.5 rounded-full">
                              {o.restaurantId ? 'Restaurant Coupon' : 'Global Coupon'}
                            </span>
                          </div>
                          <h3 className="font-extrabold text-slate-800 dark:text-slate-200 text-sm line-clamp-1 pt-1">
                            {o.restaurantName || "All Restaurants"}
                          </h3>
                          {o.endDate && (
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">
                              Expires: {new Date(o.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          )}
                        </div>

                        {/* Copy Code Area - without copy button */}
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <code className="text-xs font-mono font-extrabold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 tracking-wider">
                            {o.couponCode || "-"}
                          </code>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {offers.length === 0 && Object.keys(groupedOffers).length === 0 && !loading && (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">No offers available at the moment</p>
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  )
}

