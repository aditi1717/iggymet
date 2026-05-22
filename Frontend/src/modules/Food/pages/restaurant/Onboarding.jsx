import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Input } from "@food/components/ui/input"
import { Button } from "@food/components/ui/button"
import { Label } from "@food/components/ui/label"
import { Image as ImageIcon, Upload, Clock, Calendar as CalendarIcon, Sparkles, X, LogOut } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@food/components/ui/popover"
import { Calendar } from "@food/components/ui/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@food/components/ui/select"
import { restaurantAPI, zoneAPI, api } from "@food/api"
import { MobileTimePicker } from "@mui/x-date-pickers/MobileTimePicker"
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider"
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns"
import { determineStepToShow } from "@food/utils/onboardingUtils"
import { toast } from "sonner"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import { clearModuleAuth, clearAuthData } from "@food/utils/auth"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"
import DocumentUploadActions from "@food/components/DocumentUploadActions"
import { isFlutterBridgeAvailable, openCamera } from "@food/utils/imageUploadUtils"
import BRAND_THEME from "@/config/brandTheme"
const debugLog = (...args) => { }
const debugWarn = (...args) => { }
const debugError = (...args) => { }


const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const ESTIMATED_DELIVERY_TIME_OPTIONS = [
  "10-15 mins",
  "15-20 mins",
  "20-25 mins",
  "25-30 mins",
  "30-35 mins",
  "35-40 mins",
  "40-45 mins",
  "45-50 mins",
  "50-60 mins",
]

const ONBOARDING_STORAGE_KEY = "restaurant_onboarding_data"
const PAN_NUMBER_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const GST_NUMBER_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const FSSAI_NUMBER_REGEX = /^\d{14}$/
const OWNER_NAME_REGEX = /^[A-Za-z][A-Za-z\s.'-]*$/
const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/
const PINCODE_REGEX = /^\d{6}$/
const BANK_ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/
const IFSC_CODE_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/
const ACCOUNT_HOLDER_NAME_REGEX = /^[A-Za-z ]+$/
const GST_LEGAL_NAME_REGEX = /^[A-Za-z ]+$/
const FEATURED_DISH_NAME_REGEX = /^[A-Za-z ]+$/
const LOCAL_IMAGE_FILE_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.heif"
const GALLERY_IMAGE_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif"

/**
 * Robust de-duplication for files and URLs in menu images.
 */
const getUniqueImages = (existing, newItems) => {
  const result = [...(existing || [])];
  const itemsToAdd = Array.isArray(newItems) ? newItems : [newItems];

  itemsToAdd.forEach(item => {
    if (!item) return;
    const isDuplicate = result.some(r => {
      if (r === item) return true;
      // Compare File objects by name and size
      if (isUploadableFile(r) && isUploadableFile(item)) {
        return r.name === item.name && r.size === item.size;
      }
      // Compare URLs
      const urlR = typeof r === 'string' ? r : (r?.url || '');
      const urlItem = typeof item === 'string' ? item : (item?.url || '');
      if (urlR && urlItem && urlR === urlItem) return true;
      return false;
    });
    if (!isDuplicate) result.push(item);
  });
  return result;
};

let onboardingFileCache = {
  step2: {
    menuImages: [],
    profileImage: null,
  },
  step3: {
    panImage: null,
    gstImage: null,
    fssaiImage: null,
  },
}

const ONBOARDING_FILES_DB = "RestaurantOnboardingFiles"
const ONBOARDING_FILES_STORE = "files"
const MAX_MENU_FILES = 15

const openOnboardingFilesDB = () =>
  new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(ONBOARDING_FILES_DB, 1)
      request.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains(ONBOARDING_FILES_STORE)) {
          db.createObjectStore(ONBOARDING_FILES_STORE)
        }
      }
      request.onsuccess = (e) => resolve(e.target.result)
      request.onerror = (e) => reject(e.target.error)
    } catch (err) {
      reject(err)
    }
  })

const saveFileToDB = async (key, file) => {
  if (!isUploadableFile(file)) return
  try {
    const db = await openOnboardingFilesDB()
    const tx = db.transaction(ONBOARDING_FILES_STORE, "readwrite")
    tx.objectStore(ONBOARDING_FILES_STORE).put(file, key)
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"))
      tx.onabort = () => reject(tx.error || new Error("IndexedDB write aborted"))
    })
  } catch (err) {
    debugError("Failed to persist file in IndexedDB:", err)
  }
}

const getFileFromDB = async (key) => {
  try {
    const db = await openOnboardingFilesDB()
    const tx = db.transaction(ONBOARDING_FILES_STORE, "readonly")
    const request = tx.objectStore(ONBOARDING_FILES_STORE).get(key)
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

const deleteFileFromDB = async (key) => {
  try {
    const db = await openOnboardingFilesDB()
    const tx = db.transaction(ONBOARDING_FILES_STORE, "readwrite")
    tx.objectStore(ONBOARDING_FILES_STORE).delete(key)
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error("IndexedDB delete failed"))
      tx.onabort = () => reject(tx.error || new Error("IndexedDB delete aborted"))
    })
  } catch (err) {
    debugError("Failed to delete file from IndexedDB:", err)
  }
}

const clearAllFilesFromDB = async () => {
  try {
    const db = await openOnboardingFilesDB()
    const tx = db.transaction(ONBOARDING_FILES_STORE, "readwrite")
    tx.objectStore(ONBOARDING_FILES_STORE).clear()
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error("IndexedDB clear failed"))
      tx.onabort = () => reject(tx.error || new Error("IndexedDB clear aborted"))
    })
  } catch (err) {
    debugError("Failed to clear IndexedDB files:", err)
  }
}

const isUploadableFile = (value) => {
  if (!value || typeof value !== "object") return false

  if (typeof File !== "undefined" && value instanceof File) return true
  if (typeof Blob !== "undefined" && value instanceof Blob) return true

  return (
    typeof value.size === "number" &&
    (typeof value.slice === "function" || typeof value.arrayBuffer === "function")
  )
}

const normalizePhoneDigits = (value) => {
  const digits = String(value || "").replace(/\D/g, "")
  return digits.length >= 10 ? digits.slice(-10) : digits
}

const isValidOwnerEmail = (value) => {
  const email = String(value || "").trim().toLowerCase()
  // Strict email format: local-part + valid domain labels + TLD.
  if (!/^[a-z0-9._%+\-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,10}$/.test(email)) {
    return false
  }

  const tld = email.split(".").pop()
  if (!tld) return false
  const allowedTlds = new Set([
    "com",
    "in",
    "net",
    "org",
    "edu",
    "gov",
    "io",
    "biz",
    "info",
    "me",
    "ai",
    "app",
  ])
  if (!allowedTlds.has(tld)) return false
  return true
}

const getVerifiedPhoneFromStoredRestaurant = () => {
  try {
    const pending = localStorage.getItem("restaurant_pendingPhone")
    if (pending && pending.trim()) {
      return pending.trim()
    }

    const storedUser = localStorage.getItem("restaurant_user")
    if (!storedUser) return ""
    const user = JSON.parse(storedUser)
    const candidates = [
      user?.ownerPhone,
      user?.primaryContactNumber,
      user?.phone,
      user?.phoneNumber,
      user?.mobile,
      user?.contactNumber,
      user?.contact?.phone,
      user?.owner?.phone,
      user?.restaurant?.phone,
    ]
    const phone = candidates.find((value) => typeof value === "string" && value.trim())
    return phone ? phone.trim() : ""
  } catch {
    return ""
  }
}

const normalizeAccountTypeValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "saving" || normalized === "savings") return "Saving"
  if (normalized === "current") return "Current"
  return ""
}

const normalizeZoneIdValue = (value) => {
  if (!value) return ""
  if (typeof value === "string") return value
  return String(value?._id || value?.id || value || "")
}

const getTodayLocalYMD = () => formatDateToLocalYMD(new Date())

// Helper functions for localStorage
const saveOnboardingToLocalStorage = (step1, step2, step3, step4, currentStep, phoneContext = "") => {
  try {
    // Persist only stable URL-based values. File/Blob objects are not serializable and
    // restoring metadata-only placeholders breaks preview/upload flows.
    const serializableStep2 = {
      ...step2,
      menuImages: (step2.menuImages || []).filter(
        (img) => !isUploadableFile(img) && (img?.url || (typeof img === "string" && img.startsWith("http")))
      ),
      profileImage:
        !isUploadableFile(step2.profileImage) &&
          (step2.profileImage?.url || (typeof step2.profileImage === "string" && step2.profileImage.startsWith("http")))
          ? step2.profileImage
          : null,
    }

    const serializableStep3 = {
      ...step3,
      panImage:
        !isUploadableFile(step3.panImage) &&
          (step3.panImage?.url || (typeof step3.panImage === "string" && step3.panImage.startsWith("http")))
          ? step3.panImage
          : null,
      gstImage:
        !isUploadableFile(step3.gstImage) &&
          (step3.gstImage?.url || (typeof step3.gstImage === "string" && step3.gstImage.startsWith("http")))
          ? step3.gstImage
          : null,
      fssaiImage:
        !isUploadableFile(step3.fssaiImage) &&
          (step3.fssaiImage?.url || (typeof step3.fssaiImage === "string" && step3.fssaiImage.startsWith("http")))
          ? step3.fssaiImage
          : null,
    }

    const dataToSave = {
      step1,
      step2: serializableStep2,
      step3: serializableStep3,
      step4: step4 || {},
      currentStep,
      phoneContext: normalizePhoneDigits(phoneContext || step1?.ownerPhone || ""),
      timestamp: Date.now(),
    }
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(dataToSave))
    saveDraftToIndexedDB(dataToSave)
  } catch (error) {
    debugError("Failed to save onboarding data to localStorage:", error)
  }
}

const loadOnboardingFromLocalStorage = () => {
  try {
    const stored = localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    debugError("Failed to load onboarding data from localStorage:", error)
  }
  return null
}

const clearOnboardingFromLocalStorage = () => {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY)
    clearAllFilesFromDB()
    clearSessionBackupFromIndexedDB()
  } catch (error) {
    debugError("Failed to clear onboarding data from localStorage:", error)
  }
}

const saveDraftToIndexedDB = async (data) => {
  try {
    const db = await openOnboardingFilesDB()
    const tx = db.transaction(ONBOARDING_FILES_STORE, "readwrite")
    tx.objectStore(ONBOARDING_FILES_STORE).put(data, "onboarding_draft_json")
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error("Draft save error"))
    })
  } catch (err) {
    debugError("Failed to save draft to IndexedDB:", err)
  }
}

const loadDraftFromIndexedDB = async () => {
  try {
    const db = await openOnboardingFilesDB()
    const tx = db.transaction(ONBOARDING_FILES_STORE, "readonly")
    const request = tx.objectStore(ONBOARDING_FILES_STORE).get("onboarding_draft_json")
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

const saveSessionBackupToIndexedDB = async () => {
  try {
    if (typeof localStorage === "undefined") return
    const db = await openOnboardingFilesDB()
    const tx = db.transaction(ONBOARDING_FILES_STORE, "readwrite")
    const store = tx.objectStore(ONBOARDING_FILES_STORE)

    const keys = [
      "restaurant_accessToken",
      "restaurant_refreshToken",
      "restaurant_user",
      "restaurant_pendingPhone"
    ]
    for (const key of keys) {
      const val = localStorage.getItem(key)
      if (val) {
        store.put(val, `backup_${key}`)
      }
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error("Session backup error"))
    })
  } catch (err) {
    debugError("Failed to save session backup to IndexedDB:", err)
  }
}

