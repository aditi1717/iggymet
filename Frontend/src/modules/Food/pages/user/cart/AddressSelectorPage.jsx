import { useMemo, useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronLeft, ChevronRight, Plus, MapPin, MoreHorizontal, Navigation, Home, Building2, Briefcase, Phone, X, Crosshair, Search } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import { Textarea } from "@food/components/ui/textarea"
import { useLocation as useGeoLocation } from "@food/hooks/useLocation"
import { useProfile } from "@food/context/ProfileContext"
import { toast } from "sonner"
import { locationAPI, userAPI } from "@food/api"
import { Loader } from '@googlemaps/js-api-loader'
import AnimatedPage from "@food/components/user/AnimatedPage"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import BRAND_THEME from "@/config/brandTheme"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

// Enable Maps if API Key is available, otherwise fallback to coordinates-only mode
const MAPS_ENABLED = !!import.meta.env.VITE_GOOGLE_MAPS_API_KEY

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3 // Earth's radius in meters
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180
  const deltaLat = (lat2 - lat1) * Math.PI / 180
  const deltaLon = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

const isCoordinateLikeText = (value) => {
  const text = String(value || "").trim()
  if (!text) return false
  return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(text)
}

const getReadableAddressFromLocation = (loc) => {
  if (!loc || typeof loc !== "object") return ""

  const mergedStreet = [loc.street, loc.area || loc.additionalDetails]
    .filter(Boolean)
    .map((v) => String(v).trim())
    .filter(Boolean)
    .join(", ")

  const candidates = [
    loc.formattedAddress,
    mergedStreet,
    [loc.address, loc.city, loc.state, loc.postalCode || loc.zipCode]
      .filter(Boolean)
      .map((v) => String(v).trim())
      .filter(Boolean)
      .join(", "),
    loc.address,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean)

  return candidates.find((v) => !isCoordinateLikeText(v)) || ""
}

