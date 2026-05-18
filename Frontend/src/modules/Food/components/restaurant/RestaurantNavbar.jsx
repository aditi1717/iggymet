import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Search, Menu, ChevronRight, MapPin, X, Bell } from "lucide-react"
import { restaurantAPI } from "@food/api"
import { getCachedSettings, loadBusinessSettings } from "@food/utils/businessSettings"
import useNotificationInbox from "@food/hooks/useNotificationInbox"
import BRAND_THEME from "@/config/brandTheme"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const extractRestaurantPayload = (response) =>
  response?.data?.data?.restaurant ||
  response?.data?.restaurant ||
  response?.data?.data?.user ||
  response?.data?.user ||
  response?.data?.data ||
  null

const parseTimeToMinutes = (timeValue) => {
  if (!timeValue || typeof timeValue !== "string") return null
  const match = String(timeValue).trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return (hour * 60) + minute
}

const isWithinSlot = (nowMinutes, slot) => {
  const opening = slot?.openingMinutes
  const closing = slot?.closingMinutes
  if (opening === null || opening === undefined || closing === null || closing === undefined) return false
  if (closing > opening) return nowMinutes >= opening && nowMinutes <= closing
  return nowMinutes >= opening || nowMinutes <= closing
}

const extractDaySlots = (dayData) => {
  const rawSlots = Array.isArray(dayData?.slots) ? dayData.slots : []
  const normalized = rawSlots
    .map((slot) => {
      const openingTime = String(slot?.openingTime || "").trim()
      const closingTime = String(slot?.closingTime || "").trim()
      const openingMinutes = parseTimeToMinutes(openingTime)
      const closingMinutes = parseTimeToMinutes(closingTime)
      if (openingMinutes === null || closingMinutes === null) return null
      return { openingTime, closingTime, openingMinutes, closingMinutes }
    })
    .filter(Boolean)

  if (normalized.length > 0) return normalized

  const openingTime = String(dayData?.openingTime || "").trim()
  const closingTime = String(dayData?.closingTime || "").trim()
  const openingMinutes = parseTimeToMinutes(openingTime)
  const closingMinutes = parseTimeToMinutes(closingTime)
  if (openingMinutes === null || closingMinutes === null) return []
  return [{ openingTime, closingTime, openingMinutes, closingMinutes }]
}


