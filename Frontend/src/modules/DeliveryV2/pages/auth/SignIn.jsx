import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@food/components/ui/select"
import { deliveryAPI } from "@food/api"
import { getApiOrigin } from "@/services/api/baseUrl"
import { clearModuleAuth } from "@food/utils/auth"
import { useCompanyName } from "@food/hooks/useCompanyName"
import BRAND_THEME from "@/config/brandTheme"
import { loadBusinessSettings, getCachedSettings } from "@food/utils/businessSettings"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const countryCodes = [{ code: "+91", country: "IN", flag: "IN" }]

export default function DeliverySignIn() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [formData, setFormData] = useState({ phone: "", countryCode: "+91" })
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [showFallbackLogo, setShowFallbackLogo] = useState(false)
  const [logoUrl, setLogoUrl] = useState(null)

  useEffect(() => {
    // Prefer business settings logo (admin business setup). Fallback to brand theme file on same origin.
    const cached = getCachedSettings()
    if (cached?.logo?.url) {
      setLogoUrl(cached.logo.url)
    } else {
      loadBusinessSettings().then((settings) => {
        if (settings?.logo?.url) {
          setLogoUrl(settings.logo.url)
        } else {
          const origin = getApiOrigin()
          const file = BRAND_THEME.logoReference?.fileName
          if (origin && file) {
            setLogoUrl(`${origin}/uploads/brand/${file}`)
          }
        }
      }).catch(() => {
        const origin = getApiOrigin()
        const file = BRAND_THEME.logoReference?.fileName
        if (origin && file) {
          setLogoUrl(`${origin}/uploads/brand/${file}`)
        }
      })
    }

    const stored = sessionStorage.getItem("deliveryAuthData")
    if (stored) {
      try {
        const data = JSON.parse(stored)
        if (data.phone) {
          const phoneDigits = data.phone.replace("+91", "").trim()
          setFormData(prev => ({ ...prev, phone: phoneDigits }))
        }
      } catch (err) {
        debugError("Error parsing stored auth data:", err)
      }
    }
  }, [])

  const validatePhone = (phone) => {
    if (!phone || phone.trim() === "") return "Phone number is required"
    const digitsOnly = phone.replace(/\D/g, "")
    if (digitsOnly.length !== 10) return "Phone number must be exactly 10 digits"
    return ""
  }

  const handleSendOTP = async () => {
    setError("")
    const phoneError = validatePhone(formData.phone)
    if (phoneError) return setError(phoneError)

    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      setIsSending(true)
      clearModuleAuth("delivery")
      await deliveryAPI.sendOTP(fullPhone, "login")
      const authData = { method: "phone", phone: fullPhone, isSignUp: false, purpose: "login", module: "delivery" }
      sessionStorage.setItem("deliveryAuthData", JSON.stringify(authData))
      navigate("/food/delivery/otp")
    } catch (err) {
      debugError("Send OTP Error:", err)
      const message = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to send OTP. Please try again."
      setError(message)
    } finally {
      setIsSending(false)
    }
  }

  const handlePhoneChange = (e) => {
    const digitsOnly = e.target.value.replace(/\D/g, "")
    setFormData(prev => ({ ...prev, phone: digitsOnly }))
  }

  const isValid = validatePhone(formData.phone) === ""

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4 py-6">
      <div className="w-full max-w-md bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-100 p-6 space-y-6">
        <div className="text-center space-y-2.5">
          <div className="mx-auto h-16 w-16 rounded-2xl flex items-center justify-center">
            {!logoUrl || showFallbackLogo ? (
              <span className="text-white text-3xl">BK</span>
            ) : (
              <img
                src={logoUrl}
                alt="Brand logo"
                className="h-12 w-12 object-contain"
                onError={() => setShowFallbackLogo(true)}
                loading="lazy"
              />
            )}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">Delivery Partner</p>
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900">Login</h2>
            <p className="text-sm text-gray-600">Continue with your phone number</p>
          </div>
        </div>

        <div className="space-y-2.5">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Registered mobile number</label>
          <div className="flex gap-2 items-stretch w-full">
            <div className="flex items-center px-4 h-12 border border-gray-200 bg-gray-50 text-gray-900 rounded-xl shrink-0">
              <span className="flex items-center gap-2 text-base font-medium">
                <span>+91</span>
              </span>
            </div>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="Enter 10-digit mobile number"
              value={formData.phone}
              onChange={handlePhoneChange}
              autoComplete="off"
              className={`flex-1 h-12 px-4 text-gray-900 placeholder-gray-400 text-base border rounded-xl min-w-0 focus:outline-none ${error ? "border-red-500" : "border-gray-200"}`}
              style={!error ? { boxShadow: `0 0 0 2px ${BRAND_THEME.colors.brand.primary}1a`, borderColor: BRAND_THEME.colors.brand.primary } : undefined}
            />
          </div>
          <p className="text-xs text-gray-500">We'll send a verification code via SMS.</p>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="space-y-2.5">
          <button
            onClick={handleSendOTP}
            disabled={!isValid || isSending}
            className={`w-full h-12 rounded-xl font-semibold text-white transition-all ${isValid && !isSending ? "" : "opacity-60 cursor-not-allowed"}`}
            style={isValid && !isSending ? { background: BRAND_THEME.gradients.primary, boxShadow: `0 12px 28px -18px ${BRAND_THEME.colors.brand.primaryDark}` } : { backgroundColor: "#cbd5e1" }}
          >
            {isSending ? "Sending OTP..." : "Get Verification Code"}
          </button>
          <p className="text-[11px] text-center text-gray-500 leading-relaxed">
            By continuing, you agree to our{" "}
            <Link to="/food/delivery/terms" className="font-semibold" style={{ color: BRAND_THEME.colors.brand.primary }}>
              Terms of Service
            </Link>{" "}
            &{" "}
            <Link to="/food/delivery/privacy" className="font-semibold" style={{ color: BRAND_THEME.colors.brand.primary }}>
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
