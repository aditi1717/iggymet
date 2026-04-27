import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Phone, User, AlertCircle, Loader2, UtensilsCrossed } from "lucide-react"
import { restaurantAPI } from "@food/api"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@food/components/ui/select"
import loginBg from "@food/assets/loginbanner.png"
import { useCompanyName } from "@food/hooks/useCompanyName"
import BRAND_THEME from "@/config/brandTheme"

const countryCodes = [
  { code: "+91", country: "IN", flag: "🇮🇳" },
]

export default function RestaurantSignup() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91",
    name: "",
  })
  const [errors, setErrors] = useState({
    phone: "",
    name: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState("")

  const validatePhone = (phone) => {
    if (!phone.trim()) {
      return "Phone number is required"
    }
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, "")
    const phoneRegex = /^\d{7,15}$/
    if (!phoneRegex.test(cleanPhone)) {
      return "Phone number must be 7-15 digits"
    }
    return ""
  }

  const validateName = (name) => {
    if (!name.trim()) {
      return "Restaurant name is required"
    }
    if (name.trim().length < 2) {
      return "Restaurant name must be at least 2 characters"
    }
    if (name.trim().length > 50) {
      return "Restaurant name must be less than 50 characters"
    }
    return ""
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData({
      ...formData,
      [name]: value,
    })

    // Real-time validation
    if (name === "phone") {
      setErrors({ ...errors, phone: validatePhone(value) })
    } else if (name === "name") {
      setErrors({ ...errors, name: validateName(value) })
    }
  }

  const handleCountryCodeChange = (value) => {
    setFormData({
      ...formData,
      countryCode: value,
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setApiError("")

    // Validate
    let hasErrors = false
    const newErrors = { phone: "", name: "" }

    const phoneError = validatePhone(formData.phone)
    newErrors.phone = phoneError
    if (phoneError) hasErrors = true

    const nameError = validateName(formData.name)
    newErrors.name = nameError
    if (nameError) hasErrors = true

    setErrors(newErrors)

    if (hasErrors) {
      setIsLoading(false)
      return
    }

    // Build full phone number
    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      // Send OTP with purpose 'register'
      await restaurantAPI.sendOTP(fullPhone, "register")

      // Store auth data in sessionStorage for OTP page
      const authData = {
        method: "phone",
        phone: fullPhone,
        name: formData.name,
        isSignUp: true,
        module: "restaurant",
      }
      sessionStorage.setItem("restaurantAuthData", JSON.stringify(authData))

      navigate("/food/restaurant/otp")
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Failed to send OTP. Please try again."
      setApiError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: "linear-gradient(180deg, #f7faff 0%, #ffffff 35%)" }}
    >
      <div className="w-full max-w-sm space-y-7">
        <div className="text-center space-y-2 sm:space-y-3">
          <div className="flex justify-center">
            <div
              className="h-14 w-14 rounded-full flex items-center justify-center shadow-md"
              style={{
                background: BRAND_THEME.gradients.primary,
                boxShadow: `0 12px 30px -16px ${BRAND_THEME.colors.brand.primaryDark}`,
              }}
            >
              <span className="text-white font-black text-lg">
                {companyName?.charAt(0) || "I"}
              </span>
            </div>
          </div>
          <p className="text-[11px] tracking-[0.16em] text-gray-500 font-semibold uppercase">
            Fast Delivery, Better Cravings
          </p>
        </div>

        <Card className="rounded-3xl shadow-md border border-brand-100/70 bg-white">
          <CardContent className="pt-7 pb-8 px-5 sm:px-7 space-y-6">
            <div className="flex flex-col items-center space-y-2">
              <span className="px-4 py-1 rounded-full text-[11px] font-semibold text-brand-700 bg-brand-50">
                Secure Login
              </span>
              <div className="text-center space-y-1">
                <h2 className="text-2xl font-bold text-gray-900">Login or Signup</h2>
                <p className="text-sm text-gray-600">Continue with your phone number.</p>
                <div className="flex justify-center">
                  <div className="w-12 h-0.5 bg-brand-600 rounded-full mt-2" />
                </div>
                </div>
              </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold tracking-wide text-gray-600">
                  Restaurant Name
                </Label>
                <div
                  className="rounded-2xl border bg-white px-4 py-3 shadow-[0_8px_20px_-18px_rgba(37,99,235,0.5)]"
                  style={{ borderColor: BRAND_THEME.colors.brand.primary }}
                >
                  <input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="Restaurant name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full border-0 focus:outline-none focus:ring-0 text-base font-medium text-gray-900 placeholder-gray-400"
                    maxLength={50}
                    required
                  />
                </div>
                {errors.name && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.name}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] font-semibold tracking-wide text-gray-600">
                  Phone Number
                </Label>
                <div
                  className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 shadow-[0_10px_26px_-20px_rgba(37,99,235,0.55)]"
                  style={{ borderColor: BRAND_THEME.colors.brand.primary }}
                >
                  <span className="text-gray-500">
                    <Phone className="h-4 w-4" />
                  </span>
                  <Select value={formData.countryCode} onValueChange={handleCountryCodeChange}>
                    <SelectTrigger className="w-20 border-0 focus:ring-0 focus:outline-none text-sm font-semibold text-gray-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {countryCodes.map((country) => (
                        <SelectItem key={country.code} value={country.code}>
                          {country.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="h-5 w-px bg-brand-100" />
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="Phone number"
                    value={formData.phone}
                    onChange={handleChange}
                    className="flex-1 border-0 focus-visible:ring-0 focus-visible:outline-none text-base font-medium text-gray-900 placeholder-gray-400"
                    maxLength={15}
                    required
                  />
                </div>
                {(errors.phone || apiError) && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.phone || apiError}</span>
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-brand-50 text-brand-700 text-[12px] font-medium px-4 py-3 text-center">
                We will send verification updates via SMS.
              </div>

              <Button
                type="submit"
                className="w-full h-12 rounded-2xl text-white text-base font-semibold shadow-lg"
                style={{
                  background: BRAND_THEME.gradients.primary,
                  boxShadow: `0 16px 40px -18px ${BRAND_THEME.colors.brand.primaryDark}`,
                }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending OTP...
                  </>
                ) : (
                  "Get Verification Code"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center text-[11px] text-gray-500 font-semibold space-y-1">
          <p>By continuing, you agree to our</p>
          <div className="flex items-center justify-center gap-1 text-brand-700 font-semibold">
            <button
              type="button"
              onClick={() => navigate("/food/restaurant/terms")}
              className="underline underline-offset-2"
            >
              Terms of Service
            </button>
            <span className="text-gray-400">&</span>
            <button
              type="button"
              onClick={() => navigate("/food/restaurant/privacy")}
              className="underline underline-offset-2"
            >
              Privacy Policy
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


