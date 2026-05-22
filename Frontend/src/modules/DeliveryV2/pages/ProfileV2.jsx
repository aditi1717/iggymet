import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  Bike,
  Ticket,
  ChevronRight,
  LogOut,
  Loader2,
  Star,
  ShieldAlert,
  Store,
} from "lucide-react"
import { deliveryAPI } from "@food/api"
import { DEFAULT_USER_AVATAR, resolveProfileAvatar } from "@food/utils/profileAvatar"
import { toast } from "sonner"
import { clearModuleAuth } from "@food/utils/auth"
import BRAND_THEME from "@/config/brandTheme"

export const ProfileV2 = () => {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [profileAvatar, setProfileAvatar] = useState(DEFAULT_USER_AVATAR)
  const [loading, setLoading] = useState(true)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [logoutSubmitting, setLogoutSubmitting] = useState(false)

  // Fetch profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const response = await deliveryAPI.getProfile()
        if (response?.data?.success && response?.data?.data?.profile) {
          const fetchedProfile = response.data.data.profile
          setProfile(fetchedProfile)
          setProfileAvatar(resolveProfileAvatar(fetchedProfile))
        }
      } catch (error) {
        toast.error("Failed to load profile data")
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [])

  const handleLogout = async () => {
    if (logoutSubmitting) return
    setShowLogoutConfirm(false)
    try {
      setLogoutSubmitting(true)
      await deliveryAPI.logout()
    } catch (error) {}
    clearModuleAuth("delivery")
    localStorage.removeItem("app:isOnline")
    toast.success("Logged out successfully")
    navigate("/food/delivery/login", { replace: true })
    setLogoutSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center font-poppins gap-3">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" style={{ color: BRAND_THEME.colors.brand.primary }} />
        <span className="text-xs font-medium text-gray-500">Loading Profile...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-poppins pb-28">
      
      {/* Enlarge and beautiful Header with Profile Details */}
      <div 
        onClick={() => navigate("/food/delivery/profile/details")}
        className="bg-gradient-to-r from-gray-900 to-gray-800 text-white pt-10 pb-12 px-6 rounded-b-[2rem] shadow-md relative overflow-hidden cursor-pointer active:opacity-95 transition-opacity"
      >
        {/* Decorative backdrop shapes */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-8 -mt-8 blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-500/10 rounded-full -ml-8 -mb-8 blur-xl pointer-events-none" />

        <div className="flex items-center gap-4 relative z-10">
          {/* Circular Profile Photo on Header */}
          <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 border-2 border-white/20 bg-white/10 flex items-center justify-center shadow-lg">
            <img
              src={profileAvatar}
              alt="Profile"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.src = DEFAULT_USER_AVATAR
              }}
            />
          </div>
          
          {/* Name and ID */}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-white tracking-tight truncate leading-snug">
              {profile?.name || "Delivery Partner"}
            </h1>
            <p className="text-xs text-gray-300 font-medium mt-0.5 flex items-center gap-2">
              <span className="bg-white/10 px-2 py-0.5 rounded-full text-[10px] font-bold text-orange-300 tracking-wider">
                ID: {profile?.deliveryId || "N/A"}
              </span>
              {profile?.status && (
                <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  {profile.status}
                </span>
              )}
            </p>
          </div>
          
          <ChevronRight className="w-5 h-5 text-white/60 shrink-0" />
        </div>
      </div>

      <div className="px-4 pt-5 space-y-4">

        {/* Action Grid (Compact) */}
        <div className="grid grid-cols-2 gap-3">
           <button
             onClick={() => navigate("/food/delivery/history")}
             className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm flex items-center gap-3 active:bg-gray-50 transition-colors"
           >
             <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
               <Bike className="w-4 h-4" />
             </div>
             <div className="text-left">
               <span className="text-xs font-semibold text-gray-800 block">Trips</span>
               <span className="text-[10px] text-gray-400 font-medium">History</span>
             </div>
           </button>
           
           <button
             onClick={() => navigate("/food/delivery/shop")}
             className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm flex items-center gap-3 active:bg-gray-50 transition-colors"
           >
             <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
               <Store className="w-4 h-4" />
             </div>
             <div className="text-left">
               <span className="text-xs font-semibold text-gray-800 block">Shop</span>
               <span className="text-[10px] text-gray-400 font-medium">Buy items</span>
             </div>
           </button>
        </div>

        {/* Settings List (Compact) */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div 
              onClick={() => navigate("/food/delivery/profile/reviews")}
              className="px-4 py-3.5 border-b border-gray-50 flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                 <Star className="w-4 h-4 text-amber-500" />
                 <span className="text-sm font-medium text-gray-800">Reviews</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>

            <div 
              onClick={() => navigate("/food/delivery/help/tickets")}
              className="px-4 py-3.5 border-b border-gray-50 flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                 <Ticket className="w-4 h-4 text-gray-500" />
                 <span className="text-sm font-medium text-gray-800">Help & Support</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
            
            <div 
              onClick={() => navigate("/food/delivery/profile/terms")}
              className="px-4 py-3.5 border-b border-gray-50 flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                 <ShieldAlert className="w-4 h-4 text-gray-500" />
                 <span className="text-sm font-medium text-gray-800">Terms & Conditions</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>

            <div 
              onClick={() => setShowLogoutConfirm(true)}
              className="px-4 py-4 flex items-center justify-between cursor-pointer active:bg-red-50 hover:bg-red-50/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                 <LogOut className="w-4 h-4 text-red-500" />
                 <span className="text-sm font-bold text-red-500">Log out</span>
              </div>
            </div>
        </div>
      </div>

      {/* Basic Logout Confirm Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
              onClick={() => setShowLogoutConfirm(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-bold text-gray-900 mb-1.5">Confirm Logout</h3>
              <p className="text-sm text-gray-500 mb-6 font-medium">
                Are you sure you want to log out from this account?
              </p>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm active:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  disabled={logoutSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2 active:bg-red-700"
                >
                  {logoutSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
                  {logoutSubmitting ? "Logging out..." : "Log out"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default ProfileV2;