const restoreSessionFromIndexedDB = async () => {
  try {
    if (typeof localStorage === "undefined") return false
    const db = await openOnboardingFilesDB()
    const tx = db.transaction(ONBOARDING_FILES_STORE, "readonly")
    const store = tx.objectStore(ONBOARDING_FILES_STORE)

    const keys = [
      "restaurant_accessToken",
      "restaurant_refreshToken",
      "restaurant_user",
      "restaurant_pendingPhone"
    ]
    let restoredAny = false
    for (const key of keys) {
      if (!localStorage.getItem(key)) {
        const val = await new Promise((resolve) => {
          const req = store.get(`backup_${key}`)
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => resolve(null)
        })
        if (val) {
          localStorage.setItem(key, val)
          restoredAny = true
        }
      }
    }
    return restoredAny
  } catch (err) {
    debugError("Failed to restore session from IndexedDB:", err)
    return false
  }
}

const clearSessionBackupFromIndexedDB = async () => {
  try {
    const db = await openOnboardingFilesDB()
    const tx = db.transaction(ONBOARDING_FILES_STORE, "readwrite")
    const store = tx.objectStore(ONBOARDING_FILES_STORE)
    store.delete("backup_restaurant_accessToken")
    store.delete("backup_restaurant_refreshToken")
    store.delete("backup_restaurant_user")
    store.delete("backup_restaurant_pendingPhone")
    store.delete("onboarding_draft_json")
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error("Session clear error"))
    })
  } catch (err) {
    debugError("Failed to clear session backup from IndexedDB:", err)
  }
}

const syncOnboardingFileCache = (step2, step3) => {
  onboardingFileCache = {
    step2: {
      menuImages: (step2?.menuImages || []).filter((img) => isUploadableFile(img)),
      profileImage: isUploadableFile(step2?.profileImage) ? step2.profileImage : null,
    },
    step3: {
      panImage: isUploadableFile(step3?.panImage) ? step3.panImage : null,
      gstImage: isUploadableFile(step3?.gstImage) ? step3.gstImage : null,
      fssaiImage: isUploadableFile(step3?.fssaiImage) ? step3.fssaiImage : null,
    },
  }
}

const clearOnboardingFileCache = () => {
  onboardingFileCache = {
    step2: {
      menuImages: [],
      profileImage: null,
    },
    step3: {
      panImage: null,
      gstImage: null,
      fssaiImage: null,
    },
  }
}

// Helper function to convert "HH:mm" string to Date object
const stringToTime = (timeString) => {
  const normalized = normalizeTimeValue(timeString)
  if (!normalized || !normalized.includes(":")) {
    return null
  }
  const [hours, minutes] = normalized.split(":").map(Number)
  return new Date(2000, 0, 1, hours || 0, minutes || 0)
}

// Helper function to convert Date object to "HH:mm" string
const timeToString = (date) => {
  if (!date) return ""
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

const normalizeTimeValue = (value) => {
  if (!value) return ""

  const raw = String(value).trim()
  if (!raw) return ""

  // Already in HH:mm format
  if (/^\d{2}:\d{2}$/.test(raw)) {
    return raw
  }

  // Handle H:mm by zero-padding hour
  if (/^\d{1}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(":")
    return `${h.padStart(2, "0")}:${m}`
  }

  // Fallback for ISO / Date-like strings
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return timeToString(parsed)
  }

  return ""
}

