import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { useEffect, useState, createContext, useContext } from "react"
import { ProfileProvider } from "@food/context/ProfileContext"
import LocationPrompt from "./LocationPrompt"
import { CartProvider } from "@food/context/CartContext"
import { OrdersProvider } from "@food/context/OrdersContext"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const isNativeLikeShell = () => {
  if (typeof window === "undefined") return false
  const protocol = String(window.location?.protocol || "").toLowerCase()
  const userAgent = String(window.navigator?.userAgent || "").toLowerCase()
  return (
    Boolean(window.flutter_inappwebview) ||
    Boolean(window.ReactNativeWebView) ||
    protocol === "file:" ||
    userAgent.includes(" wv") ||
    userAgent.includes("; wv")
  )
}

import SearchOverlay from "./SearchOverlay"
import BottomNavigation from "./BottomNavigation"
import DesktopNavbar from "./DesktopNavbar"
import OrderTrackingCard from "@food/components/user/OrderTrackingCard"
import { useUserNotifications } from "../../hooks/useUserNotifications"
import BRAND_THEME from "@/config/brandTheme"

// Create SearchOverlay context with default value
const SearchOverlayContext = createContext({
  isSearchOpen: false,
  searchValue: "",
  setSearchValue: () => {
    debugWarn("SearchOverlayProvider not available")
  },
  openSearch: () => {
    debugWarn("SearchOverlayProvider not available")
  },
  closeSearch: () => { }
})

export function useSearchOverlay() {
  const context = useContext(SearchOverlayContext)
  // Always return context, even if provider is not available (will use default values)
  return context
}

function SearchOverlayProvider({ children }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")

  const openSearch = () => {
    setIsSearchOpen(true)
  }

  const closeSearch = () => {
    setIsSearchOpen(false)
    setSearchValue("")
  }

  return (
    <SearchOverlayContext.Provider value={{ isSearchOpen, searchValue, setSearchValue, openSearch, closeSearch }}>
      {children}
      {isSearchOpen && (
        <SearchOverlay
          isOpen={isSearchOpen}
          onClose={closeSearch}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
        />
      )}
    </SearchOverlayContext.Provider>
  )
}

// Create LocationSelector context with default value
const LocationSelectorContext = createContext({
  isLocationSelectorOpen: false,
  openLocationSelector: () => {
    debugWarn("LocationSelectorProvider not available")
  },
  closeLocationSelector: () => { }
})

export function useLocationSelector() {
  const context = useContext(LocationSelectorContext)
  if (!context) {
    throw new Error("useLocationSelector must be used within LocationSelectorProvider")
  }
  return context
}

function LocationSelectorProvider({ children }) {
  const navigate = useNavigate()
  const location = useLocation()

  const openLocationSelector = () => {
    const currentPath = `${location.pathname || ""}${location.search || ""}${location.hash || ""}` || "/food/user"
    navigate("/food/user/address-selector", {
      state: {
        from: currentPath,
        backTo: currentPath,
      },
    })
  }

  const closeLocationSelector = () => { }

  const value = {
    isLocationSelectorOpen: false,
    openLocationSelector,
    closeLocationSelector
  }

  return (
    <LocationSelectorContext.Provider value={value}>
      {children}
    </LocationSelectorContext.Provider>
  )
}

export default function UserLayout() {
  const location = useLocation()

  useEffect(() => {
    // Reset scroll to top whenever location changes (pathname, search, or hash)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.pathname, location.search, location.hash])

  useUserNotifications()

  // Note: Authentication checks and redirects are handled by ProtectedRoute components
  // UserLayout should not interfere with authentication redirects

  // Show bottom navigation only on home page, under-price pages, and profile page
  const path = location.pathname.startsWith("/food")
    ? location.pathname.substring(5) || "/"
    : location.pathname
  const normalizedPath =
    path.length > 1 ? path.replace(/\/+$/, "") : path

  const isProfileRoot =
    normalizedPath === "/profile" ||
    normalizedPath === "/user/profile"
  const isUnderPriceRoute =
    normalizedPath === "/under-price" ||
    normalizedPath === "/user/under-price" ||
    /^\/under-\d+$/.test(normalizedPath) ||
    /^\/user\/under-\d+$/.test(normalizedPath)

  const showBottomNav = normalizedPath === "/" ||
    normalizedPath === "/user" ||
    normalizedPath === "/under-price" ||
    normalizedPath === "/user/under-price" ||
    normalizedPath === "/under-250" ||
    normalizedPath === "/user/under-250" ||
    isUnderPriceRoute ||
    isProfileRoot ||
    normalizedPath === "" // Handle empty string case for root relative to /food

  const isUnder250 =
    normalizedPath === "/under-price" ||
    normalizedPath === "/user/under-price" ||
    normalizedPath === "/under-250" ||
    normalizedPath === "/user/under-250" ||
    isUnderPriceRoute

  const isHomeRoute =
    normalizedPath === "/" ||
    normalizedPath === "/user" ||
    normalizedPath === ""

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!isNativeLikeShell()) return
    if (!isHomeRoute) return

    if (!window.history.state?.userHomeBackGuard) {
      window.history.pushState(
        { ...(window.history.state || {}), userHomeBackGuard: true },
        "",
        window.location.href
      )
    }

    const handlePopState = async () => {
      if (window.__userNotificationPopoverOpen) return

      const shouldExit = window.confirm("Exit app?")
      if (!shouldExit) {
        window.history.pushState(
          { ...(window.history.state || {}), userHomeBackGuard: true },
          "",
          window.location.href
        )
        return
      }

      try {
        if (window.flutter_inappwebview?.callHandler) {
          const exitHandlers = ["exitApp", "closeApp", "onExitApp"]
          for (const handler of exitHandlers) {
            try {
              await window.flutter_inappwebview.callHandler(handler, { module: "user" })
              return
            } catch {
              // Try next handler.
            }
          }
        }
      } catch {
        // Ignore bridge failures.
      }
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [isHomeRoute])

  return (
    <div
      className="min-h-screen transition-colors duration-200 bg-white dark:bg-[#0a0a0a]"
    >
      <CartProvider>
        <ProfileProvider>
          <OrdersProvider>
              <SearchOverlayProvider>
                <LocationSelectorProvider>
                  {/* <Navbar /> */}
                  {/* Desktop Navbar - Hidden on mobile, visible on medium+ screens */}
                  <div className="hidden md:block">
                    {showBottomNav && <DesktopNavbar showLogo={!isUnder250} />}
                  </div>
                  <LocationPrompt />
                  <main className={showBottomNav ? "md:pt-40" : ""}>
                    <Outlet />
                  </main>
                  <OrderTrackingCard otpOnly showOtpBanner hasBottomNav={showBottomNav} />
                  {showBottomNav && <BottomNavigation />}
                </LocationSelectorProvider>
              </SearchOverlayProvider>
          </OrdersProvider>
        </ProfileProvider>
      </CartProvider>
    </div>
  )
}
