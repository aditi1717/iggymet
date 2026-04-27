import React, { useEffect, useState, useRef } from "react"
import { motion } from "framer-motion"
import { Link, useNavigate } from "react-router-dom"
import { Phone, ShieldCheck, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { authAPI } from "@food/api"
import { setAuthData } from "@food/utils/auth"
import { getCachedSettings, loadBusinessSettings } from "@food/utils/businessSettings"
import BRAND_THEME from "@/config/brandTheme"

export default function UnifiedOTPFastLogin() {
  const RESEND_COOLDOWN_SECONDS = 60
  const [phoneNumber, setPhoneNumber] = useState("")
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const [logoUrl, setLogoUrl] = useState("")
  const [companyName, setCompanyName] = useState(BRAND_THEME.brandName)
  const navigate = useNavigate()
  const submitting = useRef(false)

  useEffect(() => {
    const syncBranding = async () => {
      try {
        const cached = getCachedSettings()
        if (cached?.logo?.url) setLogoUrl(cached.logo.url)
        if (cached?.companyName) setCompanyName(cached.companyName)

        const settings = await loadBusinessSettings()
        if (settings?.logo?.url) setLogoUrl(settings.logo.url)
        if (settings?.companyName) setCompanyName(settings.companyName)
      } catch (error) {
        console.warn("Failed to load auth branding:", error)
      }
    }

    syncBranding()

    const handleSettingsUpdate = () => {
      const cached = getCachedSettings()
      setLogoUrl(cached?.logo?.url || "")
      setCompanyName(cached?.companyName || BRAND_THEME.brandName)
    }

    window.addEventListener("businessSettingsUpdated", handleSettingsUpdate)
    return () => window.removeEventListener("businessSettingsUpdated", handleSettingsUpdate)
  }, [])

  const normalizedPhone = () => {
    const digits = String(phoneNumber).replace(/\D/g, "").slice(-15)
    return digits.length >= 8 ? digits : ""
  }

  const handleSendOTP = async (e) => {
    e.preventDefault()
    const phone = normalizedPhone()
    if (phone.length < 8) {
      toast.error("Please enter a valid phone number (at least 8 digits)")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      await authAPI.sendOTP(phoneNumber, "login", null)
      setOtpSent(true)
      setOtp("")
      setStep(2)
      setResendTimer(RESEND_COOLDOWN_SECONDS)
      toast.success("OTP sent! Check your phone.")
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to send OTP."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleResendOTP = async () => {
    const phone = normalizedPhone()
    if (phone.length < 8) {
      toast.error("Please enter a valid phone number (at least 8 digits)")
      return
    }
    if (resendTimer > 0 || submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      await authAPI.sendOTP(phoneNumber, "login", null)
      setOtp("")
      setOtpSent(true)
      setResendTimer(RESEND_COOLDOWN_SECONDS)
      toast.success("OTP resent successfully.")
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to resend OTP."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleEditNumber = () => {
    setStep(1)
    setOtp("")
    setResendTimer(0)
  }

  const handleVerifyOTP = async (e) => {
    e.preventDefault()
    const phone = normalizedPhone()
    const otpDigits = String(otp).replace(/\D/g, "").slice(0, 4)
    if (otpDigits.length !== 4) {
      toast.error("Please enter the 4-digit OTP")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      // Try to get FCM token before verifying OTP
      let fcmToken = null;
      let platform = "web";
      try {
        if (typeof window !== "undefined") {
          if (window.flutter_inappwebview) {
            platform = "mobile";
            const handlerNames = ["getFcmToken", "getFCMToken", "getPushToken", "getFirebaseToken"];
            for (const handlerName of handlerNames) {
              try {
                const t = await window.flutter_inappwebview.callHandler(handlerName, { module: "user" });
                if (t && typeof t === "string" && t.length > 20) {
                  fcmToken = t.trim();
                  break;
                }
              } catch (e) {}
            }
          } else {
            fcmToken = localStorage.getItem("fcm_web_registered_token_user") || null;
          }
        }
      } catch (e) {
        console.warn("Failed to get FCM token during login", e);
      }

      const response = await authAPI.verifyOTP(phoneNumber, otpDigits, "login", null, null, "user", null, null, fcmToken, platform)
      const data = response?.data?.data || response?.data || {}
      const accessToken = data.accessToken
      const refreshToken = data.refreshToken || null
      const user = data.user

      if (!accessToken || !user) {
        throw new Error("Invalid response from server")
      }

      setAuthData("user", accessToken, user, refreshToken)
      toast.success("Login successful!")
      navigate("/food/user", { replace: true })
    } catch (err) {
      const status = err?.response?.status
      let msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Invalid OTP. Please try again."
      if (status === 401) {
        if (/deactivat(ed|e)/i.test(String(msg))) {
          msg = "Your account is deactivated. Please contact support."
        } else {
          msg = "Invalid or expired code, or account not active."
        }
      }
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  useEffect(() => {
    if (step !== 2 || resendTimer <= 0) return
    const intervalId = setInterval(() => {
      setResendTimer((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(intervalId)
  }, [step, resendTimer])

  const formatResendTimer = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }

  const authTheme = {
    bannerBackground: BRAND_THEME.tokens.homepage.header.searchRailGradient || BRAND_THEME.colors.brand.primary,
    accent: BRAND_THEME.colors.brand.primary,
    accentSoft: `${BRAND_THEME.colors.brand.primary}1A`, // very soft variant
    buttonBackground: BRAND_THEME.tokens.button.primaryBackground || BRAND_THEME.colors.brand.primary,
    buttonShadow: "rgba(41,121,251,0.22)",
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex flex-col relative font-sans overflow-hidden">
      <div className="relative z-10 flex-col pt-10 text-center px-4">
         <div className="flex flex-col items-center justify-center">
            <div className="w-20 h-20 flex items-center justify-center mb-1">
              {logoUrl ? (
                 <img src={logoUrl} alt={companyName} className="max-h-full max-w-full object-contain" />
              ) : (
                 <span className="text-3xl font-black text-slate-900 dark:text-white">{BRAND_THEME.brandName.charAt(0)}</span>
              )}
            </div>
            <p className="text-[10px] font-medium text-slate-700 dark:text-slate-300 tracking-[0.12em] uppercase mt-1">
              Fast delivery, better cravings
            </p>
         </div>
      </div>

      <div className="w-full max-w-[360px] mx-auto px-4 mt-4 mb-5 relative z-20 flex flex-col">
        <div className="bg-white dark:bg-[#1a1a1a] rounded-[1.25rem] p-5 sm:p-6 shadow-none border border-slate-200 dark:border-gray-800">
           <div className="text-center mb-6 space-y-2 flex-col flex items-center">
              <div
                className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-[0.08em] mb-1"
                style={{ backgroundColor: authTheme.accentSoft, color: authTheme.accent }}
              >
                {step === 1 ? "Secure Login" : "OTP Verification"}
              </div>
              <h2 className="text-[20px] sm:text-[22px] font-semibold text-gray-900 dark:text-white leading-tight">
                {step === 1 ? "Login or Signup" : "Enter OTP"}
              </h2>
              <p className="text-[13px] text-slate-700 dark:text-slate-300 font-medium">
                {step === 1
                  ? "Continue with your phone number."
                  : `Code sent to +91 ${phoneNumber}`}
              </p>
              <div className="h-[2px] w-10 rounded-full mt-1" style={{ backgroundColor: authTheme.accent }} />
           </div>

           <form onSubmit={step === 1 ? handleSendOTP : handleVerifyOTP} className="space-y-4">
             {step === 1 ? (
               <div className="space-y-3">
                 <div className="rounded-[0.9rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 relative transition-all focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400/20">
                   <label className="block text-[9px] font-medium uppercase tracking-[0.08em] text-slate-600 dark:text-slate-300 mb-2">
                     Phone Number
                   </label>
                   <div className="flex items-center group">
                     <Phone className="w-[18px] h-[18px] text-slate-600 dark:text-slate-300 mr-2" />
                     <span className="text-sm font-semibold text-gray-900 dark:text-white mr-3">+91</span>
                     <div className="w-[1px] h-[20px] bg-slate-200 dark:bg-slate-700 mr-3"></div>
                     <input
                       type="tel"
                       required
                       autoFocus
                       value={phoneNumber}
                       onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                       maxLength={10}
                       className="flex-1 bg-transparent text-gray-900 dark:text-white outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium text-[15px]"
                       placeholder="Phone number"
                     />
                   </div>
                 </div>
                 
                 <div className="rounded-[0.9rem] bg-slate-50 dark:bg-slate-800/40 px-4 py-2.5 text-center text-[11px] font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800/80">
                   We will send verification updates via SMS.
                 </div>
               </div>
             ) : (
               <div className="space-y-4">
                 <div className="space-y-3 text-center">
                    <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                       <div
                         className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                         style={{ backgroundColor: authTheme.accentSoft }}
                       >
                          <ShieldCheck className="w-5 h-5" style={{ color: authTheme.accent }} />
                       </div>
                       <div className="flex-1 text-left">
                          <p className="text-[9px] uppercase font-medium text-slate-600 dark:text-slate-300 tracking-[0.1em] leading-none mb-1">Sent to</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">+91 {phoneNumber}</p>
                       </div>
                       <button
                         type="button"
                         onClick={handleEditNumber}
                         className="text-xs font-medium underline"
                         style={{ color: authTheme.accent }}
                       >
                         Edit
                       </button>
                    </div>

                   <div className="flex justify-between gap-2 mt-2">
                     {[0, 1, 2, 3].map((index) => (
                       <input
                         key={index}
                         id={`otp-${index}`}
                         type="tel"
                         inputMode="numeric"
                         required
                         autoFocus={index === 0}
                         value={otp[index] || ""}
                         onChange={(e) => {
                           const val = e.target.value.replace(/\D/g, "").slice(-1);
                           if (!val) return;
                           const newOtp = otp.split("");
                           newOtp[index] = val;
                           const combined = newOtp.join("").slice(0, 4);
                           setOtp(combined);
                           
                           if (index < 3 && val) {
                             document.getElementById(`otp-${index + 1}`)?.focus();
                           }
                         }}
                         onKeyDown={(e) => {
                           if (e.key === "Backspace") {
                             if (!otp[index] && index > 0) {
                               document.getElementById(`otp-${index - 1}`)?.focus();
                             } else {
                               const newOtp = otp.split("");
                               newOtp[index] = "";
                               setOtp(newOtp.join(""));
                             }
                           }
                         }}
                         onPaste={(e) => {
                           e.preventDefault();
                           const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
                           if (pasteData) {
                             setOtp(pasteData);
                             document.getElementById(`otp-${Math.min(pasteData.length, 3)}`)?.focus();
                           }
                         }}
                         className="w-[3.1rem] h-[3.5rem] sm:w-[3.4rem] sm:h-[3.8rem] text-center text-xl font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-[#005128] focus:ring-2 focus:ring-[#005128]/20 rounded-xl outline-none transition-all text-gray-900 dark:text-white"
                         placeholder="-"
                       />
                     ))}
                   </div>
                   <div className="text-center pt-2">
                     {resendTimer > 0 ? (
                       <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                         Resend OTP in {formatResendTimer(resendTimer)}
                       </p>
                     ) : (
                       <button
                         type="button"
                         onClick={handleResendOTP}
                         disabled={loading}
                         className="text-xs font-medium underline disabled:opacity-60 disabled:cursor-not-allowed"
                         style={{ color: authTheme.accent }}
                       >
                         Resend OTP
                       </button>
                     )}
                   </div>
                 </div>
               </div>
             )}

             <button
               type="submit"
               disabled={loading}
              className={`w-full py-3 mt-1 rounded-[1rem] font-semibold text-[15px] transition-all relative overflow-hidden ${
                loading
                  ? "bg-slate-100 dark:bg-slate-800 cursor-not-allowed text-slate-400"
                  : "text-white active:scale-[0.98]"
               }`}
               style={
                 loading
                   ? undefined
                   : {
                       backgroundColor: authTheme.buttonBackground,
                     }
               }
             >
               {loading ? (
                 <Loader2 className="w-5 h-5 animate-spin mx-auto text-current" />
               ) : (
                 step === 1 ? "Get Verification Code" : "Continue"
               )}
             </button>
           </form>
        </div>

        <div className="mt-8 text-center flex-col justify-end">
           <p className="text-[10px] text-slate-400 dark:text-slate-500 font-normal uppercase tracking-[0.08em] mb-1">
             By continuing, you agree to our
           </p>
           <p className="text-[10px] font-normal uppercase tracking-[0.06em]">
             <Link
               to="/food/user/profile/terms"
               className="underline transition-colors hover:opacity-80"
               style={{ color: authTheme.accent }}
             >
               Terms of Service
             </Link>
             <span className="text-slate-300 dark:text-slate-600 mx-2">&</span>
             <Link
               to="/food/user/profile/privacy"
               className="underline transition-colors hover:opacity-80"
               style={{ color: authTheme.accent }}
             >
               Privacy Policy
             </Link>
           </p>
        </div>
      </div>
    </div>
  )
}
