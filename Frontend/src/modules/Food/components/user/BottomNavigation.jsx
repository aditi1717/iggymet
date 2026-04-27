import { Link, useLocation } from "react-router-dom"
import { Tag, User, Truck } from "lucide-react"
import BRAND_THEME from "@/config/brandTheme"

const UNDER_PRICE_DEFAULT_STORAGE_KEY = "food-under-price-default"
const DEFAULT_UNDER_PRICE_LIMIT = 250
const resolveUnderPriceLimit = (value, fallback = DEFAULT_UNDER_PRICE_LIMIT) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.round(parsed)
}

export default function BottomNavigation() {
  const location = useLocation()
  const pathname = location.pathname
  const { navigation } = BRAND_THEME.tokens
  const routePriceMatch = pathname.match(/\/under-(\d+)$/)
  const activeUnderPrice = routePriceMatch?.[1]
  const defaultUnderPrice = resolveUnderPriceLimit(
    activeUnderPrice ??
      (typeof window !== "undefined"
        ? window.localStorage.getItem(UNDER_PRICE_DEFAULT_STORAGE_KEY)
        : null),
  )

  // Check active routes - support both /user/* and /* paths
  const isUnder250 =
    pathname === "/food/under-price" ||
    pathname.startsWith("/food/user/under-price") ||
    pathname === "/under-price" ||
    pathname === "/user/under-price" ||
    pathname === "/food/under-250" ||
    pathname.startsWith("/food/user/under-250") ||
    /^\/under-\d+$/.test(pathname) ||
    /^\/user\/under-\d+$/.test(pathname) ||
    /^\/food\/under-\d+$/.test(pathname) ||
    /^\/food\/user\/under-\d+$/.test(pathname)
  const isProfile = pathname.startsWith("/food/profile") || pathname.startsWith("/food/user/profile")
  const isDelivery =
    !isUnder250 &&
    !isProfile &&
    (pathname === "/food" ||
      pathname === "/food/" ||
      pathname === "/food/user" ||
      (pathname.startsWith("/food/user") &&
        !pathname.includes("/under-") &&
        !pathname.includes("/profile")))

  return (
    <div
      className={`md:hidden fixed bottom-0 left-0 right-0 ${navigation.surface} border-t ${navigation.border} z-50 shadow-lg`}
    >
      <div className="flex items-center justify-around h-auto px-2 sm:px-4">
        {/* Delivery Tab */}
        <Link
          to="/food/user"
          className={`flex flex-1 flex-col items-center gap-1.5 px-2 sm:px-3 py-2 transition-all duration-200 relative ${isDelivery
              ? navigation.activeText
              : navigation.inactiveText
            }`}
        >
          <Truck className={`h-5 w-5 ${isDelivery ? navigation.activeText : navigation.inactiveText}`} strokeWidth={2} />
          <span className={`text-xs sm:text-sm font-medium ${isDelivery ? `${navigation.activeText} font-semibold` : navigation.inactiveText}`}>
            Delivery
          </span>
          {isDelivery && (
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${navigation.indicator} rounded-b-full`} />
          )}
        </Link>

        {/* Divider */}
        <div className={`h-8 w-px ${navigation.divider}`} />

        {/* Under 250 Tab */}
        <Link
          to="/food/under-price"
          className={`flex flex-1 flex-col items-center gap-1.5 px-2 sm:px-3 py-2 transition-all duration-200 relative ${isUnder250
              ? navigation.activeText
              : navigation.inactiveText
            }`}
        >
          <Tag className={`h-5 w-5 ${isUnder250 ? navigation.activeText : navigation.inactiveText}`} strokeWidth={2} />
          <span className={`text-xs sm:text-sm font-medium ${isUnder250 ? `${navigation.activeText} font-semibold` : navigation.inactiveText}`}>
            Under {defaultUnderPrice}
          </span>
          {isUnder250 && (
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${navigation.indicator} rounded-b-full`} />
          )}
        </Link>

        {/* Profile Tab */}
        <Link
          to="/food/user/profile"
          className={`flex flex-1 flex-col items-center gap-1.5 px-2 sm:px-3 py-2 transition-all duration-200 relative ${isProfile
              ? navigation.activeText
              : navigation.inactiveText
            }`}
        >
          <User className={`h-5 w-5 ${isProfile ? navigation.activeText : navigation.inactiveText}`} />
          <span className={`text-xs sm:text-sm font-medium ${isProfile ? `${navigation.activeText} font-semibold` : navigation.inactiveText}`}>
            Profile
          </span>
          {isProfile && (
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${navigation.indicator} rounded-b-full`} />
          )}
        </Link>
      </div>
    </div>
  )
}
