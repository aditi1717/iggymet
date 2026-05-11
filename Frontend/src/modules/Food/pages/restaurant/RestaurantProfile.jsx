import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  ArrowLeft, 
  Save, 
  Edit2, 
  MapPin, 
  User, 
  Store, 
  CreditCard, 
  ShieldCheck, 
  Image as ImageIcon,
  Loader2,
  Upload,
  Check,
  X,
  Phone,
  Mail,
  Building,
  CheckCircle2,
  Info,
  Clock,
  ChevronRight,
  TrendingUp,
  Tag
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { restaurantAPI } from "@food/api"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@food/components/ui/select"
import { toast } from "sonner"
import BRAND_THEME from "@/config/brandTheme"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import { zoneAPI } from "@food/api"
import { clearModuleAuth } from "@food/utils/auth"

const isPointInPolygon = (latitude, longitude, polygonCoordinates) => {
  if (!Array.isArray(polygonCoordinates) || polygonCoordinates.length < 3) return true
  const x = Number(latitude)
  const y = Number(longitude)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  let inside = false
  for (let i = 0, j = polygonCoordinates.length - 1; i < polygonCoordinates.length; j = i++) {
    const xi = Number(polygonCoordinates[i].latitude)
    const yi = Number(polygonCoordinates[i].longitude)
    const xj = Number(polygonCoordinates[j].latitude)
    const yj = Number(polygonCoordinates[j].longitude)
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

const buildBoundsFromZone = (zone) => {
  const coordinates = Array.isArray(zone?.coordinates) ? zone.coordinates : []
  if (coordinates.length < 3 || !window.google?.maps?.LatLngBounds) return null
  const bounds = new window.google.maps.LatLngBounds()
  coordinates.forEach((point) => {
    const lat = Number(point?.latitude)
    const lng = Number(point?.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng)) bounds.extend({ lat, lng })
  })
  return bounds
}

const getProfileUpdateErrorMessage = (error) => {
  const backendMessage = String(
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    "",
  ).trim()

  if (/cuisines must be an array of strings/i.test(backendMessage)) {
    return "Please select cuisines in list format. Example: North Indian, Chinese, Fast Food."
  }

  return backendMessage || "Failed to save changes"
}

const getZoneIdValue = (zone) => String(zone?._id || zone?.id || "").trim()

const normalizeProfileZoneId = (value) => {
  if (!value) return ""
  if (typeof value === "object") return getZoneIdValue(value)
  return String(value).trim()
}

const RestaurantProfile = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [savingSection, setSavingSection] = useState(null)
  
  const [basicInfo, setBasicInfo] = useState({
    name: "",
    pureVegRestaurant: false,
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    primaryContactNumber: "",
  })

  const [location, setLocation] = useState({
    addressLine1: "",
    addressLine2: "",
    area: "",
    city: "",
    state: "",
    pincode: "",
    landmark: "",
    latitude: 0,
    longitude: 0,
    zoneId: "",
    formattedAddress: "",
  })

  const [opsInfo, setOpsInfo] = useState({
    cuisines: [],
    estimatedDeliveryTime: "",
    featuredDish: "",
    offer: "",
  })

  const [kycInfo, setKycInfo] = useState({
    panNumber: "",
    nameOnPan: "",
    panImage: null,
    gstRegistered: false,
    gstNumber: "",
    gstLegalName: "",
    gstAddress: "",
    gstImage: null,
    fssaiNumber: "",
    fssaiExpiry: "",
    fssaiImage: null,
  })

  const [bankInfo, setBankInfo] = useState({
    accountNumber: "",
    ifscCode: "",
    accountHolderName: "",
    accountType: "Saving",
  })

  const [imageInfo, setImageInfo] = useState({
    profileImage: null,
    menuImages: [],
  })

  const [editStates, setEditStates] = useState({
    basic: false,
    location: false,
    operations: false,
    kyc: false,
    fssai: false,
    bank: false,
    images: false,
  })

  const [zones, setZones] = useState([])
  const [zonesLoading, setZonesLoading] = useState(false)
  const locationSearchInputRef = useRef(null)
  const placesAutocompleteRef = useRef(null)
  const mapsScriptLoadedRef = useRef(false)
  const selectedZoneRef = useRef(null)

  const isAutofilled = !!(location.latitude && location.longitude)

  useEffect(() => {
    fetchInitialData()
    loadZones()
  }, [])

  const loadZones = async () => {
    try {
      setZonesLoading(true)
      const res = await zoneAPI.getPublicZones()
      const list = res?.data?.data?.zones || res?.data?.zones || []
      setZones(Array.isArray(list) ? list : [])
    } catch (err) {
      console.error("Failed to load zones:", err)
    } finally {
      setZonesLoading(false)
    }
  }

  useEffect(() => {
    if (!editStates.location) {
      placesAutocompleteRef.current = null
      return
    }

    let cancelled = false

    const init = async () => {
      const apiKey = await getGoogleMapsApiKey()
      if (!apiKey) {
        console.error("Google Maps API key is missing")
        return
      }

      const loadMaps = async () => {
        if (window.google?.maps?.places?.Autocomplete) return true
        
        const existingScript = document.getElementById("restaurant-onboarding-maps-script")
        if (existingScript) {
          for (let i = 0; i < 50; i++) {
            if (window.google?.maps?.places?.Autocomplete) return true
            await new Promise((r) => setTimeout(r, 100))
          }
          return !!window.google?.maps?.places?.Autocomplete
        }

        return new Promise((resolve) => {
          const script = document.createElement("script")
          script.id = "restaurant-onboarding-maps-script"
          script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly`
          script.async = true
          script.defer = true
          script.onload = () => resolve(true)
          script.onerror = () => resolve(false)
          document.head.appendChild(script)
        })
      }

      const ok = await loadMaps()
      if (!ok || cancelled || !locationSearchInputRef.current) return

      // Ensure input is enabled and ready
      await new Promise(r => setTimeout(r, 200))

      if (placesAutocompleteRef.current) {
        // Remove existing pac-containers to avoid duplicates
        const containers = document.querySelectorAll('.pac-container')
        containers.forEach(c => c.remove())
        placesAutocompleteRef.current = null
      }

      placesAutocompleteRef.current = new window.google.maps.places.Autocomplete(
        locationSearchInputRef.current,
        {
          fields: ["formatted_address", "address_components", "geometry"],
          componentRestrictions: { country: "in" },
          strictBounds: true,
        }
      )

      // Apply initial bounds if zone is selected
      if (location.zoneId) {
        const zone = zones.find(z => String(z._id || z.id) === String(location.zoneId))
        if (zone?.coordinates?.length >= 3) {
          const bounds = new window.google.maps.LatLngBounds()
          zone.coordinates.forEach(coord => {
            bounds.extend({ lat: Number(coord.latitude), lng: Number(coord.longitude) })
          })
          placesAutocompleteRef.current.setBounds(bounds)
        }
      }

      const parsePlace = (place) => {
        const comps = Array.isArray(place?.address_components) ? place.address_components : []
        const get = (types) => comps.find((c) => types.some((t) => c.types?.includes(t)))?.long_name || ""
        return {
          formattedAddress: place?.formatted_address || "",
          area: get(["sublocality_level_1", "sublocality", "neighborhood"]) || get(["locality"]),
          city: get(["locality"]) || get(["administrative_area_level_2"]),
          state: get(["administrative_area_level_1"]),
          pincode: get(["postal_code"]),
          latitude: place?.geometry?.location?.lat?.(),
          longitude: place?.geometry?.location?.lng?.(),
        }
      }

      placesAutocompleteRef.current.addListener("place_changed", () => {
        const place = placesAutocompleteRef.current.getPlace()
        if (!place.geometry) return

        const parsed = parsePlace(place)

        if (parsed.latitude && parsed.longitude && selectedZoneRef.current) {
          const zoneCoords = selectedZoneRef.current.coordinates
          if (Array.isArray(zoneCoords) && zoneCoords.length >= 3) {
            const isInside = isPointInPolygon(parsed.latitude, parsed.longitude, zoneCoords)
            if (!isInside) {
              toast.error(`Selected location is outside your service zone.`)
              return
            }
          }
        }

        setLocation((prev) => ({
          ...prev,
          formattedAddress: parsed.formattedAddress || prev.formattedAddress,
          addressLine1: prev.addressLine1 || parsed.formattedAddress || "",
          area: parsed.area || prev.area,
          city: parsed.city || prev.city,
          state: parsed.state || prev.state,
          pincode: parsed.pincode || prev.pincode,
          latitude: parsed.latitude !== undefined ? parsed.latitude : prev.latitude,
          longitude: parsed.longitude !== undefined ? parsed.longitude : prev.longitude,
        }))
      })
    }

    init()

    return () => { cancelled = true }
  }, [editStates.location])

  useEffect(() => {
    if (!placesAutocompleteRef.current || !location.zoneId || zones.length === 0) return
    
    const selectedZone = zones.find((z) => String(z?._id || z?.id) === String(location.zoneId))
    selectedZoneRef.current = selectedZone
    
    if (window.google?.maps) {
      const bounds = buildBoundsFromZone(selectedZone)
      if (bounds) {
        placesAutocompleteRef.current.setBounds(bounds)
        placesAutocompleteRef.current.setOptions({
          strictBounds: true,
          componentRestrictions: { country: "in" }
        })
      } else {
        placesAutocompleteRef.current.setOptions({
          strictBounds: false,
          componentRestrictions: { country: "in" }
        })
      }
    }
  }, [editStates.location, location.zoneId, zones])

  const fetchInitialData = async () => {
    try {
      const response = await restaurantAPI.getCurrentRestaurant()
      const data = response?.data?.data?.restaurant || response?.data?.restaurant
      
      if (data) {
        // Map Basic Info
        setBasicInfo({
          name: data.restaurantName || data.name || "",
          pureVegRestaurant: !!data.pureVegRestaurant,
          ownerName: data.ownerName || "",
          ownerEmail: data.ownerEmail || "",
          ownerPhone: data.ownerPhone || "",
          primaryContactNumber: data.primaryContactNumber || "",
        })

        // Map Location
        setLocation({
          addressLine1: data.addressLine1 || data.location?.addressLine1 || "",
          addressLine2: data.addressLine2 || data.location?.addressLine2 || "",
          area: data.area || data.location?.area || "",
          city: data.city || data.location?.city || "",
          state: data.state || data.location?.state || "",
          pincode: data.pincode || data.location?.pincode || "",
          landmark: data.landmark || data.location?.landmark || "",
          latitude: data.location?.latitude || data.latitude || 0,
          longitude: data.location?.longitude || data.longitude || 0,
          zoneId: normalizeProfileZoneId(data.zoneId),
          formattedAddress: data.location?.formattedAddress || data.formattedAddress || "",
        })

        // Map Operations
        setOpsInfo({
          cuisines: Array.isArray(data.cuisines) ? data.cuisines : (data.cuisines ? String(data.cuisines).split(",").map(c => c.trim()) : []),
          estimatedDeliveryTime: data.estimatedDeliveryTime || "",
          featuredDish: data.featuredDish || "",
          offer: data.offer || "",
        })

        // Map KYC
        setKycInfo({
          panNumber: data.panNumber || "",
          nameOnPan: data.nameOnPan || "",
          panImage: data.panImage || null,
          gstRegistered: data.gstRegistered === true || String(data.gstRegistered) === 'true',
          gstNumber: data.gstNumber || "",
          gstLegalName: data.gstLegalName || "",
          gstAddress: data.gstAddress || "",
          gstImage: data.gstImage || null,
          fssaiNumber: data.fssaiNumber || "",
          fssaiExpiry: data.fssaiExpiry ? String(data.fssaiExpiry).split('T')[0] : "",
          fssaiImage: data.fssaiImage || null,
        })

        // Map Bank
        setBankInfo({
          accountNumber: data.accountNumber || "",
          ifscCode: data.ifscCode || "",
          accountHolderName: data.accountHolderName || "",
          accountType: data.accountType || "Saving",
        })

        // Map Images
        setImageInfo({
          profileImage: data.profileImage || null,
          menuImages: data.menuImages || [],
        })
      }
    } catch (error) {
      console.error("Failed to fetch restaurant data:", error)
      toast.error("Failed to load profile details")
    } finally {
      setLoading(false)
    }
  }

  const toggleEdit = (section) => {
    setEditStates(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const isUploadableFile = (val) => val instanceof File

  const getPreviewUrl = (value) => {
    if (!value) return ""
    if (isUploadableFile(value)) return URL.createObjectURL(value)
    if (typeof value === 'string') return value
    if (value?.url) return value.url
    return ""
  }

  const handleSaveSection = async (section) => {
    // Validation logic
    if (section === 'basic') {
      if (!basicInfo.ownerName.trim()) return toast.error("Owner name is required")
      if (!/^[a-zA-Z\s]*$/.test(basicInfo.ownerName)) return toast.error("Owner name should only contain letters")
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(basicInfo.ownerEmail)) return toast.error("Invalid email format")
      if (!/^\d{10}$/.test(basicInfo.ownerPhone)) return toast.error("Owner phone must be 10 digits")
      if (basicInfo.primaryContactNumber && !/^\d{10,20}$/.test(basicInfo.primaryContactNumber)) return toast.error("Secondary contact number should be between 10 and 20 digits")
    } else if (section === 'kyc') {
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
      if (!panRegex.test(kycInfo.panNumber)) return toast.error("Invalid PAN format (e.g., ABCDE1234F)")
      if (!/^[a-zA-Z\s]*$/.test(kycInfo.nameOnPan)) return toast.error("Name on PAN should only contain letters and spaces")
      
      if (kycInfo.gstRegistered) {
        if (!kycInfo.gstNumber) return toast.error("GST number is required")
        const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
        if (!gstRegex.test(kycInfo.gstNumber)) return toast.error("Invalid GST number format (e.g., 22AAAAA0000A1Z5)")
        if (!kycInfo.gstLegalName) return toast.error("Legal entity name is required")
        if (!/^[a-zA-Z\s]*$/.test(kycInfo.gstLegalName)) return toast.error("Legal entity name should only contain letters and spaces")
      }
    } else if (section === "fssai") {
      if (kycInfo.fssaiNumber && !/^\d{14}$/.test(kycInfo.fssaiNumber)) return toast.error("FSSAI license number must be 14 digits")
    } else if (section === 'bank') {
      if (!bankInfo.accountNumber) return toast.error("Account number is required")
      if (!/^\d{9,15}$/.test(bankInfo.accountNumber)) return toast.error("Account number should be 9 to 15 digits")
      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/
      if (!ifscRegex.test(bankInfo.ifscCode)) return toast.error("Invalid IFSC code format (e.g., ABCD0123456)")
      if (!bankInfo.accountHolderName) return toast.error("Account holder name is required")
      if (!/^[a-zA-Z\s]*$/.test(bankInfo.accountHolderName)) return toast.error("Account holder name should only contain letters and spaces")
    } else if (section === 'location') {
      const selectedZoneId = normalizeProfileZoneId(location.zoneId)
      const selectedZone = zones.find((zone) => getZoneIdValue(zone) === selectedZoneId)
      if (!selectedZoneId || !selectedZone) return toast.error("Please select a valid service zone")
    }

    setSavingSection(section)
    try {
      const formData = new FormData()
      let requestPayload = formData
      
      if (section === 'basic') {
        formData.append("restaurantName", basicInfo.name)
        formData.append("pureVegRestaurant", String(basicInfo.pureVegRestaurant))
        formData.append("ownerName", basicInfo.ownerName)
        formData.append("ownerEmail", basicInfo.ownerEmail)
        formData.append("ownerPhone", basicInfo.ownerPhone)
        formData.append("primaryContactNumber", basicInfo.primaryContactNumber)
      } else if (section === 'location') {
        requestPayload = {
          zoneId: normalizeProfileZoneId(location.zoneId),
          location: {
            addressLine1: location.addressLine1,
            addressLine2: location.addressLine2,
            area: location.area,
            city: location.city,
            state: location.state,
            pincode: location.pincode,
            landmark: location.landmark,
            latitude: location.latitude,
            longitude: location.longitude,
            formattedAddress: location.formattedAddress || "",
          },
        }
      } else if (section === 'operations') {
        const normalizedCuisines = opsInfo.cuisines
          .map((c) => String(c || "").trim())
          .filter(Boolean)
        requestPayload = {
          cuisines: normalizedCuisines,
          estimatedDeliveryTime: opsInfo.estimatedDeliveryTime,
          featuredDish: opsInfo.featuredDish,
          offer: opsInfo.offer,
        }
      } else if (section === 'kyc') {
        formData.append("panNumber", kycInfo.panNumber)
        formData.append("nameOnPan", kycInfo.nameOnPan)
        if (isUploadableFile(kycInfo.panImage)) {
          formData.append("panImage", kycInfo.panImage)
        } else if (kycInfo.panImage) {
          formData.append("panImage", getPreviewUrl(kycInfo.panImage))
        }
        
        formData.append("gstRegistered", String(kycInfo.gstRegistered))
        if (kycInfo.gstRegistered) {
          formData.append("gstNumber", kycInfo.gstNumber)
          formData.append("gstLegalName", kycInfo.gstLegalName)
          formData.append("gstAddress", kycInfo.gstAddress)
          if (isUploadableFile(kycInfo.gstImage)) {
            formData.append("gstImage", kycInfo.gstImage)
          } else if (kycInfo.gstImage) {
            formData.append("gstImage", getPreviewUrl(kycInfo.gstImage))
          }
        }
      } else if (section === "fssai") {
        formData.append("fssaiNumber", kycInfo.fssaiNumber)
        formData.append("fssaiExpiry", kycInfo.fssaiExpiry)
        if (isUploadableFile(kycInfo.fssaiImage)) {
          formData.append("fssaiImage", kycInfo.fssaiImage)
        } else if (kycInfo.fssaiImage) {
          formData.append("fssaiImage", getPreviewUrl(kycInfo.fssaiImage))
        }
      } else if (section === 'bank') {
        formData.append("accountNumber", bankInfo.accountNumber)
        formData.append("ifscCode", bankInfo.ifscCode)
        formData.append("accountHolderName", bankInfo.accountHolderName)
        formData.append("accountType", bankInfo.accountType)
      } else if (section === 'images') {
        if (isUploadableFile(imageInfo.profileImage)) {
          formData.append("profileImage", imageInfo.profileImage)
        } else if (imageInfo.profileImage) {
          formData.append("profileImage", getPreviewUrl(imageInfo.profileImage))
        }
        imageInfo.menuImages.forEach(img => {
          if (isUploadableFile(img)) {
            formData.append("menuImages", img)
          } else {
            const url = getPreviewUrl(img)
            if (url) formData.append("menuImages", url)
          }
        })
      }

      const response = await restaurantAPI.updateProfile(requestPayload)
      const updatedData = response?.data?.data?.restaurant || response?.data?.restaurant

      // Redirect if the update triggered a status change to 'pending' (requires approval)
      if (updatedData?.status === 'pending') {
        clearModuleAuth("restaurant")
        window.dispatchEvent(new Event("restaurantAuthChanged"))
        toast.success("Update submitted for approval. Please log in again.")
        navigate("/food/restaurant/login", { replace: true })
        return
      }

      toast.success(`${section.charAt(0).toUpperCase() + section.slice(1)} info updated!`)
      setEditStates(prev => ({ ...prev, [section]: false }))
      fetchInitialData() // Refresh to get server values
    } catch (error) {
      console.error(`Failed to save ${section} section:`, error)
      toast.error(getProfileUpdateErrorMessage(error))
    } finally {
      setSavingSection(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#005128] mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading your profile...</p>
        </div>
      </div>
    )
  }

  const SectionHeader = ({ icon: Icon, title, section, isEditing, onToggle, onSave, isSaving }) => (
    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-xl ${isEditing ? 'bg-[#005128] text-white' : 'bg-[#e6f0eb] text-[#005128]'}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{isEditing ? 'Editing Mode' : 'View Only'}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!isEditing ? (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onToggle} 
            className="text-[#005128] hover:bg-[#e6f0eb] rounded-full px-4"
          >
            <Edit2 className="w-4 h-4 mr-2" /> Edit
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onToggle} 
              disabled={isSaving}
              className="text-slate-500 hover:bg-slate-100 rounded-full"
            >
              Cancel
            </Button>
            <Button 
              size="sm" 
              onClick={onSave} 
              disabled={isSaving}
              className="bg-[#005128] hover:bg-[#003d1e] text-white rounded-full px-5 shadow-lg shadow-green-900/20"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-2" /> Save</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Premium Cover-Style Header */}
      <header className="bg-gradient-to-br from-[#005128] via-[#005128] to-[#003d1e] text-white pt-8 pb-12 px-6 relative overflow-hidden">
        {/* Artistic Background Elements */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] -mr-48 -mt-48 animate-pulse"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full blur-[80px] -ml-32 -mb-32"></div>
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
        </div>
        
        {/* Refined Bottom Curve */}
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-slate-50" style={{ clipPath: 'polygon(0 100%, 100% 100%, 100% 0, 0 100%)' }}></div>
        
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="flex items-center justify-between mb-8">
            <button 
              onClick={() => navigate('/food/restaurant/explore')}
              className="p-2.5 bg-white/10 backdrop-blur-xl hover:bg-white/20 rounded-2xl transition-all group border border-white/20 shadow-xl"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            </button>
            <div className="bg-white/10 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/20 flex items-center gap-2 shadow-lg">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Verified Partner</span>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-center md:items-end gap-6 text-center md:text-left pb-4">
            <div className="relative group">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-[2.5rem] overflow-hidden border-4 border-white shadow-2xl bg-slate-100 transition-transform group-hover:scale-105 duration-500">
                {imageInfo.profileImage ? (
                  <img src={getPreviewUrl(imageInfo.profileImage)} alt="Restaurant" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                    <Store className="w-12 h-12" />
                  </div>
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 w-9 h-9 bg-[#005128] rounded-2xl flex items-center justify-center border-4 border-white shadow-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex flex-col items-center md:items-start">
                <h1 className="text-3xl md:text-5xl font-black mb-3 tracking-tight leading-tight text-white drop-shadow-md">
                  {basicInfo.name || "My Restaurant"}
                </h1>
                <div className="flex flex-wrap justify-center md:justify-start items-center gap-3">
                  <div className="flex items-center gap-2 text-xs font-black bg-emerald-900/40 px-4 py-1.5 rounded-xl backdrop-blur-md border border-emerald-500/20 text-emerald-50">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" /> {location.area || 'Locality'}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-black bg-emerald-900/40 px-4 py-1.5 rounded-xl backdrop-blur-md border border-emerald-500/20 text-emerald-50">
                    <User className="w-3.5 h-3.5 text-emerald-400" /> {basicInfo.ownerName || 'Owner'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 mt-6 space-y-6">
        
        {/* Quick Stats / Indicators - More Compact */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Restaurant Type', val: basicInfo.pureVegRestaurant ? 'Pure Veg' : 'Non-Veg', icon: Tag, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Avg Delivery', val: opsInfo.estimatedDeliveryTime || '30-45 mins', icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Featured Dish', val: opsInfo.featuredDish || 'Not Set', icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'GST Status', val: kycInfo.gstRegistered ? 'Active' : 'Unregistered', icon: ShieldCheck, color: 'text-orange-600', bg: 'bg-orange-50' },
          ].map((stat, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              key={i} 
              className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3"
            >
              <div className={`p-2.5 rounded-xl ${stat.bg} ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
                <p className="text-sm font-bold text-slate-900">{stat.val}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Basic Information Section */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <SectionHeader 
            icon={User} 
            title="Basic Information" 
            section="basic"
            isEditing={editStates.basic}
            onToggle={() => toggleEdit('basic')}
            onSave={() => handleSaveSection('basic')}
            isSaving={savingSection === 'basic'}
          />
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 ml-1">Restaurant Name</Label>
              <Input 
                value={basicInfo.name} 
                onChange={e => setBasicInfo({...basicInfo, name: e.target.value})}
                disabled={!editStates.basic}
                className="rounded-xl border-slate-200 focus:ring-[#005128] bg-slate-50/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 ml-1">Veg / Non-Veg</Label>
              <div className="flex items-center gap-4 py-2">
                <button
                  type="button"
                  onClick={() => editStates.basic && setBasicInfo({...basicInfo, pureVegRestaurant: true})}
                  className={`flex-1 px-4 py-3 rounded-xl border text-sm font-bold transition-all ${basicInfo.pureVegRestaurant ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                  disabled={!editStates.basic}
                >
                  Pure Veg
                </button>
                <button
                  type="button"
                  onClick={() => editStates.basic && setBasicInfo({...basicInfo, pureVegRestaurant: false})}
                  className={`flex-1 px-4 py-3 rounded-xl border text-sm font-bold transition-all ${!basicInfo.pureVegRestaurant ? 'bg-rose-50 border-rose-500 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                  disabled={!editStates.basic}
                >
                  Non-Veg / Both
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 ml-1">Owner Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <Input 
                  value={basicInfo.ownerName} 
                  onChange={e => setBasicInfo({...basicInfo, ownerName: e.target.value.replace(/[^a-zA-Z\s]/g, "")})}
                  disabled={!editStates.basic}
                  className="pl-10 rounded-xl bg-slate-50/50"
                  placeholder="Owner's Full Name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 ml-1">Owner Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <Input 
                  type="email"
                  value={basicInfo.ownerEmail} 
                  onChange={e => setBasicInfo({...basicInfo, ownerEmail: e.target.value})}
                  disabled={!editStates.basic}
                  className="pl-10 rounded-xl bg-slate-50/50"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 ml-1">Owner Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <Input 
                  value={basicInfo.ownerPhone} 
                  onChange={e => setBasicInfo({...basicInfo, ownerPhone: e.target.value.replace(/\D/g, "").slice(0, 10)})}
                  disabled={!editStates.basic}
                  className="pl-10 rounded-xl bg-slate-50/50"
                  placeholder="10-digit mobile number"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 ml-1">Secondary Contact</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <Input 
                  value={basicInfo.primaryContactNumber} 
                  onChange={e => setBasicInfo({...basicInfo, primaryContactNumber: e.target.value.replace(/\D/g, "").slice(0, 20)})}
                  disabled={!editStates.basic}
                  className="pl-10 rounded-xl bg-slate-50/50"
                  placeholder="Max 20-digit contact number"
                />
              </div>
            </div>
          </div>
        </motion.section>

        {/* Location & Address Section */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-sm border border-slate-200"
        >
          <SectionHeader 
            icon={MapPin} 
            title="Location & Address" 
            section="location"
            isEditing={editStates.location}
            onToggle={() => toggleEdit('location')}
            onSave={() => handleSaveSection('location')}
            isSaving={savingSection === 'location'}
          />
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 ml-1">Service zone*</Label>
              <select
                value={location.zoneId || ""}
                onChange={(e) => setLocation({ ...location, zoneId: e.target.value })}
                className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm focus:ring-2 focus:ring-[#005128] transition-all"
                disabled={zonesLoading || !editStates.location}
              >
                <option value="">{zonesLoading ? "Loading zones..." : "Select a zone"}</option>
                {zones.map((z) => {
                  const id = getZoneIdValue(z)
                  const label = z?.name || z?.zoneName || z?.serviceLocation || id
                  return (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  )
                })}
              </select>
              <p className="text-[10px] text-slate-400 ml-1">Choose the service zone where your restaurant will be available.</p>
            </div>

            <div className="space-y-2">
              <div className="relative">
                <Input 
                  ref={locationSearchInputRef}
                  disabled={!editStates.location}
                  className="rounded-xl bg-slate-50/50 pr-10"
                  placeholder="Search location (area, street, etc.)"
                />
                {editStates.location && (!!location.latitude || !!location.longitude) && (
                  <button 
                    onClick={() => {
                      if (locationSearchInputRef.current) locationSearchInputRef.current.value = "";
                      setLocation({...location, latitude: "", longitude: "", area: "", city: "", state: "", pincode: "", formattedAddress: ""});
                    }}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-400 ml-1">Select a suggestion to auto-fill area/city/state/pincode.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input 
                value={location.addressLine1} 
                onChange={e => setLocation({...location, addressLine1: e.target.value})}
                disabled={!editStates.location}
                className="rounded-xl bg-slate-50/50"
                placeholder="Shop no. / building no. (optional)"
              />
              <Input 
                value={location.addressLine2} 
                onChange={e => setLocation({...location, addressLine2: e.target.value})}
                disabled={!editStates.location}
                className="rounded-xl bg-slate-50/50"
                placeholder="Floor / tower (optional)"
              />
              <Input 
                value={location.landmark} 
                onChange={e => setLocation({...location, landmark: e.target.value})}
                disabled={!editStates.location}
                className="rounded-xl bg-slate-50/50"
                placeholder="Nearby landmark (optional)"
              />
              <Input 
                value={location.area} 
                onChange={e => !isAutofilled && setLocation({...location, area: e.target.value})}
                disabled={!editStates.location || isAutofilled}
                className="rounded-xl bg-slate-50/50"
                placeholder="Area / Sector / Locality*"
              />
              <Input 
                value={location.city} 
                onChange={e => !isAutofilled && setLocation({...location, city: e.target.value})}
                disabled={!editStates.location || isAutofilled}
                className="rounded-xl bg-slate-50/50"
                placeholder="City"
              />
              <Input 
                value={location.state} 
                onChange={e => !isAutofilled && setLocation({...location, state: e.target.value})}
                disabled={!editStates.location || isAutofilled}
                className="rounded-xl bg-slate-50/50"
                placeholder="State"
              />
              <Input 
                value={location.pincode} 
                onChange={e => !isAutofilled && setLocation({...location, pincode: e.target.value})}
                disabled={!editStates.location || isAutofilled}
                className="rounded-xl bg-slate-50/50"
                placeholder="Pincode"
              />
            </div>
          </div>
        </motion.section>

        {/* Operations Section */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <SectionHeader 
            icon={TrendingUp} 
            title="Restaurant Operations" 
            section="operations"
            isEditing={editStates.operations}
            onToggle={() => toggleEdit('operations')}
            onSave={() => handleSaveSection('operations')}
            isSaving={savingSection === 'operations'}
          />
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 md:col-span-2">
              <Label className="text-xs font-bold text-slate-500 ml-1">Cuisines (Comma Separated)</Label>
              <Input 
                value={opsInfo.cuisines.join(", ")} 
                onChange={e => setOpsInfo({...opsInfo, cuisines: e.target.value.split(",").map(c => c.trim()).filter(Boolean)})}
                disabled={!editStates.operations}
                className="rounded-xl bg-slate-50/50"
                placeholder="North Indian, Chinese, Italian"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 ml-1">Avg Delivery Time</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <Input 
                  value={opsInfo.estimatedDeliveryTime} 
                  onChange={e => setOpsInfo({...opsInfo, estimatedDeliveryTime: e.target.value})}
                  disabled={!editStates.operations}
                  className="pl-10 rounded-xl bg-slate-50/50"
                  placeholder="e.g. 30-40 mins"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 ml-1">Featured Dish</Label>
              <Input 
                value={opsInfo.featuredDish} 
                onChange={e => setOpsInfo({...opsInfo, featuredDish: e.target.value})}
                disabled={!editStates.operations}
                className="rounded-xl bg-slate-50/50"
                placeholder="e.g. Butter Chicken Special"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="text-xs font-bold text-slate-500 ml-1">Special Offer / Promotion</Label>
              <div className="relative">
                <Tag className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <Input 
                  value={opsInfo.offer} 
                  onChange={e => setOpsInfo({...opsInfo, offer: e.target.value})}
                  disabled={!editStates.operations}
                  className="pl-10 rounded-xl bg-slate-50/50"
                  placeholder="e.g. 50% OFF on first order"
                />
              </div>
            </div>
          </div>
        </motion.section>

        {/* KYC & Legal Section */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <SectionHeader 
            icon={ShieldCheck} 
            title="KYC & Legal Details" 
            section="kyc"
            isEditing={editStates.kyc}
            onToggle={() => toggleEdit('kyc')}
            onSave={() => handleSaveSection('kyc')}
            isSaving={savingSection === 'kyc'}
          />
          <div className="p-6 space-y-8">
            {/* PAN Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-[#005128] flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-[#005128] rounded-full" /> PAN Details
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-500 ml-1">PAN Number</Label>
                    <Input 
                      value={kycInfo.panNumber} 
                      onChange={e => setKycInfo({...kycInfo, panNumber: e.target.value.toUpperCase().slice(0, 10)})}
                      disabled={!editStates.kyc}
                      className="rounded-xl bg-slate-50/50"
                      placeholder="ABCDE1234F"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-500 ml-1">Name on PAN</Label>
                    <Input 
                      value={kycInfo.nameOnPan} 
                      onChange={e => setKycInfo({...kycInfo, nameOnPan: e.target.value.replace(/[^a-zA-Z\s]/g, "")})}
                      disabled={!editStates.kyc}
                      className="rounded-xl bg-slate-50/50"
                      placeholder="Full Name as per PAN"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 ml-1">PAN Document</Label>
                <div className="relative group aspect-video rounded-2xl overflow-hidden border-2 border-dashed border-slate-200 bg-slate-50">
                  {kycInfo.panImage ? (
                    <img src={getPreviewUrl(kycInfo.panImage)} alt="PAN" className="w-full h-full object-contain p-2" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                      <ImageIcon className="w-8 h-8" />
                      <span className="text-xs font-medium">No Document Uploaded</span>
                    </div>
                  )}
                  {editStates.kyc && (
                    <label className="absolute inset-0 bg-[#005128]/80 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer text-white">
                      <Upload className="w-8 h-8 mb-2" />
                      <span className="text-sm font-bold">Replace Document</span>
                      <input type="file" className="hidden" accept="image/*" onChange={e => setKycInfo({...kycInfo, panImage: e.target.files[0]})} />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* GST Details */}
            <div className="pt-8 border-t border-slate-100">
               <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-[#005128] flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-[#005128] rounded-full" /> GST Information
                </h3>
                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-full">
                   <button 
                    onClick={() => editStates.kyc && setKycInfo({...kycInfo, gstRegistered: false})}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${!kycInfo.gstRegistered ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                  >
                    Unregistered
                  </button>
                  <button 
                    onClick={() => editStates.kyc && setKycInfo({...kycInfo, gstRegistered: true})}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${kycInfo.gstRegistered ? 'bg-[#005128] text-white shadow-sm' : 'text-slate-500'}`}
                  >
                    Registered
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {kycInfo.gstRegistered && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden"
                  >
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 ml-1">GST Number</Label>
                        <Input 
                          value={kycInfo.gstNumber} 
                          onChange={e => setKycInfo({...kycInfo, gstNumber: e.target.value.toUpperCase().slice(0, 15)})}
                          disabled={!editStates.kyc}
                          className="rounded-xl bg-slate-50/50"
                          placeholder="22AAAAA0000A1Z5"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 ml-1">Legal Entity Name</Label>
                        <Input 
                          value={kycInfo.gstLegalName} 
                          onChange={e => setKycInfo({...kycInfo, gstLegalName: e.target.value.replace(/[^a-zA-Z\s]/g, "")})}
                          disabled={!editStates.kyc}
                          className="rounded-xl bg-slate-50/50"
                          placeholder="Legal Business Name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 ml-1">Registered Address</Label>
                        <Input 
                          value={kycInfo.gstAddress} 
                          onChange={e => setKycInfo({...kycInfo, gstAddress: e.target.value})}
                          disabled={!editStates.kyc}
                          className="rounded-xl bg-slate-50/50"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-500 ml-1">GST Certificate</Label>
                      <div className="relative group aspect-video rounded-2xl overflow-hidden border-2 border-dashed border-slate-200 bg-slate-50">
                        {kycInfo.gstImage ? (
                          <img src={getPreviewUrl(kycInfo.gstImage)} alt="GST" className="w-full h-full object-contain p-2" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                            <ImageIcon className="w-8 h-8" />
                            <span className="text-xs font-medium">Upload Certificate</span>
                          </div>
                        )}
                        {editStates.kyc && (
                          <label className="absolute inset-0 bg-[#005128]/80 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer text-white">
                            <Upload className="w-8 h-8 mb-2" />
                            <span className="text-sm font-bold">Choose File</span>
                            <input type="file" className="hidden" accept="image/*" onChange={e => setKycInfo({...kycInfo, gstImage: e.target.files[0]})} />
                          </label>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
        </motion.section>

        {/* FSSAI Section */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <SectionHeader 
            icon={ShieldCheck} 
            title="FSSAI Details" 
            section="fssai"
            isEditing={editStates.fssai}
            onToggle={() => toggleEdit('fssai')}
            onSave={() => handleSaveSection('fssai')}
            isSaving={savingSection === 'fssai'}
          />
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 ml-1">FSSAI License Number</Label>
                <Input 
                  value={kycInfo.fssaiNumber} 
                  onChange={e => setKycInfo({...kycInfo, fssaiNumber: e.target.value.replace(/\D/g, "").slice(0, 14)})}
                  disabled={!editStates.fssai}
                  className="rounded-xl bg-slate-50/50"
                  placeholder="14-digit license number"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 ml-1">License Expiry Date</Label>
                <Input 
                  type="date"
                  value={kycInfo.fssaiExpiry} 
                  onChange={e => setKycInfo({...kycInfo, fssaiExpiry: e.target.value})}
                  disabled={!editStates.fssai}
                  className="rounded-xl bg-slate-50/50"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 ml-1">FSSAI License Document</Label>
              <div className="relative group aspect-video rounded-2xl overflow-hidden border-2 border-dashed border-slate-200 bg-slate-50">
                {kycInfo.fssaiImage ? (
                  <img src={getPreviewUrl(kycInfo.fssaiImage)} alt="FSSAI" className="w-full h-full object-contain p-2" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                    <ImageIcon className="w-8 h-8" />
                    <span className="text-xs font-medium">Upload License</span>
                  </div>
                )}
                {editStates.fssai && (
                  <label className="absolute inset-0 bg-[#005128]/80 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer text-white">
                    <Upload className="w-8 h-8 mb-2" />
                    <span className="text-sm font-bold">Replace File</span>
                    <input type="file" className="hidden" accept="image/*" onChange={e => setKycInfo({...kycInfo, fssaiImage: e.target.files[0]})} />
                  </label>
                )}
              </div>
            </div>
          </div>
        </motion.section>

        {/* Bank Details Section */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <SectionHeader 
            icon={CreditCard} 
            title="Bank Settlement Details" 
            section="bank"
            isEditing={editStates.bank}
            onToggle={() => toggleEdit('bank')}
            onSave={() => handleSaveSection('bank')}
            isSaving={savingSection === 'bank'}
          />
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 ml-1">Account Number</Label>
              <Input 
                value={bankInfo.accountNumber} 
                onChange={e => setBankInfo({...bankInfo, accountNumber: e.target.value.replace(/\D/g, "").slice(0, 15)})}
                disabled={!editStates.bank}
                className="rounded-xl bg-slate-50/50 font-mono tracking-wider"
                placeholder="9 to 15 digit number"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 ml-1">IFSC Code</Label>
              <Input 
                value={bankInfo.ifscCode} 
                onChange={e => setBankInfo({...bankInfo, ifscCode: e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 11)})}
                disabled={!editStates.bank}
                className="rounded-xl bg-slate-50/50 font-mono"
                placeholder="ABCD0123456"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 ml-1">Account Holder Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <Input 
                  value={bankInfo.accountHolderName} 
                  onChange={e => setBankInfo({...bankInfo, accountHolderName: e.target.value.replace(/[^a-zA-Z\s]/g, "")})}
                  disabled={!editStates.bank}
                  className="pl-10 rounded-xl bg-slate-50/50"
                  placeholder="Full Name as per Bank Records"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 ml-1">Account Type</Label>
              <Select 
                value={bankInfo.accountType} 
                onValueChange={v => setBankInfo({...bankInfo, accountType: v})}
                disabled={!editStates.bank}
              >
                <SelectTrigger className="rounded-xl bg-slate-50/50">
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Saving">Saving Account</SelectItem>
                  <SelectItem value="Current">Current Account</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </motion.section>

        {/* Gallery & Media Section */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <SectionHeader 
            icon={ImageIcon} 
            title="Photos & Menu Gallery" 
            section="images"
            isEditing={editStates.images}
            onToggle={() => toggleEdit('images')}
            onSave={() => handleSaveSection('images')}
            isSaving={savingSection === 'images'}
          />
          <div className="p-6 space-y-8">
            {/* Profile Image - Large */}
            <div className="space-y-4">
              <Label className="text-xs font-bold text-slate-500 ml-1">Restaurant Profile Image</Label>
              <div className="relative w-40 h-40 rounded-3xl overflow-hidden border-2 border-dashed border-slate-200 bg-slate-50 group">
                {imageInfo.profileImage ? (
                  <img src={getPreviewUrl(imageInfo.profileImage)} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400"><ImageIcon className="w-10 h-10" /></div>
                )}
                {editStates.images && (
                  <label className="absolute inset-0 bg-[#005128]/80 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer text-white">
                    <Upload className="w-8 h-8 mb-2" />
                    <span className="text-xs font-bold">Update Photo</span>
                    <input type="file" className="hidden" accept="image/*" onChange={e => setImageInfo({...imageInfo, profileImage: e.target.files[0]})} />
                  </label>
                )}
              </div>
            </div>

            {/* Menu Gallery */}
            <div className="space-y-4 pt-8 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-500 ml-1">Menu Card Images</Label>
                {editStates.images && (
                   <label className="flex items-center gap-2 px-4 py-2 bg-[#e6f0eb] text-[#005128] rounded-full text-xs font-bold cursor-pointer hover:bg-[#005128] hover:text-white transition-all">
                    <Upload className="w-4 h-4" /> Add More
                    <input type="file" multiple className="hidden" accept="image/*" onChange={e => {
                      const files = Array.from(e.target.files)
                      setImageInfo({...imageInfo, menuImages: [...imageInfo.menuImages, ...files]})
                    }} />
                  </label>
                )}
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {imageInfo.menuImages.length > 0 ? (
                  imageInfo.menuImages.map((img, idx) => (
                    <motion.div 
                      key={idx} 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 group shadow-sm hover:shadow-md transition-all"
                    >
                      <img src={getPreviewUrl(img)} alt={`Menu ${idx + 1}`} className="w-full h-full object-cover" />
                      {editStates.images && (
                        <button 
                          onClick={() => setImageInfo({...imageInfo, menuImages: imageInfo.menuImages.filter((_, i) => i !== idx)})}
                          className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-full py-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50 text-slate-400 gap-3">
                    <ImageIcon className="w-12 h-12 opacity-20" />
                    <p className="text-sm font-medium">No menu images uploaded yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.section>

      </main>

      {/* Branding only */}
      <div className="max-w-5xl mx-auto px-6 mt-12 text-center pb-12">
        <p className="mt-8 text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Powered by Bakala Business Studio</p>
      </div>
    </div>
  )
}

export default RestaurantProfile
