import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ShieldCheck, Timer, RefreshCw } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Card, CardContent } from "@food/components/ui/card"
import { restaurantAPI } from "@food/api"
import {
  setAuthData as setRestaurantAuthData,
  setRestaurantPendingPhone,
} from "@food/utils/auth"
import { checkOnboardingStatus, isRestaurantOnboardingComplete } from "@food/utils/onboardingUtils"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { getCachedSettings, loadBusinessSettings } from "@food/utils/businessSettings"
import BRAND_THEME from "@/config/brandTheme"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

export default function RestaurantOTP() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [otp, setOtp] = useState(["", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [contactInfo, setContactInfo] = useState("") 
  const [focusedIndex, setFocusedIndex] = useState(null)
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const [logoUrl, setLogoUrl] = useState("")
  const inputRefs = useRef([])
  const hasSubmittedRef = useRef(false)
  const otpSectionRef = useRef(null)

  useEffect(() => {
    const stored = sessionStorage.getItem("restaurantAuthData")
    if (stored) {
      const data = JSON.parse(stored)
      setAuthData(data)

      if (data.method === "email" && data.email) {
        setContactInfo(data.email)
      } else if (data.phone) {
        const phoneMatch = data.phone?.match(/(\+\d+)\s*(.+)/)
        if (phoneMatch) {
          const formattedPhone = `${phoneMatch[1]} ${phoneMatch[2].replace(/\D/g, "")}`
          setContactInfo(formattedPhone)
        } else {
          setContactInfo(data.phone || "")
        }
      }
    } else {
      navigate("/food/restaurant/login")
      return
    }

    setResendTimer(60)
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [navigate])

  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus()
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const viewport = window.visualViewport
    if (!viewport) return

    const updateKeyboardState = () => {
      const keyboardHeight = Math.max(0, window.innerHeight - viewport.height)
      setKeyboardOffset(keyboardHeight > 120 ? keyboardHeight : 0)
    }

    updateKeyboardState()
    viewport.addEventListener("resize", updateKeyboardState)
    viewport.addEventListener("scroll", updateKeyboardState)

    return () => {
      viewport.removeEventListener("resize", updateKeyboardState)
      viewport.removeEventListener("scroll", updateKeyboardState)
    }
  }, [])

  useEffect(() => {
    const syncBranding = async () => {
      const cached = getCachedSettings()
      if (cached?.logo?.url) setLogoUrl(cached.logo.url)
      try {
        const settings = await loadBusinessSettings()
        if (settings?.logo?.url) setLogoUrl(settings.logo.url)
      } catch {
        /* noop */
      }
    }
    syncBranding()
  }, [])

  useEffect(() => {
    if (focusedIndex == null) return

    const targetInput = inputRefs.current[focusedIndex]
    if (!targetInput) return

    const id = window.setTimeout(() => {
      try {
        targetInput.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        })
        otpSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        })
      } catch {
        // no-op
      }
    }, 120)

    return () => window.clearTimeout(id)
  }, [focusedIndex, keyboardOffset])

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) {
      return
    }

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")

    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }

    if (newOtp.every((digit) => digit !== "") && newOtp.length === 4) {
      if (!hasSubmittedRef.current) {
        hasSubmittedRef.current = true
        handleVerify(newOtp.join(""))
      }
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (otp[index]) {
        const newOtp = [...otp]
        newOtp[index] = ""
        setOtp(newOtp)
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        const newOtp = [...otp]
        newOtp[index - 1] = ""
        setOtp(newOtp)
      }
    }
    if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      navigator.clipboard.readText().then((text) => {
        const digits = text.replace(/\D/g, "").slice(0, 4).split("")
        const newOtp = [...otp]
        digits.forEach((digit, i) => {
          if (i < 4) {
            newOtp[i] = digit
          }
        })
        setOtp(newOtp)
        if (digits.length === 4) {
          handleVerify(newOtp.join(""))
        } else {
          inputRefs.current[digits.length]?.focus()
        }
      })
    }
  }

  const handlePaste = (index, e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text")
    const digits = pastedData.replace(/\D/g, "").slice(0, 4).split("")
    const newOtp = [...otp]
    digits.forEach((digit, i) => {
      if (i < 4) {
        newOtp[i] = digit
      }
    })
    setOtp(newOtp)
    if (digits.length === 4) {
      handleVerify(newOtp.join(""))
    } else {
      inputRefs.current[digits.length]?.focus()
    }
  }

  const handleVerify = async (otpValue = null) => {
    const code = otpValue || otp.join("")

    if (hasSubmittedRef.current && !otpValue) {
      return
    }

    if (code.length !== 4) {
      setError("Please enter the complete 4-digit code")
      hasSubmittedRef.current = false
      return
    }

    setIsLoading(true)
    setError("")

    try {
      if (!authData) {
        throw new Error("Session expired. Please try logging in again.")
      }

      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      const purpose = authData.isSignUp ? "register" : "login"

      const response = await restaurantAPI.verifyOTP(phone, code, purpose, null, email)
      const data = response?.data?.data || response?.data

      const needsRegistration = data?.needsRegistration === true
      const normalizedPhone = data?.phone || phone

      if (needsRegistration) {
        setRestaurantPendingPhone(normalizedPhone)
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        navigate("/food/restaurant/onboarding", { replace: true })
        return
      }

      const accessToken = data?.accessToken
      const refreshToken = data?.refreshToken ?? null
      const restaurant = data?.user ?? data?.restaurant

      if (accessToken && restaurant) {
        setRestaurantAuthData("restaurant", accessToken, restaurant, refreshToken)
        window.dispatchEvent(new Event("restaurantAuthChanged"))
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")

        setTimeout(async () => {
          if (authData?.isSignUp) {
            navigate("/food/restaurant/onboarding", { replace: true })
          } else {
            try {
              const onboardingComplete = isRestaurantOnboardingComplete(restaurant)
              if (!onboardingComplete) {
                const incompleteStep = await checkOnboardingStatus()
                if (incompleteStep) {
                  navigate(`/food/restaurant/onboarding?step=${incompleteStep}`, { replace: true })
                  return
                }
              }
              navigate("/food/restaurant", { replace: true })
            } catch (err) {
              navigate("/food/restaurant", { replace: true })
            }
          }
        }, 500)
      }
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Invalid OTP. Please try again."

      if (/pending approval/i.test(message)) {
        const pendingPhone = authData?.phone || authData?.email || contactInfo
        if (pendingPhone) {
          setRestaurantPendingPhone(pendingPhone)
        }
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        navigate("/food/restaurant/pending-verification", {
          replace: true,
          state: { phone: pendingPhone || "" },
        })
        return
      }

      setError(message)
      setOtp(["", "", "", ""])
      hasSubmittedRef.current = false
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0) return

    setIsLoading(true)
    setError("")

    try {
      if (!authData) {
        throw new Error("Session expired. Please go back and try again.")
      }

      const purpose = authData.isSignUp ? "register" : "login"
      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null

      await restaurantAPI.sendOTP(phone, purpose, email)
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to resend OTP. Please try again."
      setError(message)
    }

    setResendTimer(60)
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    setIsLoading(false)
    setOtp(["", "", "", ""])
    inputRefs.current[0]?.focus()
  }

  const isOtpComplete = otp.every((digit) => digit !== "")

  if (!authData) {
    return null
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{
        background: "linear-gradient(180deg, #f7faff 0%, #ffffff 35%)",
        paddingBottom: keyboardOffset ? `${Math.min(keyboardOffset + 80, 320)}px` : undefined,
      }}
    >
      <div className="w-full max-w-sm space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/food/restaurant/login")}
            className="p-2 rounded-full bg-white/80 shadow-sm border border-brand-100 text-brand-600 hover:bg-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 flex justify-center">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-16 w-16 object-contain" />
            ) : (
              <ShieldCheck className="w-8 h-8 text-brand-600" />
            )}
          </div>
          <div className="w-8" />
        </div>

        <Card className="rounded-3xl shadow-md border border-brand-100/70 bg-white">
          <CardContent className="pt-6 pb-6 px-4 sm:px-5 space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-bold text-gray-900">Verify OTP</h2>
              <p className="text-sm text-gray-600">
                Sent to <span className="text-brand-600 font-semibold">{contactInfo}</span>
              </p>
            </div>

            <div ref={otpSectionRef} className="flex justify-center gap-3">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={(e) => handlePaste(index, e)}
                  onFocus={() => setFocusedIndex(index)}
                  onBlur={() => setFocusedIndex(null)}
                  disabled={isLoading}
                  className={`w-12 h-14 bg-slate-50 border-2 rounded-xl text-center text-xl font-semibold text-slate-900 focus:outline-none transition-all duration-300 ${
                    error
                      ? "border-red-500 bg-red-50"
                      : focusedIndex === index
                        ? "border-brand-600 ring-4 ring-brand-100 bg-white"
                        : "border-slate-200"
                  }`}
                />
              ))}
            </div>

            {error && (
              <p className="text-red-600 text-xs font-semibold text-center">{error}</p>
            )}

            <div className="space-y-3">
              <Button
                onClick={() => handleVerify()}
                disabled={isLoading || !isOtpComplete}
                className="w-full h-11 rounded-2xl text-white text-base font-semibold shadow-lg transition-all duration-300"
                style={
                  isOtpComplete && !isLoading
                    ? {
                        background: BRAND_THEME.gradients.primary,
                        boxShadow: `0 16px 38px -18px ${BRAND_THEME.colors.brand.primaryDark}`,
                      }
                    : {
                        backgroundColor: "#e5e7eb",
                        color: "#94a3b8",
                      }
                }
              >
                {isLoading ? "Verifying..." : "Verify Code"}
              </Button>

              <div className="flex flex-col items-center gap-2">
                {resendTimer > 0 ? (
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
                    <Timer className="w-4 h-4 text-brand-600" />
                    Resend in <span className="text-brand-600">{resendTimer}s</span>
                  </div>
                ) : (
                  <button
                    onClick={handleResend}
                    disabled={isLoading}
                    className="flex items-center gap-2 text-brand-700 font-semibold text-xs hover:underline"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Resend code
                  </button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