const composeAddressText = (address = {}) => {
  if (!address || typeof address !== "object") return ""

  const formattedAddress = String(address.formattedAddress || "").trim()
  if (formattedAddress && !isCoordinateLikeText(formattedAddress)) {
    return formattedAddress
  }

  const parts = [
    address.floor ? `Floor ${String(address.floor).trim()}` : "",
    address.buildingName,
    address.street,
    address.additionalDetails,
    address.landmark,
    address.city,
    address.state,
    address.zipCode || address.postalCode,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)

  // Prevent repeated values when area/additionalDetails and landmark are same text.
  const seen = new Set()
  const uniqueParts = parts.filter((part) => {
    const key = part.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return uniqueParts.join(", ")
}

// Get icon based on address type/label
const getAddressIcon = (address) => {
  const label = (address.label || address.additionalDetails || "").toLowerCase()
  if (label.includes("home")) return Home
  if (label.includes("work") || label.includes("office")) return Briefcase
  if (label.includes("building") || label.includes("apt")) return Building2
  return Home
}

const buildLocationPayloadFromAddress = (address) => {
  if (!address || typeof address !== "object") return null

  const coordinates = Array.isArray(address.location?.coordinates)
    ? address.location.coordinates
    : []
  const longitude = Number(
    coordinates[0] ?? address.longitude ?? address.lng ?? null,
  )
  const latitude = Number(
    coordinates[1] ?? address.latitude ?? address.lat ?? null,
  )

  const street = String(address.street || "").trim()
  const area = String(address.additionalDetails || address.area || "").trim()
  const buildingName = String(address.buildingName || "").trim()
  const floor = String(address.floor || "").trim()
  const landmark = String(address.landmark || "").trim()
  const city = String(address.city || "").trim()
  const state = String(address.state || "").trim()
  const zipCode = String(address.zipCode || address.postalCode || "").trim()
  const formattedAddress =
    composeAddressText(address) ||
    [area, street, city, state, zipCode].filter(Boolean).join(", ") ||
    [street, city, state].filter(Boolean).join(", ")

  return {
    label: address.label || "Home",
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
    street,
    area,
    buildingName,
    floor,
    landmark,
    city,
    state,
    zipCode,
    postalCode: zipCode,
    address: [street, city].filter(Boolean).join(", ") || formattedAddress,
    formattedAddress,
  }
}

const persistSelectedLocation = (locationData) => {
  if (!locationData) return
  try {
    localStorage.setItem("userLocation", JSON.stringify(locationData))
    window.dispatchEvent(
      new CustomEvent("userLocationUpdated", {
        detail: { location: locationData },
      }),
    )
  } catch {
    // Ignore storage/event sync errors so selection still works.
  }
}

export default function AddressSelectorPage() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { location, loading, requestLocation } = useGeoLocation()
  const { addresses = [], addAddress, updateAddress, setDefaultAddress } = useProfile()
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [editingAddressId, setEditingAddressId] = useState(null)
  const [mapPosition, setMapPosition] = useState([22.7196, 75.8577]) // Default Indore coordinates [lat, lng]
  const [addressFormData, setAddressFormData] = useState({
    street: "",
    buildingName: "",
    floor: "",
    landmark: "",
    city: "",
    state: "",
    zipCode: "",
    additionalDetails: "",
    label: "Home",
  })
  const [loadingAddress, setLoadingAddress] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const mapContainerRef = useRef(null)
  const googleMapRef = useRef(null) // Google Maps instance
  const greenMarkerRef = useRef(null) // Green marker for address selection
  const userLocationMarkerRef = useRef(null) // Blue dot marker for user location
  const blueDotCircleRef = useRef(null) // Accuracy circle for Google Maps
  const [currentAddress, setCurrentAddress] = useState("")
  const [addressAutocompleteValue, setAddressAutocompleteValue] = useState("")
  const [keywordAddressSuggestions, setKeywordAddressSuggestions] = useState([])
  const [isKeywordSearching, setIsKeywordSearching] = useState(false)
  const [lockMapToAutocomplete, setLockMapToAutocomplete] = useState(true)
  const [GOOGLE_MAPS_API_KEY, setGOOGLE_MAPS_API_KEY] = useState(null)
  const [formScrollTop, setFormScrollTop] = useState(0)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [baseMapHeight, setBaseMapHeight] = useState(320)
  const formBodyRef = useRef(null)
  const manualFieldRefs = useRef({})
  const autoLocateAttemptedRef = useRef(false)
  const reverseReqSeqRef = useRef(0)
  const reverseDebounceRef = useRef(null)
  const lastReverseCenterRef = useRef(null)
  
  const ENABLE_LOCATION_REVERSE_GEOCODE = import.meta.env.VITE_ENABLE_LOCATION_REVERSE_GEOCODE !== "false"
  const ENABLE_NOMINATIM_SEARCH = import.meta.env.VITE_ENABLE_NOMINATIM_SEARCH !== "false"
  const getAddressId = (address) => address?.id || address?._id || null

  const handleBack = () => {
    goBack()
  }

  const addressAutocompleteSuggestions = useMemo(() => {
    const q = String(addressAutocompleteValue || "").trim().toLowerCase()
    if (!q) return []
    const list = Array.isArray(addresses) ? addresses : []
    return list
      .map((addr) => {
        const text = [
          addr?.label,
          addr?.additionalDetails,
          addr?.street,
          addr?.city,
          addr?.state,
          addr?.zipCode,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return { addr, text }
      })
      .filter((x) => x.text.includes(q))
      .slice(0, 6)
      .map((x) => x.addr)
  }, [addresses, addressAutocompleteValue])

  // Load Google Maps API key
  useEffect(() => {
    if (!MAPS_ENABLED) return
    import('@food/utils/googleMapsApiKey.js').then(({ getGoogleMapsApiKey }) => {
      getGoogleMapsApiKey().then(key => {
        setGOOGLE_MAPS_API_KEY(key)
      })
    })
  }, [])

  // Nominatim search
  useEffect(() => {
    if (!showAddressForm) return
    const q = String(addressAutocompleteValue || "").trim()
    if (!ENABLE_NOMINATIM_SEARCH || q.length < 3) {
      setKeywordAddressSuggestions([])
      setIsKeywordSearching(false)
      return
    }

    const t = setTimeout(async () => {
      try {
        setIsKeywordSearching(true)
        const refLat = location?.latitude ?? 22.7196
        const refLng = location?.longitude ?? 75.8577
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=10&q=${encodeURIComponent(q)}`
        const res = await fetch(url, { headers: { Accept: "application/json" } })
        const json = await res.json()
        const mapped = (Array.isArray(json) ? json : []).map(r => ({
          id: r.place_id || r.osm_id,
          display: r.display_name || "",
          lat: Number(r.lat),
          lng: Number(r.lon),
          address: r.address || {},
        }))
        const withDistance = mapped
          .filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lng))
          .map(x => ({ ...x, distanceMeters: calculateDistance(refLat, refLng, x.lat, x.lng) }))
          .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
          .slice(0, 4)
        setKeywordAddressSuggestions(withDistance)
      } catch (e) {
        setKeywordAddressSuggestions([])
      } finally {
        setIsKeywordSearching(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [addressAutocompleteValue, showAddressForm, location, ENABLE_NOMINATIM_SEARCH])

  // Map Initialization logic
  useEffect(() => {
    if (!MAPS_ENABLED || !showAddressForm || !mapContainerRef.current || !GOOGLE_MAPS_API_KEY) return

    let isMounted = true
    setMapLoading(true)

    const initializeGoogleMap = async () => {
      try {
        const loader = new Loader({ apiKey: GOOGLE_MAPS_API_KEY, version: "weekly" })
        const google = await loader.load()
        if (!isMounted || !mapContainerRef.current) return

        const initialPos = { lat: mapPosition[0], lng: mapPosition[1] }
        
        const map = new google.maps.Map(mapContainerRef.current, {
          center: initialPos,
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          styles: [
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] }
          ]
        })
        googleMapRef.current = map

        // Resolve address from current pin whenever user stops moving the map.
        map.addListener("idle", () => {
          const center = map.getCenter()
          const lat = center.lat()
          const lng = center.lng()
          setMapPosition([lat, lng])
          queueReverseGeocode(lat, lng)
        })

        setMapLoading(false)
      } catch (err) {
        debugError("Map init error:", err)
        setMapLoading(false)
      }
    }
    initializeGoogleMap()
    return () => { isMounted = false }
  }, [showAddressForm, GOOGLE_MAPS_API_KEY])

  const applyResolvedLocationToMap = useCallback((loc) => {
    const latitude = Number(loc?.latitude)
    const longitude = Number(loc?.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return

    const newPos = [latitude, longitude]
    setMapPosition(newPos)

    const readableAddress = getReadableAddressFromLocation(loc)
    if (readableAddress) {
      setCurrentAddress(readableAddress)
    }

    // Explicitly center map on live location.
    if (googleMapRef.current) {
      googleMapRef.current.panTo({ lat: latitude, lng: longitude })
      googleMapRef.current.setZoom(17)
    }
  }, [])

  const handleUseCurrentLocation = async () => {
    try {
      toast.loading("Getting location...", { id: "geo" })
      const loc = await requestLocation()
      if (loc?.latitude) {
        applyResolvedLocationToMap(loc)
        persistSelectedLocation(loc)
        queueReverseGeocode(Number(loc.latitude), Number(loc.longitude), { immediate: true, force: true })
        try { localStorage.setItem("deliveryAddressMode", "current") } catch {}
        toast.success("Location updated", { id: "geo" })
        // On selector list screen, auto-close and return so Home shows updated live location immediately.
        if (!showAddressForm) {
          handleBack()
        }
      }
    } catch (e) {
      toast.error("Failed to get location", { id: "geo" })
    }
  }

  // Keep UI synced with location from hook/local cache.
  useEffect(() => {
    if (!location?.latitude || !location?.longitude) return
    applyResolvedLocationToMap(location)
  }, [location, applyResolvedLocationToMap])

  // Auto-fetch live location when Add Address form opens.
  useEffect(() => {
    if (!showAddressForm) {
      autoLocateAttemptedRef.current = false
      if (reverseDebounceRef.current) {
        clearTimeout(reverseDebounceRef.current)
        reverseDebounceRef.current = null
      }
      lastReverseCenterRef.current = null
      return
    }
    if (autoLocateAttemptedRef.current) return
    autoLocateAttemptedRef.current = true

    let cancelled = false
    ;(async () => {
      try {
        const loc = await requestLocation()
        if (!cancelled && loc?.latitude && loc?.longitude) {
          applyResolvedLocationToMap(loc)
          persistSelectedLocation(loc)
          queueReverseGeocode(Number(loc.latitude), Number(loc.longitude), { immediate: true, force: true })
        }
      } catch {
        // Ignore: user can still tap "Use My Location" manually.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [showAddressForm, requestLocation, applyResolvedLocationToMap])

  const handleSelectSavedAddress = async (address) => {
    const id = getAddressId(address)
    if (id) {
      await setDefaultAddress(id)
      persistSelectedLocation(buildLocationPayloadFromAddress(address))
      try { localStorage.setItem("deliveryAddressMode", "saved") } catch {}
      toast.success("Address selected")
      handleBack()
    }
  }

  const handleAddAddressClick = () => {
    setEditingAddressId(null)
    setAddressFormData({
      street: "",
      buildingName: "",
      floor: "",
      landmark: "",
      city: "",
      state: "",
      zipCode: "",
      additionalDetails: "",
      label: "Home",
    })
    setShowAddressForm(true)
  }

  const handleEditAddressClick = (address) => {
    if (!address || typeof address !== "object") return

    const id = getAddressId(address)
    const coordinates = Array.isArray(address.location?.coordinates)
      ? address.location.coordinates
      : []
    const longitude = Number(coordinates[0])
    const latitude = Number(coordinates[1])

    setEditingAddressId(id || null)
    setAddressFormData({
      street: String(address.street || "").trim(),
      buildingName: String(address.buildingName || "").trim(),
      floor: String(address.floor || "").trim(),
      landmark: String(address.landmark || "").trim(),
      city: String(address.city || "").trim(),
      state: String(address.state || "").trim(),
      zipCode: String(address.zipCode || "").trim(),
      additionalDetails: String(address.additionalDetails || address.landmark || "").trim(),
      label: String(address.label || "Home").trim() === "Office" ? "Work" : String(address.label || "Home").trim(),
    })
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      setMapPosition([latitude, longitude])
    }
    setCurrentAddress(composeAddressText(address))
    setAddressAutocompleteValue(String(address.formattedAddress || composeAddressText(address) || "").trim())
    setShowAddressForm(true)
  }

  const handleCancelAddressForm = () => {
    setEditingAddressId(null)
    setShowAddressForm(false)
  }

  const scrollFieldIntoView = useCallback((fieldName) => {
    const el = manualFieldRefs.current?.[fieldName]
    if (!el) return
    setTimeout(() => {
      try {
        const scrollHost = formBodyRef.current
        if (!scrollHost) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
          return
        }
        const hostRect = scrollHost.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        const viewportHeight =
          typeof window !== "undefined" && window.visualViewport
            ? window.visualViewport.height
            : window.innerHeight
        const safeBottom = viewportHeight - keyboardInset - 90
        const overBy = elRect.bottom - safeBottom
        if (overBy > 0) {
          scrollHost.scrollTo({
            top: scrollHost.scrollTop + overBy + 24,
            behavior: "smooth",
          })
          return
        }
        if (elRect.top < hostRect.top + 70) {
          const upBy = hostRect.top + 70 - elRect.top
          scrollHost.scrollTo({
            top: Math.max(0, scrollHost.scrollTop - upBy - 12),
            behavior: "smooth",
          })
          return
        }
        el.scrollIntoView({ behavior: "smooth", block: "center" })
      } catch {
        // Ignore scrolling errors.
      }
    }, 120)
  }, [keyboardInset])

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

  function queueReverseGeocode(lat, lng, { immediate = false, force = false } = {}) {
    const latNum = Number(lat)
    const lngNum = Number(lng)
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return

    const prev = lastReverseCenterRef.current
    if (
      !force &&
      prev &&
      Number.isFinite(prev.lat) &&
      Number.isFinite(prev.lng)
    ) {
      const movedMeters = calculateDistance(prev.lat, prev.lng, latNum, lngNum)
      if (movedMeters < 10) return
    }

    if (reverseDebounceRef.current) {
      clearTimeout(reverseDebounceRef.current)
      reverseDebounceRef.current = null
    }

    const run = async () => {
      lastReverseCenterRef.current = { lat: latNum, lng: lngNum }
      await handleMapMoveEnd(latNum, lngNum)
    }

    if (immediate) {
      void run()
      return
    }

    reverseDebounceRef.current = setTimeout(() => {
      reverseDebounceRef.current = null
      void run()
    }, 420)
  }

  const reverseGeocodeWithGoogleMaps = async (lat, lng) => {
    if (typeof window === "undefined") return null
    if (
      !window.google?.maps?.Geocoder ||
      !Number.isFinite(Number(lat)) ||
      !Number.isFinite(Number(lng))
    ) {
      return null
    }

    const geocoder = new window.google.maps.Geocoder()
    return new Promise((resolve) => {
      geocoder.geocode({ location: { lat: Number(lat), lng: Number(lng) } }, (results, status) => {
        if (status !== "OK" || !Array.isArray(results) || results.length === 0) {
          resolve(null)
          return
        }

        const best = results[0]
        const byType = (type) =>
          (best.address_components || []).find((c) => c.types?.includes(type))?.long_name || ""

        const streetNo = byType("street_number")
        const route = byType("route")
        const sublocality = byType("sublocality") || byType("sublocality_level_1")
        const neighborhood = byType("neighborhood")
        const city = byType("locality") || byType("administrative_area_level_2")
        const state = byType("administrative_area_level_1")
        const zipCode = byType("postal_code")

        resolve({
          formattedAddress: String(best.formatted_address || "").trim(),
          street: [streetNo, route].filter(Boolean).join(" ").trim() || [route, neighborhood, sublocality].filter(Boolean).join(", "),
          city: city || "",
          state: state || "",
          zipCode: zipCode || "",
          hasStreetLevel: Boolean(streetNo || route || neighborhood || sublocality),
        })
      })
    })
  }

  const handleMapMoveEnd = async (lat, lng) => {
    if (!ENABLE_LOCATION_REVERSE_GEOCODE) return

    const requestSeq = ++reverseReqSeqRef.current
    try {
      // Detailed reverse-geocode for full address parts
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`
      const response = await fetch(url, { 
        headers: { 
          "Accept-Language": "en",
          "User-Agent": "AppZeto-Food-App" 
        } 
      })
      const json = await response.json()

      // Ignore stale/out-of-order responses so previous address doesn't mix in.
      if (requestSeq !== reverseReqSeqRef.current) return
      
      if (json && json.address) {
        const addr = json.address
        const formatted = String(json.display_name || "").trim()
        
        // Build strongest street/locality candidate available
        const streetCandidate = [
          addr.house_number,
          addr.road,
          addr.pedestrian,
          addr.residential,
          addr.neighbourhood,
          addr.suburb,
          addr.city_district,
          addr.hamlet,
        ].filter(Boolean).join(", ")
        const street = streetCandidate || addr.amenity || addr.industrial || addr.quarter || ""

        const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || ""
        const state = addr.state || ""
        const postcode = addr.postcode || ""

        let nextFormatted = formatted
        let nextStreet = street || ""
        let nextCity = city || ""
        let nextState = state || ""
        let nextZip = postcode || ""

        // Nominatim can return area-level text (e.g. "Juni Indore Tahsil") without street detail.
        // Promote to Google Maps geocoder result when available and more precise.
        const nominatimGeneric =
          !nextStreet ||
          nextFormatted.toLowerCase().includes("juni indore tahsil") ||
          nextFormatted.split(",").length < 4

        if (nominatimGeneric) {
          const googleResult = await reverseGeocodeWithGoogleMaps(lat, lng)
          if (requestSeq !== reverseReqSeqRef.current) return
          if (googleResult?.formattedAddress) {
            nextFormatted = googleResult.formattedAddress
            if (googleResult.hasStreetLevel) {
              nextStreet = googleResult.street || nextStreet
            }
            nextCity = googleResult.city || nextCity
            nextState = googleResult.state || nextState
            nextZip = googleResult.zipCode || nextZip
          }
        }

        setCurrentAddress(nextFormatted)
        setAddressFormData(prev => ({
          ...prev,
          // Replace stale values instead of merging old + new
          street: nextFormatted || nextStreet || "",
          city: nextCity || "",
          state: nextState || "",
          zipCode: nextZip || "",
        }))
      }
    } catch (e) {
      debugError("Reverse geocode error:", e)
    }
  }

  const handleAddressFormSubmit = async (e) => {
    e.preventDefault()
    if (!addressFormData.street?.trim()) {
      toast.error("Complete address is required")
      return
    }
    if (!addressFormData.buildingName?.trim()) {
      toast.error("Building / apartment is required")
      return
    }
    if (!addressFormData.floor?.trim()) {
      toast.error("Floor / flat / unit is required")
      return
    }
    if (!addressFormData.landmark?.trim()) {
      toast.error("Landmark / area details are required")
      return
    }
    if (!addressFormData.city?.trim() || !addressFormData.state?.trim()) {
      toast.error("City and state are required")
      return
    }
    setLoadingAddress(true)
    try {
      const payload = {
        ...addressFormData,
        label: addressFormData.label === "Work" ? "Office" : addressFormData.label,
        formattedAddress: composeAddressText(addressFormData),
        address: composeAddressText(addressFormData),
        location: { type: "Point", coordinates: [mapPosition[1], mapPosition[0]] },
        latitude: mapPosition[0],
        longitude: mapPosition[1]
      }
      const savedAddress = editingAddressId
        ? await updateAddress(editingAddressId, payload)
        : await addAddress(payload)
      if (savedAddress) {
        const id = getAddressId(savedAddress)
        if (id) await setDefaultAddress(id)
        persistSelectedLocation(buildLocationPayloadFromAddress(savedAddress || payload))
        try { localStorage.setItem("deliveryAddressMode", "saved") } catch {}
        toast.success(editingAddressId ? "Address updated" : "Address saved")
        setEditingAddressId(null)
        setShowAddressForm(false)
      }
    } catch (error) {
      toast.error(editingAddressId ? "Failed to update address" : "Failed to save address")
    } finally {
      setLoadingAddress(false)
    }
  }

  useEffect(() => {
    if (!showAddressForm) return
    const updateBaseMapHeight = () => {
      const vh = typeof window !== "undefined" ? window.innerHeight : 800
      const target = Math.round(vh * 0.45)
      setBaseMapHeight(Math.max(260, Math.min(420, target)))
    }
    updateBaseMapHeight()
    window.addEventListener("resize", updateBaseMapHeight)
    return () => window.removeEventListener("resize", updateBaseMapHeight)
  }, [showAddressForm])

  useEffect(() => {
    if (!showAddressForm) return
    setFormScrollTop(0)
  }, [showAddressForm])

  useEffect(() => {
    if (!showAddressForm || typeof window === "undefined" || !window.visualViewport) return
    const viewport = window.visualViewport
    const updateKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setKeyboardInset(inset > 0 ? inset : 0)
    }
    updateKeyboardInset()
    viewport.addEventListener("resize", updateKeyboardInset)
    viewport.addEventListener("scroll", updateKeyboardInset)
    return () => {
      viewport.removeEventListener("resize", updateKeyboardInset)
      viewport.removeEventListener("scroll", updateKeyboardInset)
    }
  }, [showAddressForm])

  if (showAddressForm) {
    const mapHeight = baseMapHeight 
    return (
      <AnimatedPage
        className="fixed inset-0 z-50 bg-white dark:bg-[#0a0a0a] flex flex-col h-screen overflow-hidden"
      >
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleCancelAddressForm} className="rounded-full">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-lg font-bold">{editingAddressId ? "Edit delivery location" : "Add delivery location"}</h1>
        </div>

        <div
          ref={formBodyRef}
          onScroll={(e) => {
            setFormScrollTop(e.currentTarget.scrollTop)
          }}
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: `${96 + keyboardInset}px` }}
        >
          {/* Map Section - Parallax enabled */}
          <div
            className="flex-shrink-0 relative z-0"
            style={{ 
              height: `${mapHeight}px`,
              transform: `translateY(${formScrollTop * 0.4}px)`,
              opacity: clamp(1 - (formScrollTop / 500), 0.4, 1)
            }}
          >
            <div className="absolute top-4 left-4 right-4 z-20">
              <div className="relative group shadow-2xl">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  value={addressAutocompleteValue}
                  onChange={(e) => setAddressAutocompleteValue(e.target.value)}
                  placeholder="Search area, street, landmark..."
                  className="pl-10 h-12 bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-md border-none rounded-xl shadow-lg focus:ring-2 transition-all"
                  style={{ '--tw-ring-color': BRAND_THEME.tokens.cart.primaryText }}
                />
                {isKeywordSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                     <div className="animate-spin rounded-full h-4 w-4 border-2 border-t-transparent" style={{ borderColor: BRAND_THEME.tokens.cart.primaryText, borderTopColor: 'transparent' }} />
                  </div>
                )}

                {keywordAddressSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden z-30 animate-in fade-in slide-in-from-top-2 duration-200">
                    <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 dark:bg-gray-800/50">Suggestions</p>
                    {keywordAddressSuggestions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          const { lat, lng, display, address: a } = s
                          setMapPosition([lat, lng])
                          if (googleMapRef.current) {
                            googleMapRef.current.panTo({ lat, lng })
                            googleMapRef.current.setZoom(17)
                          }
                          setCurrentAddress(display || "")
                          setAddressAutocompleteValue(display)
                          const city = a.city || a.town || a.village || a.county || ""
                          const state = a.state || ""
                          const zipCode = a.postcode || ""
                          setAddressFormData((prev) => ({
                            ...prev,
                            street: display || prev.street,
                            city: city || prev.city,
                            state: state || prev.state,
                            zipCode: zipCode || prev.zipCode,
                          }))
                          setKeywordAddressSuggestions([])
                          queueReverseGeocode(lat, lng, { immediate: true, force: true })
                        }}
                        className="w-full px-4 py-3 flex items-start gap-3 hover:bg-brand-50 dark:hover:bg-brand-900/10 transition-colors text-left border-b border-gray-50 dark:border-gray-800 last:border-none"
                      >
                        <MapPin className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{s.display}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.address?.city || s.address?.state}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div ref={mapContainerRef} className="w-full h-full bg-gray-100 dark:bg-gray-800" />
            
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
               <div className="relative mb-8 flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center p-2 mb-[-6px] shadow-sm animate-bounce-short">
                     <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center border-2 border-white">
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                     </div>
                  </div>
                  <div className="w-1.5 h-6 bg-green-600 border-x border-white shadow-xl rounded-b-full shadow-green-900/40" />
                  <div className="w-3 h-1.5 bg-black/20 rounded-full blur-[1px] transform scale-x-150 absolute bottom-[-4px]" />
               </div>
            </div>

            {mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: BRAND_THEME.tokens.cart.primaryText }} />
              </div>
            )}
            
            <div className="absolute bottom-10 right-4 z-10">
              <Button 
                  onClick={handleUseCurrentLocation} 
                  className="bg-white text-black hover:bg-gray-100 shadow-xl border border-gray-200 rounded-full h-12 px-6"
              >
                <Navigation className="h-4 w-4 mr-2" style={{ color: BRAND_THEME.tokens.cart.primaryText }} /> Use My Location
              </Button>
            </div>
          </div>

          <div className="relative bg-white dark:bg-[#0a0a0a] rounded-t-[32px] -mt-8 z-10 p-4 space-y-6 shadow-[0_-12px_24px_-10px_rgba(0,0,0,0.1)]">
            <div>
              <Label className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2 block">Complete Address</Label>
              <Input 
                placeholder="House no, street, colony" 
                value={addressFormData.street} 
                onChange={e => setAddressFormData({...addressFormData, street: e.target.value})}
                onFocus={() => scrollFieldIntoView("street")}
                ref={(el) => { manualFieldRefs.current.street = el }}
                className="h-12 rounded-xl bg-gray-50 dark:bg-gray-800/50"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1 block">Building / Apartment</Label>
                <Input
                  placeholder="Apartment, building, tower"
                  value={addressFormData.buildingName || ""}
                  onChange={e => setAddressFormData({...addressFormData, buildingName: e.target.value})}
                  onFocus={() => scrollFieldIntoView("buildingName")}
                  ref={(el) => { manualFieldRefs.current.buildingName = el }}
                  className="h-12 rounded-xl"
                  required
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1 block">Floor / Flat / Unit</Label>
                <Input
                  placeholder="Floor 3, Flat 302"
                  value={addressFormData.floor || ""}
                  onChange={e => setAddressFormData({...addressFormData, floor: e.target.value})}
                  onFocus={() => scrollFieldIntoView("floor")}
                  ref={(el) => { manualFieldRefs.current.floor = el }}
                  className="h-12 rounded-xl"
                  required
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1 block">Landmark / Area details</Label>
              <Input
                placeholder="Near metro, gate no 2, backside lane"
                value={addressFormData.landmark || addressFormData.additionalDetails || ""}
                onChange={e => setAddressFormData({
                  ...addressFormData,
                  landmark: e.target.value,
                  additionalDetails: e.target.value,
                })}
                onFocus={() => scrollFieldIntoView("landmark")}
                ref={(el) => { manualFieldRefs.current.landmark = el }}
                className="h-12 rounded-xl"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1 block">City</Label>
                <Input 
                  value={addressFormData.city} 
                  onChange={e => setAddressFormData({...addressFormData, city: e.target.value})} 
                  onFocus={() => scrollFieldIntoView("city")}
                  ref={(el) => { manualFieldRefs.current.city = el }}
                  className="h-12 rounded-xl"
                  required 
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1 block">State</Label>
                <Input 
                  value={addressFormData.state} 
                  onChange={e => setAddressFormData({...addressFormData, state: e.target.value})} 
                  onFocus={() => scrollFieldIntoView("state")}
                  ref={(el) => { manualFieldRefs.current.state = el }}
                  className="h-12 rounded-xl"
                  required 
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1 block">Pincode / ZIP</Label>
              <Input 
                placeholder="Pincode" 
                value={addressFormData.zipCode || ""} 
                onChange={e => setAddressFormData({...addressFormData, zipCode: e.target.value})} 
                onFocus={() => scrollFieldIntoView("zipCode")}
                ref={(el) => { manualFieldRefs.current.zipCode = el }}
                className="h-12 rounded-xl"
              />
            </div>

            <div>
               <Label className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2 block">Save address as</Label>
               <div className="flex gap-2">
                 {["Home", "Work", "Other"].map(l => (
                   <Button 
                     key={l}
                     variant={addressFormData.label === l ? "default" : "outline"}
                     onClick={() => setAddressFormData({...addressFormData, label: l})}
                     className="flex-1"
                     style={addressFormData.label === l ? {backgroundColor: BRAND_THEME.tokens.cart.primaryText, color: 'white'} : {}}
                   >
                     {l}
                   </Button>
                 ))}
               </div>
            </div>
          </div>
        </div>

        <div
          className="fixed left-0 right-0 p-4 bg-white dark:bg-[#1a1a1a] border-t dark:border-gray-800 transition-[bottom] duration-150"
          style={{ bottom: `${keyboardInset}px` }}
        >
          <Button 
            className="w-full h-12 text-white font-bold text-lg" 
            style={{backgroundColor: BRAND_THEME.tokens.cart.primaryText}}
            onClick={handleAddressFormSubmit}
            disabled={loadingAddress}
          >
            {loadingAddress ? (editingAddressId ? "Updating..." : "Saving...") : (editingAddressId ? "Update Address" : "Save Address \u0026 Proceed")}
          </Button>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <AnimatedPage className={`min-h-screen ${BRAND_THEME.tokens.cart.pageBackground} flex flex-col`}>
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleBack} className="rounded-full">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-xl font-bold">Select Location</h1>
      </div>

      <div className="flex-1 overflow-y-auto pb-10">
        <div className="p-4 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-800">
          <button 
            onClick={handleUseCurrentLocation}
            className="w-full flex items-center gap-4 p-4 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm hover:shadow-md transition-all group"
          >
            <div className="h-10 w-10 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
              <Navigation className="h-5 w-5" style={{ color: BRAND_THEME.tokens.cart.primaryText }} />
            </div>
            <div className="text-left flex-1">
              <p className="font-bold" style={{ color: BRAND_THEME.tokens.cart.primaryText }}>Use Current Location</p>
              <p className="text-xs text-gray-500 line-clamp-1">
                {!isCoordinateLikeText(currentAddress) && currentAddress
                  ? currentAddress
                  : (loading ? "Fetching complete address..." : "Enable GPS for accuracy")}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">Saved Addresses</h2>
            <Button variant="ghost" className="p-0 h-auto font-bold" style={{ color: BRAND_THEME.tokens.cart.primaryText }} onClick={handleAddAddressClick}>
              <Plus className="h-4 w-4 mr-1" /> Add New
            </Button>
          </div>

          <div className="space-y-4">
            {addresses.length === 0 ? (
              <div className="text-center py-10 opacity-50">
                <MapPin className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                <p>No addresses saved yet</p>
              </div>
            ) : (
              addresses.map((addr, idx) => {
                const Icon = getAddressIcon(addr)
                return (
                  <div
                    key={getAddressId(addr) || idx}
                    className="w-full flex items-start gap-4 p-4 bg-slate-50 dark:bg-[#1a1a1a] rounded-xl hover:bg-brand-50 dark:hover:bg-brand-900/10 transition-colors text-left group"
                  >
                    <div className="h-10 w-10 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm">
                      <Icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectSavedAddress(addr)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="font-bold text-gray-900 dark:text-white capitalize">{addr.label || "Address"}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                        {composeAddressText(addr)}
                      </p>
                    </button>
                    <div className="flex items-center gap-2 mt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditAddressClick(addr)}
                        className="h-9 w-9 rounded-full border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700"
                        aria-label={`Edit ${addr.label || "address"}`}
                      >
                        <MoreHorizontal className="h-4 w-4" style={{ color: BRAND_THEME.colors.brand.primary }} />
                      </Button>
                      <button
                        type="button"
                        onClick={() => handleSelectSavedAddress(addr)}
                        className="h-6 w-6 rounded-full border border-gray-200 dark:border-gray-700 mt-2 flex items-center justify-center"
                        style={{ borderColor: BRAND_THEME.colors.brand.primary }}
                        aria-label={`Select ${addr.label || "address"}`}
                      >
                        <ChevronRight className="h-3 w-3 text-gray-400" style={{ color: BRAND_THEME.colors.brand.primary }} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes bounce-short {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .animate-bounce-short {
          animation: bounce-short 1s infinite ease-in-out;
        }
      `}</style>
    </AnimatedPage>
  )
}