export default function RestaurantNavbar({
  restaurantName: propRestaurantName,
  location: propLocation,
  showSearch = true,
  showOfflineOnlineTag = true,
  showNotifications = true,
}) {
  const navigate = useNavigate()
  const [isSearchActive, setIsSearchActive] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  const [status, setStatus] = useState("Offline")
  const [manualOnlineStatus, setManualOnlineStatus] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  const [outletTimings, setOutletTimings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState("")
  const [logoUrl, setLogoUrl] = useState(null)
  const { unreadCount } = useNotificationInbox("restaurant", { limit: 20, pollMs: 5 * 60 * 1000 })

  // Load business settings for branding
  useEffect(() => {
    const loadSettings = async () => {
      const cached = getCachedSettings()
      if (cached) {
        if (cached.companyName) setCompanyName(cached.companyName)
        if (cached.logo?.url) setLogoUrl(cached.logo.url)
      } else {
        const settings = await loadBusinessSettings()
        if (settings) {
          if (settings.companyName) setCompanyName(settings.companyName)
          if (settings.logo?.url) setLogoUrl(settings.logo.url)
        }
      }
    }
    loadSettings()

    const handleSettingsUpdate = () => {
      const cached = getCachedSettings()
      if (cached) {
        if (cached.companyName) setCompanyName(cached.companyName)
        if (cached.logo?.url) setLogoUrl(cached.logo.url)
      }
    }
    window.addEventListener('businessSettingsUpdated', handleSettingsUpdate)
    return () => window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate)
  }, [])

  // Fetch restaurant data and outlet timings on mount
  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setLoading(true)
        const response = await restaurantAPI.getCurrentRestaurant()
        const data = extractRestaurantPayload(response)
        if (data) {
          setRestaurantData(data)
        }
      } catch (error) {
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          debugError("Error fetching restaurant data:", error)
        }
      } finally {
        setLoading(false)
      }
    }

    const fetchOutletTimings = async () => {
      try {
        const response = await restaurantAPI.getOutletTimings()
        const timings = response?.data?.data?.outletTimings || response?.data?.outletTimings
        if (timings) {
          setOutletTimings(timings)
        }
      } catch (error) {
        // ignore timing fetch errors
      }
    }

    fetchRestaurantData()
    fetchOutletTimings()

    // Listen for outlet timings updates
    const handleTimingsUpdate = () => {
      fetchOutletTimings()
    }
    window.addEventListener("outletTimingsUpdated", handleTimingsUpdate)
    return () => window.removeEventListener("outletTimingsUpdated", handleTimingsUpdate)
  }, [])

  // Format full address from location object - using stored data only, no live fetching
  const formatAddress = (location) => {
    if (!location) return ""
    
    // Priority 1: Use formattedAddress if available (stored address from database)
    if (location.formattedAddress && location.formattedAddress.trim() !== "" && location.formattedAddress !== "Select location") {
      // Check if it's just coordinates (latitude, longitude format)
      const isCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(location.formattedAddress.trim())
      if (!isCoordinates) {
        return location.formattedAddress.trim()
      }
    }
    
    // Priority 2: Use address field if available
    if (location.address && location.address.trim() !== "") {
      return location.address.trim()
    }
    
    // Priority 3: Build from individual components
    const parts = []
    
    // Add street address (addressLine1 or street)
    if (location.addressLine1) {
      parts.push(location.addressLine1.trim())
    } else if (location.street) {
      parts.push(location.street.trim())
    }
    
    // Add addressLine2 if available
    if (location.addressLine2) {
      parts.push(location.addressLine2.trim())
    }
    
    // Add area if available
    if (location.area) {
      parts.push(location.area.trim())
    }
    
    // Add landmark if available
    if (location.landmark) {
      parts.push(location.landmark.trim())
    }
    
    // Add city if available and not already in area
    if (location.city) {
      const city = location.city.trim()
      // Only add city if it's not already included in previous parts
      const cityAlreadyIncluded = parts.some(part => part.toLowerCase().includes(city.toLowerCase()))
      if (!cityAlreadyIncluded) {
        parts.push(city)
      }
    }
    
    // Add state if available
    if (location.state) {
      const state = location.state.trim()
      // Only add state if it's not already included
      const stateAlreadyIncluded = parts.some(part => part.toLowerCase().includes(state.toLowerCase()))
      if (!stateAlreadyIncluded) {
        parts.push(state)
      }
    }
    
    // Add zipCode/pincode if available
    if (location.zipCode || location.pincode || location.postalCode) {
      const zip = (location.zipCode || location.pincode || location.postalCode).trim()
      parts.push(zip)
    }
    
    return parts.length > 0 ? parts.join(", ") : ""
  }

  // Get restaurant name (use prop if provided, otherwise use fetched data)
  const restaurantName = propRestaurantName || restaurantData?.name || "Restaurant"

  const [location, setLocation] = useState("")

  // Update location when restaurantData or propLocation changes
  useEffect(() => {
    let newLocation = ""
    
    // Priority 1: Explicit prop takes highest priority
    if (propLocation && propLocation.trim() !== "") {
      newLocation = propLocation.trim()
    }
    // Priority 2: Check restaurantData location
    else if (restaurantData) {
      debugLog('?? Checking restaurant data for address:', {
        hasLocation: !!restaurantData.location,
        locationKeys: restaurantData.location ? Object.keys(restaurantData.location) : [],
        formattedAddress: restaurantData.location?.formattedAddress,
        address: restaurantData.location?.address,
        directAddress: restaurantData.address,
        fullLocation: restaurantData.location
      })
      
      if (restaurantData.location) {
        // Use stored formattedAddress first (from database)
        if (restaurantData.location.formattedAddress && 
            restaurantData.location.formattedAddress.trim() !== "" && 
            restaurantData.location.formattedAddress !== "Select location") {
          // Check if it's just coordinates (latitude, longitude format)
          const isCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(restaurantData.location.formattedAddress.trim())
          if (!isCoordinates) {
            newLocation = restaurantData.location.formattedAddress.trim()
            debugLog('? Using formattedAddress:', newLocation)
          }
        }
        
        // If formattedAddress is not available or is coordinates, try formatAddress function
        if (!newLocation) {
          const formatted = formatAddress(restaurantData.location)
          if (formatted && formatted.trim() !== "") {
            newLocation = formatted.trim()
            debugLog('? Using formatAddress result:', newLocation)
          }
        }
        
        // Additional fallback: check if address is directly on location
        if (!newLocation && restaurantData.location.address && restaurantData.location.address.trim() !== "") {
          newLocation = restaurantData.location.address.trim()
          debugLog('? Using location.address:', newLocation)
        }
      }
      
      // Priority 3: Fallback - check if address is directly on restaurantData (not in location object)
      if (!newLocation && restaurantData.address && restaurantData.address.trim() !== "") {
        newLocation = restaurantData.address.trim()
        debugLog('? Using restaurantData.address:', newLocation)
      }
    }
    
    setLocation(newLocation)
    
    // Debug log
    if (newLocation) {
      debugLog('?? Restaurant address displayed:', newLocation)
    } else if (restaurantData) {
      debugLog('?? Restaurant data available but no address found')
    }
  }, [restaurantData, propLocation])

  // Load manual accepts orders status on mount and listen for changes
  useEffect(() => {
    const updateManualStatus = () => {
      try {
        const savedStatus = localStorage.getItem('restaurant_online_status')
        if (savedStatus !== null) {
          setManualOnlineStatus(JSON.parse(savedStatus))
        } else if (restaurantData) {
          setManualOnlineStatus(Boolean(restaurantData.isAcceptingOrders))
        }
      } catch (error) {
        if (restaurantData) {
          setManualOnlineStatus(Boolean(restaurantData.isAcceptingOrders))
        }
      }
    }

    updateManualStatus()

    const handleStatusChange = (event) => {
      const isOnline = event.detail?.isOnline || false
      setManualOnlineStatus(isOnline)
    }

    window.addEventListener('restaurantStatusChanged', handleStatusChange)
    
    return () => {
      window.removeEventListener('restaurantStatusChanged', handleStatusChange)
    }
  }, [restaurantData])

  // Dynamically compute final Online/Offline status based on all 3 conditions:
  // 1. Manual status must be ON
  // 2. Today's day must be OPEN in outlet timings
  // 3. Current time must be WITHIN timing slots
  useEffect(() => {
    const recomputeStatus = () => {
      // Condition 1: Manual off
      if (!manualOnlineStatus) {
        setStatus("Offline")
        return
      }

      // If timings haven't loaded yet, fall back to manual status
      if (!outletTimings) {
        setStatus(manualOnlineStatus ? "Online" : "Offline")
        return
      }

      const now = new Date()
      const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
      const currentDayFull = DAY_NAMES[now.getDay()] // "Monday", "Tuesday", etc.
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      const currentTimeInMinutes = currentHour * 60 + currentMinute

      const dayData = outletTimings[currentDayFull]
      
      // Condition 2: Day is closed
      if (!dayData || dayData.isOpen === false) {
        setStatus("Offline")
        return
      }

      const slots = extractDaySlots(dayData)
      if (slots.length === 0) {
        // No slots means open 24/7 or not configured yet, so treat as online
        setStatus("Online")
        return
      }

      // Condition 3: Outside timing slots
      const isWithin = slots.some((slot) => isWithinSlot(currentTimeInMinutes, slot))
      if (!isWithin) {
        setStatus("Offline")
        return
      }

      // All conditions passed!
      setStatus("Online")
    }

    recomputeStatus()
    
    // Check every 30 seconds to react to clock changes
    const interval = setInterval(recomputeStatus, 30000)
    
    return () => clearInterval(interval)
  }, [manualOnlineStatus, outletTimings])

  const handleStatusClick = () => {
    navigate("/restaurant/status")
  }

  const handleSearchClick = () => {
    setIsSearchActive(true)
  }

  const handleSearchClose = () => {
    setIsSearchActive(false)
    setSearchValue("")
  }

  const handleSearchChange = (e) => {
    setSearchValue(e.target.value)
  }

  const handleMenuClick = () => {
    navigate("/restaurant/explore")
  }

  const handleNotificationsClick = () => {
    navigate("/restaurant/notifications")
  }

  // Show search input when search is active
  if (isSearchActive) {
    return (
      <div className="w-full bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        {/* Search Input */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchValue}
            onChange={handleSearchChange}
            placeholder="Search by order ID"
            className="w-full px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none"
            autoFocus
          />
        </div>

        {/* Close Button */}
        <button
          onClick={handleSearchClose}
          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: BRAND_THEME.colors.brand.primary }}
          aria-label="Close search"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      </div>
    )
  }

  return (
    <div className="w-full bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      {/* Left Side - Restaurant Info */}
      <div className="flex-1 min-w-0 pr-4 flex items-center gap-3">

        <div className="min-w-0">
          {/* Restaurant Name & Company */}
          <div className="flex items-baseline gap-1.5 min-w-0">
            <h1 className="text-[15px] font-bold text-gray-900 truncate">
              {loading ? "Loading..." : (restaurantName || "Restaurant")}
            </h1>

          </div>
          {!loading && location && location.trim() !== "" && (
            <div className="flex items-center gap-1 mt-0.5 opacity-80">
              <MapPin className="w-2.5 h-2.5 text-gray-500 shrink-0" />
              <p className="text-[10px] text-gray-500 truncate font-medium" title={location}>
                {location}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right Side - Interactive Elements */}
      <div className="flex items-center">
        {/* Offline/Online Status Tag */}
        {showOfflineOnlineTag && (
          <button
            onClick={handleStatusClick}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full hover:opacity-90 transition-all"
            style={{
              backgroundColor: status === "Online" ? "#DCFCE7" : "#F1F5F9",
              color: status === "Online" ? "#166534" : "#334155",
              border: status === "Online" ? "1px solid #bbf7d0" : "1px solid #e2e8f0",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: status === "Online" ? "#22c55e" : "#94a3b8" }}
            ></span>
            <span className="text-sm font-medium">
              {status}
            </span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Search Icon */}
        {showSearch && (
          <button
            onClick={handleSearchClick}
            className="p-2 ml-1 hover:bg-white/15 rounded-full transition-colors"
            aria-label="Search"
          >
            <Search className="w-5 h-5 text-gray-700" />
          </button>
        )}

        {/* Notifications Icon */}
        {showNotifications && (
            <button
              onClick={handleNotificationsClick}
              className="relative p-2 ml-1 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-gray-700" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-red-500 border border-white" />
              )}
            </button>
          )}

        {/* Hamburger Menu Icon */}
        <button
          onClick={handleMenuClick}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Menu"
        >
          <Menu className="w-5 h-5 text-gray-700" />
        </button>
      </div>
    </div>
  )
}