const formatDateToLocalYMD = (date) => {
  if (!date || Number.isNaN(date.getTime?.())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const parseLocalYMDDate = (value) => {
  if (!value || typeof value !== "string") return undefined
  const parts = value.split("-").map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return undefined
  const [year, month, day] = parts
  return new Date(year, month - 1, day)
}

function TimeSelector({ label, value, onChange }) {
  const timeValue = stringToTime(value)

  const handleTimeChange = (newValue) => {
    if (!newValue) {
      onChange("")
      return
    }
    const timeString = timeToString(newValue)
    onChange(timeString)
  }

  return (
    <div className="border border-gray-200 rounded-md px-3 py-2 bg-gray-50/60">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-4 h-4 text-gray-800" />
        <span className="text-xs font-medium text-gray-900">{label}</span>
      </div>
      <MobileTimePicker
        value={timeValue}
        onChange={handleTimeChange}
        onAccept={handleTimeChange}
        slotProps={{
          textField: {
            variant: "outlined",
            size: "small",
            placeholder: "Select time",
            sx: {
              "& .MuiOutlinedInput-root": {
                height: "36px",
                fontSize: "12px",
                backgroundColor: "white",
                "& fieldset": {
                  borderColor: "#e5e7eb",
                },
                "&:hover fieldset": {
                  borderColor: "#d1d5db",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#000",
                },
              },
              "& .MuiInputBase-input": {
                padding: "8px 12px",
                fontSize: "12px",
              },
            },
            onBlur: (event) => {
              const normalized = normalizeTimeValue(event?.target?.value)
              if (normalized) {
                onChange(normalized)
              }
            },
          },
        }}
        format="hh:mm a"
      />
    </div>
  )
}

export default function RestaurantOnboarding() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [hasRestored, setHasRestored] = useState(false)

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      // Explicit logout should wipe onboarding draft/session backups to avoid stale restore.
      try {
        sessionStorage.setItem("restaurant_skip_restore_once", "1")
      } catch (_) { }
      clearOnboardingFromLocalStorage()
      clearOnboardingFileCache()

      await restaurantAPI.logout()
      clearModuleAuth("restaurant")
      clearAuthData()
      localStorage.removeItem(ONBOARDING_STORAGE_KEY)
      window.dispatchEvent(new Event("restaurantAuthChanged"))
      navigate("/food/restaurant/login", { replace: true })
    } catch (error) {
      debugError("Logout failed:", error)
      clearOnboardingFromLocalStorage()
      clearOnboardingFileCache()
      clearModuleAuth("restaurant")
      navigate("/food/restaurant/login", { replace: true })
    } finally {
      setIsLoggingOut(false)
    }
  }

  const [verifiedPhoneNumber, setVerifiedPhoneNumber] = useState("")
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [isEditing, setIsEditing] = useState(true)
  const [isRegistered, setIsRegistered] = useState(false)
  const [isFssaiCalendarOpen, setIsFssaiCalendarOpen] = useState(false)
  const [zones, setZones] = useState([])
  const [zonesLoading, setZonesLoading] = useState(false)
  const [isAutocompleteReady, setIsAutocompleteReady] = useState(false)

  // Browser/device back should move between onboarding steps first.
  useEffect(() => {
    if (step > 1) {
      window.history.pushState({ onboardingStep: step }, "", window.location.href)
    }
  }, [step])

  useEffect(() => {
    const handlePopState = () => {
      setStep((prev) => {
        if (prev > 1) {
          const nextStep = prev - 1
          window.history.pushState({ onboardingStep: nextStep }, "", window.location.href)
          window.scrollTo({ top: 0, behavior: "instant" })
          return nextStep
        }
        return prev
      })
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  const [step1, setStep1] = useState({
    restaurantName: "",
    pureVegRestaurant: null,
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    primaryContactNumber: "",
    zoneId: "",
    location: {
      formattedAddress: "",
      addressLine1: "",
      addressLine2: "",
      area: "",
      city: "",
      state: "",
      pincode: "",
      landmark: "",
      latitude: "",
      longitude: "",
    },
  })

  const [step2, setStep2] = useState({
    menuImages: [],
    profileImage: null,
    cuisines: [],
    openingTime: "",
    closingTime: "",
    openDays: [],
  })

  const [step3, setStep3] = useState({
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
    accountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
    accountHolderName: "",
    accountType: "",
  })

  const [step4, setStep4] = useState({
    estimatedDeliveryTime: "",
    featuredDish: "",
    featuredPrice: "",
    offer: "",
  })
  const previewUrlCacheRef = useRef(new Map())
  const restoredDraftRef = useRef(false)
  const locationSearchInputRef = useRef(null)
  const placesAutocompleteRef = useRef(null)
  const mapsScriptLoadedRef = useRef(false)
  const menuImagesInputRef = useRef(null)
  const profileImageInputRef = useRef(null)
  const panImageInputRef = useRef(null)
  const gstImageInputRef = useRef(null)
  const fssaiImageInputRef = useRef(null)
  const getPreviewImageUrl = (value) => {
    if (!value) return null
    if (typeof value === "string") return value
    if (value?.url && typeof value.url === "string") return value.url

    if (isUploadableFile(value)) {
      const cache = previewUrlCacheRef.current
      const cached = cache.get(value)
      if (cached) return cached
      try {
        const objectUrl = URL.createObjectURL(value)
        cache.set(value, objectUrl)
        return objectUrl
      } catch {
        return null
      }
    }

    return null
  }

  const getPersistedImageUrl = (value) => {
    if (!value) return ""
    if (typeof value === "string" && value.startsWith("http")) return value
    if (value?.url && typeof value.url === "string" && value.url.startsWith("http")) return value.url
    return ""
  }

  const appendImageFileOrUrl = (formData, fieldName, value, { required = false, label = "Image" } = {}) => {
    if (isUploadableFile(value)) {
      formData.append(fieldName, value)
      return true
    }

    const url = getPersistedImageUrl(value)
    if (url) {
      formData.append(fieldName, url)
      return true
    }

    if (required) {
      throw new Error(`${label} is required`)
    }
    return false
  }


  // Load from localStorage/IndexedDB on mount and check URL parameter
  useEffect(() => {
    let active = true

    const initializeData = async () => {
      // Skip one-time restore immediately after explicit logout to prevent stale account revival.
      let skipRestoreOnce = false
      try {
        skipRestoreOnce = sessionStorage.getItem("restaurant_skip_restore_once") === "1"
        if (skipRestoreOnce) {
          sessionStorage.removeItem("restaurant_skip_restore_once")
        }
      } catch (_) { }

      // 1. Try to restore session tokens first (except explicit post-logout load).
      if (!skipRestoreOnce) {
        await restoreSessionFromIndexedDB()
      }

      const verifiedPhone = getVerifiedPhoneFromStoredRestaurant()
      if (!active) return
      setVerifiedPhoneNumber(verifiedPhone)

      // Check if step is specified in URL (from OTP login redirect)
      const stepParam = searchParams.get("step")
      if (stepParam) {
        const stepNum = parseInt(stepParam, 10)
        if (stepNum >= 1 && stepNum <= 3) {
          setStep(stepNum)
        }
      }

      let localData = loadOnboardingFromLocalStorage()
      if (!localData && active) {
        localData = await loadDraftFromIndexedDB()
        if (localData) {
          debugLog("Restored onboarding draft from IndexedDB backup")
          try {
            localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(localData))
          } catch (_) {}
        }
      }

      const savedPhone = normalizePhoneDigits(localData?.phoneContext || localData?.step1?.ownerPhone || "")
      const currentPhone = normalizePhoneDigits(verifiedPhone)
      const hasPhoneMismatch = Boolean(savedPhone && currentPhone && savedPhone !== currentPhone)
      const hasMissingDraftPhone = Boolean(localData && currentPhone && !savedPhone)

      if ((hasPhoneMismatch || hasMissingDraftPhone) && active) {
        clearOnboardingFromLocalStorage()
        clearOnboardingFileCache()
        localData = null
      }

      if (localData && active) {
        restoredDraftRef.current = true
        if (localData.step1) {
          setStep1({
            restaurantName: localData.step1.restaurantName || "",
            pureVegRestaurant:
              typeof localData.step1.pureVegRestaurant === "boolean"
                ? localData.step1.pureVegRestaurant
                : null,
            ownerName: localData.step1.ownerName || "",
            ownerEmail: localData.step1.ownerEmail || "",
            ownerPhone: verifiedPhone || localData.step1.ownerPhone || "",
            primaryContactNumber: localData.step1.primaryContactNumber || "",
            zoneId: normalizeZoneIdValue(localData.step1.zoneId),
            location: {
              formattedAddress: localData.step1.location?.formattedAddress || "",
              addressLine1: localData.step1.location?.addressLine1 || "",
              addressLine2: localData.step1.location?.addressLine2 || "",
              area: localData.step1.location?.area || "",
              city: localData.step1.location?.city || "",
              state: localData.step1.location?.state || "",
              pincode: localData.step1.location?.pincode || "",
              landmark: localData.step1.location?.landmark || "",
              latitude: localData.step1.location?.latitude ?? "",
              longitude: localData.step1.location?.longitude ?? "",
            },
          })
        }
        if (localData.step2) {
          const restoredMenuImages = (localData.step2.menuImages || []).filter(
            (img) => img?.url || (typeof img === "string" && img.startsWith("http"))
          )
          const cachedMenuImages = onboardingFileCache.step2.menuImages || []
          const restoredProfileImage =
            localData.step2.profileImage?.url ||
              (typeof localData.step2.profileImage === "string" &&
                localData.step2.profileImage.startsWith("http"))
              ? localData.step2.profileImage
              : null
          const cachedProfileImage = onboardingFileCache.step2.profileImage || null

          setStep2({
            menuImages: getUniqueImages(restoredMenuImages, cachedMenuImages),
            profileImage: cachedProfileImage || restoredProfileImage,
            cuisines: localData.step2.cuisines || [],
            openingTime: normalizeTimeValue(localData.step2.openingTime),
            closingTime: normalizeTimeValue(localData.step2.closingTime),
            openDays: localData.step2.openDays || [],
          })
        }
        if (localData.step3) {
          setStep3({
            panNumber: localData.step3.panNumber || "",
            nameOnPan: localData.step3.nameOnPan || "",
            panImage: onboardingFileCache.step3.panImage || localData.step3.panImage || null,
            gstRegistered: localData.step3.gstRegistered || false,
            gstNumber: localData.step3.gstNumber || "",
            gstLegalName: localData.step3.gstLegalName || "",
            gstAddress: localData.step3.gstAddress || "",
            gstImage: onboardingFileCache.step3.gstImage || localData.step3.gstImage || null,
            fssaiNumber: localData.step3.fssaiNumber || "",
            fssaiExpiry: localData.step3.fssaiExpiry || "",
            fssaiImage: onboardingFileCache.step3.fssaiImage || localData.step3.fssaiImage || null,
            accountNumber: localData.step3.accountNumber || "",
            confirmAccountNumber: localData.step3.confirmAccountNumber || "",
            ifscCode: (localData.step3.ifscCode || "").toUpperCase(),
            accountHolderName: localData.step3.accountHolderName || "",
            accountType: normalizeAccountTypeValue(localData.step3.accountType || ""),
          })
        }
        if (localData.step4) {
          setStep4({
            estimatedDeliveryTime: localData.step4.estimatedDeliveryTime || "",
            featuredDish: localData.step4.featuredDish || "",
            featuredPrice: localData.step4.featuredPrice || "",
            offer: localData.step4.offer || "",
          })
        }
        // Only set step from localStorage if URL doesn't have a step parameter
        if (localData.currentStep && !stepParam) {
          setStep(localData.currentStep)
        }
      }

      // Restore files from IndexedDB
      try {
        if (hasPhoneMismatch) {
          setHasRestored(true)
          return
        }
        const [profileImg, panImg, gstImg, fssaiImg] = await Promise.all([
          getFileFromDB("profileImage"),
          getFileFromDB("panImage"),
          getFileFromDB("gstImage"),
          getFileFromDB("fssaiImage"),
        ])
        const menuFilePromises = Array.from({ length: MAX_MENU_FILES }, (_, i) => getFileFromDB(`menuImage_${i}`))
        const menuFilesFromDB = (await Promise.all(menuFilePromises)).filter(Boolean)

        if (!active) return

        if (profileImg) {
          setStep2(prev => ({ ...prev, profileImage: profileImg }))
          onboardingFileCache.step2.profileImage = profileImg
        }
        if (menuFilesFromDB.length) {
          setStep2(prev => ({
            ...prev,
            menuImages: getUniqueImages(prev.menuImages, menuFilesFromDB)
          }))
          onboardingFileCache.step2.menuImages = menuFilesFromDB
        }
        if (panImg) {
          setStep3(prev => ({ ...prev, panImage: panImg }))
          onboardingFileCache.step3.panImage = panImg
        }
        if (gstImg) {
          setStep3(prev => ({ ...prev, gstImage: gstImg }))
          onboardingFileCache.step3.gstImage = gstImg
        }
        if (fssaiImg) {
          setStep3(prev => ({ ...prev, fssaiImage: fssaiImg }))
          onboardingFileCache.step3.fssaiImage = fssaiImg
        }
      } catch (err) {
        debugError("Failed to restore files from DB:", err)
      } finally {
        if (active) {
          setHasRestored(true)
        }
      }
    }

    initializeData()

    return () => {
      active = false
    }
  }, [searchParams])

  useEffect(() => {
    if (!verifiedPhoneNumber) return
    setStep1((prev) => ({
      ...prev,
      ownerPhone: verifiedPhoneNumber,
    }))
  }, [verifiedPhoneNumber])

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return undefined

    const updateInset = () => {
      const vv = window.visualViewport
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height))
      setKeyboardInset(inset > 120 ? inset : 0)
    }

    updateInset()
    window.visualViewport.addEventListener("resize", updateInset)
    window.visualViewport.addEventListener("scroll", updateInset)
    return () => {
      window.visualViewport.removeEventListener("resize", updateInset)
      window.visualViewport.removeEventListener("scroll", updateInset)
    }
  }, [])

  // Save to localStorage whenever step data changes
  useEffect(() => {
    if (hasRestored) {
      saveOnboardingToLocalStorage(step1, step2, step3, step4, step, verifiedPhoneNumber)
      saveSessionBackupToIndexedDB()
    }
  }, [step1, step2, step3, step4, step, hasRestored, verifiedPhoneNumber])

  // Clear location search input DOM when formattedAddress is empty
  useEffect(() => {
    if (locationSearchInputRef.current && !step1.location?.formattedAddress) {
      locationSearchInputRef.current.value = "";
    }
  }, [step1.location?.formattedAddress])

  // Cleanup: Ensure Shop No doesn't accidentally hold the full address from search
  useEffect(() => {
    if (
      step1.location?.addressLine1 &&
      step1.location?.formattedAddress &&
      step1.location.addressLine1 === step1.location.formattedAddress
    ) {
      setStep1((prev) => ({
        ...prev,
        location: { ...prev.location, addressLine1: "" },
      }))
    }
  }, [step1.location?.formattedAddress, step1.location?.addressLine1])

  useEffect(() => {
    syncOnboardingFileCache(step2, step3)

    if (hasRestored) {
      // Persist files to IndexedDB
      if (isUploadableFile(step2.profileImage)) {
        saveFileToDB("profileImage", step2.profileImage)
      } else if (!step2.profileImage) {
        deleteFileFromDB("profileImage")
      }

      const uploadableMenuFiles = (step2.menuImages || []).filter(isUploadableFile).slice(0, MAX_MENU_FILES)
      uploadableMenuFiles.forEach((file, idx) => {
        saveFileToDB(`menuImage_${idx}`, file)
      })
      for (let i = uploadableMenuFiles.length; i < MAX_MENU_FILES; i++) {
        deleteFileFromDB(`menuImage_${i}`)
      }

      if (isUploadableFile(step3.panImage)) {
        saveFileToDB("panImage", step3.panImage)
      } else if (!step3.panImage) {
        deleteFileFromDB("panImage")
      }

      if (isUploadableFile(step3.gstImage)) {
        saveFileToDB("gstImage", step3.gstImage)
      } else if (!step3.gstImage) {
        deleteFileFromDB("gstImage")
      }

      if (isUploadableFile(step3.fssaiImage)) {
        saveFileToDB("fssaiImage", step3.fssaiImage)
      } else if (!step3.fssaiImage) {
        deleteFileFromDB("fssaiImage")
      }
    }
  }, [step2, step3, hasRestored])

  useEffect(() => {
    return () => {
      previewUrlCacheRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url)
        } catch {
          // Ignore revoke errors
        }
      })
      previewUrlCacheRef.current.clear()
    }
  }, [])

  // --- Step-specific side effects moved to top level for React Hook stability ---

  // Initialize Google Places Autocomplete for Step 1 location search.
  useEffect(() => {
    if (step !== 1) return

    let cancelled = false

    const init = async () => {
      // Wait for the ref to be attached (up to 1s)
      for (let i = 0; i < 20; i++) {
        if (locationSearchInputRef.current) break
        await new Promise((r) => setTimeout(r, 50))
      }
      if (!locationSearchInputRef.current || cancelled) return

      const loadMaps = async () => {
        if (mapsScriptLoadedRef.current && window.google?.maps?.places?.Autocomplete) return true
        if (window.google?.maps?.places?.Autocomplete) {
          mapsScriptLoadedRef.current = true
          return true
        }
        const apiKey = await getGoogleMapsApiKey()
        if (!apiKey) return false

        const existing = document.getElementById("restaurant-onboarding-maps-script")
        if (existing) {
          for (let i = 0; i < 30; i += 1) {
            if (window.google?.maps?.places?.Autocomplete) {
              mapsScriptLoadedRef.current = true
              return true
            }
            await new Promise((r) => setTimeout(r, 100))
          }
          return false
        }

        try {
          await new Promise((resolve, reject) => {
            const script = document.createElement("script")
            script.id = "restaurant-onboarding-maps-script"
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly`
            script.async = true
            script.defer = true
            script.onload = () => {
              mapsScriptLoadedRef.current = true
              resolve(true)
            }
            script.onerror = reject
            document.head.appendChild(script)
          })
          return !!window.google?.maps?.places?.Autocomplete
        } catch (err) {
          debugWarn("Error loading Google Maps script:", err)
          return false
        }
      }

      const ok = await loadMaps()
      if (!ok || cancelled || !locationSearchInputRef.current) return
      if (placesAutocompleteRef.current) return

      placesAutocompleteRef.current = new window.google.maps.places.Autocomplete(
        locationSearchInputRef.current,
        {
          componentRestrictions: { country: "in" },
          fields: ["address_components", "formatted_address", "geometry", "name"],
        },
      )
      setIsAutocompleteReady(true)

      placesAutocompleteRef.current.addListener("place_changed", () => {
        const place = placesAutocompleteRef.current.getPlace()
        if (!place.geometry) return

        const get = (types) =>
          place.address_components?.find((c) => types.some((t) => c.types.includes(t)))
            ?.long_name || ""

        const formattedAddress = place.formatted_address || ""
        const area =
          get(["sublocality_level_1"]) ||
          get(["sublocality"]) ||
          get(["locality"])
        const city =
          get(["locality"]) ||
          get(["administrative_area_level_2"])
        const state = get(["administrative_area_level_1"])
        const pincode = get(["postal_code"])
        const lat = place?.geometry?.location?.lat?.()
        const lng = place?.geometry?.location?.lng?.()

        const locationData = {
          formattedAddress,
          area,
          city,
          state,
          pincode,
          latitude: Number.isFinite(lat) ? Number(lat.toFixed(6)) : "",
          longitude: Number.isFinite(lng) ? Number(lng.toFixed(6)) : "",
        };

        setStep1((prev) => ({
          ...prev,
          location: {
            ...prev.location,
            ...locationData,
            addressLine1: "", // Keep Shop No empty for manual entry
          },
        }))

        if (locationSearchInputRef.current) {
          locationSearchInputRef.current.value = formattedAddress || ""
        }
      })
    }

    init().catch((err) => {
      debugWarn("Failed to load Google Places for onboarding:", err)
    })

    return () => {
      cancelled = true
      placesAutocompleteRef.current = null
      setIsAutocompleteReady(false)
    }
  }, [step])

  // Update Google Places Autocomplete restrictions when zone changes
  useEffect(() => {
    if (step !== 1 || !placesAutocompleteRef.current || !window.google?.maps || !isAutocompleteReady) return

    debugLog("?? Updating Autocomplete restrictions for zone:", step1.zoneId)

    if (!step1.zoneId) {
      placesAutocompleteRef.current.setOptions({
        bounds: null,
        strictBounds: false,
        componentRestrictions: { country: "in" },
      })
      return
    }

    const selectedZone = zones.find((z) => {
      const id = String(z?._id || z?.id || "")
      return id === step1.zoneId
    })

    try {
      const bounds = new window.google.maps.LatLngBounds()
      let hasValidBounds = false

      // 1) GeoJSON polygon coordinates: zone.location.coordinates[0] = [[lng, lat], ...]
      const geoCoords = selectedZone?.location?.coordinates?.[0]
      if (Array.isArray(geoCoords)) {
        geoCoords.forEach((point) => {
          if (!Array.isArray(point) || point.length < 2) return
          const lng = parseFloat(point[0])
          const lat = parseFloat(point[1])
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
          bounds.extend({ lat, lng })
          hasValidBounds = true
        })
      }

      // 2) Array of coordinate objects: zone.coordinates = [{ latitude/lat, longitude/lng }, ...]
      if (!hasValidBounds && Array.isArray(selectedZone?.coordinates)) {
        selectedZone.coordinates.forEach((pt) => {
          const lat = parseFloat(pt?.latitude ?? pt?.lat)
          const lng = parseFloat(pt?.longitude ?? pt?.lng)
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
          bounds.extend({ lat, lng })
          hasValidBounds = true
        })
      }

      // 3) Fallback to center+radius if polygon points are unavailable
      if (!hasValidBounds && selectedZone?.location?.latitude && selectedZone?.location?.longitude) {
        const center = {
          lat: parseFloat(selectedZone.location.latitude),
          lng: parseFloat(selectedZone.location.longitude),
        }
        if (Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
          const radius = (selectedZone.radius || 10) * 1000
          const circle = new window.google.maps.Circle({ center, radius })
          const circleBounds = circle.getBounds()
          if (circleBounds) {
            placesAutocompleteRef.current.setOptions({
              bounds: circleBounds,
              strictBounds: true,
              componentRestrictions: { country: "in" },
            })
            return
          }
        }
      }

      if (hasValidBounds) {
        placesAutocompleteRef.current.setOptions({
          bounds,
          strictBounds: true,
          componentRestrictions: { country: "in" },
        })
      } else {
        placesAutocompleteRef.current.setOptions({
          bounds: null,
          strictBounds: false,
          componentRestrictions: { country: "in" },
        })
      }
    } catch (err) {
      debugWarn("Failed to set Autocomplete bounds for zone:", err)
      placesAutocompleteRef.current.setOptions({
        bounds: null,
        strictBounds: false,
        componentRestrictions: { country: "in" },
      })
    }
  }, [step1.zoneId, zones, step, isAutocompleteReady])

  // Load zones for onboarding dropdown (public endpoint).
  useEffect(() => {
    if (step !== 1) return
    let cancelled = false
    setZonesLoading(true)
    zoneAPI.getPublicZones()
      .then((res) => {
        const list = res?.data?.data?.zones || res?.data?.zones || []
        if (!cancelled) setZones(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setZones([])
      })
      .finally(() => {
        if (!cancelled) setZonesLoading(false)
      })
    return () => { cancelled = true }
  }, [step])

  useEffect(() => {
    if (!hasRestored) return

    const fetchData = async () => {
      try {
        setLoading(true)
        // Use restaurantAPI.getCurrentRestaurant() to fetch real data
        const res = await restaurantAPI.getCurrentRestaurant()
        const data = res?.data?.data?.restaurant || res?.data?.restaurant

        if (data) {
          setIsEditing(false)
          setIsRegistered(true)
          const hasLocalDraft = restoredDraftRef.current
          // Map Step 1
          setStep1((prev) => ({
            restaurantName: hasLocalDraft ? (prev.restaurantName || data.name || data.restaurantName || "") : (data.name || data.restaurantName || ""),
            pureVegRestaurant: hasLocalDraft
              ? (typeof prev.pureVegRestaurant === "boolean" ? prev.pureVegRestaurant : (typeof data.pureVegRestaurant === "boolean" ? data.pureVegRestaurant : null))
              : (typeof data.pureVegRestaurant === "boolean" ? data.pureVegRestaurant : null),
            ownerName: hasLocalDraft ? (prev.ownerName || data.ownerName || "") : (data.ownerName || ""),
            ownerEmail: hasLocalDraft ? (prev.ownerEmail || data.ownerEmail || "") : (data.ownerEmail || ""),
            ownerPhone: verifiedPhoneNumber || data.ownerPhone || prev.ownerPhone || "",
            zoneId: normalizeZoneIdValue(data.zoneId) || prev.zoneId || "",
            primaryContactNumber: hasLocalDraft ? (prev.primaryContactNumber || data.primaryContactNumber || "") : (data.primaryContactNumber || ""),
            location: {
              formattedAddress: hasLocalDraft ? (prev.location?.formattedAddress || data.location?.formattedAddress || data.location?.address || "") : (data.location?.formattedAddress || data.location?.address || ""),
              addressLine1: hasLocalDraft ? (prev.location?.addressLine1 || data.location?.addressLine1 || "") : (data.location?.addressLine1 || ""),
              addressLine2: hasLocalDraft ? (prev.location?.addressLine2 || data.location?.addressLine2 || "") : (data.location?.addressLine2 || ""),
              area: hasLocalDraft ? (prev.location?.area || data.location?.area || "") : (data.location?.area || ""),
              city: hasLocalDraft ? (prev.location?.city || data.location?.city || "") : (data.location?.city || ""),
              state: hasLocalDraft ? (prev.location?.state || data.location?.state || "") : (data.location?.state || ""),
              pincode: hasLocalDraft ? (prev.location?.pincode || data.location?.pincode || "") : (data.location?.pincode || ""),
              landmark: hasLocalDraft ? (prev.location?.landmark || data.location?.landmark || "") : (data.location?.landmark || ""),
              latitude: hasLocalDraft ? (prev.location?.latitude ?? data.location?.latitude ?? "") : (data.location?.latitude ?? ""),
              longitude: hasLocalDraft ? (prev.location?.longitude ?? data.location?.longitude ?? "") : (data.location?.longitude ?? ""),
            },
          }))

          // Map Step 2
          setStep2((prev) => {
            const localFiles = (prev.menuImages || []).filter(img => isUploadableFile(img));
            const serverImages = data.menuImages || [];
            return {
              ...prev,
              menuImages: getUniqueImages(serverImages, localFiles),
              profileImage: isUploadableFile(prev.profileImage) ? prev.profileImage : (data.profileImage || prev.profileImage || null),
              cuisines: (data.cuisines && data.cuisines.length > 0) ? data.cuisines : prev.cuisines || [],
              openingTime: normalizeTimeValue(data.openingTime) || prev.openingTime,
              closingTime: normalizeTimeValue(data.closingTime) || prev.closingTime,
              openDays: (data.openDays && data.openDays.length > 0) ? data.openDays : prev.openDays || [],
            };
          })

          // Map Step 3
          setStep3((prev) => ({
            ...prev,
            panNumber: data.panNumber || prev.panNumber || "",
            nameOnPan: data.nameOnPan || prev.nameOnPan || "",
            panImage: isUploadableFile(prev.panImage) ? prev.panImage : (data.panImage || prev.panImage || null),
            gstRegistered: data.gstRegistered !== undefined ? !!data.gstRegistered : prev.gstRegistered,
            gstNumber: data.gstNumber || prev.gstNumber || "",
            gstLegalName: data.gstLegalName || prev.gstLegalName || "",
            gstAddress: data.gstAddress || prev.gstAddress || "",
            gstImage: isUploadableFile(prev.gstImage) ? prev.gstImage : (data.gstImage || prev.gstImage || null),
            fssaiNumber: data.fssaiNumber || prev.fssaiNumber || "",
            fssaiExpiry: data.fssaiExpiry ? String(data.fssaiExpiry).split('T')[0] : prev.fssaiExpiry || "",
            fssaiImage: isUploadableFile(prev.fssaiImage) ? prev.fssaiImage : (data.fssaiImage || prev.fssaiImage || null),
            accountNumber: data.accountNumber || prev.accountNumber || "",
            confirmAccountNumber: data.accountNumber || prev.confirmAccountNumber || "",
            ifscCode: (data.ifscCode || prev.ifscCode || "").toUpperCase(),
            accountHolderName: data.accountHolderName || prev.accountHolderName || "",
            accountType: normalizeAccountTypeValue(data.accountType || prev.accountType || ""),
          }))


          // Map Step 4
          setStep4((prev) => ({
            ...prev,
            estimatedDeliveryTime: data.estimatedDeliveryTime || prev.estimatedDeliveryTime || "",
            featuredDish: data.featuredDish || prev.featuredDish || "",
            featuredPrice: data.featuredPrice || prev.featuredPrice || "",
            offer: data.offer || prev.offer || "",
          }))

          // Only determine step automatically if not specified in URL
          const stepParam = searchParams.get("step")
          if (!stepParam) {
            // If already registered/pending, stay on step 1 for editing
            if (hasLocalDraft) {
              // Keep the step restored from localStorage/IndexedDB.
            } else if (data.status === "approved" || data.status === "pending") {
              setStep(1)
            } else {
              const stepToShow = determineStepToShow({ step1: data, step2: data, step3: data, step4: data })
              setStep(stepToShow)
            }
          }
        } else {
          setIsEditing(true)
        }
      } catch (err) {
        setIsEditing(true)
        if (err?.response?.status === 401) {
          debugError("Authentication error fetching onboarding:", err)
        } else {
          debugError("Error fetching onboarding data:", err)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [searchParams, hasRestored])

  const handleUpload = async (file, folder) => {
    try {
      // Uploading is done on final registration submit (multipart /register).
      // Keep this method for backward compatibility in case other flows call it.
      throw new Error("Image uploads are submitted during registration")
    } catch (err) {
      // Provide more informative error message for upload failures
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to upload image"
      debugError("Upload error:", errorMsg, err)
      throw new Error(`Image upload failed: ${errorMsg}`)
    }
  }

  // Validation functions for each step
  const validateStep1 = () => {
    const errors = []

    if (!step1.restaurantName?.trim()) {
      errors.push("Restaurant name is required")
    }
    if (typeof step1.pureVegRestaurant !== "boolean") {
      errors.push("Please select whether your restaurant is pure veg")
    }
    if (!step1.ownerName?.trim()) {
      errors.push("Owner name is required")
    } else if (!OWNER_NAME_REGEX.test(step1.ownerName.trim())) {
      errors.push("Owner full name must contain letters only (numbers are not allowed)")
    }
    if (!step1.ownerEmail?.trim()) {
      errors.push("Owner email is required")
    } else if (!isValidOwnerEmail(step1.ownerEmail)) {
      errors.push("Please enter a valid email address (example: owner@example.com)")
    }
    if (!step1.ownerPhone?.trim()) {
      errors.push("Owner phone number is required")
    }
    if (!step1.primaryContactNumber?.trim()) {
      errors.push("Primary contact number is required")
    } else if (!INDIAN_MOBILE_REGEX.test(step1.primaryContactNumber.trim())) {
      errors.push("Primary contact number must be a valid 10-digit mobile number")
    }
    if (!step1.zoneId?.trim()) {
      errors.push("Service zone is required")
    }
    if (!step1.location?.formattedAddress?.trim()) {
      errors.push("Please search and select an address from the location search")
    }
    if (!step1.location?.addressLine1?.trim()) {
      errors.push("Shop no. / building no. is required")
    }
    if (!step1.location?.addressLine2?.trim()) {
      errors.push("Floor / tower is required")
    }
    if (!step1.location?.landmark?.trim()) {
      errors.push("Nearby landmark is required")
    }
    if (!step1.location?.area?.trim()) {
      errors.push("Area/Sector/Locality is required")
    }
    if (!step1.location?.city?.trim()) {
      errors.push("City is required")
    }
    if (!step1.location?.state?.trim()) {
      errors.push("State is required")
    }
    if (!step1.location?.pincode?.trim()) {
      errors.push("Pincode is required")
    } else if (!PINCODE_REGEX.test(step1.location.pincode.trim())) {
      errors.push("Pincode must be exactly 6 digits")
    }

    return errors
  }

  const validateStep2 = () => {
    const errors = []

    // Check menu images - must have at least one File or existing URL
    const hasMenuImages = step2.menuImages && step2.menuImages.length > 0
    if (!hasMenuImages) {
      errors.push("At least one menu image is required")
    } else {
      // Verify that menu images are either File objects or have valid URLs
      const validMenuImages = step2.menuImages.filter(img => {
        if (isUploadableFile(img)) return true
        if (img?.url && typeof img.url === 'string') return true
        if (typeof img === 'string' && img.startsWith('http')) return true
        return false
      })
      if (validMenuImages.length === 0) {
        errors.push("Please upload at least one valid menu image")
      }
    }

    // Check profile image - must be a File or existing URL
    if (!step2.profileImage) {
      errors.push("Restaurant profile image is required")
    } else {
      // Verify profile image is either a File or has a valid URL
      const isValidProfileImage =
        isUploadableFile(step2.profileImage) ||
        (step2.profileImage?.url && typeof step2.profileImage.url === 'string') ||
        (typeof step2.profileImage === 'string' && step2.profileImage.startsWith('http'))
      if (!isValidProfileImage) {
        errors.push("Please upload a valid restaurant profile image")
      }
    }

    if (!step2.openingTime?.trim()) {
      errors.push("Opening time is required")
    }
    if (!step2.closingTime?.trim()) {
      errors.push("Closing time is required")
    }
    if (!step2.openDays || step2.openDays.length === 0) {
      errors.push("Please select at least one open day")
    }

    return errors
  }

  const validateStep4 = () => {
    const errors = []
    if (!step4.estimatedDeliveryTime || !step4.estimatedDeliveryTime.trim()) {
      errors.push("Estimated delivery time is required")
    }
    if (!step4.featuredDish || !step4.featuredDish.trim()) {
      errors.push("Featured dish name is required")
    } else if (!FEATURED_DISH_NAME_REGEX.test(step4.featuredDish.trim())) {
      errors.push("Featured dish name must contain only letters")
    }
    return errors
  }

  const validateStep3 = () => {
    const errors = []

    if (!step3.panNumber?.trim()) {
      errors.push("PAN number is required")
    } else if (!PAN_NUMBER_REGEX.test(step3.panNumber.trim().toUpperCase())) {
      errors.push("PAN number must be valid (e.g., ABCDE1234F)")
    }
    if (!step3.nameOnPan?.trim()) {
      errors.push("Name on PAN is required")
    }
    // Validate PAN image - must be a File or existing URL
    if (!step3.panImage) {
      errors.push("PAN image is required")
    } else {
      const isValidPanImage =
        isUploadableFile(step3.panImage) ||
        (step3.panImage?.url && typeof step3.panImage.url === 'string') ||
        (typeof step3.panImage === 'string' && step3.panImage.startsWith('http'))
      if (!isValidPanImage) {
        errors.push("Please upload a valid PAN image")
      }
    }

    if (!step3.fssaiNumber?.trim()) {
      errors.push("FSSAI number is required")
    } else if (!FSSAI_NUMBER_REGEX.test(step3.fssaiNumber.trim())) {
      errors.push("FSSAI number must contain exactly 14 digits")
    }
    if (!step3.fssaiExpiry?.trim()) {
      errors.push("FSSAI expiry date is required")
    } else if (step3.fssaiExpiry < getTodayLocalYMD()) {
      errors.push("FSSAI expiry date cannot be in the past")
    }
    // Validate FSSAI image - must be a File or existing URL
    if (!step3.fssaiImage) {
      errors.push("FSSAI image is required")
    } else {
      const isValidFssaiImage =
        isUploadableFile(step3.fssaiImage) ||
        (step3.fssaiImage?.url && typeof step3.fssaiImage.url === 'string') ||
        (typeof step3.fssaiImage === 'string' && step3.fssaiImage.startsWith('http'))
      if (!isValidFssaiImage) {
        errors.push("Please upload a valid FSSAI image")
      }
    }

    // Validate GST details if GST registered
    if (step3.gstRegistered) {
      if (!step3.gstNumber?.trim()) {
        errors.push("GST number is required when GST registered")
      } else if (!GST_NUMBER_REGEX.test(step3.gstNumber.trim().toUpperCase())) {
        errors.push("GST number must be a valid 15-character GSTIN")
      }
      if (!step3.gstLegalName?.trim()) {
        errors.push("GST legal name is required when GST registered")
      } else if (!GST_LEGAL_NAME_REGEX.test(step3.gstLegalName.trim())) {
        errors.push("GST legal name must contain only letters")
      }
      if (!step3.gstAddress?.trim()) {
        errors.push("GST registered address is required when GST registered")
      }
      // Validate GST image if GST registered
      if (!step3.gstImage) {
        errors.push("GST image is required when GST registered")
      } else {
        const isValidGstImage =
          isUploadableFile(step3.gstImage) ||
          (step3.gstImage?.url && typeof step3.gstImage.url === 'string') ||
          (typeof step3.gstImage === 'string' && step3.gstImage.startsWith('http'))
        if (!isValidGstImage) {
          errors.push("Please upload a valid GST image")
        }
      }
    }

    if (!step3.accountNumber?.trim()) {
      errors.push("Account number is required")
    } else if (!BANK_ACCOUNT_NUMBER_REGEX.test(step3.accountNumber.trim())) {
      errors.push("Account number must contain 9 to 18 digits only")
    }
    if (!step3.confirmAccountNumber?.trim()) {
      errors.push("Please confirm your account number")
    } else if (!BANK_ACCOUNT_NUMBER_REGEX.test(step3.confirmAccountNumber.trim())) {
      errors.push("Confirm account number must contain 9 to 18 digits only")
    }
    if (step3.accountNumber && step3.confirmAccountNumber && step3.accountNumber !== step3.confirmAccountNumber) {
      errors.push("Account number and confirmation do not match")
    }
    if (!step3.ifscCode?.trim()) {
      errors.push("IFSC code is required")
    } else if (!IFSC_CODE_REGEX.test(step3.ifscCode.trim().toUpperCase())) {
      errors.push("IFSC code must be in proper format (e.g., SBIN0001234)")
    }
    if (!step3.accountHolderName?.trim()) {
      errors.push("Account holder name is required")
    } else if (!ACCOUNT_HOLDER_NAME_REGEX.test(step3.accountHolderName.trim())) {
      errors.push("Account holder name must contain only letters")
    }
    if (!step3.accountType?.trim()) {
      errors.push("Account type is required")
    } else if (!["Saving", "Current"].includes(step3.accountType.trim())) {
      errors.push("Account type must be either Saving or Current")
    }

    return errors
  }

  // Fill dummy data for testing (development mode only)




  const handleNext = async () => {
    setError("")

    // Validate current step before proceeding
    let validationErrors = []
    if (step === 1) {
      validationErrors = validateStep1()
    } else if (step === 2) {
      validationErrors = validateStep2()
    } else if (step === 3) {
      validationErrors = validateStep3()
    } else if (step === 4) {
      validationErrors = validateStep4()
      debugLog('?? Step 4 validation:', {
        step4,
        errors: validationErrors,
        estimatedDeliveryTime: step4.estimatedDeliveryTime,
        featuredDish: step4.featuredDish,
        featuredPrice: step4.featuredPrice,
        offer: step4.offer
      })
    }

    if (validationErrors.length > 0) {
      // Show only the first validation error so users can fix fields one-by-one.
      toast.error(validationErrors[0], {
        duration: 4000,
      })
      debugLog('? Validation failed:', validationErrors)
      return
    }

    setSaving(true)
    try {
      if (step === 1) {
        setStep(2)
        window.scrollTo({ top: 0, behavior: "instant" })
      } else if (step === 2) {
        setStep(3)
        window.scrollTo({ top: 0, behavior: "instant" })
      } else if (step === 3) {
        setStep(4)
        window.scrollTo({ top: 0, behavior: "instant" })
      } else if (step === 4) {
        // Final submit: create restaurant in DB using backend multipart endpoint.
        const formData = new FormData()

        // Step 1
        formData.append("restaurantName", step1.restaurantName || "")
        formData.append(
          "pureVegRestaurant",
          step1.pureVegRestaurant === true ? "true" : "false",
        )
        formData.append("ownerName", step1.ownerName || "")
        formData.append("ownerEmail", (step1.ownerEmail || "").trim())
        formData.append("ownerPhone", normalizePhoneDigits(step1.ownerPhone))
        formData.append("primaryContactNumber", normalizePhoneDigits(step1.primaryContactNumber))
        formData.append("zoneId", step1.zoneId || "")
        formData.append("addressLine1", step1.location?.addressLine1 || "")
        formData.append("addressLine2", step1.location?.addressLine2 || "")
        formData.append("area", step1.location?.area || "")
        formData.append("city", step1.location?.city || "")
        formData.append("state", step1.location?.state || "")
        formData.append("pincode", step1.location?.pincode || "")
        formData.append("landmark", step1.location?.landmark || "")
        formData.append("formattedAddress", step1.location?.formattedAddress || "")
        formData.append("latitude", String(step1.location?.latitude || ""))
        formData.append("longitude", String(step1.location?.longitude || ""))

        // Step 2
        formData.append("cuisines", (step2.cuisines || []).join(","))
        formData.append("openingTime", normalizeTimeValue(step2.openingTime) || "")
        formData.append("closingTime", normalizeTimeValue(step2.closingTime) || "")
        formData.append("openDays", (step2.openDays || []).join(","))

        const validMenuImages = (step2.menuImages || []).filter((img) => isUploadableFile(img) || getPersistedImageUrl(img))
        if (validMenuImages.length === 0) {
          throw new Error("At least one menu image must be uploaded")
        }
        validMenuImages.forEach((image) => {
          if (isUploadableFile(image)) {
            formData.append("menuImages", image)
          } else {
            formData.append("menuImages", getPersistedImageUrl(image))
          }
        })

        appendImageFileOrUrl(formData, "profileImage", step2.profileImage, {
          required: true,
          label: "Restaurant profile image",
        })

        // Step 3
        formData.append("panNumber", step3.panNumber || "")
        formData.append("nameOnPan", step3.nameOnPan || "")
        appendImageFileOrUrl(formData, "panImage", step3.panImage, {
          required: true,
          label: "PAN image",
        })

        formData.append("gstRegistered", step3.gstRegistered ? "true" : "false")
        if (step3.gstRegistered) {
          formData.append("gstNumber", step3.gstNumber || "")
          formData.append("gstLegalName", step3.gstLegalName || "")
          formData.append("gstAddress", step3.gstAddress || "")
          appendImageFileOrUrl(formData, "gstImage", step3.gstImage, {
            required: true,
            label: "GST image",
          })
        }

        formData.append("fssaiNumber", step3.fssaiNumber || "")
        formData.append("fssaiExpiry", step3.fssaiExpiry || "")
        appendImageFileOrUrl(formData, "fssaiImage", step3.fssaiImage, {
          required: true,
          label: "FSSAI image",
        })

        formData.append("accountNumber", step3.accountNumber || "")
        formData.append("ifscCode", (step3.ifscCode || "").toUpperCase())
        formData.append("accountHolderName", step3.accountHolderName || "")
        formData.append("accountType", step3.accountType || "")

        // Step 4
        formData.append("estimatedDeliveryTime", step4.estimatedDeliveryTime || "")
        formData.append("featuredDish", step4.featuredDish || "")
        formData.append("offer", step4.offer || "")

        // Logging for verification
        debugLog("?? Submitting restaurant data:", {
          openingTime: normalizeTimeValue(step2.openingTime),
          closingTime: normalizeTimeValue(step2.closingTime),
          openDays: (step2.openDays || []).join(",")
        });

        if (isRegistered) {
          debugLog("?? Updating existing restaurant profile");
          await restaurantAPI.updateProfile(formData);
        } else {
          debugLog("?? Registering new restaurant");
          await restaurantAPI.register(formData);
        }

        // Clear localStorage when onboarding is complete
        clearOnboardingFromLocalStorage()
        clearOnboardingFileCache()
        try {
          localStorage.setItem("restaurant_pendingPhone", normalizePhoneDigits(step1.ownerPhone))
        } catch { }

        toast.success("Registration submitted. Awaiting admin approval.", { duration: 4000 })
        navigate("/food/restaurant/pending-verification", {
          replace: true,
          state: {
            phone: normalizePhoneDigits(step1.ownerPhone),
          },
        })
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to save onboarding data"
      setError(msg)
    } finally {
      setSaving(false)
    }
  }



  const toggleDay = (day) => {
    setStep2((prev) => {
      const exists = prev.openDays.includes(day)
      if (exists) {
        return { ...prev, openDays: prev.openDays.filter((d) => d !== day) }
      }
      return { ...prev, openDays: [...prev.openDays, day] }
    })
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md">
        <h2 className="text-lg font-semibold text-black mb-4">Restaurant information</h2>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-gray-700">Restaurant name*</Label>
            <Input
              value={step1.restaurantName || ""}
              onChange={(e) => setStep1({ ...step1, restaurantName: e.target.value })}
              onKeyDown={(e) => {
                // Allow letters, numbers, spaces and common symbols
                if (e.key.length === 1 && !/^[A-Za-z0-9\s.,&'-]$/.test(e.key)) {
                  e.preventDefault()
                }
              }}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="Customers will see this name"
              disabled={!isEditing}
            />
          </div>
          <div>
            <Label className="text-xs text-gray-700">Pure veg restaurant?*</Label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => isEditing && setStep1({ ...step1, pureVegRestaurant: true })}
                className={`px-3 py-1.5 text-xs rounded-full border ${step1.pureVegRestaurant === true
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-white text-gray-700 border-gray-200"
                  } ${!isEditing ? "opacity-70 cursor-not-allowed" : ""}`}
              >
                Yes, Pure Veg
              </button>
              <button
                type="button"
                onClick={() => isEditing && setStep1({ ...step1, pureVegRestaurant: false })}
                className={`px-3 py-1.5 text-xs rounded-full border ${step1.pureVegRestaurant === false
                    ? "text-white border-transparent"
                    : "bg-white text-gray-700 border-gray-200"
                  } ${!isEditing ? "opacity-70 cursor-not-allowed" : ""}`}
                style={step1.pureVegRestaurant === false ? { background: BRAND_THEME.gradients.primary } : undefined}
              >
                No, Mixed Menu
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              This helps users filter restaurants by dietary preference.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md">
        <h2 className="text-lg font-semibold text-black mb-4">Owner details</h2>
        <p className="text-sm text-gray-600 mb-4">
          These details will be used for all business communications and updates.
        </p>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-gray-700">Full name*</Label>
            <Input
              value={step1.ownerName || ""}
              onChange={(e) => {
                const sanitized = e.target.value.replace(/[^A-Za-z\s.'-]/g, "")
                setStep1({ ...step1, ownerName: sanitized })
              }}
              onKeyDown={(e) => {
                if (e.key.length === 1 && !/^[A-Za-z\s.'-]$/.test(e.key)) {
                  e.preventDefault()
                }
              }}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="Owner full name"
              disabled={!isEditing}
            />
          </div>
          <div>
            <Label className="text-xs text-gray-700">Email address*</Label>
            <Input
              type="email"
              value={step1.ownerEmail || ""}
              onChange={(e) => {
                const sanitizedEmail = e.target.value.replace(/\s+/g, "").toLowerCase()
                setStep1({ ...step1, ownerEmail: sanitizedEmail })
              }}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="owner@example.com"
              disabled={!isEditing}
            />
          </div>
          <div>
            <Label className="text-xs text-gray-700">Phone number*</Label>
            <Input
              value={step1.ownerPhone || ""}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 10)
                setStep1({ ...step1, ownerPhone: val })
              }}
              onKeyDown={(e) => {
                const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"]
                if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) e.preventDefault()
                if (/^\d$/.test(e.key) && (step1.ownerPhone || "").length >= 10) e.preventDefault()
              }}
              onPaste={(e) => {
                e.preventDefault()
                const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 10)
                setStep1({ ...step1, ownerPhone: pasted })
              }}
              inputMode="numeric"
              readOnly
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="+91 98XXXXXX"
              disabled={!isEditing}
            />
          </div>
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Restaurant contact & location</h2>
        <div>
          <Label className="text-xs text-gray-700">Primary contact number*</Label>
          <Input
            value={step1.primaryContactNumber || ""}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 10)
              setStep1({ ...step1, primaryContactNumber: val })
            }}
            onKeyDown={(e) => {
              const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"]
              if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) e.preventDefault()
              if (/^\d$/.test(e.key) && (step1.primaryContactNumber || "").length >= 10) e.preventDefault()
            }}
            onPaste={(e) => {
              e.preventDefault()
              const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 10)
              setStep1({ ...step1, primaryContactNumber: pasted })
            }}
            inputMode="numeric"
            className="mt-1 bg-white text-sm text-black placeholder-black"
            placeholder="Restaurant's primary contact number"
            disabled={!isEditing}
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Customers, delivery partners and {companyName} may call on this number for order
            support.
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Add your restaurant's location for order pick-up.
          </p>
          <div>
            <Label className="text-xs text-gray-700">Service zone*</Label>
            <select
              value={step1.zoneId || ""}
              onChange={(e) => {
                const newZoneId = e.target.value
                if (locationSearchInputRef.current) {
                  locationSearchInputRef.current.value = ""
                }
                setStep1((prev) => ({
                  ...prev,
                  zoneId: newZoneId,
                  location: {
                    formattedAddress: "",
                    addressLine1: "",
                    addressLine2: "",
                    area: "",
                    city: "",
                    state: "",
                    pincode: "",
                    landmark: "",
                    latitude: "",
                    longitude: "",
                  },
                }))
              }}
              className="mt-1 w-full h-9 rounded-md border border-input bg-white px-3 text-sm"
              disabled={zonesLoading || !isEditing}
            >
              <option value="">{zonesLoading ? "Loading zones..." : "Select a zone"}</option>
              {zones.map((z) => {
                const id = String(z?._id || z?.id || "")
                const label = z?.name || z?.zoneName || z?.serviceLocation || id
                return (
                  <option key={id} value={id}>
                    {label}
                  </option>
                )
              })}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">
              Choose the service zone where your restaurant will be available.
            </p>
          </div>
          <div className="p-3 bg-brand-50/50 rounded-lg border-2 border-brand-200 shadow-sm ring-2 ring-brand-100/50">
            <Label className="text-xs font-bold text-brand-700 mb-1.5 block">Search & Set Restaurant Location*</Label>
            <Input
              ref={locationSearchInputRef}
              className="mt-1 bg-white text-sm text-black! dark:text-white! placeholder:text-gray-500 dark:placeholder:text-gray-400 caret-black dark:caret-white border-brand-500 border-2 ring-2 ring-brand-100 focus:border-brand-600 focus:ring-brand-200 font-bold transition-all shadow-sm"
              style={{ color: "#000", WebkitTextFillColor: "#000" }}
              placeholder="Search your restaurant address here..."
              defaultValue={step1.location?.formattedAddress || ""}
              disabled={!isEditing}
              onChange={(e) => {
                if (!e.target.value.trim()) {
                  setStep1((prev) => ({
                    ...prev,
                    location: {
                      formattedAddress: "",
                      addressLine1: "",
                      addressLine2: "",
                      area: "",
                      city: "",
                      state: "",
                      pincode: "",
                      landmark: "",
                      latitude: "",
                      longitude: "",
                    },
                  }))
                }
              }}
            />
            <p className="text-[10px] text-brand-600 mt-2 font-medium">
              Start typing and select from the list to auto-fill details below.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-gray-700">Shop no. / Building no. / Apartment*</Label>
            <Input
              value={step1.location?.addressLine1 || ""}
              onChange={(e) =>
                setStep1({
                  ...step1,
                  location: { ...step1.location, addressLine1: e.target.value },
                })
              }
              className="bg-white text-sm"
              placeholder="e.g., Shop 42 or Building 7A"
              disabled={!isEditing}
            />
          </div>
          <Input
            value={step1.location?.addressLine2 || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, addressLine2: e.target.value },
              })
            }
            className="bg-white text-sm"
            placeholder="Floor / tower*"
            disabled={!isEditing}
          />
          <Input
            value={step1.location?.landmark || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, landmark: e.target.value },
              })
            }
            className="bg-white text-sm"
            placeholder="Nearby landmark*"
            disabled={!isEditing}
          />
          {/* Auto-filled Location Details as non-input blocks (Always visible) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-md text-[13px] text-gray-600 flex flex-col min-h-[52px]">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Locality / Area</span>
              <span className="mt-0.5">{step1.location?.area || "—"}</span>
            </div>
            <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-md text-[13px] text-gray-600 flex flex-col min-h-[52px]">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">City</span>
              <span className="mt-0.5">{step1.location?.city || "—"}</span>
            </div>
            <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-md text-[13px] text-gray-600 flex flex-col min-h-[52px]">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">State</span>
              <span className="mt-0.5">{step1.location?.state || "—"}</span>
            </div>
            <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-md text-[13px] text-gray-600 flex flex-col min-h-[52px]">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Pincode</span>
              <span className="mt-0.5">{step1.location?.pincode || "—"}</span>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Please ensure that this address is the same as mentioned on your FSSAI license.
          </p>
        </div>
      </section>
    </div>
  )


  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Images section */}
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        <h2 className="text-lg font-semibold text-black">Menu & photos</h2>
        <p className="text-xs text-gray-500">
          Add clear photos of your printed menu and a primary profile image. This helps customers
          understand what you serve.
        </p>

        {/* Menu images */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">Menu images</Label>
          <div className="mt-1 border border-dashed border-gray-300 rounded-md bg-gray-50/70 px-4 py-3 flex items-center justify-between flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-white flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-gray-700" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-900">Upload menu images</span>
                <span className="text-[11px] text-gray-500">
                  JPG, PNG, WebP ? You can select multiple files
                </span>
              </div>
            </div>
            <DocumentUploadActions
              onFileSelect={(file) => {
                if (file) {
                  setStep2((prev) => ({
                    ...prev,
                    menuImages: getUniqueImages(prev.menuImages, file)
                  }))
                }
              }}
              fileNamePrefix="menu-image"
              galleryInputRef={menuImagesInputRef}
            />
            <input
              id="menuImagesInput"
              type="file"
              multiple
              accept={LOCAL_IMAGE_FILE_ACCEPT}
              className="hidden"
              ref={menuImagesInputRef}
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                if (!files.length) return
                debugLog('?? Menu images selected:', files.length, 'files')
                setStep2((prev) => ({
                  ...prev,
                  menuImages: getUniqueImages(prev.menuImages, files)
                }))
                // Reset input to allow selecting same file again
                e.target.value = ''
              }}
            />
          </div>

          {/* Menu image previews */}
          {!!step2.menuImages.length && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {step2.menuImages.map((file, idx) => {
                // Handle both File objects and URL objects
                let imageUrl = null
                let imageName = `Image ${idx + 1}`

                if (isUploadableFile(file)) {
                  imageUrl = getPreviewImageUrl(file)
                  imageName = file.name || imageName
                } else if (file?.url) {
                  // If it's an object with url property (from backend)
                  imageUrl = file.url
                  imageName = file.name || `Image ${idx + 1}`
                } else if (typeof file === 'string') {
                  // If it's a direct URL string
                  imageUrl = file
                }

                return (
                  <div
                    key={idx}
                    className="relative aspect-4/5 rounded-md overflow-hidden bg-gray-100"
                  >
                    <div className="absolute top-1 right-1 z-30">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setStep2((prev) => ({
                            ...prev,
                            menuImages: prev.menuImages.filter((_, i) => i !== idx),
                          }));
                        }}
                        className="bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={`Menu ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-500 px-2 text-center">
                        Preview unavailable
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-brand-900/50 px-2 py-1">
                      <p className="text-[10px] text-white truncate">
                        {imageName}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Profile image */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">Restaurant profile image</Label>
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                {step2.profileImage ? (
                  (() => {
                    const imageSrc = getPreviewImageUrl(step2.profileImage)

                    return imageSrc ? (
                      <img
                        src={imageSrc}
                        alt="Restaurant profile"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-gray-500" />
                    );
                  })()
                ) : (
                  <ImageIcon className="w-6 h-6 text-gray-500" />
                )}
              </div>
              {step2.profileImage && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStep2((prev) => ({
                      ...prev,
                      profileImage: null,
                    }));
                  }}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors z-10"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex-1 flex-col flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-900">Upload profile image</span>
                <span className="text-[11px] text-gray-500">
                  This will be shown on your listing card and restaurant page.
                </span>
              </div>

            </div>

          </div>
          <DocumentUploadActions
            onFileSelect={(file) => {
              if (file) {
                setStep2((prev) => ({
                  ...prev,
                  profileImage: file,
                }))
              }
            }}
            fileNamePrefix="profile-image"
            galleryInputRef={profileImageInputRef}
          />
          <input
            id="profileImageInput"
            type="file"
            accept={LOCAL_IMAGE_FILE_ACCEPT}
            className="hidden"
            ref={profileImageInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0] || null
              if (file) {
                debugLog('?? Profile image selected:', file.name)
                setStep2((prev) => ({
                  ...prev,
                  profileImage: file,
                }))
              }
              // Reset input to allow selecting same file again
              e.target.value = ''
            }}
          />
        </div>
      </section>

      {/* Operational details */}
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        {/* Timings with popover time selectors */}
        <div className="space-y-3">
          <Label className="text-xs text-gray-700">Delivery timings</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TimeSelector
              label="Opening time"
              value={step2.openingTime || ""}
              onChange={(val) =>
                setStep2((prev) => ({ ...prev, openingTime: normalizeTimeValue(val) || "" }))
              }
            />
            <TimeSelector
              label="Closing time"
              value={step2.closingTime || ""}
              onChange={(val) =>
                setStep2((prev) => ({ ...prev, closingTime: normalizeTimeValue(val) || "" }))
              }
            />
          </div>
        </div>

        {/* Open days in a calendar-like grid */}
        <div className="space-y-2">
          <Label className="text-xs text-gray-700 flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 text-gray-800" />
            <span>Open days</span>
          </Label>
          <p className="text-[11px] text-gray-500">
            Select the days your restaurant accepts delivery orders.
          </p>
          <div className="mt-1 grid grid-cols-7 gap-1.5 sm:gap-2">
            {daysOfWeek.map((day) => {
              const active = step2.openDays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`aspect-square flex items-center justify-center rounded-md text-[11px] font-medium ${active ? "text-white" : "bg-gray-100 text-gray-800"
                    }`}
                  style={active ? { background: BRAND_THEME.gradients.primary } : undefined}
                >
                  {day.charAt(0)}
                </button>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">PAN details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-gray-700">PAN number</Label>
            <Input
              value={step3.panNumber || ""}
              onChange={(e) => {
                const normalized = e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 10)
                setStep3({ ...step3, panNumber: normalized })
              }}
              onKeyDown={(e) => {
                const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"]
                if (allowed.includes(e.key)) return
                if (!/^[A-Za-z0-9]$/.test(e.key)) e.preventDefault()
                if ((step3.panNumber || "").length >= 10) e.preventDefault()
              }}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="ABCDE1234F"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-700">PAN Card Holder Name</Label>
            <Input
              value={step3.nameOnPan || ""}
              onChange={(e) =>
                setStep3({
                  ...step3,
                  nameOnPan: e.target.value.replace(/[^A-Za-z\s.'-]/g, ""),
                })
              }
              onKeyDown={(e) => {
                if (e.key.length === 1 && !/^[A-Za-z\s.'-]$/.test(e.key)) {
                  e.preventDefault()
                }
              }}
              className="mt-1 bg-white text-sm text-black placeholder-black"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-gray-700">PAN image</Label>
          <DocumentUploadActions
            onFileSelect={(file) =>
              setStep3((prev) => ({ ...prev, panImage: file || null }))
            }
            fileNamePrefix="pan-image"
            galleryInputRef={panImageInputRef}
          />
          <input
            type="file"
            accept={GALLERY_IMAGE_ACCEPT}
            className="hidden"
            ref={panImageInputRef}
            onChange={(e) =>
              setStep3((prev) => ({ ...prev, panImage: e.target.files?.[0] || null }))
            }
          />
          {step3.panImage && (
            <div className="mt-3 relative aspect-4/3 rounded-md overflow-hidden bg-gray-100">
              {getPreviewImageUrl(step3.panImage) ? (
                <img
                  src={getPreviewImageUrl(step3.panImage)}
                  alt="PAN document"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                  Preview unavailable
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setStep3((prev) => ({ ...prev, panImage: null }))
                }}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">GST details</h2>
        <div className="flex gap-4 items-center text-sm">
          <span className="text-gray-700">GST registered?</span>
          <button
            type="button"
            onClick={() => setStep3({ ...step3, gstRegistered: true })}
            className={`px-3 py-1.5 text-xs rounded-full ${step3.gstRegistered ? "text-white" : "bg-gray-100 text-gray-800"
              }`}
            style={step3.gstRegistered ? { background: BRAND_THEME.gradients.primary } : undefined}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setStep3({ ...step3, gstRegistered: false })}
            className={`px-3 py-1.5 text-xs rounded-full ${!step3.gstRegistered ? "text-white" : "bg-gray-100 text-gray-800"
              }`}
            style={!step3.gstRegistered ? { background: BRAND_THEME.gradients.primary } : undefined}
          >
            No
          </button>
        </div>
        {step3.gstRegistered && (
          <div className="space-y-3">
            <Input
              value={step3.gstNumber || ""}
              onChange={(e) =>
                setStep3({
                  ...step3,
                  gstNumber: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15),
                })
              }
              onKeyDown={(e) => {
                const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"]
                if (allowed.includes(e.key)) return
                if (!/^[A-Za-z0-9]$/.test(e.key)) e.preventDefault()
                if ((step3.gstNumber || "").length >= 15) e.preventDefault()
              }}
              className="bg-white text-sm"
              placeholder="GST number (15 characters)"
            />
            <Input
              value={step3.gstLegalName || ""}
              onChange={(e) =>
                setStep3({
                  ...step3,
                  gstLegalName: e.target.value.replace(/[^A-Za-z\s.'-]/g, ""),
                })
              }
              onKeyDown={(e) => {
                if (e.key.length === 1 && !/^[A-Za-z\s.'-]$/.test(e.key)) {
                  e.preventDefault()
                }
              }}
              className="bg-white text-sm"
              placeholder="Legal name"
            />
            <Input
              value={step3.gstAddress || ""}
              onChange={(e) => setStep3({ ...step3, gstAddress: e.target.value })}
              className="bg-white text-sm"
              placeholder="Registered address"
            />
            <DocumentUploadActions
              onFileSelect={(file) =>
                setStep3((prev) => ({ ...prev, gstImage: file || null }))
              }
              fileNamePrefix="gst-image"
              galleryInputRef={gstImageInputRef}
            />
            <input
              type="file"
              accept={GALLERY_IMAGE_ACCEPT}
              className="hidden"
              ref={gstImageInputRef}
              onChange={(e) =>
                setStep3((prev) => ({ ...prev, gstImage: e.target.files?.[0] || null }))
              }
            />
            {step3.gstImage && (
              <div className="mt-3 relative aspect-4/3 rounded-md overflow-hidden bg-gray-100">
                {getPreviewImageUrl(step3.gstImage) ? (
                  <img
                    src={getPreviewImageUrl(step3.gstImage)}
                    alt="GST document"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                    Preview unavailable
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setStep3((prev) => ({ ...prev, gstImage: null }))
                  }}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">FSSAI details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            value={step3.fssaiNumber || ""}
            onChange={(e) =>
              setStep3({ ...step3, fssaiNumber: e.target.value.replace(/\D/g, "").slice(0, 14) })
            }
            onKeyDown={(e) => {
              const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"]
              if (allowed.includes(e.key)) return
              if (!/^\d$/.test(e.key)) e.preventDefault()
              if (/^\d$/.test(e.key) && (step3.fssaiNumber || "").length >= 14) e.preventDefault()
            }}
            className="bg-white text-sm"
            placeholder="FSSAI number (14 digits)"
          />
          <div>
            <Label className="text-xs text-gray-700 mb-1 block">FSSAI expiry date</Label>
            <Popover open={isFssaiCalendarOpen} onOpenChange={setIsFssaiCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={() => setIsFssaiCalendarOpen(true)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md bg-white text-sm text-left flex items-center justify-between hover:bg-gray-50"
                >
                  <span className={step3.fssaiExpiry ? "text-gray-900" : "text-gray-500"}>
                    {step3.fssaiExpiry
                      ? parseLocalYMDDate(step3.fssaiExpiry)?.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                      : "Select expiry date"}
                  </span>
                  <CalendarIcon className="w-4 h-4 text-gray-500" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-100" align="start">
                <div className="bg-white rounded-md shadow-lg border border-gray-200">
                  <Calendar
                    mode="single"
                    selected={parseLocalYMDDate(step3.fssaiExpiry)}
                    disabled={(date) => formatDateToLocalYMD(date) < getTodayLocalYMD()}
                    onSelect={(date) => {
                      if (date && formatDateToLocalYMD(date) >= getTodayLocalYMD()) {
                        const formattedDate = formatDateToLocalYMD(date)
                        setStep3({ ...step3, fssaiExpiry: formattedDate })
                        setIsFssaiCalendarOpen(false)
                      }
                    }}
                    initialFocus
                    classNames={{
                      today: "bg-transparent text-foreground border-none", // Remove today highlight
                    }}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <DocumentUploadActions
          onFileSelect={(file) =>
            setStep3((prev) => ({ ...prev, fssaiImage: file || null }))
          }
          fileNamePrefix="fssai-image"
          galleryInputRef={fssaiImageInputRef}
        />
        <input
          type="file"
          accept={GALLERY_IMAGE_ACCEPT}
          className="hidden"
          ref={fssaiImageInputRef}
          onChange={(e) =>
            setStep3((prev) => ({ ...prev, fssaiImage: e.target.files?.[0] || null }))
          }
        />
        {step3.fssaiImage && (
          <div className="mt-3 relative aspect-4/3 rounded-md overflow-hidden bg-gray-100">
            {getPreviewImageUrl(step3.fssaiImage) ? (
              <img
                src={getPreviewImageUrl(step3.fssaiImage)}
                alt="FSSAI document"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                Preview unavailable
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setStep3((prev) => ({ ...prev, fssaiImage: null }))
              }}
              className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Bank account details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            value={step3.accountNumber || ""}
            onChange={(e) =>
              setStep3({ ...step3, accountNumber: e.target.value.replace(/\D/g, "").slice(0, 18) })
            }
            onKeyDown={(e) => {
              const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"]
              if (allowed.includes(e.key)) return
              if (!/^\d$/.test(e.key)) e.preventDefault()
              if (/^\d$/.test(e.key) && (step3.accountNumber || "").length >= 18) e.preventDefault()
            }}
            className="bg-white text-sm"
            placeholder="Account number"
          />
          <Input
            value={step3.confirmAccountNumber || ""}
            onChange={(e) =>
              setStep3({
                ...step3,
                confirmAccountNumber: e.target.value.replace(/\D/g, "").slice(0, 18),
              })
            }
            className="bg-white text-sm"
            onKeyDown={(e) => {
              const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"]
              if (allowed.includes(e.key)) return
              if (!/^\d$/.test(e.key)) e.preventDefault()
              if (/^\d$/.test(e.key) && (step3.confirmAccountNumber || "").length >= 18) e.preventDefault()
            }}
            placeholder="Re-enter account number"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            value={step3.ifscCode || ""}
            onChange={(e) => {
              const normalized = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11)
              const enforcedFormat =
                normalized.length >= 5
                  ? `${normalized.slice(0, 4)}0${normalized.slice(5)}`
                  : normalized
              setStep3({
                ...step3,
                ifscCode: enforcedFormat,
              })
            }}
            onKeyDown={(e) => {
              const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter"]
              if (allowed.includes(e.key)) return
              if (!/^[A-Za-z0-9]$/.test(e.key)) e.preventDefault()
              if ((step3.ifscCode || "").length >= 11) e.preventDefault()
            }}
            className="bg-white text-sm"
            placeholder="IFSC code (e.g., SBIN0001234)"
          />
          <Select
            value={step3.accountType || ""}
            onValueChange={(value) => setStep3({ ...step3, accountType: value })}
          >
            <SelectTrigger className="bg-white text-sm">
              <SelectValue placeholder="Select account type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Saving">Saving</SelectItem>
              <SelectItem value="Current">Current</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input
          value={step3.accountHolderName || ""}
          onChange={(e) =>
            setStep3({
              ...step3,
              accountHolderName: e.target.value.replace(/[^A-Za-z\s.'-]/g, ""),
            })
          }
          onKeyDown={(e) => {
            if (e.key.length === 1 && !/^[A-Za-z\s.'-]$/.test(e.key)) {
              e.preventDefault()
            }
          }}
          className="bg-white text-sm"
          placeholder="Account holder name"
        />
      </section>
    </div>
  )

  const renderStep4 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Restaurant Display Information</h2>
        <p className="text-sm text-gray-600">
          Add information that will be displayed to customers on the home page
        </p>

        <div>
          <Label className="text-xs text-gray-700">Estimated Delivery Time*</Label>
          <Select
            value={step4.estimatedDeliveryTime || ""}
            onValueChange={(value) => setStep4({ ...step4, estimatedDeliveryTime: value })}
          >
            <SelectTrigger className="mt-1 bg-white text-sm">
              <SelectValue placeholder="Select estimated timing" />
            </SelectTrigger>
            <SelectContent>
              {[
                ...ESTIMATED_DELIVERY_TIME_OPTIONS,
                ...(step4.estimatedDeliveryTime &&
                  !ESTIMATED_DELIVERY_TIME_OPTIONS.includes(step4.estimatedDeliveryTime)
                  ? [step4.estimatedDeliveryTime]
                  : []),
              ].map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-gray-700">Featured Dish Name*</Label>
          <Input
            value={step4.featuredDish || ""}
            onChange={(e) =>
              setStep4({
                ...step4,
                featuredDish: e.target.value.replace(/[^A-Za-z\s.'-]/g, ""),
              })
            }
            onKeyDown={(e) => {
              if (e.key.length === 1 && !/^[A-Za-z\s.'-]$/.test(e.key)) {
                e.preventDefault()
              }
            }}
            className="mt-1 bg-white text-sm"
            placeholder="e.g., Butter Chicken Special"
          />
        </div>

        <div>
          <Label className="text-xs text-gray-700">Special Offer/Promotion</Label>
          <Input
            value={step4.offer || ""}
            onChange={(e) => setStep4({ ...step4, offer: e.target.value })}
            className="mt-1 bg-white text-sm"
            placeholder="e.g., Flat 50 Rs. OFF on Order Above Rs.199"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Optional. Leave this blank if you do not want to highlight an offer.
          </p>
        </div>
      </section>
    </div>
  )

  const renderStep = () => {
    if (step === 1) return renderStep1()
    if (step === 2) return renderStep2()
    if (step === 3) return renderStep3()
    return renderStep4()
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft }}
      >
        <header className="px-4 py-4 sm:px-6 sm:py-5 bg-white flex items-center justify-between border-b">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/food/restaurant/explore")}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Close onboarding"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
            <div className="text-sm font-semibold text-black">Restaurant onboarding</div>
          </div>
          <div className="flex items-center gap-3">
            {!loading && !isEditing && (
              <Button
                onClick={() => setIsEditing(true)}
                variant="outline"
                size="sm"
                className="text-xs bg-brand-50 border-brand-300 text-brand-700 hover:bg-brand-100 flex items-center gap-1.5"
                title="Edit Details"
              >
                <Sparkles className="w-3 h-3" />
                Edit Details
              </Button>
            )}
            <div className="flex items-center gap-3">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider text-right">
                Step {step} of 4
              </div>
              <Button
                onClick={handleLogout}
                disabled={isLoggingOut}
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>

        </header>

        <main
          className="flex-1 px-4 sm:px-6 py-4 space-y-4"
          style={{ paddingBottom: keyboardInset ? `${keyboardInset + 20}px` : undefined }}
          onFocusCapture={(e) => {
            const target = e.target
            if (!(target instanceof HTMLElement)) return
            if (!target.matches("input, textarea, select")) return
            window.setTimeout(() => {
              target.scrollIntoView({ behavior: "smooth", block: "center" })
            }, 250)
          }}
        >
          {loading ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : (
            <div className={!isEditing ? "pointer-events-none select-none" : ""}>
              {renderStep()}
            </div>
          )}
        </main>


        {error && (
          <div className="px-4 sm:px-6 pb-2 text-xs text-red-600">
            {error}
          </div>
        )}

        <footer className={`px-4 sm:px-6 py-3 bg-white ${keyboardInset ? "hidden" : ""}`}>
          <div className="flex justify-between items-center">
            <Button
              variant="ghost"
              disabled={step === 1 || saving}
              onClick={() => { setStep((s) => Math.max(1, s - 1)); window.scrollTo({ top: 0, behavior: "instant" }) }}
              className="text-sm text-gray-700 bg-transparent"
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={saving || (step === 4 && !isEditing)}
              className="text-sm px-6 rounded-lg text-white"
              style={
                saving || (step === 4 && !isEditing)
                  ? { backgroundColor: "#e5e7eb", color: "#94a3b8" }
                  : {
                    background: BRAND_THEME.gradients.primary,
                    boxShadow: `0 10px 28px -18px ${BRAND_THEME.colors.brand.primaryDark}`,
                  }
              }
            >
              {step === 4 ? (saving ? "Saving..." : "Finish") : saving ? "Saving..." : "Continue"}
            </Button>
          </div>
        </footer>
      </div>
    </LocalizationProvider>
  )
}




